import crypto from "node:crypto";
import { AdminApiError, adminGameConfig, object, playFabAdmin } from "./admin-client.server.ts";

export interface PremiumEntity {
  readonly Id: string;
  readonly Type: "title_player_account";
}
export interface InventoryPremiumWalletConfig {
  readonly storage?: "economy-v2";
  readonly collectionId: "premium-wallet";
  readonly diamondItemId: string;
  readonly receiptItemId: string;
}
export interface ObjectPremiumWalletConfig {
  readonly storage: "entity-objects";
  readonly collectionId: "premium-wallet";
  readonly objectName: "civilcraft.premium-wallet.v1";
  /** Application safety cap, not a claim about the title's service quota. */
  readonly maxBytes: 8192;
}
export type PremiumWalletConfig = InventoryPremiumWalletConfig | ObjectPremiumWalletConfig;
export interface PremiumDiamondGrantInput {
  readonly orderId: string;
  readonly playFabId: string;
  readonly entity: PremiumEntity;
  readonly wallet: PremiumWalletConfig;
  readonly rewardAmount: number;
}
export interface PremiumDiamondGrantResult {
  alreadyGranted: boolean;
  balance: number;
  etag?: string;
  transactionIds?: string[];
  profileVersion?: number;
}

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const INITIAL_STACK = "wallet-initialized-v1";
const RETRIES = 4;
const UNAVAILABLE = "Diamonds service is temporarily unavailable. Please try again later.";
type EconomyOperation =
  | "Inventory/GetInventoryItems"
  | "Inventory/AddInventoryItems"
  | "Inventory/ExecuteInventoryOperations"
  | "Object/GetObjects"
  | "Object/SetObjects";
type ErrorKind = "conflict" | "retryable" | "rejected";
class WalletApiError extends AdminApiError {
  kind: ErrorKind;
  constructor(kind: ErrorKind) {
    super(503, UNAVAILABLE);
    this.kind = kind;
  }
}

function validateWallet(wallet: PremiumWalletConfig): PremiumWalletConfig {
  if (wallet?.storage === "entity-objects") {
    if (
      wallet.collectionId !== "premium-wallet" ||
      wallet.objectName !== "civilcraft.premium-wallet.v1" ||
      wallet.maxBytes !== 8192
    )
      throw new AdminApiError(503, "Diamonds wallet configuration is unavailable.");
    return Object.freeze({
      storage: "entity-objects",
      collectionId: "premium-wallet",
      objectName: "civilcraft.premium-wallet.v1",
      maxBytes: 8192,
    });
  }
  if (
    (wallet?.storage !== undefined && wallet.storage !== "economy-v2") ||
    wallet?.collectionId !== "premium-wallet" ||
    !UUID.test(wallet?.diamondItemId ?? "") ||
    !UUID.test(wallet?.receiptItemId ?? "") ||
    wallet.diamondItemId.toLowerCase() === wallet.receiptItemId.toLowerCase()
  )
    throw new AdminApiError(503, "Diamonds wallet configuration is unavailable.");
  return Object.freeze({
    collectionId: "premium-wallet" as const,
    diamondItemId: wallet.diamondItemId.toLowerCase(),
    receiptItemId: wallet.receiptItemId.toLowerCase(),
  });
}

export function premiumWalletConfig(): PremiumWalletConfig {
  const storage = (process.env["PLAYFAB_DIAMONDS_STORAGE"] || "entity-objects").trim();
  if (storage === "entity-objects") {
    // Never turn a configured historic Economy wallet into an apparently empty wallet.
    if (
      process.env["PLAYFAB_DIAMONDS_ITEM_ID"]?.trim() ||
      process.env["PLAYFAB_DIAMONDS_RECEIPT_ITEM_ID"]?.trim()
    )
      throw new AdminApiError(503, "Review the previous Diamonds wallet before switching storage.");
    return validateWallet({
      storage,
      collectionId: "premium-wallet",
      objectName: "civilcraft.premium-wallet.v1",
      maxBytes: 8192,
    });
  }
  if (storage !== "economy-v2")
    throw new AdminApiError(503, "Diamonds wallet configuration is unavailable.");
  return validateWallet({
    collectionId: "premium-wallet",
    diamondItemId: (process.env["PLAYFAB_DIAMONDS_ITEM_ID"] || "").trim(),
    receiptItemId: (process.env["PLAYFAB_DIAMONDS_RECEIPT_ITEM_ID"] || "").trim(),
  });
}

