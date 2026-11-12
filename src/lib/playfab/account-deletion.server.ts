import crypto from "node:crypto";
import { z } from "zod";
import { AdminApiError, adminGameConfig, object, playFabAdmin } from "./admin-client.server.ts";
import { smallBody } from "./request-body.server.ts";
import {
  listOrdersForPlayer,
  saveOrder,
  getReceiptEmailClaim,
  saveReceiptEmailClaim,
} from "../payments/orders.server.ts";
import type { PaymentOrder } from "../payments/types.ts";
import {
  type AccountDeletionRecord,
  type DeletionStatus,
  getDeletionRecord,
  getDeletionRecordByReceiptId,
  saveDeletionRecord,
  isAccountDeleted,
  resetDeletionStorageForTesting,
  verifyStorageHealth,
  acquireDeletionLock,
  releaseDeletionLock,
  renewDeletionLock,
  isProductionStorageRequired,
  isPostgresConfigured,
} from "./account-deletion-storage.server.ts";

export type { AccountDeletionRecord, DeletionStatus };
export {
  getDeletionRecord,
  getDeletionRecordByReceiptId,
  saveDeletionRecord,
  isAccountDeleted,
  resetDeletionStorageForTesting,
  verifyStorageHealth,
  acquireDeletionLock,
  releaseDeletionLock,
  renewDeletionLock,
  isProductionStorageRequired,
  isPostgresConfigured,
};

export interface AccountDeletionResult {
  success: boolean;
  status: DeletionStatus;
  message: string;
  jobReceiptId?: string | undefined;
  queuedAt?: string | undefined;
  deletedAt?: string | undefined;
  affectedTitleIds?: string[] | undefined;
  recoveryToken?: string | undefined;
  pseudonymizedIdentifier?: string | undefined;
}

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS_PER_WINDOW = 5;
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

export function resetDeletionRateLimits(): void {
  rateLimitMap.clear();
}

const deletionRequestSchema = z.object({
  confirmationText: z.string().trim(),
  confirm: z.boolean(),
  password: z.string().optional(),
});

function checkRateLimit(key: string): void {
  const now = Date.now();
  const record = rateLimitMap.get(key) || { count: 0, windowStart: now };
  if (now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    record.count = 0;
    record.windowStart = now;
  }
  record.count++;
  rateLimitMap.set(key, record);
  if (record.count > MAX_REQUESTS_PER_WINDOW) {
    throw new AdminApiError(429, "Too many deletion requests. Please try again in a few minutes.");
  }
}

function getRecoveryTokenSecret(): string {
  return (
    process.env["PLAYFAB_WEBHOOK_SECRET"]?.trim() ||
    process.env["PLAYFAB_SECRET_KEY"]?.trim() ||
    "civilcraft-deletion-token-secret"
  );
}

/**
 * Creates a cryptographically signed HMAC token for the player to query deletion status
 * even after session invalidation without disclosing personal data or job receipts.
 */
export function createDeletionRecoveryToken(playFabId: string): string {
  const secret = getRecoveryTokenSecret();
  const payload = JSON.stringify({
    sub: playFabId.toUpperCase(),
    iat: Date.now(),
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days validity
  });
  const b64Payload = Buffer.from(payload).toString("base64url");
  const hmac = crypto.createHmac("sha256", secret).update(b64Payload).digest("base64url");
  return `${b64Payload}.${hmac}`;
}

/**
 * Verifies the deletion recovery token and extracts the authenticated PlayFab ID.
 */
export function verifyDeletionRecoveryToken(token: string): string | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [b64Payload, signature] = parts;
  if (!b64Payload || !signature) return null;

  const secret = getRecoveryTokenSecret();
  const expectedHmac = crypto.createHmac("sha256", secret).update(b64Payload).digest("base64url");
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedHmac);

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const raw = Buffer.from(b64Payload, "base64url").toString("utf-8");
    const data = JSON.parse(raw) as { sub?: string; exp?: number };
    if (typeof data.exp === "number" && Date.now() > data.exp) return null;
    return typeof data.sub === "string" ? data.sub.toUpperCase() : null;
  } catch {
    return null;
  }
}

/**
 * Obtains a Title Entity Token for administrative Entity API operations.
 */
async function getTitleEntityToken(): Promise<string> {
  const { titleId, secret } = adminGameConfig();
  if (!secret) throw new AdminApiError(503, "Administrative PlayFab access is not configured.");

  const response = await fetch(`https://${titleId}.playfabapi.com/Authentication/GetEntityToken`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-SecretKey": secret,
    },
    body: JSON.stringify({}),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
  });

  const payload = object(await response.json());
  if (!response.ok || payload["code"] !== 200) {
    throw new AdminApiError(503, "Unable to obtain PlayFab entity token.");
  }
  const token = object(payload["data"])["EntityToken"];
  if (typeof token !== "string" || !token) {
    throw new AdminApiError(503, "PlayFab entity token was invalid.");
  }
  return token;
}

/**
 * Step 2: Discovers all PlayFab titles associated with a master player account before deletion.
 */
