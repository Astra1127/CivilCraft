import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bankersRound,
  gameCatalog,
  importCatalogState,
  purchaseTarget,
  rewardEvent,
} from "../src/lib/game-wallet/catalog.server.ts";

test("server prices/entitlement IDs come from the canonical active catalog", () => {
  const item = gameCatalog.items[0]!;
  assert.equal(purchaseTarget("cosmetic", item.itemId).price, item.price);
  assert.equal(purchaseTarget("cosmetic", item.itemId).payload.cosmeticId, item.cosmeticId);
  assert.throws(() => purchaseTarget("cosmetic", "0af84f68a2a94118b505ce5a2cc12172"), /catalog/);
  assert.throws(() => purchaseTarget("material", "Beam", "MarshID"), /active game catalog/);
});
test("material spaces and alias saves retain canonical contract/material save keys", () => {
  assert.equal(
    purchaseTarget("material", "Wood Road", "ShopKeeperContract").targetKey,
    "ShopKeeper_Wood Road",
  );
  assert.throws(() => purchaseTarget("material", "Concrete Road", "ShopKeeper"), /not allowed/);
  const state = importCatalogState({ unlockedContractMaterials: ["ShopKeeperContract_Wood Road"] });
  assert.equal(state.entitlements[0]!.payload["saveKey"], "ShopKeeper_Wood Road");
});
test("actual tutorial objective pays zero but tutorial-flagged ShopKeeper contract normally pays", () => {
  const base = { kind: "contract", sourceId: "ShopKeeper", eventId: "contract:ShopKeeper" };
  assert.equal(
    rewardEvent({
      ...base,
      evidence: { finalCost: 75000, failureCount: 0, tutorial: false, quotedAmount: 500 },
    }).amount,
    500,
  );
  assert.equal(
    rewardEvent({
      ...base,
      evidence: { finalCost: 75000, failureCount: 0, tutorial: true, quotedAmount: 0 },
    }).amount,
    0,
  );
});
test("budget bonus, over-budget/failure penalties, banker rounding match Unity float arithmetic", () => {
  assert.equal(bankersRound(2.5), 2);
  assert.equal(bankersRound(3.5), 4);
  const base = { kind: "contract", sourceId: "ReedsContract", eventId: "contract:ReedsContract" };
  assert.equal(
    rewardEvent({ ...base, evidence: { finalCost: 99000, failureCount: 2 } }).amount,
    600,
  );
  assert.equal(
    rewardEvent({ ...base, evidence: { finalCost: 100200, failureCount: 1 } }).amount,
    350,
  );
  assert.equal(
    rewardEvent({ ...base, evidence: { finalCost: 102000, failureCount: 0 } }).amount,
    0,
  );
  const cost = 99987.5;
  const expected =
    500 +
    bankersRound(
      Math.fround(Math.fround(Math.fround(100000) - Math.fround(cost)) * Math.fround(0.2)),
    );
  assert.equal(
    rewardEvent({ ...base, evidence: { finalCost: cost, failureCount: 0 } }).amount,
    expected,
  );
});
test("unknown sources, arbitrary credits and invalid evidence cannot mint rewards", () => {
  const base = { kind: "achievement", sourceId: "ACH_001", eventId: "achievement:ACH_001" };
  assert.equal(rewardEvent(base).amount, 150);
  assert.throws(() => rewardEvent({ ...base, amount: 2147483647 }), /does not match/);
  assert.throws(() => rewardEvent({ ...base, eventId: "random-event" }), /canonical source/);
  assert.throws(() => rewardEvent({ ...base, sourceId: "UNKNOWN" }), /catalog/);
  assert.throws(
    () =>
      rewardEvent({
        kind: "contract",
        sourceId: "ShopKeeper",
        eventId: "contract:ShopKeeper",
        evidence: { finalCost: NaN, failureCount: 0 },
      }),
    /cost/,
  );
  assert.throws(
    () =>
      rewardEvent({
        kind: "contract",
        sourceId: "ShopKeeper",
        eventId: "contract:ShopKeeper",
        evidence: { finalCost: 75000, failureCount: 0, quotedAmount: 10000 },
      }),
    /quote/,
  );
});
test("legacy completion tombstones and wardrobe import are canonical and deduplicated", () => {
  const item = gameCatalog.items[0]!;
  const state = importCatalogState({
    completedContracts: ["ShopKeeperContract", "INACTIVE"],
    unlockedAchievements: ["ACH_001"],
    purchasedShopItemIds: [item.itemId],
    unlockedCosmeticIDs: [item.cosmeticId, "UNKNOWN"],
  });
  assert.deepEqual(
    state.rewards.map((r) => r.key),
    ["contract:ShopKeeper", "achievement:ACH_001"],
  );
  assert.equal(state.entitlements.length, 1);
  assert.equal(state.entitlements[0]!.payload["cosmeticId"], item.cosmeticId);
});