/** Old single-receipt checks cannot attest the new shared-capacity readiness contract. */
export function premiumWalletVerificationFingerprint(): string {
  const { titleId } = adminGameConfig();
  const wallet = premiumWalletConfig();
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        version: wallet.storage === "entity-objects" ? 3 : 1,
        titleId: titleId.toUpperCase(),
        ...wallet,
        ...(wallet.storage === "entity-objects"
          ? { sharedCapacityBytes: wallet.maxBytes, capacityCheck: "full-size-roundtrip-v1" }
          : {}),
      }),
    )
    .digest("hex");
}

/** No fallback wallet or legacy currency grant is permitted when setup is incomplete. */
export function requireDiamondCheckoutReady(): PremiumWalletConfig {
  const enabled = (name: string) => process.env[name]?.trim().toLowerCase() === "true";
  const { titleId, secret } = adminGameConfig();
  if (!enabled("PLAYFAB_DIAMONDS_ENABLED") || !secret)
    throw new AdminApiError(503, "Diamonds checkout is not available yet.");
  const wallet = premiumWalletConfig();
  if (
    !enabled("PLAYFAB_DIAMONDS_BOOTSTRAP_VERIFIED") ||
    !enabled("PLAYFAB_DIAMONDS_PLAYER_WRITES_DENIED") ||
    (wallet.storage === "entity-objects" && !enabled("PLAYFAB_DIAMONDS_CAPACITY_VERIFIED")) ||
    process.env["PLAYFAB_DIAMONDS_VERIFIED_TITLE_ID"]?.trim().toUpperCase() !==
      titleId.toUpperCase() ||
    process.env["PLAYFAB_DIAMONDS_VERIFIED_CONFIG_SHA256"]?.trim().toLowerCase() !==
      premiumWalletVerificationFingerprint()
  )
    throw new AdminApiError(503, "Diamonds checkout requires verified PlayFab setup.");
  return wallet;
}

export async function resolvePremiumEntity(playFabId: string): Promise<PremiumEntity> {
  if (!/^[a-f0-9]{1,32}$/i.test(playFabId))
    throw new AdminApiError(400, "Player identity is invalid.");
  const account = await playFabAdmin("Admin/GetUserAccountInfo", { PlayFabId: playFabId });
  const info = object(account["UserInfo"]);
  const entity = object(object(info["TitleInfo"])["TitlePlayerAccount"]);
  if (
    typeof info["PlayFabId"] !== "string" ||
    info["PlayFabId"].toUpperCase() !== playFabId.toUpperCase() ||
    entity["Type"] !== "title_player_account" ||
    typeof entity["Id"] !== "string" ||
    !/^[a-f0-9]{1,64}$/i.test(entity["Id"])
  )
    throw new AdminApiError(503, "Unable to resolve the player's Diamonds wallet.");
  return Object.freeze({ Id: entity["Id"], Type: "title_player_account" as const });
}

type Token = { value: string; expires: number };
let tokenContext: string | null = null;
let cachedToken: Token | null = null;
let pendingToken: Promise<Token> | null = null;

