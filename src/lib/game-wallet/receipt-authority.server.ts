import { createHash } from "node:crypto";
import { AdminApiError, adminGameConfig, object } from "../playfab/admin-client.server.ts";
import { entityObjectsRequest, type PremiumEntity } from "../playfab/premium-wallet.server.ts";
import { normalizeOrderReward } from "../payments/products.ts";
import { requireGameWalletSettlementReady } from "./config.server.ts";
import { walletCall, walletIdentity, walletInteger } from "./database.server.ts";
import { digest } from "./catalog.server.ts";
import type { GameCoinOrder, GameWalletConfig } from "./types.ts";

export const ORIGINAL_COIN_OBJECT = "civilcraft.coin-purchases.v1";
export interface PermanentCoinReceipt {
  provider: "postgres" | "entity-objects";
  receiptKey: string;
  originalFingerprint: string;
  amount: number;
  state: "pending" | "granted";
}
export interface CoveredCoinReceipt {
  orderId: string; // Historical SQL column name; value is a provider-qualified permanent receipt key.
  fingerprint: string;
  provider: PermanentCoinReceipt["provider"];
  entityId: string;
  amount: number;
  originalFingerprint: string;
}
const hex = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function review(): AdminApiError {
  return new AdminApiError(
    503,
    "Permanent legacy Coin receipt authority requires review; wallet import was not approved.",
  );
}
export function postgresReceiptFingerprint(
  config: GameWalletConfig,
  player: string,
  entity: PremiumEntity,
  orderId: string,
  amount: number,
): string {
  return digest({
    version: 1,
    databaseId: config.databaseId,
    targetId: config.targetId,
    schemaVersion: 1,
    titleId: adminGameConfig().titleId.toUpperCase(),
    orderId,
    playFabId: player.toUpperCase(),
    entityId: entity.Id.toUpperCase(),
    entityType: entity.Type,
    currency: "CO",
    amount,
  });
}
function entityReceiptFingerprint(
  player: string,
  entity: PremiumEntity,
  orderId: string,
  amount: number,
): string {
  return digest({
    version: 1,
    orderId,
    titleId: adminGameConfig().titleId.toUpperCase(),
    playFabId: player.toUpperCase(),
    entityId: entity.Id.toUpperCase(),
    code: "CO",
    amount,
    objectName: ORIGINAL_COIN_OBJECT,
  });
}
export function sourceCoverage(
  config: GameWalletConfig,
  player: string,
  entity: PremiumEntity,
  row: PermanentCoinReceipt,
): CoveredCoinReceipt {
  return {
    orderId: row.receiptKey,
    provider: row.provider,
    entityId: entity.Id.toUpperCase(),
    amount: row.amount,
    originalFingerprint: row.originalFingerprint,
    fingerprint: digest({
      protocol: "permanent-source-coverage-v1",
      databaseId: config.databaseId,
      targetId: config.targetId,
      titleId: adminGameConfig().titleId.toUpperCase(),
      player: player.toUpperCase(),
      entityId: entity.Id.toUpperCase(),
      entityType: entity.Type,
      provider: row.provider,
      receiptKey: row.receiptKey,
      amount: row.amount,
      currency: "CO",
      originalFingerprint: row.originalFingerprint,
    }),
  };
}
export async function postgresCoinReceipts(
  player: string,
  entity: PremiumEntity,
): Promise<PermanentCoinReceipt[]> {
  const config = requireGameWalletSettlementReady();
  const rows = await walletCall("legacy_receipts", walletIdentity(config, player, entity), true);
  return rows.map((row) => {
    const orderId = row["order_id"],
      fingerprint = row["original_fingerprint"],
      state = row["state"];
    const amount = walletInteger(row["amount"]);
    if (
      typeof orderId !== "string" ||
      !/^[a-z0-9][a-z0-9._:-]{0,199}$/i.test(orderId) ||
      amount < 1 ||
      !hex(fingerprint) ||
      (state !== "pending" && state !== "granted") ||
      row["player_id"] !== player.toUpperCase() ||
      row["entity_id"] !== entity.Id.toUpperCase() ||
      row["entity_type"] !== entity.Type ||
      row["currency"] !== "CO" ||
      fingerprint !== postgresReceiptFingerprint(config, player, entity, orderId, amount)
    )
      throw review();
    return {
      provider: "postgres",
      receiptKey: `postgres:${orderId}`,
      originalFingerprint: fingerprint,
      amount,
      state,
    };
  });
}
/** Conservative live read of the same global unconditional deny used by original setup verification. */
export function policyProvesServerOnlyObjects(policy: unknown): boolean {
  const data = object(policy);
  if (data["PolicyName"] !== "ApiPolicy" || !Array.isArray(data["Statements"])) return false;
  return data["Statements"].some((raw) => {
    const statement = object(raw),
      condition = statement["ApiConditions"];
    if (
      statement["Effect"] !== "Deny" ||
      statement["Principal"] !== "*" ||
      statement["Action"] !== "*" ||
      typeof statement["Resource"] !== "string" ||
      (condition !== undefined &&
        condition !== null &&
        (typeof condition !== "object" ||
          Array.isArray(condition) ||
          Object.keys(condition).length > 0)) ||
      Object.keys(statement).some(
        (key) =>
          !["Effect", "Principal", "Action", "Resource", "ApiConditions", "Comment"].includes(key),
      )
    )
      return false;
    const pattern = statement["Resource"]
      .split("*")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*");
    return new RegExp(`^${pattern}$`, "i").test("pfrn:api--/Object/SetObjects");
  });
}
export function parseOriginalEntityReceipts(
  result: Record<string, unknown>,
  player: string,
  entity: PremiumEntity,
): { exists: boolean; receipts: PermanentCoinReceipt[] } {
  const returned = object(result["Entity"]),
    objects = result["Objects"],
    version = result["ProfileVersion"];
  if (
    returned["Type"] !== entity.Type ||
    typeof returned["Id"] !== "string" ||
    returned["Id"].toUpperCase() !== entity.Id.toUpperCase() ||
    !Number.isSafeInteger(version) ||
    Number(version) < 0 ||
    !objects ||
    typeof objects !== "object" ||
    Array.isArray(objects)
  )
    throw review();
  if (!Object.hasOwn(objects, ORIGINAL_COIN_OBJECT)) return { exists: false, receipts: [] };
  const entry = object(object(objects)[ORIGINAL_COIN_OBJECT]);
  const ledger = object(entry["DataObject"]);
  if (
    entry["ObjectName"] !== ORIGINAL_COIN_OBJECT ||
    Object.keys(ledger).length !== 5 ||
    ledger["schemaVersion"] !== 1 ||
    ledger["titleId"] !== adminGameConfig().titleId.toUpperCase() ||
    ledger["playFabId"] !== player.toUpperCase() ||
    ledger["entityId"] !== entity.Id.toUpperCase() ||
    !ledger["receipts"] ||
    typeof ledger["receipts"] !== "object" ||
    Array.isArray(ledger["receipts"])
  )
    throw review();
  const receipts = Object.entries(object(ledger["receipts"]))
    .map(([key, value]): PermanentCoinReceipt => {
      const receipt = object(value),
        amount = receipt["amount"],
        state = receipt["state"];
      if (
        !/^order-[a-f0-9]{64}$/.test(key) ||
        Object.keys(receipt).length !== 5 ||
        !hex(receipt["fingerprint"]) ||
        receipt["code"] !== "CO" ||
        typeof amount !== "number" ||
        !Number.isSafeInteger(amount) ||
        amount < 1 ||
        amount > 2_147_483_647 ||
        typeof receipt["attemptId"] !== "string" ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          receipt["attemptId"],
        ) ||
        (state !== "pending" && state !== "granted")
      )
        throw review();
      return {
        provider: "entity-objects",
        receiptKey: `entity-objects:${entity.Id.toUpperCase()}:${key}`,
        originalFingerprint: receipt["fingerprint"],
        amount,
        state,
      };
    })
    .sort((a, b) => a.receiptKey.localeCompare(b.receiptKey));
  return { exists: true, receipts };
}
export function entityAuthoritySnapshotHash(
  config: GameWalletConfig,
  player: string,
  entity: PremiumEntity,
  snapshot: { exists: boolean; receipts: PermanentCoinReceipt[] },
): string {
  return digest(
    canonical({
      protocol: "original-entity-receipts-completeness-v1",
      databaseId: config.databaseId,
      targetId: config.targetId,
      titleId: adminGameConfig().titleId.toUpperCase(),
      player: player.toUpperCase(),
      entityId: entity.Id.toUpperCase(),
      entityType: entity.Type,
      objectName: ORIGINAL_COIN_OBJECT,
      ...snapshot,
    }),
  );
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
export async function originalEntityCoinReceipts(
  player: string,
  entity: PremiumEntity,
  requireCompleteness = true,
): Promise<PermanentCoinReceipt[]> {
  const config = requireGameWalletSettlementReady();
  const snapshot = parseOriginalEntityReceipts(
    await entityObjectsRequest("Object/GetObjects", { Entity: entity, EscapeObject: false }),
    player,
    entity,
  );
  if (!requireCompleteness) return snapshot.receipts;
  // Current API policy cannot prove that a receipt was not deleted before protection was installed.
  // ALL snapshots, including empty/absent ones, need immutable historic completeness approval.
  const hash = entityAuthoritySnapshotHash(config, player, entity, snapshot);
  const manifest = await walletCall(
    "entity_manifest",
    [...walletIdentity(config, player, entity), config.targetId, hash],
    true,
  );
  if (
    manifest.length !== 1 ||
    manifest[0]?.["ledger_hash"] !== hash ||
    digest(canonical(manifest[0]?.["receipt_set"])) !== digest(canonical(snapshot))
  )
    throw review();
  return snapshot.receipts;
}
/** Original order must still match its provider/target and exact permanent receipt, not an audit state. */
export async function permanentReceiptForOrder(
  order: GameCoinOrder,
  entity: PremiumEntity,
): Promise<PermanentCoinReceipt> {
  const config = requireGameWalletSettlementReady(),
    reward = normalizeOrderReward(order);
  if (reward.rewardCurrency !== "CO" || (order.coinCurrencyCode || "CO") !== "CO") throw review();
  let rows: PermanentCoinReceipt[], key: string, expected: string;
  if (order.coinReceiptVersion === 2) {
    if (
      order.coinReceipt?.storage !== "postgres" ||
      order.coinReceipt.databaseId !== config.databaseId ||
      order.coinReceipt.targetId !== config.targetId ||
      order.coinReceipt.schemaVersion !== 1
    )
      throw review();
    rows = await postgresCoinReceipts(order.playFabId, entity);
    key = `postgres:${order.orderId}`;
    expected = postgresReceiptFingerprint(
      config,
      order.playFabId,
      entity,
      order.orderId,
      reward.rewardAmount,
    );
  } else if (order.coinReceiptVersion === 1 && order.coinReceipt === undefined) {
    // Caller already proved this exact original receipt through the historic settlement verifier.
    rows = await originalEntityCoinReceipts(order.playFabId, entity, false);
    key = `entity-objects:${entity.Id.toUpperCase()}:order-${createHash("sha256").update(order.orderId).digest("hex")}`;
    expected = entityReceiptFingerprint(
      order.playFabId,
      entity,
      order.orderId,
      reward.rewardAmount,
    );
  } else throw review();
  const row = rows.find((r) => r.receiptKey === key);
  if (
    !row ||
    row.state !== "granted" ||
    row.amount !== reward.rewardAmount ||
    row.originalFingerprint !== expected
  )
    throw review();
  return row;
}
