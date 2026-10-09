import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const MAX_COINS = 2_147_483_647;
const PLAYER = "ABC123";
const ENTITY = { Id: "FACE123", Type: "title_player_account" };
const DATABASE_ID = "0654f25d-9b4b-4f8a-b039-e0359a3b50f2";
const TARGET_ID = "b".repeat(64);
const snapshot = () => ({
  storage: "postgres",
  databaseId: DATABASE_ID,
  targetId: TARGET_ID,
  schemaVersion: 1,
});
const input = (orderId = "postgres-coin-order-1", rewardAmount = 500) => ({
  orderId,
  playFabId: PLAYER,
  currencyCode: "CO",
  rewardAmount,
  receipt: snapshot(),
});
const plain = (value) => JSON.parse(JSON.stringify(value));
const source = readFileSync(
  new URL("../src/lib/payments/coin-receipts.server.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
  },
}).outputText;

class AdminApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** All database and PlayFab boundaries are in-memory doubles. No env file or network is used. */
function fixture(options = {}) {
  const env = {
    VITE_PLAYFAB_TITLE_ID: "17FA03",
    PLAYFAB_SECRET_KEY: "mock-postgres-coin-title-secret",
    COIN_RECEIPTS_STORAGE: "postgres",
    COIN_CHECKOUT_ENABLED: "true",
    PLAYFAB_DIAMONDS_ENABLED: "false",
    PLAYFAB_DIAMONDS_BOOTSTRAP_VERIFIED: "false",
    PLAYFAB_DIAMONDS_PLAYER_WRITES_DENIED: "false",
    PLAYFAB_DIAMONDS_CAPACITY_VERIFIED: "false",
    PLAYFAB_COINS_RECEIPTS_VERIFIED: "false",
  };
  const receipts = new Map();
  const calls = [];
  let balance = options.balance ?? 0;
  let increments = 0;
  let claimed = 0;
  let completed = 0;
  let entityCalls = 0;
  let entityObjectCalls = 0;
  let failedReadbacks = options.failedReadbacks ?? 0;
  const unavailable = () => new AdminApiError(503, "Currency database is temporarily unavailable.");
  const config = () => {
    calls.push("config");
    if (options.notReady) throw unavailable();
    return { ...snapshot(), collectionId: "premium-wallet" };
  };
  const checkGrant = (grant) => {
    assert.equal(grant.currency, "CO");
    assert.equal(grant.databaseId, DATABASE_ID);
    assert.equal(grant.targetId, TARGET_ID);
    assert.equal(grant.schemaVersion, 1);
    assert.deepEqual(plain(grant.entity), ENTITY);
    const existing = receipts.get(grant.orderId);
    if (existing && JSON.stringify(existing.grant) !== JSON.stringify(plain(grant)))
      throw new AdminApiError(503, "Coin receipt identity requires review.");
    return existing;
  };
  const database = {
    requireCurrencyDatabaseReady: config,
    async assertCurrencyDatabaseHealthy() {
      calls.push("health");
      if (options.unhealthy) throw unavailable();
    },
    async databaseReceiptStatus(grant) {
      calls.push("status");
      const existing = checkGrant(grant);
      if (existing?.state === "granted" && failedReadbacks-- > 0) throw unavailable();
      if (options.staleReceiptReads && existing?.state === "granted") return "pending";
      return existing?.state ?? "absent";
    },
    async assertDatabaseCoinCapacity(grant) {
      calls.push("capacity");
      checkGrant(grant);
      if (options.capacityFailure) throw unavailable();
      const pendingAmount = [...receipts.values()]
        .filter((receipt) => receipt.state === "pending")
        .reduce((sum, receipt) => sum + receipt.grant.amount, 0);
      return { pendingAmount: options.pendingAmount ?? pendingAmount };
    },
    async claimDatabaseCoins(grant, attemptId) {
      calls.push("claim");
      assert.match(attemptId, /^[a-f0-9-]{36}$/);
      if (checkGrant(grant)) return false;
      if (options.claimFailureBeforeWrite) throw unavailable();
      receipts.set(grant.orderId, { grant: plain(grant), attemptId, state: "pending" });
      claimed++;
      if (options.postClaimPendingAmount !== undefined)
        options.pendingAmount = options.postClaimPendingAmount;
      if (options.claimTimeoutAfterCommit) throw unavailable();
      return options.claimResult ?? true;
    },
    async completeDatabaseCoins(grant, attemptId) {
      calls.push("complete");
      const existing = checkGrant(grant);
      assert.equal(existing?.attemptId, attemptId);
      completed++;
      if (options.completeFailure) throw unavailable();
      existing.state = "granted";
      if (options.completeTimeoutAfterCommit) throw unavailable();
    },
  };
  const admin = {
    AdminApiError,
    adminGameConfig: () => ({ titleId: env.VITE_PLAYFAB_TITLE_ID, secret: env.PLAYFAB_SECRET_KEY }),
    object: (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {}),
    async playFabAdmin(operation, body) {
      calls.push(operation);
      if (operation === "Admin/ListVirtualCurrencyTypes") {
        assert.deepEqual(plain(body), {});
        if (options.currencyListFailure) throw unavailable();
        return options.currencyList ?? { VirtualCurrencies: [{ CurrencyCode: "CO" }] };
      }
      assert.equal(body.PlayFabId, PLAYER);
      if (operation === "Server/GetUserInventory")
        return options.inventory ?? { VirtualCurrency: { CO: balance, ZZ: 7 }, Inventory: [] };
      assert.equal(operation, "Server/AddUserVirtualCurrency");
      assert.equal(body.VirtualCurrency, "CO");
      assert.deepEqual(plain(body.CustomTags), { orderId: body.CustomTags.orderId });
      assert.equal(receipts.get(body.CustomTags.orderId)?.state, "pending", "claim precedes money");
      increments++;
      if (options.grantFailureBeforeCredit) throw unavailable();
      balance += body.Amount;
      if (options.grantTimeoutAfterCredit) throw new Error("private-title-key-timeout");
      return (
        options.grantResult ?? {
          PlayFabId: PLAYER,
          VirtualCurrency: "CO",
          BalanceChange: body.Amount,
          Balance: balance,
        }
      );
    },
  };
  const entity = {
    premiumWalletConfig: () => ({ storage: "entity-objects" }),
    premiumWalletVerificationFingerprint: () => "mock-entity-wallet-verification",
    isWalletRetryable: () => false,
    async resolvePremiumEntity(player) {
      entityCalls++;
      assert.match(player, /^[a-f0-9]{1,32}$/i);
      return ENTITY;
    },
    async entityObjectsRequest() {
      entityObjectCalls++;
      assert.fail("PostgreSQL Coin dispatch must never touch Entity Objects");
    },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    process: { env },
    Buffer,
    setTimeout: (callback) => setTimeout(callback, 0),
    require(id) {
      if (id === "node:crypto") return crypto;
      if (id.endsWith("gate-context.server.ts"))
        return { markLegacyCoinMutationAttempted: () => {} };
      if (id.endsWith("admin-client.server.ts")) return admin;
      if (id.endsWith("premium-wallet.server.ts")) return entity;
      if (id.endsWith("currency-database.server.ts")) return database;
      throw new Error("Unexpected mocked dependency: " + id);
    },
  });
  return {
    api: exports,
    env,
    receipts,
    calls,
    options,
    get balance() {
      return balance;
    },
    get increments() {
      return increments;
    },
    get claimed() {
      return claimed;
    },
    get completed() {
      return completed;
    },
    get entityCalls() {
      return entityCalls;
    },
    get entityObjectCalls() {
      return entityObjectCalls;
    },
    reviewed(error) {
      return error instanceof exports.CoinGrantReviewRequired && error.status === 503;
    },
  };
}

