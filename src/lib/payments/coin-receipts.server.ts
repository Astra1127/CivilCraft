import crypto from "node:crypto";
import {
  AdminApiError,
  adminGameConfig,
  object,
  playFabAdmin,
} from "../playfab/admin-client.server.ts";
import {
  entityObjectsRequest,
  isWalletRetryable,
  premiumWalletConfig,
  premiumWalletVerificationFingerprint,
  resolvePremiumEntity,
  type PremiumEntity,
} from "../playfab/premium-wallet.server.ts";

const OBJECT_NAME = "civilcraft.coin-purchases.v1";
const CAPACITY = 8192;
const MAX_COINS = 2_147_483_647;
const RETRIES = 6;
const UNAVAILABLE = "Coin purchase receipts are temporarily unavailable.";

export class CoinGrantReviewRequired extends AdminApiError {
  constructor() {
    super(503, "This purchase needs review. Do not pay again; contact support with the order ID.");
  }
}

export interface CoinGrantInput {
  readonly orderId: string;
  readonly playFabId: string;
  readonly currencyCode: string;
  readonly rewardAmount: number;
}

interface Receipt {
  fingerprint: string;
  amount: number;
  code: string;
  attemptId: string;
  state: "pending" | "granted";
}
interface Ledger {
  schemaVersion: 1;
  titleId: string;
  playFabId: string;
  entityId: string;
  receipts: Record<string, Receipt>;
}
interface LedgerRead {
  ledger: Ledger;
  profileVersion: number;
  otherBytes: number;
}

const enabled = (key: string) => process.env[key]?.trim().toLowerCase() === "true";
const digest = (value: unknown) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function coinReceiptVerificationFingerprint(): string {
  return digest({
    version: 1,
    titleId: adminGameConfig().titleId.toUpperCase(),
    objectName: OBJECT_NAME,
    sharedCapacityBytes: CAPACITY,
    diamondConfig: premiumWalletVerificationFingerprint(),
    protocol: "permanent-pregrant-claim-v1",
  });
}

/** Coins stay in classic CO; only permanent server-only claims use Entity Objects. */
export function requireCoinCheckoutReady(): void {
  const { titleId, secret } = adminGameConfig();
  if (
    !secret ||
    premiumWalletConfig().storage !== "entity-objects" ||
    !enabled("PLAYFAB_DIAMONDS_BOOTSTRAP_VERIFIED") ||
    !enabled("PLAYFAB_DIAMONDS_PLAYER_WRITES_DENIED") ||
    !enabled("PLAYFAB_DIAMONDS_CAPACITY_VERIFIED") ||
    process.env["PLAYFAB_DIAMONDS_VERIFIED_TITLE_ID"]?.trim().toUpperCase() !==
      titleId.toUpperCase() ||
    process.env["PLAYFAB_DIAMONDS_VERIFIED_CONFIG_SHA256"]?.trim().toLowerCase() !==
      premiumWalletVerificationFingerprint() ||
    !enabled("PLAYFAB_COINS_RECEIPTS_VERIFIED") ||
    process.env["PLAYFAB_COINS_VERIFIED_TITLE_ID"]?.trim().toUpperCase() !==
      titleId.toUpperCase() ||
    process.env["PLAYFAB_COINS_VERIFIED_CONFIG_SHA256"]?.trim().toLowerCase() !==
      coinReceiptVerificationFingerprint()
  )
    throw new AdminApiError(503, "Coin checkout requires verified purchase-receipt setup.");
}

function validate(input: CoinGrantInput): void {
  requireCoinCheckoutReady();
  if (
    !/^[a-z0-9_-]{1,128}$/i.test(input.orderId) ||
    !/^[a-f0-9]{1,32}$/i.test(input.playFabId) ||
    !/^[A-Z]{2}$/.test(input.currencyCode) ||
    !Number.isSafeInteger(input.rewardAmount) ||
    input.rewardAmount < 1 ||
    input.rewardAmount > MAX_COINS
  )
    throw new AdminApiError(503, "Coin order configuration requires review.");
}
function receiptKey(input: CoinGrantInput): string {
  return `order-${crypto.createHash("sha256").update(input.orderId).digest("hex")}`;
}
function fingerprint(input: CoinGrantInput, entity: PremiumEntity): string {
  return digest({
    version: 1,
    orderId: input.orderId,
    titleId: adminGameConfig().titleId.toUpperCase(),
    playFabId: input.playFabId.toUpperCase(),
    entityId: entity.Id.toUpperCase(),
    code: input.currencyCode,
    amount: input.rewardAmount,
    objectName: OBJECT_NAME,
  });
}

