import assert from "node:assert/strict";
import { test } from "node:test";
import { availableCoinPackages } from "../src/lib/payments/checkout-preflight.ts";
import { COINS_500, DIAMONDS_500 } from "../src/lib/payments/products.ts";

test("only valid active Coin products receive account checks", async () => {
  const seen: string[] = [];
  const result = await availableCoinPackages(
    [
      null,
      undefined,
      DIAMONDS_500,
      { ...COINS_500, active: false },
      { ...COINS_500, rewardAmount: -1 },
      COINS_500,
    ],
    async (product) => {
      seen.push(product.id);
      return true;
    },
  );
  assert.deepEqual(seen, [COINS_500.id]);
  assert.deepEqual(result, seen);
});

test("checks overlap with at most three in flight and preserve catalog order", async () => {
  const releases = new Map<string, () => void>();
  let active = 0;
  let maximum = 0;
  const products = Array.from({ length: 5 }, (_, i) => ({ ...COINS_500, id: String(i) }));
  const pending = availableCoinPackages(products, async (product) => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise<void>((resolve) => releases.set(product.id, resolve));
    active--;
    return true;
  });
  assert.equal(active, 3);
  releases.get("2")!();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(active, 3);
  assert.ok(releases.has("3"));
  releases.get("3")!();
  await new Promise((resolve) => setImmediate(resolve));
  releases.get("4")!();
  releases.get("1")!();
  releases.get("0")!();
  assert.deepEqual(await pending, ["0", "1", "2", "3", "4"]);
  assert.equal(maximum, 3);
});

test("failures exclude only their package and eligibility is never cached", async () => {
  const products = ["yes", "no", "error", "yes"].map((id) => ({ ...COINS_500, id }));
  assert.deepEqual(
    await availableCoinPackages(products, async (product) => {
      if (product.id === "error") throw new Error("unavailable");
      return product.id === "yes";
    }),
    ["yes"],
  );
  assert.deepEqual(await availableCoinPackages(products, async () => false), []);
  assert.deepEqual(
    await availableCoinPackages([], async () => {
      throw new Error("not called");
    }),
    [],
  );
});