export async function getPlayerPlayedTitles(playFabId: string): Promise<string[]> {
  const { titleId } = adminGameConfig();
  try {
    const res = await playFabAdmin("Admin/GetPlayedTitleList", { PlayFabId: playFabId });
    const data = object(res["Data"] ?? res["data"] ?? res);
    const titleIds = Array.isArray(data["TitleIds"])
      ? (data["TitleIds"] as unknown[])
          .filter((t): t is string => typeof t === "string" && Boolean(t))
          .map((t) => t.toUpperCase())
      : [];

    const currentTitle = titleId.toUpperCase();
    if (!titleIds.includes(currentTitle)) {
      titleIds.unshift(currentTitle);
    }
    return titleIds;
  } catch (err) {
    console.warn("[account/deletion] Unable to fetch played title list:", err);
    throw err instanceof Error
      ? err
      : new AdminApiError(500, "Unable to inspect player title associations.");
  }
}

/**
 * Auxiliary Step 6a: Purges player entity files (save data, portraits, albums).
 */
async function purgeEntityFiles(titlePlayerAccountId: string): Promise<void> {
  if (!titlePlayerAccountId) return;
  const { titleId } = adminGameConfig();
  const entityToken = await getTitleEntityToken();
  const entity = { Id: titlePlayerAccountId, Type: "title_player_account" };

  const getFilesRes = await fetch(`https://${titleId}.playfabapi.com/File/GetFiles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-EntityToken": entityToken,
    },
    body: JSON.stringify({ Entity: entity }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
  });

  const getFilesPayload = object(await getFilesRes.json());
  if (!getFilesRes.ok || getFilesPayload["code"] !== 200) {
    throw new AdminApiError(500, "Unable to inspect player entity files for deletion.");
  }

  const metadata = object(object(getFilesPayload["data"])["Metadata"]);
  const fileNames = Object.keys(metadata);
  if (fileNames.length > 0) {
    const delRes = await fetch(`https://${titleId}.playfabapi.com/File/DeleteFiles`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-EntityToken": entityToken,
      },
      body: JSON.stringify({ Entity: entity, FileNames: fileNames }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
    });
    const delPayload = object(await delRes.json());
    if (!delRes.ok || delPayload["code"] !== 200) {
      throw new AdminApiError(500, "Failed to purge player entity files.");
    }
  }
}

/**
 * Auxiliary Step 6b: Purges player entity objects (premium Diamonds wallet snapshot).
 */