async function read(input: CoinGrantInput, entity: PremiumEntity): Promise<LedgerRead> {
  const result = await entityObjectsRequest("Object/GetObjects", {
    Entity: entity,
    EscapeObject: false,
  });
  const returned = object(result["Entity"]);
  const version = result["ProfileVersion"];
  const rawObjects = result["Objects"];
  if (
    returned["Type"] !== entity.Type ||
    typeof returned["Id"] !== "string" ||
    returned["Id"].toUpperCase() !== entity.Id.toUpperCase() ||
    typeof version !== "number" ||
    !Number.isSafeInteger(version) ||
    version < 0 ||
    !rawObjects ||
    typeof rawObjects !== "object" ||
    Array.isArray(rawObjects)
  )
    throw new AdminApiError(503, UNAVAILABLE);
  const objects = object(rawObjects);
  let otherBytes = 0;
  for (const [name, raw] of Object.entries(objects)) {
    const entry = object(raw);
    if (
      entry["ObjectName"] !== name ||
      !entry["DataObject"] ||
      typeof entry["DataObject"] !== "object" ||
      Array.isArray(entry["DataObject"])
    )
      throw new AdminApiError(503, UNAVAILABLE);
    if (name !== OBJECT_NAME)
      otherBytes += Buffer.byteLength(
        JSON.stringify({ ObjectName: name, DataObject: entry["DataObject"] }),
        "utf8",
      );
  }
  const identity = {
    schemaVersion: 1 as const,
    titleId: adminGameConfig().titleId.toUpperCase(),
    playFabId: input.playFabId.toUpperCase(),
    entityId: entity.Id.toUpperCase(),
  };
  if (!Object.hasOwn(objects, OBJECT_NAME)) {
    if (Object.keys(objects).length >= 3)
      throw new AdminApiError(
        503,
        "A free PlayFab object slot is required for Coin purchase receipts.",
      );
    return { ledger: { ...identity, receipts: {} }, profileVersion: version, otherBytes };
  }
  const data = object(object(objects[OBJECT_NAME])["DataObject"]);
  if (
    Object.keys(data).length !== 5 ||
    Object.entries(identity).some(([key, value]) => data[key] !== value) ||
    !data["receipts"] ||
    typeof data["receipts"] !== "object" ||
    Array.isArray(data["receipts"])
  )
    throw new AdminApiError(503, "Coin purchase receipts require review.");
  const receipts: Record<string, Receipt> = {};
  for (const [key, raw] of Object.entries(object(data["receipts"]))) {
    const entry = object(raw);
    if (
      !/^order-[a-f0-9]{64}$/.test(key) ||
      Object.keys(entry).length !== 5 ||
      typeof entry["fingerprint"] !== "string" ||
      !/^[a-f0-9]{64}$/.test(entry["fingerprint"]) ||
      typeof entry["attemptId"] !== "string" ||
      !/^[a-f0-9-]{36}$/.test(entry["attemptId"]) ||
      typeof entry["code"] !== "string" ||
      !/^[A-Z]{2}$/.test(entry["code"]) ||
      typeof entry["amount"] !== "number" ||
      !Number.isSafeInteger(entry["amount"]) ||
      entry["amount"] < 1 ||
      entry["amount"] > MAX_COINS ||
      (entry["state"] !== "pending" && entry["state"] !== "granted")
    )
      throw new AdminApiError(503, "Coin purchase receipts require review.");
    receipts[key] = entry as unknown as Receipt;
  }
  return { ledger: { ...identity, receipts }, profileVersion: version, otherBytes };
}

function receipt(
  state: LedgerRead,
  input: CoinGrantInput,
  entity: PremiumEntity,
): Receipt | undefined {
  const entry = state.ledger.receipts[receiptKey(input)];
  if (
    entry &&
    (entry.fingerprint !== fingerprint(input, entity) ||
      entry.amount !== input.rewardAmount ||
      entry.code !== input.currencyCode)
  )
    throw new CoinGrantReviewRequired();
  return entry;
}