async function titleToken(refresh = false): Promise<string> {
  const { titleId, secret } = adminGameConfig();
  if (!secret) throw new WalletApiError("rejected");
  // The cache key is a hash, not a credential. It also prevents cross-title reuse.
  const context = crypto.createHash("sha256").update(`${titleId}:${secret}`).digest("hex");
  if (context !== tokenContext) {
    tokenContext = context;
    cachedToken = null;
    pendingToken = null;
  }
  if (refresh) cachedToken = null;
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;
  if (!pendingToken) {
    const currentContext = context;
    const request = (async () => {
      const result = await postPlayFab(
        "Authentication/GetEntityToken",
        {},
        { "X-SecretKey": secret },
      );
      const entity = object(result["Entity"]);
      const expires = Date.parse(String(result["TokenExpiration"] || ""));
      if (
        entity["Type"] !== "title" ||
        typeof entity["Id"] !== "string" ||
        entity["Id"].toUpperCase() !== titleId.toUpperCase() ||
        typeof result["EntityToken"] !== "string" ||
        !result["EntityToken"] ||
        !Number.isFinite(expires) ||
        expires <= Date.now() + 60_000
      )
        throw new WalletApiError("rejected");
      const token = { value: result["EntityToken"], expires };
      if (tokenContext === currentContext) cachedToken = token;
      return token;
    })();
    pendingToken = request;
    void request
      .finally(() => {
        if (pendingToken === request) pendingToken = null;
      })
      .catch(() => {});
  }
  return (await pendingToken).value;
}

