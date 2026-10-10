import { randomUUID } from "node:crypto";
import { AdminApiError, object, playFabAdmin } from "../playfab/admin-client.server.ts";
import { resolvePremiumEntity } from "../playfab/premium-wallet.server.ts";
import { getCoinReceiptStatus, type CoinGrantInput } from "../payments/coin-receipts.server.ts";
import { normalizeOrderReward } from "../payments/products.ts";
import { assertCoinFulfillmentAvailable } from "../payments/coin-maintenance.server.ts";
import { isLegacyCoinGateRequired, requireGameWalletSettlementReady } from "./config.server.ts";
import { walletCall, walletIdentity, walletInteger, walletUnavailable } from "./database.server.ts";
import type { GameCoinOrder } from "./types.ts";
import { walletGateContext, type WalletGatePhase } from "./gate-context.server.ts";
import {
  originalEntityCoinReceipts,
  permanentReceiptForOrder,
  postgresCoinReceipts,
  sourceCoverage,
  type CoveredCoinReceipt,
} from "./receipt-authority.server.ts";

/** Used only when the caller proves no monetary statement/external mutation was dispatched. */
export class GateBeforeMutationError extends Error {
  readonly original: unknown;
  constructor(original: unknown) {
    super("Wallet preparation failed before mutation.");
    this.original = original;
  }
}

export function legacyCoinInput(order: GameCoinOrder): CoinGrantInput {
  const reward = normalizeOrderReward(order);
  if (
    reward.rewardCurrency !== "CO" ||
    ![1, 2].includes(order.coinReceiptVersion ?? 0) ||
    (order.coinReceiptVersion === 1 && order.coinReceipt !== undefined) ||
    (order.coinReceiptVersion === 2 && order.coinReceipt?.storage !== "postgres") ||
    (order.coinCurrencyCode || "CO") !== "CO"
  )
    throw walletUnavailable();
  return {
    orderId: order.orderId,
    playFabId: order.playFabId,
    currencyCode: "CO",
    rewardAmount: reward.rewardAmount,
    ...(order.coinReceiptVersion === 2 ? { receipt: order.coinReceipt! } : {}),
  };
}
export async function withAccountGate<T>(
  playFabId: string,
  reason: "import" | "legacy",
  task: (owner: string) => Promise<T>,
): Promise<T> {
  const config = requireGameWalletSettlementReady();
  const entity = await resolvePremiumEntity(playFabId);
  const identity = walletIdentity(config, playFabId, entity);
  const owner = randomUUID();
  let acquired;
  try {
    acquired = await walletCall("gate_acquire", [...identity, owner, reason], true);
  } catch (error) {
    // Task was never invoked. Ownership-CAS cannot release somebody else's fence.
    try {
      await walletCall("gate_release", [...identity, owner], true);
    } catch {
      /* Preserve unknown ownership. */
    }
    throw error;
  }
  if (acquired.length !== 1 || acquired[0]?.["acquired"] !== true)
    throw new AdminApiError(
      409,
      "This account has a pending wallet migration or legacy purchase. Contact support if it remains pending.",
    );
  // No lease expiry or reacquisition: a crashed external grant remains fenced for review.
  let result: T;
  const phase: WalletGatePhase = { monetaryAttempted: false, importAttempted: false };
  try {
    result = await walletGateContext.run(phase, () => task(owner));
  } catch (error) {
    let safe = error instanceof GateBeforeMutationError || !phase.monetaryAttempted;
    if (!safe && phase.importAttempted) {
      try {
        safe = (await walletCall("wallet_balance", identity, true))[0]?.["ready"] === true;
      } catch {
        /* Unknown commit remains fenced. */
      }
    }
    if (!safe && phase.legacyInput) {
      try {
        safe = (await getCoinReceiptStatus(phase.legacyInput)) === "granted";
      } catch {
        /* Uncertain classic grant remains fenced. */
      }
    }
    if (safe) {
      await walletCall("gate_release", [...identity, owner], true);
      throw error instanceof GateBeforeMutationError ? error.original : error;
    }
    throw error; // Unknown import commit/classic grant stays fenced; no automatic expiry.
  }
  const released = await walletCall("gate_release", [...identity, owner], true);
  if (released.length !== 1 || released[0]?.["released"] !== true) throw walletUnavailable();
  return result;
}
export async function withLegacyCoinGate<T>(playFabId: string, task: () => Promise<T>): Promise<T> {
  assertCoinFulfillmentAvailable();
  if (!isLegacyCoinGateRequired()) return task();
  return withAccountGate(playFabId, "legacy", task);
}
export async function recordLegacyCoinGrant(
  order: GameCoinOrder,
): Promise<{ alreadyGranted: boolean; covered: boolean }> {
  assertCoinFulfillmentAvailable();
  if (!isLegacyCoinGateRequired()) return { alreadyGranted: true, covered: false };
  const input = legacyCoinInput(order);
  if ((await getCoinReceiptStatus(input)) !== "granted")
    throw new AdminApiError(
      503,
      "Legacy purchase requires a confirmed permanent receipt before wallet credit.",
    );
  const config = requireGameWalletSettlementReady();
  const entity = await resolvePremiumEntity(order.playFabId);
  const source = await permanentReceiptForOrder(order, entity);
  const coverage = sourceCoverage(config, order.playFabId, entity, source);
  const rows = await walletCall(
    "credit",
    [
      ...walletIdentity(config, order.playFabId, entity),
      order.orderId,
      input.rewardAmount,
      coverage.fingerprint,
      "legacy",
      coverage.orderId,
    ],
    true,
  );
  if (
    rows.length !== 1 ||
    typeof rows[0]?.["already_granted"] !== "boolean" ||
    typeof rows[0]?.["covered"] !== "boolean"
  )
    throw walletUnavailable();
  return { alreadyGranted: rows[0]["already_granted"], covered: rows[0]["covered"] };
}
/** Invoked while holding the durable migration gate. Never treats audit status as grant proof. */
export async function legacyOpeningSnapshot(
  playFabId: string,
): Promise<{ classic: number; covered: CoveredCoinReceipt[] }> {
  const config = requireGameWalletSettlementReady();
  const entity = await resolvePremiumEntity(playFabId);
  const pg = await postgresCoinReceipts(playFabId, entity);
  // Orphan PG pending claims block before any inventory lookup or Entity fallback.
  if (pg.some((row) => row.state === "pending"))
    throw new AdminApiError(
      503,
      "Uncertain permanent Coin claim blocks wallet import; contact support.",
    );
  const original = await originalEntityCoinReceipts(playFabId, entity);
  if (original.some((row) => row.state === "pending"))
    throw new AdminApiError(
      503,
      "Uncertain original Entity Coin claim blocks wallet import; contact support.",
    );
  const covered = [...pg, ...original].map((row) => sourceCoverage(config, playFabId, entity, row));
  const inventory = await playFabAdmin("Server/GetUserInventory", { PlayFabId: playFabId });
  const currencies = inventory["VirtualCurrency"];
  if (!currencies || typeof currencies !== "object" || Array.isArray(currencies))
    throw walletUnavailable();
  return { classic: walletInteger(object(currencies)["CO"] ?? 0), covered };
}