async function purgeEntityObjects(titlePlayerAccountId: string): Promise<void> {
  if (!titlePlayerAccountId) return;
  const { titleId } = adminGameConfig();
  const entityToken = await getTitleEntityToken();
  const entity = { Id: titlePlayerAccountId, Type: "title_player_account" };

  const res = await fetch(`https://${titleId}.playfabapi.com/Object/SetObjects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-EntityToken": entityToken,
    },
    body: JSON.stringify({
      Entity: entity,
      Objects: [{ ObjectName: "civilcraft.premium-wallet.v1", DeleteObject: true }],
    }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
  });
  const payload = object(await res.json());
  if (!res.ok || payload["code"] !== 200) {
    throw new AdminApiError(500, "Failed to purge player entity objects.");
  }
}

/**
 * Auxiliary Step 6c: Purges UserData and resets leaderboard statistics to 0.
 */
async function purgeUserDataAndStatistics(playFabId: string): Promise<void> {
  await playFabAdmin("Server/UpdateUserData", {
    PlayFabId: playFabId,
    KeysToRemove: [
      "AlmanacProgress",
      "QuizReviewProgress",
      "CurrentLevel",
      "XP",
      "MapProgress",
      "EquippedCosmetics",
      "PolicyAgreement",
      "PolicyAcceptedAt",
      "TermsAcceptedVersion",
      "PrivacyAcceptedVersion",
    ],
  });

  await playFabAdmin("Server/UpdatePlayerStatistics", {
    PlayFabId: playFabId,
    Statistics: [
      { StatisticName: "TotalScore", Value: 0 },
      { StatisticName: "BridgesCompleted", Value: 0 },
      { StatisticName: "ChallengesCompleted", Value: 0 },
      { StatisticName: "BestSingleBuildScore", Value: 0 },
    ],
  });
}

/**
 * Auxiliary Step 6d: Deletes player email preference from Title Internal Data.
 */
async function purgeEmailPreferences(playFabId: string): Promise<void> {
  await playFabAdmin("Admin/SetTitleInternalData", {
    Key: `civilcraft.email.preference.${playFabId}`,
    Value: null,
  });
}

/**
 * Auxiliary Step 6e: Disassociates player support conversations and bug reports.
 */
async function disassociateMessagesAndBugReports(playFabId: string): Promise<void> {
  const targetId = playFabId.trim().toUpperCase();

  try {
    const internalDataRes = await playFabAdmin("Admin/GetTitleInternalData");
    const data = object(internalDataRes["Data"]);
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith("civilcraft.website.v1.messages.") && typeof value === "string") {
        try {
          const msg = JSON.parse(value) as Record<string, unknown>;
          if (
            typeof msg["ownerId"] === "string" &&
            msg["ownerId"].trim().toUpperCase() === targetId
          ) {
            msg["ownerId"] = null;
            msg["name"] = "Former Player";
            msg["email"] = "";
            await playFabAdmin("Admin/SetTitleInternalData", {
              Key: key,
              Value: JSON.stringify(msg),
            });
          }
        } catch {
          /* ignore parse error */
        }
      }
    }
  } catch (err) {
    console.warn("[account/deletion] Non-fatal error disassociating support messages:", err);
  }

  try {
    const internalDataRes = await playFabAdmin("Admin/GetTitleInternalData");
    const data = object(internalDataRes["Data"]);
    for (const [key, value] of Object.entries(data)) {
      if (
        key.startsWith("civilcraft.bug.v1.") &&
        !key.endsWith(".status") &&
        !key.endsWith(".deleted") &&
        typeof value === "string"
      ) {
        try {
          const report = JSON.parse(value) as Record<string, unknown>;
          if (
            typeof report["playFabId"] === "string" &&
            report["playFabId"].trim().toUpperCase() === targetId
          ) {
            report["playFabId"] = "PSEUDO_DELETED_PLAYER";
            await playFabAdmin("Admin/SetTitleInternalData", {
              Key: key,
              Value: JSON.stringify(report),
            });
          }
        } catch {
          /* ignore parse error */
        }
      }
    }
  } catch (err) {
    console.warn("[account/deletion] Non-fatal error disassociating bug reports:", err);
  }
}

/**
 * Auxiliary Step 6f: Pseudonymizes payment orders and receipt claims.
 *
 * Statutory Retention Basis:
 * Under Section 235 of the Philippine National Internal Revenue Code (NIRC), as amended by
 * Republic Act (RA) No. 11976 (Ease of Paying Taxes / EOPT Act), commercial sales invoices
 * and accounting records must be preserved for five (5) years from the return filing deadline.
 */
async function pseudonymizeFinancialRecords(
  playFabId: string,
  pseudonymizedIdentifier: string,
): Promise<void> {
  try {
    const orders = await listOrdersForPlayer(playFabId);
    for (const order of orders) {
      const updatedOrder: PaymentOrder = {
        ...order,
        playFabId: pseudonymizedIdentifier,
        receiptEmailError: null,
      };
      await saveOrder(updatedOrder);

      const claim = await getReceiptEmailClaim(order.orderId);
      if (claim) {
        await saveReceiptEmailClaim({
          ...claim,
          playFabId: pseudonymizedIdentifier,
          maskedEmail: "DELETED",
        });
      }
    }
  } catch (err) {
    console.warn("[account/deletion] Non-fatal error pseudonymizing financial records:", err);
  }
}

/**
 * Auxiliary Step 6g: Pseudonymizes PostgreSQL currency database accounts if configured.
 */
async function pseudonymizeCurrencyDatabase(
  playFabId: string,
  pseudonymizedIdentifier: string,
): Promise<void> {
  const dbUrl = process.env["CURRENCY_DATABASE_URL"]?.trim();
  if (!dbUrl) return;

  try {
    const { default: postgres } = await import("postgres");
    const sql = postgres(dbUrl, { max: 1, connect_timeout: 5 });
    try {
      await sql`
        UPDATE civilcraft_currency.accounts 
        SET playfab_id = ${pseudonymizedIdentifier}, balance = 0, updated_at = NOW()
        WHERE UPPER(playfab_id) = ${playFabId.trim().toUpperCase()}
      `;
    } finally {
      await sql.end({ timeout: 5 });
    }
  } catch (err) {
    console.warn("[account/deletion] Non-fatal error pseudonymizing currency database:", err);
  }
}

/**
 * Step 7: Calls Admin/DeleteMasterPlayerAccount in Microsoft PlayFab.
 */
async function queueMasterAccountDeletion(playFabId: string): Promise<string | undefined> {
  const res = await playFabAdmin("Admin/DeleteMasterPlayerAccount", { PlayFabId: playFabId });
  const data = object(res["data"] ?? res);
  const receipt =
    typeof data["JobReceiptId"] === "string"
      ? data["JobReceiptId"]
      : typeof res["JobReceiptId"] === "string"
        ? (res["JobReceiptId"] as string)
        : undefined;
  return receipt;
}

/**
 * Checks if the PlayFab master player account is already purged or missing.
 * Used for safe crash recovery to prevent duplicate DeleteMasterPlayerAccount calls.
 */
async function isPlayFabAccountMissingOrDeleted(playFabId: string): Promise<boolean> {
  try {
    const res = await playFabAdmin("Admin/GetUserAccountInfo", { PlayFabId: playFabId });
    const userAccount = object(res["UserInfo"]);
    return !userAccount["PlayFabId"];
  } catch (err) {
    // 404, AccountNotFound, User not found
    if (err instanceof AdminApiError && (err.status === 404 || err.status === 410)) {
      return true;
    }
    const msg = String(err instanceof Error ? err.message : err).toLowerCase();
    if (msg.includes("not found") || msg.includes("accountnotfound") || msg.includes("deleted")) {
      return true;
    }
    return false;
  }
}

/**
 * Verifies deletion status via durable website storage.
 */
export async function verifyDeletionStatus(
  playFabId: string,
): Promise<AccountDeletionRecord | null> {
  return getDeletionRecord(playFabId);
}

/**
 * Executes the complete multi-system player account deletion pipeline in strict sequence:
 * 4. Create and persist external deletion record with status `pending`.
 * 5. Acquire durable deletion lock.
 * 6. Execute required auxiliary data cleanup.
 * 7. Call Admin/DeleteMasterPlayerAccount (with crash detection).
 * 8. Persist JobReceiptId and status `processing`.
 */
export async function executeAccountDeletion(
  playFabId: string,
  titlePlayerAccountId?: string,
  affectedTitleIds: string[] = [],
): Promise<AccountDeletionResult> {
  const cleanId = playFabId.trim().toUpperCase();
  const instanceId = `inst_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const pseudonymizedIdentifier = `PSEUDO_PLAYER_${crypto.createHash("sha256").update(cleanId).digest("hex").slice(0, 12).toUpperCase()}`;

  // Pre-condition: Durable external storage health check
  await verifyStorageHealth();

  // Check existing durable deletion record
  const existing = await getDeletionRecord(cleanId);
  if (existing?.status === "completed") {
    return {
      success: true,
      status: "completed",
      message: "Account has already been permanently deleted.",
      deletedAt: existing.completedAt,
      affectedTitleIds: existing.affectedTitleIds,
      pseudonymizedIdentifier: existing.pseudonymizedIdentifier,
    };
  }

  // Step 4: Create and persist external deletion record with status "pending"
  const record: AccountDeletionRecord = {
    playFabId: cleanId,
    status: existing?.status === "processing" ? "processing" : "pending",
    requestedAt: existing?.requestedAt || new Date().toISOString(),
    startedAt: new Date().toISOString(),
    jobReceiptId: existing?.jobReceiptId,
    queuedAt: existing?.queuedAt,
    stepsCompleted: existing?.stepsCompleted ? [...existing.stepsCompleted] : [],
    affectedTitleIds:
      affectedTitleIds.length > 0 ? affectedTitleIds : existing?.affectedTitleIds || [],
    pseudonymizedIdentifier,
    recoveryNote: existing?.recoveryNote,
    updatedAt: new Date().toISOString(),
  };

  // Step 5: Acquire durable deletion lock across instances
  const lockAcquired = await acquireDeletionLock(cleanId, instanceId);
  if (!lockAcquired) {
    throw new AdminApiError(
      409,
      "Account deletion is currently in progress on another server instance. Please wait.",
    );
  }

  try {
    record.lockedBy = instanceId;
    record.lockedAt = new Date().toISOString();
    await saveDeletionRecord(record);

    // Distributed Lock Fencing Guard:
    // Ensures this worker still owns the lock lease before executing each destructive step.
    // If the lease expired and another instance claimed it, this worker halts immediately.
    const assertLockHeld = async () => {
      const renewed = await renewDeletionLock(cleanId, instanceId);
      if (!renewed) {
        throw new AdminApiError(
          409,
          "Account deletion lock was lost to another instance. Execution fenced and aborted.",
        );
      }
    };

    // CRASH RECOVERY CHECK:
    // If the server crashed after calling DeleteMasterPlayerAccount in a previous attempt,
    // verify if PlayFab has already stripped or queued the account.
    const alreadyCalled = record.stepsCompleted.includes("playfab_account_deletion_called");
    if (alreadyCalled || record.status === "processing") {
      const isMissing = await isPlayFabAccountMissingOrDeleted(cleanId);
      if (isMissing) {
        // Safe recovery: Account is already removed or queued in PlayFab.
        // Do NOT call DeleteMasterPlayerAccount again!
        record.status = "processing";
        record.recoveryNote =
          "Recovered after server crash: PlayFab master player account already queued or erased. Awaiting PlayStream webhook.";
        await saveDeletionRecord(record);
        await releaseDeletionLock(cleanId, instanceId);

        const recoveryToken = createDeletionRecoveryToken(cleanId);
        return {
          success: true,
          status: "processing",
          queuedAt: record.queuedAt || new Date().toISOString(),
          affectedTitleIds: record.affectedTitleIds,
          recoveryToken,
          pseudonymizedIdentifier,
          message:
            "Account deletion was already accepted and is being processed in Microsoft PlayFab. Local data has been cleared.",
        };
      }
    }

    // Step 6: Execute auxiliary cleanup steps with lease renewal and fencing
    if (!record.stepsCompleted.includes("entity_files") && titlePlayerAccountId) {
      await assertLockHeld();
      await purgeEntityFiles(titlePlayerAccountId);
      record.stepsCompleted.push("entity_files");
      await saveDeletionRecord(record);
    }

    if (!record.stepsCompleted.includes("entity_objects") && titlePlayerAccountId) {
      await assertLockHeld();
      await purgeEntityObjects(titlePlayerAccountId);
      record.stepsCompleted.push("entity_objects");
      await saveDeletionRecord(record);
    }

    if (!record.stepsCompleted.includes("user_data_and_statistics")) {
      await assertLockHeld();
      await purgeUserDataAndStatistics(cleanId);
      record.stepsCompleted.push("user_data_and_statistics");
      await saveDeletionRecord(record);
    }

    if (!record.stepsCompleted.includes("email_preferences")) {
      await assertLockHeld();
      await purgeEmailPreferences(cleanId);
      record.stepsCompleted.push("email_preferences");
      await saveDeletionRecord(record);
    }

    if (!record.stepsCompleted.includes("support_and_bugs")) {
      await assertLockHeld();
      await disassociateMessagesAndBugReports(cleanId);
      record.stepsCompleted.push("support_and_bugs");
      await saveDeletionRecord(record);
    }

    if (!record.stepsCompleted.includes("payment_records_anonymized")) {
      await assertLockHeld();
      await pseudonymizeFinancialRecords(cleanId, pseudonymizedIdentifier);
      record.stepsCompleted.push("payment_records_anonymized");
      await saveDeletionRecord(record);
    }

    if (!record.stepsCompleted.includes("currency_database")) {
      await assertLockHeld();
      await pseudonymizeCurrencyDatabase(cleanId, pseudonymizedIdentifier);
      record.stepsCompleted.push("currency_database");
      await saveDeletionRecord(record);
    }

    // Step 7: Call Admin/DeleteMasterPlayerAccount in PlayFab
    if (!record.stepsCompleted.includes("playfab_account_queued")) {
      await assertLockHeld();
      // Record intent immediately prior to network call for crash diagnosis
      if (!record.stepsCompleted.includes("playfab_account_deletion_called")) {
        record.stepsCompleted.push("playfab_account_deletion_called");
        await saveDeletionRecord(record);
      }

      const receipt = await queueMasterAccountDeletion(cleanId);

      // Step 8: Persist JobReceiptId and status "processing"
      record.jobReceiptId = receipt;
      record.queuedAt = new Date().toISOString();
      record.status = "processing";
      record.stepsCompleted.push("playfab_account_queued");
      await saveDeletionRecord(record);
    } else {
      record.status = "processing";
      await saveDeletionRecord(record);
    }

    // Release lock once processing state is durable
    await releaseDeletionLock(cleanId, instanceId);

    const recoveryToken = createDeletionRecoveryToken(cleanId);

    return {
      success: true,
      status: "processing",
      jobReceiptId: record.jobReceiptId,
      queuedAt: record.queuedAt,
      affectedTitleIds: record.affectedTitleIds,
      recoveryToken,
      pseudonymizedIdentifier,
      message:
        "Your Civil Craft account deletion has been queued and all player data has been purged. PlayFab background deletion is in progress.",
    };
  } catch (error) {
    await releaseDeletionLock(cleanId, instanceId).catch(() => {});

    // If PlayFab already deleted or is deleting the account, do not mark as failed
    if (
      record.stepsCompleted.includes("playfab_account_deletion_called") &&
      (await isPlayFabAccountMissingOrDeleted(cleanId))
    ) {
      record.status = "processing";
      record.recoveryNote = "PlayFab account deletion active despite exception; status processing.";
      await saveDeletionRecord(record).catch(() => {});
      const recoveryToken = createDeletionRecoveryToken(cleanId);
      return {
        success: true,
        status: "processing",
        queuedAt: record.queuedAt || new Date().toISOString(),
        affectedTitleIds: record.affectedTitleIds,
        recoveryToken,
        message: "PlayFab background account deletion is actively processing.",
      };
    }

    const errorMsg = error instanceof Error ? error.message : "Account deletion failed.";
    record.status = "failed";
    record.failedAt = new Date().toISOString();
    record.error = errorMsg;
    await saveDeletionRecord(record).catch(() => {});

    const status = error instanceof AdminApiError ? error.status : 500;
    throw new AdminApiError(status, `Account deletion failed: ${errorMsg}`);
  }
}

/**
 * Step 1-3: Validates player authentication, discovers played titles, obtains confirmation,
 * and initiates deletion in strict order.
 */
export async function requestAccountDeletion(params: {
  sessionTicket: string;
  confirm: boolean;
  confirmationText: string;
  password?: string | undefined;
}): Promise<AccountDeletionResult> {
  const { sessionTicket, confirm, confirmationText, password } = params;

  if (!sessionTicket || typeof sessionTicket !== "string" || sessionTicket.length > 4096) {
    throw new AdminApiError(401, "Player sign-in is required.");
  }

  // Preflight health check: reject immediately if durable storage is unavailable
  await verifyStorageHealth();

  // Step 1: Authenticate player session ticket via PlayFab
  const auth = await playFabAdmin("Server/AuthenticateSessionTicket", {
    SessionTicket: sessionTicket,
  });

  if (auth["IsSessionTicketExpired"] === true) {
    throw new AdminApiError(401, "Player session has expired. Please sign in again.");
  }

  const userInfo = object(auth["UserInfo"]);
  const playFabId = userInfo["PlayFabId"];
  if (typeof playFabId !== "string" || !/^[a-f0-9]{1,32}$/i.test(playFabId)) {
    throw new AdminApiError(401, "Unable to verify player account.");
  }

  const titleInfo = object(userInfo["TitleInfo"]);
  const titlePlayerAccount = object(titleInfo["TitlePlayerAccount"]);
  const titlePlayerAccountId =
    typeof titlePlayerAccount["Id"] === "string" ? titlePlayerAccount["Id"] : undefined;

  checkRateLimit(playFabId.toUpperCase());

  // Existing deletion state check in durable website storage
  const existing = await getDeletionRecord(playFabId);
  if (existing?.status === "completed") {
    throw new AdminApiError(410, "This account has already been permanently deleted.");
  }
  if (existing?.status === "processing" && existing.jobReceiptId) {
    throw new AdminApiError(409, "Account deletion is already being processed for this account.");
  }

  // Step 2: Retrieve GetPlayedTitleList
  const affectedTitleIds = await getPlayerPlayedTitles(playFabId);

  // CRASH RECOVERY SHORT-CIRCUIT:
  // If deletion was already initiated in PlayFab and account is gone, recover immediately
  if (
    existing?.stepsCompleted.includes("playfab_account_deletion_called") &&
    (await isPlayFabAccountMissingOrDeleted(playFabId))
  ) {
    return executeAccountDeletion(playFabId, titlePlayerAccountId, affectedTitleIds);
  }

  // Step 3: Explicit player confirmation
  if (confirm !== true) {
    throw new AdminApiError(400, "Account deletion confirmation is required.");
  }
  if (confirmationText !== "DELETE") {
    throw new AdminApiError(400, 'Please type "DELETE" exactly to confirm account deletion.');
  }

  // Step 1 (reauthentication): Verify password if account has credentials
  try {
    const accountInfo = await playFabAdmin("Admin/GetUserAccountInfo", { PlayFabId: playFabId });
    const userAccount = object(accountInfo["UserInfo"]);
    const username =
      typeof userAccount["Username"] === "string" ? userAccount["Username"] : undefined;
    const privateInfo = object(userAccount["PrivateInfo"]);
    const email = typeof privateInfo["Email"] === "string" ? privateInfo["Email"] : undefined;

    if (username || email) {
      if (!password || typeof password !== "string" || password.trim().length === 0) {
        throw new AdminApiError(
          400,
          "Your account password is required to confirm account deletion.",
        );
      }

      const { titleId } = adminGameConfig();
      let passwordValid = false;

      if (username) {
        const loginRes = await fetch(`https://${titleId}.playfabapi.com/Client/LoginWithPlayFab`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ TitleId: titleId, Username: username, Password: password }),
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
        });
        const loginJson = object(await loginRes.json());
        if (loginRes.ok && loginJson["code"] === 200) {
          const loginData = object(loginJson["data"]);
          if (loginData["PlayFabId"] === playFabId) {
            passwordValid = true;
          }
        }
      }

      if (!passwordValid && email) {
        const emailRes = await fetch(
          `https://${titleId}.playfabapi.com/Client/LoginWithEmailAddress`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ TitleId: titleId, Email: email, Password: password }),
            cache: "no-store",
            redirect: "error",
            signal: AbortSignal.timeout(10_000),
          },
        );
        const emailJson = object(await emailRes.json());
        if (emailRes.ok && emailJson["code"] === 200) {
          const emailData = object(emailJson["data"]);
          if (emailData["PlayFabId"] === playFabId) {
            passwordValid = true;
          }
        }
      }

      if (!passwordValid) {
        throw new AdminApiError(401, "Incorrect account password. Account deletion cancelled.");
      }
    }
  } catch (pwErr) {
    if (pwErr instanceof AdminApiError) throw pwErr;
    console.warn("[account/deletion] Account info check exception:", pwErr);
  }

  // Steps 4-8: Execute the multi-system deletion workflow
  return executeAccountDeletion(playFabId, titlePlayerAccountId, affectedTitleIds);
}