test("new PostgreSQL Coin orders receive a frozen verified database snapshot independent of Diamonds", () => {
  const f = fixture();
  const result = f.api.coinReceiptSnapshot();
  assert.deepEqual(plain(result), snapshot());
  assert.equal(Object.isFrozen(result), true);
  assert.equal(f.entityCalls, 0);
  assert.equal(f.claimed, 0);
  assert.equal(f.env.PLAYFAB_DIAMONDS_ENABLED, "false");
});

test("unconfigured, disabled, or missing-secret PostgreSQL checkout cannot issue a snapshot", () => {
  for (const options of [{ notReady: true }, {}]) {
    const f = fixture(options);
    if (!options.notReady) f.env.COIN_CHECKOUT_ENABLED = "false";
    assert.throws(
      () => f.api.coinReceiptSnapshot(),
      (error) => error.status === 503,
    );
    assert.equal(f.claimed, 0);
    assert.equal(f.increments, 0);
  }
  const f = fixture();
  f.env.PLAYFAB_SECRET_KEY = "";
  assert.throws(
    () => f.api.requireCoinCheckoutReady(),
    (error) => error.status === 503,
  );
});

test("default Entity provider is preserved and cannot silently return a PostgreSQL snapshot", () => {
  const f = fixture();
  delete f.env.COIN_RECEIPTS_STORAGE;
  Object.assign(f.env, {
    PLAYFAB_DIAMONDS_BOOTSTRAP_VERIFIED: "true",
    PLAYFAB_DIAMONDS_PLAYER_WRITES_DENIED: "true",
    PLAYFAB_DIAMONDS_CAPACITY_VERIFIED: "true",
    PLAYFAB_DIAMONDS_VERIFIED_TITLE_ID: "17FA03",
    PLAYFAB_DIAMONDS_VERIFIED_CONFIG_SHA256: "mock-entity-wallet-verification",
    PLAYFAB_COINS_RECEIPTS_VERIFIED: "true",
    PLAYFAB_COINS_VERIFIED_TITLE_ID: "17FA03",
  });
  f.env.PLAYFAB_COINS_VERIFIED_CONFIG_SHA256 = f.api.coinReceiptVerificationFingerprint();
  assert.equal(f.api.coinReceiptSnapshot(), undefined);
  assert.equal(f.calls.includes("config"), false);
  f.env.COIN_RECEIPTS_STORAGE = "unknown";
  assert.throws(
    () => f.api.coinReceiptSnapshot(),
    (error) => error.status === 503,
  );
});

