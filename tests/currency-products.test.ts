import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import {
  DEFAULT_PRODUCTS,
  DIAMONDS_500,
  currencyLabel,
  normalizeOrderReward,
  normalizeProductReward,
} from "../src/lib/payments/products.ts";
import {
  deleteProduct,
  getProductById,
  listActiveProducts,
  listAllProducts,
  productSchema,
  saveProduct,
  seedMissingDefaultProducts,
} from "../src/lib/payments/products.server.ts";
import { handlePlayFabAdminRequest } from "../src/lib/playfab/admin-api.server.ts";
import { getAdminAuthConfig } from "../src/lib/admin-auth/config.server.ts";
import { cookieName, issueAdminSession } from "../src/lib/admin-auth/session.server.ts";
import { hashAdminPassword } from "../src/lib/admin-auth/password.server.ts";

const PREFIX = "civilcraft.website.v1.coin-products.";
const env = {
  VITE_PLAYFAB_TITLE_ID: "17FA03",
  PLAYFAB_SECRET_KEY: "catalog-test-only-secret",
  ADMIN_AUTH_ORIGIN: "https://civilcraft.test",
  ADMIN_SESSION_SECRET: "catalog-test-session-secret-at-least-32-bytes",
  ADMIN_USERS_JSON: JSON.stringify([
    {
      email: "admin@civilcraft.test",
      displayName: "Admin",
      passwordHash: await hashAdminPassword("catalog-test-password"),
    },
  ]),
};
const previousEnv = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
let data: Record<string, string>;
let writes: Array<{ Key: string; Value: string | null }>;
let readFailure = false;
let failWriteKey: string | null = null;

beforeEach(() => {
  Object.assign(process.env, env);
  data = {};
  writes = [];
  readFailure = false;
  failWriteKey = null;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body || "{}"));
    if (url.endsWith("/Admin/GetTitleInternalData")) {
      if (readFailure)
        return Response.json({ code: 503, error: "ServiceUnavailable" }, { status: 503 });
      const selected: Record<string, string> = {};
      for (const key of (body.Keys || Object.keys(data)) as string[]) {
        if (Object.hasOwn(data, key)) selected[key] = data[key]!;
      }
      return Response.json({ code: 200, data: { Data: selected } });
    }
    if (url.endsWith("/Admin/SetTitleInternalData")) {
      if (body.Key === failWriteKey) return Response.json({ code: 503 }, { status: 503 });
      writes.push(body);
      if (body.Value === null) delete data[body.Key];
      else data[body.Key] = body.Value;
      return Response.json({ code: 200, data: {} });
    }
    throw new Error(`Unexpected test request: ${url}`);
  };
});