function nextLedger(
  state: LedgerRead,
  input: CoinGrantInput,
  entity: PremiumEntity,
  attemptId: string,
): Ledger {
  const next: Ledger = {
    ...state.ledger,
    receipts: {
      ...state.ledger.receipts,
      [receiptKey(input)]: {
        fingerprint: fingerprint(input, entity),
        amount: input.rewardAmount,
        code: input.currencyCode,
        attemptId,
        state: "pending",
      },
    },
  };
  if (
    state.otherBytes +
      Buffer.byteLength(JSON.stringify({ ObjectName: OBJECT_NAME, DataObject: next }), "utf8") >
    CAPACITY
  )
    throw new AdminApiError(503, "Purchase receipt storage is full. Please contact support.");
  return next;
}
async function checkBalance(state: LedgerRead, input: CoinGrantInput): Promise<void> {
  const result = await playFabAdmin("Server/GetUserInventory", { PlayFabId: input.playFabId });
  const currencies = result["VirtualCurrency"];
  if (!currencies || typeof currencies !== "object" || Array.isArray(currencies))
    throw new AdminApiError(503, "Coin balance is unavailable.");
  const balance = object(currencies)[input.currencyCode] ?? 0;
  if (
    typeof balance !== "number" ||
    !Number.isSafeInteger(balance) ||
    balance < 0 ||
    balance > MAX_COINS
  )
    throw new AdminApiError(503, "Coin balance is unavailable.");
  const reserved = Object.values(state.ledger.receipts)
    .filter((r) => r.code === input.currencyCode && r.state === "pending")
    .reduce((sum, r) => sum + r.amount, 0);
  if (!Number.isSafeInteger(reserved) || balance + reserved + input.rewardAmount > MAX_COINS)
    throw new AdminApiError(
      503,
      "Coin balance has insufficient purchase capacity. Please contact support.",
    );
}
async function write(state: LedgerRead, entity: PremiumEntity, ledger: Ledger): Promise<void> {
  await entityObjectsRequest("Object/SetObjects", {
    Entity: entity,
    ExpectedProfileVersion: state.profileVersion,
    Objects: [{ ObjectName: OBJECT_NAME, DataObject: ledger }],
  });
  // Every caller confirms via a read, including unknown outcomes and malformed responses.
}
const pause = (attempt: number) =>
  new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));

export async function assertCoinCheckoutReady(input: CoinGrantInput): Promise<void> {
  validate(input);
  const entity = await resolvePremiumEntity(input.playFabId);
  const state = await read(input, entity);
  if (receipt(state, input, entity)) throw new CoinGrantReviewRequired();
  nextLedger(state, input, entity, crypto.randomUUID());
  await checkBalance(state, input);
}

export async function getCoinReceiptStatus(
  input: CoinGrantInput,
): Promise<"absent" | "pending" | "granted"> {
  validate(input);
  const entity = await resolvePremiumEntity(input.playFabId);
  return receipt(await read(input, entity), input, entity)?.state ?? "absent";
}

/** Classic AddUserVirtualCurrency is NOT idempotent. An uncertain grant is never repeated. */
export async function grantCoinsOnce(input: CoinGrantInput): Promise<{ alreadyGranted: boolean }> {
  validate(input);
  const entity = await resolvePremiumEntity(input.playFabId);
  const attemptId = crypto.randomUUID();
  let ownsClaim = false;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const state = await read(input, entity);
      const existing = receipt(state, input, entity);
      if (existing?.state === "granted") return { alreadyGranted: true };
      if (existing?.attemptId === attemptId) {
        ownsClaim = true;
        break;
      }
      if (!existing) {
        await checkBalance(state, input);
        await write(state, entity, nextLedger(state, input, entity, attemptId));
      }
      // Another worker's pending claim is never stolen, expired, or deleted.
    } catch (error) {
      if (!isWalletRetryable(error)) throw error;
    }
    await pause(attempt);
  }
  if (!ownsClaim) throw new CoinGrantReviewRequired();
  try {
    const result = await playFabAdmin("Server/AddUserVirtualCurrency", {
      PlayFabId: input.playFabId,
      VirtualCurrency: input.currencyCode,
      Amount: input.rewardAmount,
      CustomTags: { orderId: input.orderId },
    });
    if (
      typeof result["PlayFabId"] !== "string" ||
      result["PlayFabId"].toUpperCase() !== input.playFabId.toUpperCase() ||
      result["VirtualCurrency"] !== input.currencyCode ||
      result["BalanceChange"] !== input.rewardAmount ||
      typeof result["Balance"] !== "number" ||
      !Number.isSafeInteger(result["Balance"]) ||
      result["Balance"] < input.rewardAmount ||
      result["Balance"] > MAX_COINS
    )
      throw new CoinGrantReviewRequired();
  } catch {
    // The provider may have credited Coins before a timeout/error. Keep the permanent claim.
    throw new CoinGrantReviewRequired();
  }
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const state = await read(input, entity);
      const existing = receipt(state, input, entity);
      if (existing?.state === "granted") return { alreadyGranted: false };
      if (!existing || existing.attemptId !== attemptId) throw new CoinGrantReviewRequired();
      await write(state, entity, {
        ...state.ledger,
        receipts: {
          ...state.ledger.receipts,
          [receiptKey(input)]: { ...existing, state: "granted" },
        },
      });
    } catch (error) {
      if (!isWalletRetryable(error)) throw new CoinGrantReviewRequired();
    }
    await pause(attempt);
  }
  // A last-attempt confirmation may have committed. Read once more; never repeat money.
  try {
    const confirmed = receipt(await read(input, entity), input, entity);
    if (confirmed?.state === "granted") return { alreadyGranted: false };
  } catch {
    /* Keep the permanent pending claim and require reconciliation. */
  }
  throw new CoinGrantReviewRequired();
}
