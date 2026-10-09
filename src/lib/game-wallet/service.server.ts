import { randomBytes, createHash } from "node:crypto";
import { AdminApiError, object } from "../playfab/admin-client.server.ts";
import { getDiamondBalance, resolvePremiumEntity } from "../playfab/premium-wallet.server.ts";
import { normalizeOrderReward } from "../payments/products.ts";
import { updateOrderStatus } from "../payments/orders.server.ts";
import {
  isGameWalletEnabled,
  isGameWalletInstalled,
  requireGameWalletReady,
  requireGameWalletSettlementReady,
} from "./config.server.ts";
import {
  balanceRow,
  walletCall,
  walletIdentity,
  walletInteger,
  walletUnavailable,
} from "./database.server.ts";
import {
  boundedInteger,
  catalogFingerprint,
  digest,
  importCatalogState,
  purchaseTarget,
  rewardEvent,
} from "./catalog.server.ts";
import {
  GateBeforeMutationError,
  legacyOpeningSnapshot,
  withAccountGate,
} from "./legacy.server.ts";
import {
  MAX_GAME_COINS,
  type GameCoinOrder,
  type GameWalletDTO,
  type GameWalletSnapshot,
  type GameEntitlements,
} from "./types.ts";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function gameCoinBalance(playFabId: string) {
  if (!isGameWalletEnabled() && !isGameWalletInstalled())
    return {
      coins: null,
      ready: false,
      version: 0,
      lifetimeGoldEarned: null,
      lifetimeGoldSpent: null,
    };
  const config = requireGameWalletSettlementReady();
  const entity = await resolvePremiumEntity(playFabId);
  const rows = await walletCall("wallet_balance", walletIdentity(config, playFabId, entity), true);
  if (rows.length !== 1) throw walletUnavailable();
  const balance = balanceRow(rows[0]);
  return {
    ...balance,
    lifetimeGoldEarned: balance.ready ? walletInteger(rows[0]?.["lifetime_gold_earned"]) : null,
    lifetimeGoldSpent: balance.ready ? walletInteger(rows[0]?.["lifetime_gold_spent"]) : null,
  };
}
export async function gameWallet(playFabId: string): Promise<GameWalletDTO> {
  const coins = await gameCoinBalance(playFabId);
  if (!isGameWalletEnabled() && !isGameWalletInstalled()) return { ...coins, diamonds: null };
  let diamonds: number | null = null;
  try {
    diamonds = await getDiamondBalance(playFabId);
  } catch {
    /* Independent DI outage is not a fake zero. */
  }
  return { ...coins, diamonds };
}
export async function gameCoinSnapshot(playFabId: string): Promise<GameWalletSnapshot> {
  const config = requireGameWalletReady();
  const entity = await resolvePremiumEntity(playFabId);
  const rows = await walletCall("wallet_balance", walletIdentity(config, playFabId, entity));
  if (rows.length !== 1 || !balanceRow(rows[0]).ready)
    throw new AdminApiError(
      409,
      "Open the updated game and approve your account save before buying Coins.",
    );
  return Object.freeze({
    ...config,
    entity: Object.freeze({ Id: entity.Id.toUpperCase(), Type: entity.Type }),
  });
}
function orderInput(order: GameCoinOrder) {
  const config = requireGameWalletSettlementReady();
  const reward = normalizeOrderReward(order);
  const snapshot = order.gameWallet;
  if (
    order.coinReceiptVersion !== 3 ||
    reward.rewardCurrency !== "CO" ||
    !snapshot ||
    snapshot.storage !== config.storage ||
    snapshot.namespace !== config.namespace ||
    snapshot.databaseId !== config.databaseId ||
    snapshot.targetId !== config.targetId ||
    snapshot.protocolVersion !== 3 ||
    (order.coinCurrencyCode !== undefined && order.coinCurrencyCode !== "CO") ||
    order.coinReceipt !== undefined ||
    !/^[a-z0-9][a-z0-9._:-]{0,199}$/i.test(order.orderId)
  )
    throw walletUnavailable();
  const identity = walletIdentity(config, order.playFabId, snapshot.entity);
  const fingerprint = digest({
    protocol: 3,
    titleId: identity[1],
    orderId: order.orderId,
    player: order.playFabId.toUpperCase(),
    amount: reward.rewardAmount,
    snapshot,
  });
  return { identity, amount: reward.rewardAmount, fingerprint };
}
export async function grantGameCoins(order: GameCoinOrder): Promise<{ alreadyGranted: boolean }> {
  const input = orderInput(order);
  const rows = await walletCall(
    "credit",
    [...input.identity, order.orderId, input.amount, input.fingerprint, "payment"],
    true,
  );
  if (rows.length !== 1 || typeof rows[0]?.["already_granted"] !== "boolean")
    throw walletUnavailable();
  return { alreadyGranted: rows[0]["already_granted"] };
}
export async function repairGameCoinOrder<T extends GameCoinOrder>(order: T): Promise<T> {
  const input = orderInput(order);
  const rows = await walletCall(
    "receipt",
    [...input.identity, order.orderId, input.amount, input.fingerprint],
    true,
  );
  if (rows.length !== 1 || typeof rows[0]?.["granted"] !== "boolean") throw walletUnavailable();
  if (rows[0]["granted"] === true) {
    const updates = {
      status: "fulfilled" as const,
      fulfilledAt: order.fulfilledAt || new Date().toISOString(),
      error: null,
      fulfillmentReviewRequired: false,
    };
    if (order.status !== "fulfilled" || order.fulfillmentReviewRequired) {
      try {
        await updateOrderStatus(order.orderId, updates);
      } catch {
        /* The permanent PG receipt remains authoritative. */
      }
    }
    return { ...order, ...updates };
  }
  if (order.status === "fulfilled")
    throw new AdminApiError(503, "Coin fulfillment could not be verified.");
  return order;
}
export async function importGameWallet(
  playFabId: string,
  body: Record<string, unknown>,
): Promise<GameWalletDTO> {
  requireGameWalletReady();
  // A second device/old save never reimports or replaces the first approved snapshot.
  if ((await gameCoinBalance(playFabId)).ready) return gameWallet(playFabId);
  const gold = boundedInteger(body["gold"]);
  const earned = boundedInteger(body["lifetimeGoldEarned"] ?? 0);
  const spent = boundedInteger(body["lifetimeGoldSpent"] ?? 0);
  const saveHash = body["saveHash"];
  if (typeof saveHash !== "string" || !/^[a-f0-9]{64}$/i.test(saveHash))
    throw new AdminApiError(400, "Legacy save hash is invalid.");
  const state = importCatalogState(body);
  return withAccountGate(playFabId, "import", async (owner) => {
    const config = requireGameWalletReady();
    const entity = await resolvePremiumEntity(playFabId);
    const identity = walletIdentity(config, playFabId, entity);
    let opening: Awaited<ReturnType<typeof legacyOpeningSnapshot>>;
    try {
      if (balanceRow((await walletCall("wallet_balance", identity))[0]).ready)
        return gameWallet(playFabId);
      opening = await legacyOpeningSnapshot(playFabId);
      if (gold > MAX_GAME_COINS - opening.classic)
        throw new AdminApiError(
          400,
          "Combined legacy balance exceeds game capacity; contact support.",
        );
    } catch (error) {
      throw new GateBeforeMutationError(error);
    }
    const rows = await walletCall("import_wallet", [
      ...identity,
      owner,
      gold,
      opening.classic,
      saveHash.toLowerCase(),
      JSON.stringify(opening.covered),
      JSON.stringify(state.rewards),
      JSON.stringify(state.entitlements),
      earned,
      spent,
    ]);
    if (rows.length !== 1 || !balanceRow(rows[0]).ready) throw walletUnavailable();
    return gameWallet(playFabId);
  });
}
export async function grantGameRewards(
  playFabId: string,
  events: Record<string, unknown>[],
): Promise<GameWalletDTO> {
  const config = requireGameWalletReady();
  const prepared = events.map(rewardEvent);
  const entity = await resolvePremiumEntity(playFabId);
  for (const reward of prepared)
    await walletCall("reward", [
      ...walletIdentity(config, playFabId, entity),
      reward.key,
      reward.amount,
      reward.fingerprint,
      JSON.stringify(reward.payload),
    ]);
  return gameWallet(playFabId);
}
export async function purchaseGameItem(
  playFabId: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const config = requireGameWalletReady();
  const operation = body["operationId"];
  if (typeof operation !== "string" || !UUID.test(operation))
    throw new AdminApiError(400, "Purchase operation ID is invalid.");
  const entity = await resolvePremiumEntity(playFabId);
  let target: ReturnType<typeof purchaseTarget>;
  try {
    target = purchaseTarget(body["targetKind"], body["targetId"], body["contractId"]);
  } catch (error) {
    if (!(error instanceof AdminApiError) || error.status !== 400) throw error;
    const rejected = await walletCall("reject_purchase", [
      ...walletIdentity(config, playFabId, entity),
      operation.toLowerCase(),
      digest({
        operation: operation.toLowerCase(),
        player: playFabId.toUpperCase(),
        input: body,
        reason: "invalid-catalog",
        catalogFingerprint,
      }),
    ]);
    if (rejected.length !== 1) throw walletUnavailable();
    return purchaseDTO(rejected[0]?.["result"]);
  }
  const fingerprint = digest({
    operation: operation.toLowerCase(),
    player: playFabId.toUpperCase(),
    target,
    catalogFingerprint,
  });
  const rows = await walletCall("purchase", [
    ...walletIdentity(config, playFabId, entity),
    operation.toLowerCase(),
    fingerprint,
    target.kind,
    target.targetKey,
    target.price,
    JSON.stringify(target.payload),
  ]);
  if (rows.length !== 1 || !rows[0]?.["result"] || typeof rows[0]["result"] !== "object")
    throw walletUnavailable();
  return purchaseDTO(rows[0]["result"]);
}
export class GamePurchaseRejected extends AdminApiError {
  readonly terminal = true;
  readonly operationId: string;
  constructor(operationId: string) {
    super(
      400,
      "Purchase target is not in the allowed game catalog. This operation was rejected without spending Coins.",
    );
    this.operationId = operationId;
  }
}
function purchaseDTO(value: unknown): Record<string, unknown> {
  const result = object(value);
  const status = result["status"];
  if (
    status === "rejected" &&
    result["reason"] === "invalid-catalog" &&
    typeof result["operationId"] === "string"
  )
    throw new GamePurchaseRejected(result["operationId"]);
  const mapped =
    status === "fulfilled"
      ? "completed"
      : status === "already-owned"
        ? "already_owned"
        : status === "rejected" && result["reason"] === "insufficient-coins"
          ? "insufficient_funds"
          : null;
  if (!mapped) throw walletUnavailable();
  return { ...result, status: mapped };
}
export async function gamePurchaseStatus(
  playFabId: string,
  operation: string,
): Promise<Record<string, unknown>> {
  const config = requireGameWalletSettlementReady();
  if (!UUID.test(operation)) throw new AdminApiError(400, "Purchase operation ID is invalid.");
  const entity = await resolvePremiumEntity(playFabId);
  const rows = await walletCall(
    "purchase_status",
    [...walletIdentity(config, playFabId, entity), operation.toLowerCase()],
    true,
  );
  if (rows.length === 0) throw new AdminApiError(404, "Purchase operation was not found.");
  if (rows.length !== 1) throw walletUnavailable();
  return purchaseDTO(rows[0]?.["result"]);
}
export async function gameEntitlements(playFabId: string): Promise<GameEntitlements> {
  const config = requireGameWalletSettlementReady();
  const entity = await resolvePremiumEntity(playFabId);
  const identity = walletIdentity(config, playFabId, entity);
  const rows = await walletCall("entitlements", identity, true);
  const wallet = balanceRow((await walletCall("wallet_balance", identity, true))[0]);
  if (!wallet.ready) throw new AdminApiError(409, "Wallet import is required.");
  const shopItems: GameEntitlements["shopItems"] = [];
  const materials: GameEntitlements["materials"] = [];
  for (const row of rows) {
    const payload = object(row["payload"]);
    if (
      row["kind"] === "cosmetic" &&
      typeof payload["itemId"] === "string" &&
      typeof payload["cosmeticId"] === "string"
    )
      shopItems.push({ itemId: payload["itemId"], cosmeticId: payload["cosmeticId"] });
    else if (
      row["kind"] === "material" &&
      typeof payload["contractId"] === "string" &&
      typeof payload["materialId"] === "string" &&
      typeof payload["saveKey"] === "string"
    )
      materials.push({
        contractId: payload["contractId"],
        materialId: payload["materialId"],
        saveKey: payload["saveKey"],
      });
    else throw walletUnavailable();
  }
  return { shopItems, materials, version: wallet.version };
}
export async function issueGameShopLink(playFabId: string, currency: "coins" | "diamonds") {
  const config = requireGameWalletReady();
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  const rows = await walletCall("link_issue", [
    config.databaseId,
    walletIdentity(config, playFabId, await resolvePremiumEntity(playFabId))[1],
    playFabId.toUpperCase(),
    hash,
    currency,
  ]);
  const expiresAt = new Date(String(rows[0]?.["expires_at"])).toISOString();
  return { token, currency, expiresAt };
}
export async function assertGameShopLink(
  token: string,
  playFabId: string,
): Promise<{ valid: true; currency: "coins" | "diamonds"; expiresAt: string }> {
  const config = requireGameWalletReady();
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) throw new AdminApiError(400, "Shop link is invalid.");
  const rows = await walletCall("link_read", [
    config.databaseId,
    walletIdentity(config, playFabId, await resolvePremiumEntity(playFabId))[1],
    createHash("sha256").update(token).digest("hex"),
  ]);
  if (rows.length !== 1)
    throw new AdminApiError(
      410,
      "Shop link expired or is unavailable. Reopen the shop from the game.",
    );
  const row = rows[0]!;
  if (row["player_id"] !== playFabId.toUpperCase())
    throw new AdminApiError(
      409,
      "The browser is signed into a different game account. Sign out and use the account that opened this link.",
    );
  const expiresAt = new Date(String(row["expires_at"])).toISOString();
  if (Date.parse(expiresAt) <= Date.now())
    throw new AdminApiError(410, "Shop link expired. Reopen it from the game.");
  if (row["currency"] !== "coins" && row["currency"] !== "diamonds") throw walletUnavailable();
  return { valid: true, currency: row["currency"], expiresAt };
}