test("legacy receipt-absent grants and status checks never dispatch into PostgreSQL after an env change", async () => {
  const f = fixture();
  const legacy = input();
  delete legacy.receipt;
  await assert.rejects(f.api.grantCoinsOnce(legacy), f.reviewed);
  await assert.rejects(f.api.getCoinReceiptStatus(legacy), f.reviewed);
  await assert.rejects(f.api.assertCoinCheckoutReady(legacy), f.reviewed);
  assert.equal(f.entityCalls, 0);
  assert.equal(f.claimed, 0);
  assert.equal(f.entityObjectCalls, 0);
  assert.equal(f.increments, 0);
});

test("a bound version2 database receipt settles after new Coin checkout is disabled or points elsewhere", async () => {
  const f = fixture();
  f.env.COIN_CHECKOUT_ENABLED = "false";
  f.env.COIN_RECEIPTS_STORAGE = "entity-objects";
  assert.equal((await f.api.grantCoinsOnce(input())).alreadyGranted, false);
  assert.equal(await f.api.getCoinReceiptStatus(input()), "granted");
  assert.equal((await f.api.grantCoinsOnce(input())).alreadyGranted, true);
  assert.equal(f.increments, 1);
  assert.equal(f.entityObjectCalls, 0);
  assert.equal(f.claimed, 1);
  await assert.rejects(
    f.api.assertCoinCheckoutReady(input("new-order")),
    (error) => error.status === 503,
  );
  assert.equal(f.increments, 1);
});

for (const receipt of [
  { ...snapshot(), databaseId: "a-different-database" },
  { ...snapshot(), targetId: "c".repeat(64) },
  { storage: "postgres", databaseId: DATABASE_ID, schemaVersion: 1 },
  { ...snapshot(), schemaVersion: 2 },
  { ...snapshot(), storage: "entity-objects" },
  { ...snapshot(), playerId: "untrusted-browser-player" },
  null,
]) {
  test(
    "mismatched or malformed immutable Coin receipt snapshot is rejected: " +
      JSON.stringify(receipt),
    async () => {
      const f = fixture();
      await assert.rejects(f.api.grantCoinsOnce({ ...input(), receipt }), f.reviewed);
      assert.equal(f.entityCalls, 0);
      assert.equal(f.claimed, 0);
      assert.equal(f.increments, 0);
    },
  );
}