/**
 * Validates the security authorization header on PlayStream webhook calls.
 * Accepts X-PlayFab-Webhook-Secret, Authorization Bearer, or a secure URL secret query parameter.
 */
function isAuthorizedWebhook(request: Request): boolean {
  const expectedSecret =
    process.env["PLAYFAB_WEBHOOK_SECRET"]?.trim() || process.env["PLAYFAB_SECRET_KEY"]?.trim();

  // In production, the webhook secret is strictly mandatory
  if (!expectedSecret) {
    if (isProductionStorageRequired()) return false;
    return true; // Local test environments without configured secret
  }

  const url = new URL(request.url);
  const querySecret =
    url.searchParams.get("secret")?.trim() || url.searchParams.get("token")?.trim();

  const headerSecret =
    request.headers.get("x-playfab-webhook-secret")?.trim() ||
    request.headers.get("x-civilcraft-webhook-secret")?.trim() ||
    request.headers.get("x-secret-key")?.trim() ||
    request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "")
      .trim();

  const candidateSecret = headerSecret || querySecret;
  if (!candidateSecret) return false;

  const expectedBuf = Buffer.from(expectedSecret);
  const candidateBuf = Buffer.from(candidateSecret);
  if (expectedBuf.length !== candidateBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, candidateBuf);
}

