import assert from "node:assert/strict";
import { after, test } from "node:test";
import { AdminApiError } from "../src/lib/playfab/admin-client.server.ts";
import {
  assertCoinFulfillmentAvailable,
  CoinFulfillmentMaintenance,
  isCoinFulfillmentMaintenance,
} from "../src/lib/payments/coin-maintenance.server.ts";
import {
  assertCoinCheckoutReady,
  grantCoinsOnce,
  requireCoinCheckoutReady,
} from "../src/lib/payments/coin-receipts.server.ts";
import { withLegacyCoinGate, recordLegacyCoinGrant } from "../src/lib/game-wallet/legacy.server.ts";
import {
  gameCoinSnapshot,
  grantGameCoins,
  repairGameCoinOrder,
} from "../src/lib/game-wallet/service.server.ts";

const previous = process.env.COIN_FULFILLMENT_MAINTENANCE;
after(() => {
  if (previous === undefined) delete process.env.COIN_FULFILLMENT_MAINTENANCE;
  else process.env.COIN_FULFILLMENT_MAINTENANCE = previous;
});
test("explicit maintenance is off by default and throws a retryable503 only for true", () => {
  for (const value of [undefined, "false", "1", "yes", ""]) {
    if (value === undefined) delete process.env.COIN_FULFILLMENT_MAINTENANCE;
    else process.env.COIN_FULFILLMENT_MAINTENANCE = value;
    assert.equal(isCoinFulfillmentMaintenance(), false);
    assert.doesNotThrow(assertCoinFulfillmentAvailable);
  }
  process.env.COIN_FULFILLMENT_MAINTENANCE = " TRUE ";
  assert.throws(
    assertCoinFulfillmentAvailable,
    (error) =>
      error instanceof CoinFulfillmentMaintenance &&
      error instanceof AdminApiError &&
      error.status === 503,
  );
});
test("all direct Coin fulfillment/preflight/overlay helpers fail before provider/config calls", async () => {
  process.env.COIN_FULFILLMENT_MAINTENANCE = "true";
  const fenced = (error) => error instanceof CoinFulfillmentMaintenance && error.status === 503;
  assert.throws(requireCoinCheckoutReady, fenced);
  await assert.rejects(assertCoinCheckoutReady({}), fenced);
  await assert.rejects(grantCoinsOnce({}), fenced);
  await assert.rejects(
    withLegacyCoinGate("not-a-valid-player", () => {
      throw new Error("task must not run");
    }),
    fenced,
  );
  await assert.rejects(recordLegacyCoinGrant({}), fenced);
  await assert.rejects(gameCoinSnapshot("not-a-valid-player"), fenced);
  await assert.rejects(grantGameCoins({}), fenced);
  await assert.rejects(repairGameCoinOrder({}), fenced);
});