after(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function legacyProduct() {
  return {
    id: "coins_500",
    name: "Legacy Coins",
    description: "Existing coin package",
    amount: 5100,
    currency: "PHP",
    rewardCoins: 500,
    category: "currency",
    active: false,
    order: 70,
  };
}

test("legacy products and order snapshots normalize to Coins without being rewritten", () => {
  assert.deepEqual(normalizeProductReward({ rewardCoins: 500 }), {
    rewardCurrency: "CO",
    rewardAmount: 500,
  });
  assert.deepEqual(normalizeOrderReward({ expectedCoins: 500 }), {
    rewardCurrency: "CO",
    rewardAmount: 500,
  });
  assert.equal(currencyLabel("DI"), "Diamonds");
  assert.equal(currencyLabel("CO"), "Coins");
});

test("malformed explicit rewards never fall back to legacy Coin fields", () => {
  for (const reward of [
    { rewardCurrency: "DI", rewardCoins: 500 },
    { rewardCurrency: "DI", rewardAmount: 500, rewardCoins: 500 },
    { rewardAmount: 500, rewardCoins: 500 },
    { rewardCurrency: "XX", rewardAmount: 500, rewardCoins: 500 },
    { rewardCurrency: null, rewardAmount: 500, rewardCoins: 500 },
    { rewardCurrency: "DI", rewardAmount: -500, rewardCoins: 0 },
    { rewardCurrency: "CO", rewardAmount: 1.1, rewardCoins: 500 },
    {
      rewardCurrency: "CO",
      rewardAmount: Number.MAX_SAFE_INTEGER,
      rewardCoins: Number.MAX_SAFE_INTEGER,
    },
  ]) {
    assert.throws(() => normalizeProductReward(reward as never));
    assert.throws(() =>
      normalizeOrderReward({ ...reward, expectedCoins: reward.rewardCoins } as never),
    );
  }
});

test("approved Diamond package quantities and prices are separate from Coin compatibility fields", () => {
  const diamonds = DEFAULT_PRODUCTS.filter(
    (p) => normalizeProductReward(p).rewardCurrency === "DI",
  );
  assert.deepEqual(
    diamonds.map((p) => [p.id, p.rewardAmount, p.amount, p.rewardCoins]),
    [
      ["diamonds_500", 500, 5000, 0],
      ["diamonds_1000", 1000, 9500, 0],
      ["diamonds_2500", 2500, 22000, 0],
    ],
  );
  assert.equal(
    DEFAULT_PRODUCTS.filter((p) => normalizeProductReward(p).rewardCurrency === "CO").length,
    3,
  );
});

test("schema canonicalizes legacy and explicit rewards and rejects conflicts", () => {
  const old = productSchema.parse(legacyProduct());
  assert.equal(old.rewardCurrency, "CO");
  assert.equal(old.rewardAmount, 500);
  assert.equal(old.active, false);
  const { rewardCoins: _compat, ...diamond } = DIAMONDS_500;
  const parsed = productSchema.parse(diamond);
  assert.equal(parsed.rewardCoins, 0);
  for (const invalid of [
    { ...DIAMONDS_500, rewardCoins: 500 },
    { ...legacyProduct(), rewardCurrency: "DI" },
    { ...DIAMONDS_500, rewardAmount: 0 },
    { ...DIAMONDS_500, rewardAmount: 1.5 },
    { ...DIAMONDS_500, currency: "USD" },
    { ...DIAMONDS_500, id: "invalid/path" },
  ])
    assert.equal(productSchema.safeParse(invalid).success, false);
});

test("empty catalogue reads and missing lookups never seed or return active static defaults", async () => {
  assert.deepEqual(await listAllProducts(), []);
  assert.deepEqual(await listActiveProducts(), []);
  assert.equal(await getProductById("coins_500"), null);
  assert.equal(await getProductById("diamonds_500"), null);
  assert.equal(writes.length, 0);
});

test("catalogue outage propagates without fabricated products or writes", async () => {
  readFailure = true;
  await assert.rejects(listAllProducts(), /unavailable/i);
  await assert.rejects(listActiveProducts(), /unavailable/i);
  await assert.rejects(getProductById("diamonds_500"), /unavailable/i);
  await assert.rejects(seedMissingDefaultProducts(), /unavailable/i);
  assert.equal(writes.length, 0);
});

test("explicit missing-only migration preserves disabled, customized, and malformed records", async () => {
  const old = JSON.stringify(legacyProduct());
  const disabledDiamond = JSON.stringify({
    ...DIAMONDS_500,
    active: false,
    amount: 6000,
    rewardAmount: 700,
  });
  data[PREFIX + "coins_500"] = old;
  data[PREFIX + "diamonds_500"] = disabledDiamond;
  data[PREFIX + "diamonds_1000"] = "malformed existing record";
  data["unrelated-title-data"] = "untouched";
  await seedMissingDefaultProducts();
  assert.equal(data[PREFIX + "coins_500"], old);
  assert.equal(data[PREFIX + "diamonds_500"], disabledDiamond);
  assert.equal(data[PREFIX + "diamonds_1000"], "malformed existing record");
  assert.equal(data["unrelated-title-data"], "untouched");
  assert.equal(writes.length, 3);
  await seedMissingDefaultProducts();
  assert.equal(writes.length, 3, "Repeated migration must not rewrite any existing key");
  const active = await listActiveProducts();
  assert.equal(
    active.some((p) => p.id === "coins_500" || p.id === "diamonds_500" || p.id === "diamonds_1000"),
    false,
  );
});

test("partial migration failures do not return invented products and retry preserves edits", async () => {
  failWriteKey = PREFIX + "coins_1000";
  await assert.rejects(seedMissingDefaultProducts(), /unavailable/i);
  assert.equal(writes.length, 1);
  const edited = JSON.stringify({ ...legacyProduct(), name: "Admin edit after partial migration" });
  data[PREFIX + "coins_500"] = edited;
  failWriteKey = null;
  await seedMissingDefaultProducts();
  assert.equal(data[PREFIX + "coins_500"], edited);
  assert.equal(writes.length, 6);
});

test("Diamond save and lookup persist canonical quantity without adding Coin rewards", async () => {
  const saved = await saveProduct({ ...DIAMONDS_500, active: false });
  assert.equal(saved.rewardCoins, 0);
  assert.equal(saved.rewardCurrency, "DI");
  const read = await getProductById(" DIAMONDS_500 ");
  assert.equal(read?.rewardAmount, 500);
  assert.equal(read?.active, false);
  await assert.rejects(saveProduct({ ...DIAMONDS_500, rewardCoins: 500 }));
  assert.equal(writes.length, 1);
});

test("invalid stored IDs or rewards remain unavailable rather than restoring templates", async () => {
  data[PREFIX + "diamonds_500"] = JSON.stringify({ ...DIAMONDS_500, id: "diamonds_1000" });
  data[PREFIX + "coins_500"] = JSON.stringify({ ...legacyProduct(), rewardCurrency: "DI" });
  assert.equal(await getProductById("diamonds_500"), null);
  assert.deepEqual(await listAllProducts(), []);
  assert.equal(writes.length, 0);
});

test("history failures and existing transactions block product deletion", async () => {
  readFailure = true;
  await assert.rejects(deleteProduct("diamonds_500"), /unavailable/i);
  assert.equal(writes.length, 0);
  readFailure = false;
  data["civilcraft.website.v1.payment-orders.old-order"] = JSON.stringify({
    orderId: "old-order",
    productId: "diamonds_500",
    createdAt: "2026-01-01",
  });
  await assert.rejects(deleteProduct("diamonds_500"), /transaction records exist/i);
  assert.equal(writes.length, 0);
});

test("explicit migration endpoint requires authorized same-origin administrator POST", async () => {
  const url = "https://civilcraft.test/api/admin/products";
  const unauth = await handlePlayFabAdminRequest(
    new Request(url, { method: "POST", body: JSON.stringify({ action: "seed-missing-defaults" }) }),
  );
  assert.equal(unauth?.status, 401);
  const config = getAdminAuthConfig()!;
  const token = await issueAdminSession(config, config.users[0]!);
  const headers = {
    "Content-Type": "application/json",
    cookie: `${cookieName(config)}=${token}`,
    origin: config.origin,
  };
  const crossSite = await handlePlayFabAdminRequest(
    new Request(url, {
      method: "POST",
      headers: { ...headers, origin: "https://attacker.test" },
      body: JSON.stringify({ action: "seed-missing-defaults" }),
    }),
  );
  assert.equal(crossSite?.status, 403);
  assert.equal(writes.length, 0);
  const get = await handlePlayFabAdminRequest(new Request(url, { headers }));
  assert.equal(get?.status, 200);
  assert.equal(writes.length, 0);
  const response = await handlePlayFabAdminRequest(
    new Request(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "seed-missing-defaults" }),
    }),
  );
  assert.equal(response?.status, 200);
  assert.equal(writes.length, 6);
  const body = await response!.json();
  assert.equal(body.products.length, 6);
});