/**
 * HTTP Handler for player account deletion endpoints:
 * - GET  /api/player/account/delete/preflight
 * - POST /api/player/account/delete
 * - GET  /api/player/account/delete/status (supports recoveryToken even after session invalidation)
 * - POST /api/player/account/delete/webhook (canonical PlayStream title_deleted_master_player event)
 * - POST /api/webhooks/playfab/account-deleted (alias)
 */
export async function handleAccountDeletionRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  const isWebhookPath =
    path === "/api/player/account/delete/webhook" ||
    path === "/api/webhooks/playfab/account-deleted";

  if (
    path !== "/api/player/account/delete" &&
    path !== "/api/player/account/delete/status" &&
    path !== "/api/player/account/delete/preflight" &&
    !isWebhookPath
  ) {
    return null;
  }

  const json = (data: unknown, status = 200) =>
    Response.json(data, {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    });

  // 1. PlayStream official Webhook: title_deleted_master_player (Steps 9, 10, 11)
  if (isWebhookPath) {
    if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

    // Anti-spoofing header check
    if (!isAuthorizedWebhook(request)) {
      return json({ error: "Unauthorized webhook request." }, 401);
    }

    try {
      const body = await smallBody(request);
      const rawEvents = Array.isArray(body) ? body : [body];

      for (const item of rawEvents) {
        const event = object(item);
        const eventName = String(event["EventName"] || event["eventName"] || "");

        // Filter: title_deleted_master_player
        if (eventName !== "title_deleted_master_player") {
          continue;
        }

        const eventBody = object(event["Body"]);
        const receiptId = String(
          event["ReceiptId"] || eventBody["ReceiptId"] || event["jobReceiptId"] || "",
        ).trim();
        const playerId = String(
          event["PlayerId"] || eventBody["PlayerId"] || event["playFabId"] || "",
        )
          .trim()
          .toUpperCase();

        if (!receiptId) {
          return json({ error: "Missing ReceiptId in title_deleted_master_player event." }, 400);
        }

        // Locate deletion record in durable website storage
        // Step 10: Match ReceiptId and PlayerId
        let record = await getDeletionRecordByReceiptId(receiptId);

        // SAFE CRASH RECOVERY:
        // If server crashed before receiptId was persisted, recover via authenticated PlayerId
        if (!record && playerId) {
          const playerRecord = await getDeletionRecord(playerId);
          // Only recover if the player record is actually in processing/pending, has stepsCompleted indicating playfab was called, and has no conflicting receipt
          if (
            playerRecord &&
            (!playerRecord.jobReceiptId || playerRecord.jobReceiptId === receiptId) &&
            (playerRecord.status === "processing" ||
              playerRecord.stepsCompleted.includes("playfab_account_queued") ||
              playerRecord.stepsCompleted.includes("playfab_account_deletion_called"))
          ) {
            record = playerRecord;
            if (!record.jobReceiptId) {
              record.jobReceiptId = receiptId;
              record.recoveryNote =
                "ReceiptId recovered and associated from authenticated title_deleted_master_player webhook.";
            }
          }
        }

        if (!record) {
          return json({ error: "No matching deletion record found for ReceiptId." }, 404);
        }

        // Validate receipt ID if record has one (strictly reject mismatched receipt)
        if (record.jobReceiptId && record.jobReceiptId !== receiptId) {
          return json({ error: "ReceiptId mismatch for deletion record." }, 400);
        }

        // Validate associated player ID if present in the event
        if (playerId && record.playFabId.toUpperCase() !== playerId) {
          return json({ error: "Player ID mismatch for ReceiptId." }, 400);
        }

        // Idempotent completion check
        if (record.status === "completed") {
          return json({ acknowledged: true, duplicate: true }, 200);
        }

        // Step 11: Transition external record to "completed"
        record.status = "completed";
        record.completedAt =
          (typeof event["Timestamp"] === "string" ? event["Timestamp"] : null) ||
          new Date().toISOString();
        record.lockedAt = undefined;
        record.lockedBy = undefined;
        await saveDeletionRecord(record);

        return json(
          {
            acknowledged: true,
            status: "completed",
          },
          200,
        );
      }

      return json({ acknowledged: true, ignored: true }, 200);
    } catch {
      return json({ error: "Invalid webhook payload format." }, 400);
    }
  }

  // Preflight health check
  try {
    await verifyStorageHealth();
  } catch (err) {
    const status = err instanceof AdminApiError ? err.status : 503;
    const msg =
      err instanceof Error ? err.message : "Durable account deletion storage is unavailable.";
    return json({ error: msg }, status);
  }

  // 2. GET /api/player/account/delete/status (supports session ticket OR recoveryToken)
  if (path === "/api/player/account/delete/status") {
    if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);

    let authenticatedPlayFabId: string | null = null;

    // Check for recovery token (query param or header)
    const recoveryToken =
      url.searchParams.get("token") || request.headers.get("x-deletion-recovery-token");
    if (recoveryToken) {
      authenticatedPlayFabId = verifyDeletionRecoveryToken(recoveryToken);
      if (!authenticatedPlayFabId) {
        return json({ error: "Invalid or expired deletion recovery token." }, 401);
      }
    } else {
      // Fallback to SessionTicket in Authorization header
      const ticket = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
      if (!ticket) {
        return json({ error: "Player sign-in or valid deletion recovery token is required." }, 401);
      }

      try {
        const auth = await playFabAdmin("Server/AuthenticateSessionTicket", {
          SessionTicket: ticket,
        });
        const id = object(auth["UserInfo"])["PlayFabId"];
        if (typeof id === "string") authenticatedPlayFabId = id.toUpperCase();
      } catch {
        return json({ error: "Invalid or expired player session ticket." }, 401);
      }
    }

    if (!authenticatedPlayFabId) {
      return json({ error: "Unable to verify player identity." }, 401);
    }

    const record = await getDeletionRecord(authenticatedPlayFabId);

    // Public sanitized status: Does NOT expose JobReceiptId, email, username, or private internal notes
    return json({
      hasPendingDeletion: record?.status === "processing" || record?.status === "pending",
      isDeleted: record?.status === "completed",
      record: record
        ? {
            status: record.status,
            requestedAt: record.requestedAt,
            queuedAt: record.queuedAt,
            completedAt: record.completedAt,
            affectedTitleIds: record.affectedTitleIds,
          }
        : null,
    });
  }

  // Endpoints below require a valid player SessionTicket
  const ticket = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (!ticket || ticket.length > 4096) {
    return json({ error: "Player sign-in is required." }, 401);
  }

  try {
    // 3. GET /api/player/account/delete/preflight
    if (path === "/api/player/account/delete/preflight") {
      if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);
      const auth = await playFabAdmin("Server/AuthenticateSessionTicket", {
        SessionTicket: ticket,
      });
      const playFabId = object(auth["UserInfo"])["PlayFabId"];
      if (typeof playFabId !== "string") return json({ error: "Player sign-in is required." }, 401);

      const { titleId } = adminGameConfig();
      const affectedTitles = await getPlayerPlayedTitles(playFabId);

      return json({
        playFabId,
        currentTitleId: titleId.toUpperCase(),
        affectedTitleIds: affectedTitles,
        hasMultipleTitles: affectedTitles.length > 1,
        publisherWarning:
          "Master player account deletion permanently deletes your account and progression across ALL titles linked under this studio/publisher.",
      });
    }

    // 4. POST /api/player/account/delete
    if (path === "/api/player/account/delete") {
      if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

      const body = await smallBody(request);
      const parsed = deletionRequestSchema.safeParse(body);
      if (!parsed.success) {
        return json({ error: "Invalid deletion request format." }, 400);
      }

      const result = await requestAccountDeletion({
        sessionTicket: ticket,
        confirm: parsed.data.confirm,
        confirmationText: parsed.data.confirmationText,
        password: parsed.data.password,
      });

      // Public sanitized response: Do not leak JobReceiptId or internal identifiers
      const publicResponse = {
        success: result.success,
        status: result.status,
        message: result.message,
        queuedAt: result.queuedAt,
        affectedTitleIds: result.affectedTitleIds,
        recoveryToken: result.recoveryToken,
      };

      return json(publicResponse, 200);
    }

    return null;
  } catch (error) {
    const status = error instanceof AdminApiError ? error.status : 500;
    const message =
      error instanceof Error ? error.message : "Account deletion service unavailable.";
    return json({ error: message }, status);
  }
}