test("PostgreSQL receipt provider rejects non-CO rewards without any DB claim", async () => {
  const f = fixture();
  await assert.rejects(f.api.grantCoinsOnce({ ...input(), currencyCode: "DI" }), f.reviewed);
  assert.equal(f.claimed, 0);
  assert.equal(f.increments, 0);
});

test("checkout validates healthy DB and actual classic Coin headroom without writing a receipt", async () => {
  const f = fixture({ balance: 10 });
  await f.api.assertCoinCheckoutReady(input());
  assert.equal(f.calls.includes("health"), true);
  assert.equal(f.calls.includes("Server/GetUserInventory"), true);
  assert.equal(await f.api.getCoinReceiptStatus(input()), "absent");
  assert.equal(f.claimed, 0);
  assert.equal(f.increments, 0);
  assert.equal(f.entityObjectCalls, 0);
});

test("an unhealthy database blocks checkout before any receipt or currency change", async () => {
  const f = fixture({ unhealthy: true });
  await assert.rejects(f.api.assertCoinCheckoutReady(input()), (error) => error.status === 503);
  assert.equal(f.claimed, 0);
  assert.equal(f.increments, 0);
});

for (const currencyList of [
  {},
  { VirtualCurrencies: null },
  { VirtualCurrencies: {} },
  { VirtualCurrencies: [] },
  { VirtualCurrencies: [{ CurrencyCode: "DI" }] },
  { VirtualCurrencies: [{ CurrencyCode: "CO" }, { CurrencyCode: "CO" }] },
  { VirtualCurrencies: [{ CurrencyCode: "co" }] },
  { VirtualCurrencies: ["CO"] },
  { VirtualCurrencies: [{ CurrencyCode: "CO" }, null] },
]) {
  test(
    "undefined or malformed classic CO definition blocks checkout and grants: " +
      JSON.stringify(currencyList),
    async () => {
      const f = fixture({ currencyList });
      await assert.rejects(f.api.assertCoinCheckoutReady(input()), /Coins are not configured/);
      await assert.rejects(f.api.grantCoinsOnce(input()), /Coins are not configured/);
      assert.equal(f.claimed, 0);
      assert.equal(f.increments, 0);
      assert.equal(f.receipts.size, 0);
      assert.equal(
        f.calls.some((call) => /AddVirtualCurrencyTypes|RemoveVirtualCurrencyTypes/.test(call)),
        false,
      );
    },
  );
}

test("an unavailable classic currency definition blocks checkout and fresh grants without changing money", async () => {
  const f = fixture({ currencyListFailure: true });
  await assert.rejects(f.api.assertCoinCheckoutReady(input()), (error) => error.status === 503);
  await assert.rejects(f.api.grantCoinsOnce(input()), (error) => error.status === 503);
  assert.equal(f.claimed, 0);
  assert.equal(f.increments, 0);
  assert.equal(f.receipts.size, 0);
});

test("balance availability can check the existing CO definition without checkout or DB readiness", async () => {
  const f = fixture({ notReady: true });
  f.env.COIN_CHECKOUT_ENABLED = "false";
  await f.api.assertClassicCurrencyConfigured();
  assert.deepEqual(f.calls, ["Admin/ListVirtualCurrencyTypes"]);
  assert.equal(f.claimed, 0);
  assert.equal(f.increments, 0);
});

test("a granted permanent receipt remains repairable when classic currency metadata is unavailable", async () => {
  const f = fixture();
  await f.api.grantCoinsOnce(input());
  const metadataReads = f.calls.filter((call) => call === "Admin/ListVirtualCurrencyTypes").length;
  f.options.currencyListFailure = true;
  assert.equal((await f.api.grantCoinsOnce(input())).alreadyGranted, true);
  assert.equal(await f.api.getCoinReceiptStatus(input()), "granted");
  assert.equal(
    f.calls.filter((call) => call === "Admin/ListVirtualCurrencyTypes").length,
    metadataReads,
  );
  assert.equal(f.increments, 1);
});

test("simultaneous duplicate Coin grants claim once, credit once, and preserve permanent proof", async () => {
  const f = fixture();
  const results = await Promise.all([f.api.grantCoinsOnce(input()), f.api.grantCoinsOnce(input())]);
  assert.equal(results.filter((result) => result.alreadyGranted === false).length, 1);
  assert.equal(results.filter((result) => result.alreadyGranted === true).length, 1);
  assert.equal(f.balance, 500);
  assert.equal(f.increments, 1);
  assert.equal(f.claimed, 1);
  assert.equal(f.receipts.size, 1);
  assert.equal(await f.api.getCoinReceiptStatus(input()), "granted");
  assert.equal(f.entityObjectCalls, 0);
});

