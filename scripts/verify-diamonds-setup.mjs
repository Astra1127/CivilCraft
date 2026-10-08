import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { adminGameConfig, object } from "../src/lib/playfab/admin-client.server.ts";
import {
  getDiamondBalance,
  grantDiamonds,
  hasDiamondReceipt,
  premiumWalletConfig,
  premiumWalletVerificationFingerprint,
  resolvePremiumEntity,
} from "../src/lib/playfab/premium-wallet.server.ts";

export const FORBIDDEN_PLAYER_WRITES = Object.freeze([
  "AddInventoryItems",
  "SubtractInventoryItems",
  "UpdateInventoryItems",
  "DeleteInventoryItems",
  "DeleteInventoryCollection",
  "TransferInventoryItems",
  "ExecuteInventoryOperations",
  "ExecuteTransferOperations",
  "PurchaseInventoryItems",
]);

/** Require unconditional, global client denials; ambiguous policy shapes do not qualify. */
export function policyBlocksPlayerInventoryWrites(statements) {
  return policyBlocksOperations(
    statements,
    FORBIDDEN_PLAYER_WRITES.map((name) => `Inventory/${name}`),
  );
}

export function policyBlocksPlayerObjectWrites(statements) {
  return policyBlocksOperations(statements, ["Object/SetObjects"]);
}

function policyBlocksOperations(statements, operations) {
  if (!Array.isArray(statements)) return false;
  return operations.every((operation) =>
    statements.some((statement) => {
      if (
        statement?.Effect !== "Deny" ||
        statement.Principal !== "*" ||
        statement.Action !== "*" ||
        typeof statement.Resource !== "string" ||
        (statement.ApiConditions && Object.keys(statement.ApiConditions).length > 0)
      )
        return false;
      const pattern = statement.Resource.split("*")
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*");
      return new RegExp(`^${pattern}$`, "i").test(`pfrn:api--/${operation}`);
    }),
  );
}

