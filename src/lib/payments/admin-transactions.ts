import type { PaymentOrder, RewardCurrency } from "./types.ts";
import { normalizeOrderReward } from "./products.ts";
export type CheckoutState = "Completed" | "Pending" | "Failed" | "Cancelled";
export type DeliveryState = "Credited" | "Pending" | "Not credited" | "Needs review";
export interface AdminTransaction {
  orderId: string;
  playerId: string;
  productId: string;
  rewardCurrency: RewardCurrency;
  rewardAmount: number;
  price: number;
  currency: string;
  checkout: CheckoutState;
  delivery: DeliveryState;
  createdAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;
  reference: string;
  issue: string | null;
}
/** Explicit read-only projection: exclude checkout URLs, bindings and raw provider errors. */
export function adminTransaction(o: PaymentOrder): AdminTransaction {
  const completed = Boolean(o.paidAt) || o.status === "paid" || o.status === "fulfilled";
  const review = o.fulfillmentReviewRequired || (completed && Boolean(o.error));
  return {
    orderId: o.orderId,
    playerId: o.playFabId,
    productId: o.productId,
    ...normalizeOrderReward(o),
    price: o.expectedAmount / 100,
    currency: o.currency,
    checkout: completed
      ? "Completed"
      : o.status === "failed"
        ? "Failed"
        : o.status === "cancelled"
          ? "Cancelled"
          : "Pending",
    delivery: review
      ? "Needs review"
      : o.status === "fulfilled"
        ? "Credited"
        : completed
          ? "Pending"
          : "Not credited",
    createdAt: o.createdAt,
    paidAt: o.paidAt,
    fulfilledAt: o.fulfilledAt,
    reference: o.PayMongoReferenceNumber,
    issue: review
      ? "Delivery requires review. Do not manually credit or retry an uncertain grant."
      : o.error
        ? "Checkout reported an error. No successful delivery is recorded."
        : null,
  };
}
export function filterTransactions(
  rows: AdminTransaction[],
  search: string,
  currency: string,
  status: string,
  days: number,
  now = Date.now(),
) {
  const term = search.trim().toLowerCase();
  const start = days ? new Date(now) : null;
  if (start) {
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - days + 1);
  }
  return rows.filter(
    (r) =>
      (!term ||
        [r.playerId, r.orderId, r.reference, r.productId].some((v) =>
          v?.toLowerCase().includes(term),
        )) &&
      (currency === "All" || r.rewardCurrency === currency) &&
      (status === "All" || r.checkout === status || r.delivery === status) &&
      (!start || (Date.parse(r.createdAt) >= start.getTime() && Date.parse(r.createdAt) <= now)),
  );
}
export function transactionCharts(rows: AdminTransaction[]) {
  const daily = new Map<string, number>();
  const packages = { Coins: 0, Diamonds: 0 };
  const delivery: Record<DeliveryState, number> = {
    Credited: 0,
    Pending: 0,
    "Not credited": 0,
    "Needs review": 0,
  };
  for (const r of rows) {
    delivery[r.delivery]++;
    if (r.checkout !== "Completed") continue;
    packages[r.rewardCurrency === "DI" ? "Diamonds" : "Coins"]++;
    const time = Date.parse(r.paidAt ?? r.createdAt);
    if (Number.isFinite(time)) {
      const day = new Date(time).toISOString().slice(0, 10);
      daily.set(day, (daily.get(day) ?? 0) + 1);
    }
  }
  return {
    daily: [...daily]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, orders]) => ({ date, orders })),
    packages: Object.entries(packages).map(([name, orders]) => ({ name, orders })),
    delivery: Object.entries(delivery).map(([name, orders]) => ({ name, orders })),
  };
}