test("different simultaneous Coin purchases keep independent receipts and correct rewards", async () => {
  const f = fixture();
  await Promise.all([
    f.api.grantCoinsOnce(input("coin-purchase-500", 500)),
    f.api.grantCoinsOnce(input("coin-purchase-2500", 2500)),
  ]);
  assert.equal(f.balance, 3000);
  assert.equal(f.increments, 2);
  assert.equal(f.receipts.size, 2);
  assert.equal(
    [...f.receipts.values()].every((receipt) => receipt.state === "granted"),
    true,
  );
});

test("failed order-status persistence and replay beyond 14 days cannot repeat a granted Coin increment", async () => {
  const f = fixture();
  await f.api.grantCoinsOnce(input());
  f.receipts.get(input().orderId).createdAt = Date.now() - 40 * 24 * 60 * 60 * 1000;
  assert.equal((await f.api.grantCoinsOnce(input())).alreadyGranted, true);
  assert.equal(f.increments, 1);
  assert.equal(f.balance, 500);
});

for (const changes of [{ playFabId: "ABC999" }, { rewardAmount: 1000 }]) {
  test("receipt fingerprint conflict cannot grant again: " + JSON.stringify(changes), async () => {
    const f = fixture();
    await f.api.grantCoinsOnce(input());
    await assert.rejects(f.api.grantCoinsOnce({ ...input(), ...changes }), /requires review/);
    assert.equal(f.increments, 1);
    assert.equal(f.balance, 500);
  });
}

test("timeout after the database claim is not proof to start a Coin increment", async () => {
  const f = fixture({ claimTimeoutAfterCommit: true });
  await assert.rejects(f.api.grantCoinsOnce(input()), f.reviewed);
  await assert.rejects(f.api.grantCoinsOnce(input()), f.reviewed);
  assert.equal(f.receipts.get(input().orderId).state, "pending");
  assert.equal(f.claimed, 1);
  assert.equal(f.increments, 0);
});

test("failed DB claim with no confirmed receipt cannot grant or silently retry the claim", async () => {
  const f = fixture({ claimFailureBeforeWrite: true });
  await assert.rejects(f.api.grantCoinsOnce(input()), f.reviewed);
  assert.equal(f.calls.filter((call) => call === "claim").length, 1);
  assert.equal(f.receipts.size, 0);
  assert.equal(f.increments, 0);
});

test("a truthy malformed fresh-claim response is not sufficient monetary authority", async () => {
  const f = fixture({ claimResult: "true" });
  await assert.rejects(f.api.grantCoinsOnce(input()), f.reviewed);
  assert.equal(f.increments, 0);
  assert.equal(f.receipts.get(input().orderId).state, "pending");
});

test("Coin timeout after credit keeps a permanent pending claim and never retries money", async () => {
  const f = fixture({ grantTimeoutAfterCredit: true });
  await assert.rejects(f.api.grantCoinsOnce(input()), (error) => {
    assert.equal(f.reviewed(error), true);
    assert.doesNotMatch(error.message, /private-title-key/);
    return true;
  });
  await assert.rejects(f.api.grantCoinsOnce(input()), f.reviewed);
  assert.equal(f.increments, 1);
  assert.equal(f.balance, 500);
  assert.equal(f.receipts.get(input().orderId).state, "pending");
});

test("even a rejected classic Coin request cannot free or steal its permanent claim", async () => {
  const f = fixture({ grantFailureBeforeCredit: true });
  await assert.rejects(f.api.grantCoinsOnce(input()), f.reviewed);
  await assert.rejects(f.api.grantCoinsOnce(input()), f.reviewed);
  assert.equal(f.balance, 0);
  assert.equal(f.increments, 1);
  assert.equal(f.receipts.get(input().orderId).state, "pending");
});

