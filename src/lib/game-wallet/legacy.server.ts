import { randomUUID } from "node:crypto";
import { AdminApiError, object, playFabAdmin } from "../playfab/admin-client.server.ts";
import { resolvePremiumEntity } from "../playfab/premium-wallet.server.ts";
import { getCoinReceiptStatus, type CoinGrantInput } from "../payments/coin-receipts.server.ts";
import { normalizeOrderReward } from "../payments/products.ts";
import { isLegacyCoinGateRequired, requireGameWalletSettlementReady } from "./config.server.ts";
import { walletCall, walletIdentity, walletInteger, walletUnavailable } from "./database.server.ts";
import { digest } from "./catalog.server.ts";
import type { GameCoinOrder } from "./types.ts";
import { walletGateContext, type WalletGatePhase } from "./gate-context.server.ts";

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
export function legacyFingerprint(order: GameCoinOrder): string {
  const input = legacyCoinInput(order);
  return digest({
    protocol: "legacy-overlay-v3",
    titleId: requireGameWalletSettlementReady().databaseId,
    orderId: input.orderId,
    player: input.playFabId.toUpperCase(),
    amount: input.rewardAmount,
    code: input.currencyCode,
    version: order.coinReceiptVersion,
    receipt: input.receipt ?? null,
  });
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
  if (!isLegacyCoinGateRequired()) return task();
  return withAccountGate(playFabId, "legacy", task);
}
export async function recordLegacyCoinGrant(
  order: GameCoinOrder,
): Promise<{ alreadyGranted: boolean; covered: boolean }> {
  if (!isLegacyCoinGateRequired()) return { alreadyGranted: true, covered: false };
  const input = legacyCoinInput(order);
  if ((await getCoinReceiptStatus(input)) !== "granted")
    throw new AdminApiError(
      503,
      "Legacy purchase requires a confirmed permanent receipt before wallet credit.",
    );
  const config = requireGameWalletSettlementReady();
  const entity = await resolvePremiumEntity(order.playFabId);
  const rows = await walletCall(
    "credit",
    [
      ...walletIdentity(config, order.playFabId, entity),
      order.orderId,
      input.rewardAmount,
      legacyFingerprint(order),
      "legacy",
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
): Promise<{ classic: number; covered: Array<{ orderId: string; fingerprint: string }> }> {
  const title = await playFabAdmin("Admin/GetTitleInternalData");
  const covered: Array<{ orderId: string; fingerprint: string }> = [];
  for (const [key, value] of Object.entries(object(title["Data"]))) {
    if (!key.startsWith("civilcraft.website.v1.payment-orders.")) continue;
    let order: GameCoinOrder;
    try {
      if (typeof value !== "string") throw new Error();
      order = JSON.parse(value) as GameCoinOrder;
      if (!order || typeof order.playFabId !== "string") throw new Error();
    } catch {
      throw new AdminApiError(
        503,
        "Legacy order audit contains an invalid record; migration requires review.",
      );
    }
    if (order.playFabId.toUpperCase() !== playFabId.toUpperCase()) continue;
    const reward = normalizeOrderReward(order);
    if (reward.rewardCurrency !== "CO" || order.coinReceiptVersion === 3) continue;
    if (![1, 2].includes(order.coinReceiptVersion ?? 0)) {
      if (order.status !== "pending" && order.status !== "cancelled" && order.status !== "failed")
        throw new AdminApiError(503, "Historic Coin grant requires review before wallet import.");
      continue;
    }
    const status = await getCoinReceiptStatus(legacyCoinInput(order));
    if (status === "pending" || (status === "absent" && order.status === "fulfilled"))
      throw new AdminApiError(
        503,
        "Uncertain legacy Coin grant blocks wallet import; contact support.",
      );
    if (status === "granted")
      covered.push({ orderId: order.orderId, fingerprint: legacyFingerprint(order) });
  }
  const inventory = await playFabAdmin("Server/GetUserInventory", { PlayFabId: playFabId });
  const currencies = inventory["VirtualCurrency"];
  if (!currencies || typeof currencies !== "object" || Array.isArray(currencies))
    throw walletUnavailable();
  return { classic: walletInteger(object(currencies)["CO"] ?? 0), covered };
}