class TokenRejected extends WalletApiError {}
async function postPlayFab(
  path: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const { titleId } = adminGameConfig();
  try {
    const response = await fetch(`https://${titleId}.playfabapi.com/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
    });
    const payload = object(await response.json());
    if (!response.ok || payload["code"] !== 200) {
      if (
        response.status === 412 ||
        payload["errorCode"] === 1610 ||
        payload["error"] === "PreconditionFailed" ||
        payload["error"] === "EntityProfileVersionMismatch" ||
        payload["error"] === "ConcurrentEditError"
      )
        throw new WalletApiError("conflict");
      if (
        [
          "EntityTokenExpired",
          "InvalidEntityToken",
          "NotAuthenticated",
          "AuthTokenExpired",
        ].includes(String(payload["error"]))
      )
        throw new TokenRejected("rejected");
      throw new WalletApiError(
        response.status >= 500 || response.status === 429 ? "retryable" : "rejected",
      );
    }
    if (!payload["data"] || typeof payload["data"] !== "object" || Array.isArray(payload["data"]))
      throw new WalletApiError("retryable");
    return object(payload["data"]);
  } catch (error) {
    if (error instanceof WalletApiError) throw error;
    // Never relay upstream bodies, API credentials, or account data to clients.
    throw new WalletApiError("retryable");
  }
}

async function economy(
  path: EconomyOperation,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  try {
    return await postPlayFab(path, body, { "X-EntityToken": await titleToken(), ...headers });
  } catch (error) {
    if (!(error instanceof TokenRejected)) throw error;
    // A rejected/expired token cannot have committed an inventory operation.
    return postPlayFab(path, body, { "X-EntityToken": await titleToken(true), ...headers });
  }
}

/** Shared privileged transport for server-only, conditional entity data workflows. */
export async function entityObjectsRequest(
  path: "Object/GetObjects" | "Object/SetObjects",
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return economy(path, body);
}

export function isWalletRetryable(error: unknown): boolean {
  return error instanceof WalletApiError && error.kind !== "rejected";
}

function receiptStackId(orderId: string): string {
  return `order-${crypto.createHash("sha256").update(orderId).digest("hex")}`;
}
function grantFingerprint(input: PremiumDiamondGrantInput): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        version: 1,
        orderId: input.orderId,
        playFabId: input.playFabId.toUpperCase(),
        entityId: input.entity.Id.toUpperCase(),
        ...validateWallet(input.wallet),
        rewardAmount: input.rewardAmount,
      }),
    )
    .digest("hex");
}
function validateGrant(input: PremiumDiamondGrantInput): void {
  const current = requireDiamondCheckoutReady();
  const snapshot = validateWallet(input.wallet);
  if (
    !/^[a-f0-9]{1,32}$/i.test(input.playFabId) ||
    input.entity?.Type !== "title_player_account" ||
    !/^[a-f0-9]{1,64}$/i.test(input.entity?.Id ?? "") ||
    typeof input.orderId !== "string" ||
    !/^[a-z0-9_-]{1,128}$/i.test(input.orderId) ||
    !Number.isSafeInteger(input.rewardAmount) ||
    input.rewardAmount < 1 ||
    JSON.stringify(current) !== JSON.stringify(snapshot)
  )
    throw new AdminApiError(
      503,
      "The Diamonds order does not match the approved wallet configuration.",
    );
}

interface WalletRead {
  balance: number;
  etag?: string;
  receipt: Record<string, unknown> | null;
  itemCount: number;
}
async function readWallet(
  entity: PremiumEntity,
  wallet: InventoryPremiumWalletConfig,
  stackId?: string,
): Promise<WalletRead> {
  const result = await economy("Inventory/GetInventoryItems", {
    Entity: entity,
    CollectionId: wallet.collectionId,
    Count: 50,
    Filter: stackId
      ? `id eq '${wallet.diamondItemId}' or (id eq '${wallet.receiptItemId}' and stackId eq '${stackId}')`
      : `id eq '${wallet.diamondItemId}'`,
  });
  if (!Array.isArray(result["Items"]) || result["ContinuationToken"])
    throw new WalletApiError("rejected");
  const items = result["Items"].map(object);
  const diamonds = items.filter((item) => item["Id"] === wallet.diamondItemId);
  // Diamonds uses one controlled stack; extra stacks indicate unauthorized changes.
  if (diamonds.length > 1 || (diamonds[0] && diamonds[0]["StackId"] !== "default"))
    throw new WalletApiError("rejected");
  const balance = diamonds[0]?.["Amount"] ?? 0;
  if (typeof balance !== "number" || !Number.isSafeInteger(balance) || balance < 0)
    throw new WalletApiError("rejected");
  const receipts = stackId
    ? items.filter((item) => item["Id"] === wallet.receiptItemId && item["StackId"] === stackId)
    : [];
  if (receipts.length > 1) throw new WalletApiError("rejected");
  const etag = typeof result["ETag"] === "string" && result["ETag"] ? result["ETag"] : undefined;
  return {
    balance,
    receipt: receipts[0] ?? null,
    itemCount: items.length,
    ...(etag ? { etag } : {}),
  };
}

function receiptExists(state: WalletRead, input: PremiumDiamondGrantInput): boolean {
  if (!state.receipt) return false;
  const metadata = object(state.receipt["DisplayProperties"]);
  if (
    state.receipt["Amount"] !== 1 ||
    state.receipt["ExpirationDate"] != null ||
    metadata["grantFingerprint"] !== grantFingerprint(input)
  )
    throw new AdminApiError(503, "The Diamonds purchase receipt requires review.");
  return true;
}

export async function getDiamondBalance(playFabId: string): Promise<number> {
  const wallet = requireDiamondCheckoutReady();
  const entity = await resolvePremiumEntity(playFabId);
  if (wallet.storage === "entity-objects")
    return (await readObjectWallet(playFabId, entity, wallet)).wallet.balance;
  return (await readWallet(entity, wallet)).balance;
}

/** Used only to repair a paid order's status; this function never initializes or grants. */
export async function hasDiamondReceipt(input: PremiumDiamondGrantInput): Promise<boolean> {
  validateGrant(input);
  const wallet = validateWallet(input.wallet);
  if (wallet.storage === "entity-objects")
    return objectReceiptExists(
      (await readObjectWallet(input.playFabId, input.entity, wallet)).wallet,
      input,
    );
  return receiptExists(
    await readWallet(input.entity, wallet, receiptStackId(input.orderId)),
    input,
  );
}

/** Permanent receipts and ETag CAS protect replay even after provider idempotency IDs expire. */
export async function grantDiamonds(
  input: PremiumDiamondGrantInput,
): Promise<PremiumDiamondGrantResult> {
  validateGrant(input);
  const wallet = validateWallet(input.wallet);
  if (wallet.storage === "entity-objects") return grantObjectDiamonds(input, wallet);
  const stackId = receiptStackId(input.orderId);
  let initialized = false;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const state = await readWallet(input.entity, wallet, stackId);
      if (receiptExists(state, input))
        return {
          alreadyGranted: true,
          balance: state.balance,
          ...(state.etag ? { etag: state.etag } : {}),
        };
      if (!state.etag) {
        if (state.itemCount !== 0) throw new WalletApiError("rejected");
        if (initialized) throw new WalletApiError("retryable");
        initialized = true;
        try {
          // Bootstrap may create only a nonmonetary marker. It cannot grant Diamonds.
          await economy(
            "Inventory/AddInventoryItems",
            {
              Entity: input.entity,
              CollectionId: wallet.collectionId,
              Item: { Id: wallet.receiptItemId, StackId: INITIAL_STACK },
              Amount: 1,
            },
            { "X-PlayFab-Economy-If-None-Match": "*" },
          );
        } catch (error) {
          if (!(error instanceof WalletApiError) || error.kind === "rejected") throw error;
        }
        continue;
      }
      const newBalance = state.balance + input.rewardAmount;
      if (!Number.isSafeInteger(newBalance)) throw new WalletApiError("rejected");
      const result = await economy(
        "Inventory/ExecuteInventoryOperations",
        {
          Entity: input.entity,
          CollectionId: wallet.collectionId,
          Operations: [
            {
              Add: {
                Item: { Id: wallet.receiptItemId, StackId: stackId },
                Amount: 1,
                NewStackValues: {
                  DisplayProperties: {
                    orderId: input.orderId,
                    grantFingerprint: grantFingerprint(input),
                    rewardCurrency: "DI",
                    rewardAmount: input.rewardAmount,
                  },
                },
              },
            },
            {
              Add: {
                Item: { Id: wallet.diamondItemId, StackId: "default" },
                Amount: input.rewardAmount,
              },
            },
          ],
        },
        { "X-PlayFab-Economy-If-Match": state.etag },
      );
      const etag =
        typeof result["ETag"] === "string" && result["ETag"] ? result["ETag"] : undefined;
      const transactionIds = Array.isArray(result["TransactionIds"])
        ? result["TransactionIds"].filter((id): id is string => typeof id === "string")
        : undefined;
      return {
        alreadyGranted: false,
        balance: newBalance,
        ...(etag ? { etag } : {}),
        ...(transactionIds ? { transactionIds } : {}),
      };
    } catch (error) {
      if (!(error instanceof WalletApiError) || error.kind === "rejected") throw error;
      // A timed-out write may have committed. Re-read the permanent receipt before
      // deciding to retry; stale versions will fail the next conditional write.
      if (attempt === RETRIES - 1) throw new AdminApiError(503, UNAVAILABLE);
      await new Promise((resolve) => setTimeout(resolve, 75 * (attempt + 1)));
    }
  }
  throw new AdminApiError(503, UNAVAILABLE);
}

interface ObjectReceipt {
  fingerprint: string;
  amount: number;
}
interface ObjectWallet {
  schemaVersion: 1;
  currency: "DI";
  titleId: string;
  playFabId: string;
  entityId: string;
  balance: number;
  receipts: Record<string, ObjectReceipt>;
}

async function readObjectWallet(
  playFabId: string,
  entity: PremiumEntity,
  config: ObjectPremiumWalletConfig,
): Promise<{ wallet: ObjectWallet; profileVersion: number; otherObjectBytes: number }> {
  const result = await economy("Object/GetObjects", { Entity: entity, EscapeObject: false });
  const returnedEntity = object(result["Entity"]);
  const profileVersion = result["ProfileVersion"];
  if (
    returnedEntity["Type"] !== entity.Type ||
    typeof returnedEntity["Id"] !== "string" ||
    returnedEntity["Id"].toUpperCase() !== entity.Id.toUpperCase() ||
    typeof profileVersion !== "number" ||
    !Number.isSafeInteger(profileVersion) ||
    profileVersion < 0 ||
    !result["Objects"] ||
    typeof result["Objects"] !== "object" ||
    Array.isArray(result["Objects"])
  )
    throw new WalletApiError("rejected");
  const identity = {
    schemaVersion: 1 as const,
    currency: "DI" as const,
    titleId: adminGameConfig().titleId.toUpperCase(),
    playFabId: playFabId.toUpperCase(),
    entityId: entity.Id.toUpperCase(),
  };
  const objects = object(result["Objects"]);
  let otherObjectBytes = 0;
  for (const [name, raw] of Object.entries(objects)) {
    if (name === config.objectName) continue;
    const entry = object(raw);
    if (
      entry["ObjectName"] !== name ||
      !entry["DataObject"] ||
      typeof entry["DataObject"] !== "object" ||
      Array.isArray(entry["DataObject"])
    )
      throw new WalletApiError("rejected");
    // Entity Objects may share a per-entity quota. Count names/envelopes too,
    // so unrelated objects cannot silently consume the verified wallet allowance.
    otherObjectBytes += Buffer.byteLength(
      JSON.stringify({ ObjectName: name, DataObject: entry["DataObject"] }),
      "utf8",
    );
    if (!Number.isSafeInteger(otherObjectBytes)) throw new WalletApiError("rejected");
  }
  if (!Object.hasOwn(objects, config.objectName)) {
    // The no-card setup deliberately stays within the documented free-tier three
    // objects. Do not collect a payment if the first wallet has no free slot.
    if (Object.keys(objects).length >= 3)
      throw new AdminApiError(
        503,
        "A free PlayFab object slot is required for this Diamonds wallet.",
      );
    return { wallet: { ...identity, balance: 0, receipts: {} }, profileVersion, otherObjectBytes };
  }
  const stored = object(objects[config.objectName]);
  const data = object(stored["DataObject"]);
  if (
    stored["ObjectName"] !== config.objectName ||
    Object.entries(identity).some(([key, value]) => data[key] !== value) ||
    typeof data["balance"] !== "number" ||
    !Number.isSafeInteger(data["balance"]) ||
    data["balance"] < 0 ||
    !data["receipts"] ||
    typeof data["receipts"] !== "object" ||
    Array.isArray(data["receipts"])
  )
    throw new WalletApiError("rejected");
  const receipts: Record<string, ObjectReceipt> = {};
  let total = 0;
  for (const [key, raw] of Object.entries(object(data["receipts"]))) {
    const receipt = object(raw);
    if (
      !/^order-[a-f0-9]{64}$/.test(key) ||
      typeof receipt["fingerprint"] !== "string" ||
      !/^[a-f0-9]{64}$/.test(receipt["fingerprint"]) ||
      typeof receipt["amount"] !== "number" ||
      !Number.isSafeInteger(receipt["amount"]) ||
      receipt["amount"] < 1
    )
      throw new WalletApiError("rejected");
    total += receipt["amount"];
    if (!Number.isSafeInteger(total)) throw new WalletApiError("rejected");
    receipts[key] = { fingerprint: receipt["fingerprint"], amount: receipt["amount"] };
  }
  // This phase has no spending: balance and all permanent purchase receipts must agree.
  if (total !== data["balance"]) throw new WalletApiError("rejected");
  return { wallet: { ...identity, balance: total, receipts }, profileVersion, otherObjectBytes };
}

function objectReceiptExists(wallet: ObjectWallet, input: PremiumDiamondGrantInput): boolean {
  const receipt = wallet.receipts[receiptStackId(input.orderId)];
  if (!receipt) return false;
  if (receipt.fingerprint !== grantFingerprint(input) || receipt.amount !== input.rewardAmount)
    throw new AdminApiError(503, "The Diamonds purchase receipt requires review.");
  return true;
}

function nextObjectWallet(
  state: ObjectWallet,
  input: PremiumDiamondGrantInput,
  config: ObjectPremiumWalletConfig,
  otherObjectBytes: number,
): ObjectWallet {
  const balance = state.balance + input.rewardAmount;
  if (!Number.isSafeInteger(balance)) throw new WalletApiError("rejected");
  const next: ObjectWallet = {
    ...state,
    balance,
    receipts: {
      ...state.receipts,
      [receiptStackId(input.orderId)]: {
        fingerprint: grantFingerprint(input),
        amount: input.rewardAmount,
      },
    },
  };
  // Never prune receipts to fit: stop taking payments and retain replay protection.
  if (
    otherObjectBytes +
      Buffer.byteLength(
        JSON.stringify({ ObjectName: config.objectName, DataObject: next }),
        "utf8",
      ) >
    config.maxBytes
  )
    throw new AdminApiError(
      503,
      "This Diamonds wallet has reached its storage limit. Please contact support.",
    );
  return next;
}

/** Read-only preflight before creating the PayMongo checkout; never initializes or grants. */
export async function assertDiamondCheckoutCapacity(
  input: PremiumDiamondGrantInput,
): Promise<void> {
  validateGrant(input);
  const config = validateWallet(input.wallet);
  if (config.storage === "entity-objects") {
    const state = await readObjectWallet(input.playFabId, input.entity, config);
    if (!objectReceiptExists(state.wallet, input))
      nextObjectWallet(state.wallet, input, config, state.otherObjectBytes);
  } else {
    await readWallet(input.entity, config);
  }
}

/** One version-checked JSON write stores BOTH balance and permanent receipt. */
async function grantObjectDiamonds(
  input: PremiumDiamondGrantInput,
  config: ObjectPremiumWalletConfig,
): Promise<PremiumDiamondGrantResult> {
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const state = await readObjectWallet(input.playFabId, input.entity, config);
      if (objectReceiptExists(state.wallet, input))
        return {
          alreadyGranted: true,
          balance: state.wallet.balance,
          profileVersion: state.profileVersion,
        };
      const next = nextObjectWallet(state.wallet, input, config, state.otherObjectBytes);
      const result = await economy("Object/SetObjects", {
        Entity: input.entity,
        ExpectedProfileVersion: state.profileVersion,
        Objects: [{ ObjectName: config.objectName, DataObject: next }],
      });
      if (
        typeof result["ProfileVersion"] !== "number" ||
        !Number.isSafeInteger(result["ProfileVersion"]) ||
        result["ProfileVersion"] <= state.profileVersion ||
        !Array.isArray(result["SetResults"]) ||
        !result["SetResults"].some((raw) => {
          const entry = object(raw);
          return (
            entry["ObjectName"] === config.objectName &&
            (entry["SetResult"] === "Created" || entry["SetResult"] === "Updated")
          );
        })
      )
        throw new WalletApiError("retryable");
      const confirmed = await readObjectWallet(input.playFabId, input.entity, config);
      if (!objectReceiptExists(confirmed.wallet, input)) throw new WalletApiError("retryable");
      return {
        alreadyGranted: false,
        balance: confirmed.wallet.balance,
        profileVersion: confirmed.profileVersion,
      };
    } catch (error) {
      if (!(error instanceof WalletApiError) || error.kind === "rejected") throw error;
      // Unknown outcomes are never retried blindly. The next read checks the receipt;
      // even a stale read cannot overwrite a newer profile because every write has CAS.
      if (attempt === RETRIES - 1) throw new AdminApiError(503, UNAVAILABLE);
      await new Promise((resolve) => setTimeout(resolve, 75 * (attempt + 1)));
    }
  }
  throw new AdminApiError(503, UNAVAILABLE);
}
