import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adminTransaction,
  filterTransactions,
  transactionCharts,
  simulatedRevenue,
} from "../src/lib/payments/admin-transactions.ts";
import type { PaymentOrder } from "../src/lib/payments/types.ts";
const base: PaymentOrder = {
  orderId: "order-one",
  playFabId: "PLAYER-A",
  productId: "coins500",
  expectedAmount: 4900,
  currency: "PHP",
  expectedCoins: 500,
  PayMongoCheckoutSessionId: "private-session",
  PayMongoReferenceNumber: "reference-one",
  status: "pending",
  createdAt: "2026-10-14T02:00:00Z",
  paidAt: null,
  fulfilledAt: null,
  webhookEventId: null,
};
test("simulated revenue counts completed orders once, not unpaid orders or reward units", () => {
  const paid = adminTransaction({ ...base, status: "paid", expectedAmount: 5010 });
  const credited = adminTransaction({
    ...base,
    orderId: "two",
    status: "fulfilled",
    expectedAmount: 5020,
  });
  const unpaid = ["pending", "failed", "cancelled"].map((status) =>
    adminTransaction({
      ...base,
      orderId: status,
      status: status as PaymentOrder["status"],
    }),
  );
  assert.deepEqual(simulatedRevenue([paid, credited, paid, ...unpaid]), [
    { currency: "PHP", amount: 100.3 },
  ]);
  assert.deepEqual(simulatedRevenue([]), []);
  assert.deepEqual(simulatedRevenue([paid, { ...credited, currency: "USD" }]), [
    { currency: "PHP", amount: 50.1 },
    { currency: "USD", amount: 50.2 },
  ]);
  assert.equal(simulatedRevenue([{ ...paid, price: NaN }]), null);
  assert.equal(simulatedRevenue([{ ...paid, price: -1 }]), null);
  assert.deepEqual(simulatedRevenue(filterTransactions([paid, credited], "two", "All", "All", 0)), [
    { currency: "PHP", amount: 50.2 },
  ]);
});
test("checkout and delivery remain independent; cancelled is never refunded", () => {
  for (const status of ["pending", "paid", "fulfilled", "failed", "cancelled"] as const) {
    const r = adminTransaction({ ...base, status });
    assert.equal(
      r.checkout,
      {
        pending: "Pending",
        paid: "Completed",
        fulfilled: "Completed",
        failed: "Failed",
        cancelled: "Cancelled",
      }[status],
    );
    assert.equal(
      r.delivery,
      {
        pending: "Not credited",
        paid: "Pending",
        fulfilled: "Credited",
        failed: "Not credited",
        cancelled: "Not credited",
      }[status],
    );
    assert.equal(r.price, 49);
  }
  assert.equal(
    adminTransaction({ ...base, status: "fulfilled", fulfillmentReviewRequired: true }).delivery,
    "Needs review",
  );
  assert.equal(
    adminTransaction({ ...base, status: "failed", paidAt: base.createdAt, error: "secret" })
      .checkout,
    "Completed",
  );
});
test("admin projection excludes private links, provider errors and wallet bindings", () => {
  const result = JSON.stringify(
    adminTransaction({
      ...base,
      status: "paid",
      checkoutUrl: "https://private-secret",
      error: "private-secret",
      gameWallet: { databaseId: "private-secret" } as PaymentOrder["gameWallet"],
    }),
  );
  assert.doesNotMatch(result, /private-secret|checkoutUrl|gameWallet|private-session/);
  assert.match(result, /Needs review/);
});
test("filters and graphs use matching real orders, counting purchases not reward units", () => {
  const rows = [
    adminTransaction({ ...base, status: "fulfilled" }),
    adminTransaction({
      ...base,
      orderId: "two",
      playFabId: "PLAYER-B",
      status: "paid",
      rewardCurrency: "DI",
      rewardAmount: 100,
      expectedCoins: 0,
    }),
    adminTransaction({ ...base, orderId: "three", status: "cancelled" }),
  ];
  const now = Date.parse("2026-10-14T12:00:00Z");
  assert.equal(filterTransactions(rows, "player-b", "All", "All", 30, now).length, 1);
  assert.equal(filterTransactions(rows, "", "CO", "Credited", 30, now).length, 1);
  assert.equal(filterTransactions(rows, "reference-one", "All", "All", 30, now).length, 3);
  assert.equal(filterTransactions(rows, "", "All", "All", 7, now + 8 * 86400000).length, 0);
  assert.deepEqual(transactionCharts(rows).packages, [
    { name: "Coins", orders: 1 },
    { name: "Diamonds", orders: 1 },
  ]);
  assert.deepEqual(transactionCharts(rows).daily, [{ date: "2026-10-14", orders: 2 }]);
  assert.equal(
    transactionCharts(rows).delivery.reduce((sum, d) => sum + d.orders, 0),
    3,
  );
  assert.deepEqual(transactionCharts([]).daily, []);
});