/** Opt-in test-title smoke check. Does not create catalog items, alter policy, or save env files. */
export async function verifyDiamondSetup({
  testPlayerId,
  playerTicket,
  confirmTestWrites = false,
}) {
  if (!confirmTestWrites)
    throw new Error(
      "Explicit --confirm-test-writes is required; this check leaves one Diamond in the test account.",
    );
  if (!/^[a-f0-9]{1,32}$/i.test(testPlayerId || ""))
    throw new Error("A valid --test-player PlayFab ID is required.");
  if (!playerTicket || playerTicket.length > 4096)
    throw new Error(
      "Set the verification player's session ticket in PLAYFAB_DIAMONDS_VERIFICATION_PLAYER_TICKET.",
    );
  if (process.env["PLAYFAB_DIAMONDS_ENABLED"]?.trim().toLowerCase() === "true")
    throw new Error(
      "Disable Diamonds checkout before verification. This script never changes deployed configuration.",
    );
  if (!process.env["PAYMONGO_SECRET_KEY"]?.trim().startsWith("sk_test_"))
    throw new Error(
      "A PayMongo test key is required. Live payment keys cannot be verified for this phase.",
    );
  const { titleId, secret } = adminGameConfig();
  if (!secret) throw new Error("Server-only PlayFab title secret is required.");
  const wallet = premiumWalletConfig();
  const request = async (path, body, authentication) => {
    try {
      const response = await fetch(`https://${titleId}.playfabapi.com/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authentication },
        body: JSON.stringify(body),
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
      const payload = object(await response.json());
      return { ok: response.ok && payload.code === 200, payload };
    } catch {
      throw new Error(
        `Verification service connection unavailable (${path}). Keep checkout disabled.`,
      );
    }
  };
  const api = async (path, body, authentication) => {
    const response = await request(path, body, authentication);
    if (!response.ok)
      throw new Error(
        `Verification could not complete ${path}. No credentials or upstream payload were printed.`,
      );
    return object(response.payload.data);
  };
  const authentication = await api(
    "Server/AuthenticateSessionTicket",
    { SessionTicket: playerTicket },
    { "X-SecretKey": secret },
  );
  const verifiedPlayer = object(authentication.UserInfo).PlayFabId;
  if (
    authentication.IsSessionTicketExpired ||
    typeof verifiedPlayer !== "string" ||
    verifiedPlayer.toUpperCase() !== testPlayerId.toUpperCase()
  )
    throw new Error("Verification ticket does not belong to the explicitly selected test player.");
  const entity = await resolvePremiumEntity(testPlayerId);
  const title = await api("Authentication/GetEntityToken", {}, { "X-SecretKey": secret });
  if (
    object(title.Entity).Type !== "title" ||
    object(title.Entity).Id?.toUpperCase() !== titleId.toUpperCase() ||
    typeof title.EntityToken !== "string"
  )
    throw new Error("Could not verify a title-level entity token.");
  const titleAuth = { "X-EntityToken": title.EntityToken };
  const policy = await api(
    "Admin/GetPolicy",
    { PolicyName: "ApiPolicy" },
    { "X-SecretKey": secret },
  );
  const objectStorage = wallet.storage === "entity-objects";
  if (
    !(objectStorage
      ? policyBlocksPlayerObjectWrites(policy.Statements)
      : policyBlocksPlayerInventoryWrites(policy.Statements))
  )
    throw new Error(
      "Player wallet mutation policy is not unconditionally denied. No test grant was attempted.",
    );
  if (!objectStorage) {
    const diamond = object(
      (await api("Catalog/GetItem", { Id: wallet.diamondItemId }, titleAuth)).Item,
    );
    const receipt = object(
      (await api("Catalog/GetItem", { Id: wallet.receiptItemId }, titleAuth)).Item,
    );
    if (diamond.Id !== wallet.diamondItemId || diamond.Type !== "currency")
      throw new Error("Published Diamonds item must have type currency.");
    if (
      receipt.Id !== wallet.receiptItemId ||
      receipt.Type !== "catalogItem" ||
      receipt.IsHidden !== true ||
      receipt.EndDate ||
      object(receipt.PriceOptions).Prices?.length
    )
      throw new Error(
        "Published receipt item must be hidden, noncurrency, unpriced, and nonexpiring.",
      );
  }
  const player = await api(
    "Authentication/GetEntityToken",
    {},
    { "X-Authorization": playerTicket },
  );
  if (
    object(player.Entity).Type !== entity.Type ||
    object(player.Entity).Id?.toUpperCase() !== entity.Id.toUpperCase() ||
    typeof player.EntityToken !== "string"
  )
    throw new Error("Player token does not resolve to the selected test player's entity.");
  // This is a disposable noncurrency marker, never a real wallet/receipt deletion.
  // If client permissions are broken it may create one marker before stopping.
  let profileVersion;
  if (objectStorage) {
    const empty = await api(
      "Object/GetObjects",
      { Entity: entity, EscapeObject: false },
      titleAuth,
    );
    if (
      object(empty.Entity).Type !== entity.Type ||
      object(empty.Entity).Id?.toUpperCase() !== entity.Id.toUpperCase() ||
      !Number.isSafeInteger(empty.ProfileVersion) ||
      empty.ProfileVersion < 0 ||
      !empty.Objects ||
      typeof empty.Objects !== "object" ||
      Array.isArray(empty.Objects) ||
      Object.hasOwn(empty.Objects, wallet.objectName) ||
      Object.keys(empty.Objects).length >= 3
    )
      throw new Error(
        "Use a fresh disposable player with no Diamonds wallet and a valid profile version. Existing data is never removed.",
      );
    profileVersion = empty.ProfileVersion;
  }
  const probe = await request(
    objectStorage ? "Object/SetObjects" : "Inventory/AddInventoryItems",
    objectStorage
      ? {
          Entity: entity,
          ExpectedProfileVersion: profileVersion,
          Objects: [
            {
              ObjectName: "civilcraft.diamonds.permission-probe.v1",
              DataObject: { verification: true },
            },
          ],
        }
      : {
          Entity: entity,
          CollectionId: "premium-wallet-verification",
          Item: { Id: wallet.receiptItemId, StackId: "player-permission-probe" },
          Amount: 1,
        },
    { "X-EntityToken": player.EntityToken },
  );
  if (
    probe.ok ||
    ![
      "NotAuthorized",
      "APINotEnabledForGameClient",
      "ApiNotEnabledForGameClient",
      "APIRequestNotAllowed",
    ].includes(String(probe.payload.error))
  )
    throw new Error(
      "Player write was not explicitly denied. Stop and review client API policy; a noncurrency probe marker may exist.",
    );
  if (objectStorage) {
    // A future version cannot match. Check the real service enforces conditional writes
    // BEFORE granting; a successful probe is a hard failure, never an attestation.
    const cas = await request(
      "Object/SetObjects",
      {
        Entity: entity,
        ExpectedProfileVersion: profileVersion + 1,
        Objects: [
          { ObjectName: "civilcraft.diamonds.cas-probe.v1", DataObject: { verification: true } },
        ],
      },
      titleAuth,
    );
    if (
      cas.ok ||
      !["EntityProfileVersionMismatch", "ConcurrentEditError"].includes(String(cas.payload.error))
    )
      throw new Error(
        "Conditional object writes were not verified. Keep checkout disabled; a nonmonetary probe object may exist.",
      );
  } else {
    const empty = await api(
      "Inventory/GetInventoryItems",
      { Entity: entity, CollectionId: wallet.collectionId, Count: 50 },
      titleAuth,
    );
    if (!Array.isArray(empty.Items) || empty.Items.length !== 0 || empty.ContinuationToken)
      throw new Error(
        "Use a fresh disposable player with an empty premium-wallet. Existing wallet data is never removed by this script.",
      );
  }

  const attestations = {
    PLAYFAB_DIAMONDS_ENABLED: "true",
    PLAYFAB_DIAMONDS_BOOTSTRAP_VERIFIED: "true",
    PLAYFAB_DIAMONDS_PLAYER_WRITES_DENIED: "true",
    PLAYFAB_DIAMONDS_VERIFIED_TITLE_ID: titleId.toUpperCase(),
    PLAYFAB_DIAMONDS_VERIFIED_CONFIG_SHA256: premiumWalletVerificationFingerprint(),
  };
  const previous = Object.fromEntries(
    Object.keys(attestations).map((key) => [key, process.env[key]]),
  );
  const orderId = `CC-DIAMONDS-VERIFY-${crypto.randomUUID()}`;
  try {
    // Enable only this isolated verification process, not deployed checkout or any env file.
    Object.assign(process.env, attestations);
    const grant = { orderId, playFabId: testPlayerId, entity, wallet, rewardAmount: 1 };
    const results = await Promise.all([grantDiamonds(grant), grantDiamonds(grant)]);
    const repeated = await grantDiamonds(grant);
    let balance = 0;
    let receiptConfirmed = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      balance = await getDiamondBalance(testPlayerId);
      receiptConfirmed = await hasDiamondReceipt(grant);
      if (balance === 1 && receiptConfirmed) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (
      balance !== 1 ||
      !repeated.alreadyGranted ||
      !receiptConfirmed ||
      results.some((result) => result.balance !== 1)
    )
      throw new Error(
        "First-wallet or duplicate grant verification failed. Keep checkout disabled and review the disposable test wallet.",
      );
    return {
      titleId: titleId.toUpperCase(),
      storage: objectStorage ? "entity-objects" : "economy-v2",
      testPlayerId: testPlayerId.toUpperCase(),
      orderId,
      balance,
      attestations,
    };
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--help")) {
    console.log(
      "Usage: node --env-file=.env scripts/verify-diamonds-setup.mjs --test-player <PlayFabId> --confirm-test-writes\nRequires a fresh disposable player and PLAYFAB_DIAMONDS_VERIFICATION_PLAYER_TICKET. Leaves exactly one test Diamond and its permanent receipt; does not edit catalog, policies, or env files.",
    );
  } else {
    const index = process.argv.indexOf("--test-player");
    try {
      const result = await verifyDiamondSetup({
        testPlayerId: index >= 0 ? process.argv[index + 1] : undefined,
        playerTicket: process.env["PLAYFAB_DIAMONDS_VERIFICATION_PLAYER_TICKET"],
        confirmTestWrites: process.argv.includes("--confirm-test-writes"),
      });
      console.log(
        `Verified title ${result.titleId}; disposable player ${result.testPlayerId}; one test Diamond; receipt order ${result.orderId}.`,
      );
      console.log(
        "All checks passed. Review these nonsecret attestations before setting deployment environment values:",
      );
      for (const [key, value] of Object.entries(result.attestations))
        console.log(`${key}=${value}`);
    } catch (error) {
      console.error(
        error instanceof Error
          ? error.message
          : "Diamonds setup verification failed. Keep checkout disabled.",
      );
      process.exitCode = 1;
    }
  }
}