/**
 * Administrator recovery process for failed or stalled account deletions.
 * Resumes execution strictly from uncompleted steps.
 * Cannot accidentally unblock or restore player access.
 */
export async function adminRetryAccountDeletion(
  playFabId: string,
  adminUserId: string,
): Promise<AccountDeletionResult> {
  if (!playFabId || typeof playFabId !== "string" || !/^[a-f0-9]{1,32}$/i.test(playFabId.trim())) {
    throw new AdminApiError(400, "Valid player PlayFab ID is required for deletion recovery.");
  }

  const cleanId = playFabId.trim().toUpperCase();
  const existing = await getDeletionRecord(cleanId);
  if (!existing) {
    throw new AdminApiError(404, "No deletion record found for this player.");
  }

  if (existing.status === "completed") {
    return {
      success: true,
      status: "completed",
      message: "Account has already been permanently deleted.",
      deletedAt: existing.completedAt,
      affectedTitleIds: existing.affectedTitleIds,
      pseudonymizedIdentifier: existing.pseudonymizedIdentifier,
    };
  }

  existing.recoveryNote = `Admin retry initiated by administrator: ${adminUserId} at ${new Date().toISOString()}`;
  await saveDeletionRecord(existing);

  // Attempt to resolve titlePlayerAccountId if the player entity still exists
  let titlePlayerAccountId: string | undefined;
  try {
    const info = await playFabAdmin("Admin/GetUserAccountInfo", { PlayFabId: cleanId });
    const userInfo = object(info["UserInfo"]);
    const titleInfo = object(userInfo["TitleInfo"]);
    const titlePlayerAccount = object(titleInfo["TitlePlayerAccount"]);
    if (typeof titlePlayerAccount["Id"] === "string") {
      titlePlayerAccountId = titlePlayerAccount["Id"];
    }
  } catch {
    // If account was already queued or stripped from PlayFab, titlePlayerAccountId may not be resolvable
  }

  // Resume deletion strictly from current state
  return executeAccountDeletion(cleanId, titlePlayerAccountId, existing.affectedTitleIds);
}