test("malformed classic Coin evidence leaves the claim pending instead of falsely fulfilling", async () => {
  const f = fixture({
    grantResult: { PlayFabId: "WRONG", VirtualCurrency: "CO", BalanceChange: 500, Balance: 500 },
  });
  await assert.rejects(f.api.grantCoinsOnce(input()), f.reviewed);
  assert.equal(f.increments, 1);
  assert.equal(f.completed, 0);
  assert.equal(f.receipts.get(input().orderId).state, "pending");
});

test("lost completion response rereads permanent proof and repairs fulfillment without another increment", async () => {
  const f = fixture({ completeTimeoutAfterCommit: true });
  assert.equal((await f.api.grantCoinsOnce(input())).alreadyGranted, false);
  assert.equal((await f.api.grantCoinsOnce(input())).alreadyGranted, true);
  assert.equal(f.increments, 1);
  assert.equal(f.completed, 1);
  assert.equal(f.receipts.get(input().orderId).state, "granted");
});

test("receipt completion failure preserves pending review and prevents another Coin increment", async () => {
  const f = fixture({ completeFailure: true });
  await assert.rejects(f.api.grantCoinsOnce(input()), f.reviewed);
  await assert.rejects(f.api.grantCoinsOnce(input()), f.reviewed);
  assert.equal(f.increments, 1);
  assert.equal(f.balance, 500);
  assert.equal(f.receipts.get(input().orderId).state, "pending");
});

test("bounded failed completion reads can recover from proof without repeating Coins", async () => {
  const f = fixture({ failedReadbacks: 7 });
  assert.equal((await f.api.grantCoinsOnce(input())).alreadyGranted, false);
  assert.equal(f.increments, 1);
  assert.equal(f.receipts.get(input().orderId).state, "granted");
});

test("persistent stale completion reads stay under review until durable proof becomes visible", async () => {
  const f = fixture({ staleReceiptReads: true });
  await assert.rejects(f.api.grantCoinsOnce(input()), f.reviewed);
  assert.equal(f.increments, 1);
  f.options.staleReceiptReads = false;
  assert.equal((await f.api.grantCoinsOnce(input())).alreadyGranted, true);
  assert.equal(f.increments, 1);
});

for (const options of [
  { balance: MAX_COINS - 499 },
  { balance: MAX_COINS - 500, pendingAmount: 1 },
  { balance: MAX_COINS },
  { inventory: { VirtualCurrency: { CO: -1 } } },
  { inventory: { VirtualCurrency: { CO: 0.5 } } },
  { inventory: { VirtualCurrency: null } },
  { pendingAmount: -1 },
  { pendingAmount: 0.5 },
]) {
  test(
    "unsafe classic balance or pending reservation rejects checkout before claims: " +
      JSON.stringify(options),
    async () => {
      const f = fixture(options);
      await assert.rejects(f.api.assertCoinCheckoutReady(input()), (error) => error.status === 503);
      await assert.rejects(f.api.grantCoinsOnce(input()), (error) => error.status === 503);
      assert.equal(f.claimed, 0);
      assert.equal(f.increments, 0);
    },
  );
}

test("a final available Coin slot is not double-counted after its own DB claim", async () => {
  const f = fixture({ balance: MAX_COINS - 1 });
  await f.api.grantCoinsOnce(input("final-coin", 1));
  assert.equal(f.balance, MAX_COINS);
  assert.equal(f.increments, 1);
});

test("new concurrent reservations can stop a claimed purchase without ever exceeding the classic cap", async () => {
  const f = fixture({ balance: MAX_COINS - 500, postClaimPendingAmount: 501 });
  await assert.rejects(f.api.grantCoinsOnce(input()), f.reviewed);
  assert.equal(f.claimed, 1);
  assert.equal(f.increments, 0);
  assert.equal(f.receipts.get(input().orderId).state, "pending");
});

test("simultaneous near-cap purchases never exceed headroom or recycle uncertain claims", async () => {
  const f = fixture({ balance: MAX_COINS - 500 });
  const results = await Promise.allSettled([
    f.api.grantCoinsOnce(input("near-cap-one")),
    f.api.grantCoinsOnce(input("near-cap-two")),
  ]);
  assert.equal(
    results.every((result) => result.status === "fulfilled" || f.reviewed(result.reason)),
    true,
  );
  assert.ok(f.balance <= MAX_COINS);
  assert.ok(f.increments <= 1);
  assert.equal(f.receipts.size, 2);
});
