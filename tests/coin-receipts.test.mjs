import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, beforeEach, test } from "node:test";
import {
  assertCoinCheckoutReady,
  CoinGrantReviewRequired,
  coinReceiptVerificationFingerprint,
  getCoinReceiptStatus,
  grantCoinsOnce,
  requireCoinCheckoutReady,
} from "../src/lib/payments/coin-receipts.server.ts";
import { premiumWalletVerificationFingerprint } from "../src/lib/playfab/premium-wallet.server.ts";
import { walletGateContext } from "../src/lib/game-wallet/gate-context.server.ts";

const PLAYER = "ABC123";
const ENTITY = { Id: "FACE123", Type: "title_player_account" };
const NAME = "civilcraft.coin-purchases.v1";
const MAX_COINS = 2_147_483_647;
const environment = {
  VITE_PLAYFAB_TITLE_ID: "17FA03",
  PLAYFAB_SECRET_KEY: "fixture-coin-secret",
  PLAYFAB_DIAMONDS_STORAGE: "entity-objects",
  PLAYFAB_DIAMONDS_ITEM_ID: "",
  PLAYFAB_DIAMONDS_RECEIPT_ITEM_ID: "",
  PLAYFAB_DIAMONDS_ENABLED: "false",
  PLAYFAB_DIAMONDS_BOOTSTRAP_VERIFIED: "true",
  PLAYFAB_DIAMONDS_PLAYER_WRITES_DENIED: "true",
  PLAYFAB_DIAMONDS_CAPACITY_VERIFIED: "true",
  PLAYFAB_DIAMONDS_VERIFIED_TITLE_ID: "17FA03",
  PLAYFAB_DIAMONDS_VERIFIED_CONFIG_SHA256: "",
  PLAYFAB_COINS_RECEIPTS_VERIFIED: "true",
  PLAYFAB_COINS_VERIFIED_TITLE_ID: "17FA03",
  PLAYFAB_COINS_VERIFIED_CONFIG_SHA256: "",
  COIN_RECEIPTS_STORAGE: "entity-objects",
};
const previous = Object.fromEntries(Object.keys(environment).map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
const originalNow = Date.now;
let serial = 0;
let objects, version, balance, calls, options, grantCalls;
const ok = (data) => Response.json({ code: 200, data });
const failure = (error, status = 400) => Response.json({ code: status, error }, { status });
const input = (orderId = "coin-order-1", rewardAmount = 500) => ({
  orderId,
  playFabId: PLAYER,
  currencyCode: "CO",
  rewardAmount,
});
const key = (orderId) => `order-${crypto.createHash("sha256").update(orderId).digest("hex")}`;
const ledger = () => objects[NAME]?.DataObject;
const receipt = (orderId = "coin-order-1") => ledger()?.receipts[key(orderId)];
const snapshot = () => ({
  Entity: ENTITY,
  ProfileVersion: version,
  Objects: structuredClone(objects),
});
const reviewed = (error) => error instanceof CoinGrantReviewRequired && error.status === 503;

beforeEach(() => {
  Date.now = originalNow;
  Object.assign(process.env, environment, {
    PLAYFAB_SECRET_KEY: `fixture-coin-secret-${++serial}`,
  });
  process.env.PLAYFAB_DIAMONDS_VERIFIED_CONFIG_SHA256 = premiumWalletVerificationFingerprint();
  process.env.PLAYFAB_COINS_VERIFIED_CONFIG_SHA256 = coinReceiptVerificationFingerprint();
  objects = { unrelated: { ObjectName: "unrelated", DataObject: { theme: "town" } } };
  version = 0;
  balance = 0;
  grantCalls = 0;
  calls = [];
  options = {};
  globalThis.fetch = async (url, init) => {
    const path = new URL(String(url)).pathname;
    const body = JSON.parse(String(init?.body || "{}"));
    const headers = new Headers(init?.headers);
    calls.push({ path, body, headers });
    if (path === "/Admin/GetUserAccountInfo") {
      assert.equal(headers.get("X-SecretKey"), process.env.PLAYFAB_SECRET_KEY);
      return ok({
        UserInfo: {
          PlayFabId: options.wrongPlayer ? "BAD" : PLAYER,
          TitleInfo: { TitlePlayerAccount: options.entity ?? ENTITY },
        },
      });
    }
    if (path === "/Authentication/GetEntityToken")
      return ok({
        Entity: { Id: "17FA03", Type: "title" },
        EntityToken: "fixture-title-token",
        TokenExpiration: new Date(Date.now() + 3_600_000).toISOString(),
      });
    if (path === "/Server/GetUserInventory") {
      assert.equal(body.PlayFabId, PLAYER);
      return ok(options.inventory ?? { VirtualCurrency: { CO: balance, ZZ: 7 } });
    }
    if (path === "/Server/AddUserVirtualCurrency") {
      if (options.expectedGatePhase) {
        assert.equal(
          options.expectedGatePhase.monetaryAttempted,
          true,
          "Mark the durable gate before dispatching money",
        );
        assert.equal(options.expectedGatePhase.legacyInput.orderId, body.CustomTags.orderId);
      }
      assert.equal(headers.get("X-SecretKey"), process.env.PLAYFAB_SECRET_KEY);
      assert.deepEqual(body, {
        PlayFabId: PLAYER,
        VirtualCurrency: "CO",
        Amount: 500,
        CustomTags: { orderId: body.CustomTags?.orderId },
      });
      assert.match(body.CustomTags.orderId, /^[a-z0-9_-]{1,128}$/i);
      grantCalls++;
      if (options.grantRejected) return failure("ServiceUnavailable", 503);
      balance += body.Amount;
      if (options.grantTimeoutAfterCredit) throw new Error("private-key-timeout-after-credit");
      const result = {
        PlayFabId: PLAYER,
        VirtualCurrency: "CO",
        BalanceChange: body.Amount,
        Balance: balance,
      };
      return ok(options.grantResponse ? options.grantResponse(result) : result);
    }
    assert.equal(body.Entity.Id, ENTITY.Id);
    assert.equal(body.Entity.Type, ENTITY.Type);
    assert.equal(headers.get("X-EntityToken"), "fixture-title-token");
    if (path === "/Object/GetObjects") {
      if (options.readFailureCount > 0) {
        options.readFailureCount--;
        return failure("ServiceUnavailable", 503);
      }
      const data = options.stale?.length ? options.stale.shift() : snapshot();
      return ok(options.readResponse ? options.readResponse(data) : data);
    }
    if (path === "/Object/SetObjects") {
      assert.equal(body.Objects.length, 1);
      assert.equal(body.Objects[0].ObjectName, NAME);
      assert.equal(body.IdempotencyId, undefined);
      assert.equal(Number.isSafeInteger(body.ExpectedProfileVersion), true);
      const next = body.Objects[0];
      const target = next.DataObject.receipts;
      const isCompleting =
        Object.values(target).some((value) => value.state === "granted") &&
        Object.entries(target).some(
          ([receiptKey, value]) =>
            value.state === "granted" && ledger()?.receipts[receiptKey]?.state !== "granted",
        );
      if (options.conflictOnce) {
        delete options.conflictOnce;
        version++;
        return failure("ConcurrentEditError");
      }
      if (body.ExpectedProfileVersion !== version) return failure("EntityProfileVersionMismatch");
      if (isCompleting && options.completeRejected) return failure("NotAuthorized", 403);
      if (options.neverCommitClaim && !isCompleting) return ok({});
      const previousState = snapshot();
      objects[NAME] = structuredClone(next);
      version++;
      if (!isCompleting && options.staleAfterClaim) {
        options.stale = [previousState];
        delete options.staleAfterClaim;
      }
      if (
        (!isCompleting && options.claimTimeoutAfterCommit) ||
        (isCompleting && options.completeTimeoutAfterCommit)
      ) {
        delete options.claimTimeoutAfterCommit;
        delete options.completeTimeoutAfterCommit;
        throw new Error("private-key-timeout-after-object-commit");
      }
      return ok(
        options.malformedSetResponse
          ? {}
          : { ProfileVersion: version, SetResults: [{ ObjectName: NAME, SetResult: "Updated" }] },
      );
    }
    assert.fail(`Unexpected network operation: ${path}`);
  };
});

after(() => {
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
  for (const [name, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("Coin preflight is read-only, supports profile version zero, and does not require enabled Diamond sales", async () => {
  requireCoinCheckoutReady();
  await assertCoinCheckoutReady(input());
  assert.equal(await getCoinReceiptStatus(input()), "absent");
  assert.equal(ledger(), undefined);
  assert.equal(grantCalls, 0);
  assert.equal(
    calls.some((call) => call.path === "/Object/SetObjects"),
    false,
  );
});

test("one permanent claim precedes the Coin grant and preserves unrelated player objects", async () => {
  const other = structuredClone(objects.unrelated);
  assert.deepEqual(await grantCoinsOnce(input()), { alreadyGranted: false });
  assert.equal(balance, 500);
  assert.equal(grantCalls, 1);
  assert.equal(await getCoinReceiptStatus(input()), "granted");
  assert.deepEqual(objects.unrelated, other);
  assert.equal(receipt().amount, 500);
  assert.equal(receipt().code, "CO");
  assert.equal(receipt().state, "granted");
  assert.match(receipt().fingerprint, /^[a-f0-9]{64}$/);
  assert.match(receipt().attemptId, /^[a-f0-9-]{36}$/);
  assert.equal(Object.hasOwn(receipt(), "expiresAt"), false);
  const claimIndex = calls.findIndex((call) => call.path === "/Object/SetObjects");
  const grantIndex = calls.findIndex((call) => call.path === "/Server/AddUserVirtualCurrency");
  assert.ok(claimIndex >= 0 && claimIndex < grantIndex);
  assert.equal(
    Object.values(calls[claimIndex].body.Objects[0].DataObject.receipts)[0].state,
    "pending",
  );
});

test("duplicate and concurrent deliveries of one order grant exactly once", async () => {
  const outcomes = await Promise.allSettled([
    grantCoinsOnce(input()),
    grantCoinsOnce(input()),
    grantCoinsOnce(input()),
  ]);
  assert.ok(outcomes.some((outcome) => outcome.status === "fulfilled"));
  for (const outcome of outcomes)
    if (outcome.status === "rejected") assert.ok(reviewed(outcome.reason));
  assert.equal(grantCalls, 1);
  assert.equal(balance, 500);
  assert.equal(Object.keys(ledger().receipts).length, 1);
  assert.deepEqual(await grantCoinsOnce(input()), { alreadyGranted: true });
  assert.equal(grantCalls, 1);
});

test("different concurrent orders retain both permanent receipts without losing either grant", async () => {
  await Promise.all([grantCoinsOnce(input("coin-order-a")), grantCoinsOnce(input("coin-order-b"))]);
  assert.equal(grantCalls, 2);
  assert.equal(balance, 1000);
  assert.equal(receipt("coin-order-a").state, "granted");
  assert.equal(receipt("coin-order-b").state, "granted");
});

test("receipt authority prevents recredit after failed status projection and replay beyond fifteen days", async () => {
  await grantCoinsOnce(input());
  const immutable = structuredClone(receipt());
  // Order status is deliberately outside the claim; losing its projection cannot erase the receipt.
  Date.now = () => originalNow() + 16 * 24 * 60 * 60 * 1000;
  assert.deepEqual(await grantCoinsOnce(input()), { alreadyGranted: true });
  assert.equal(await getCoinReceiptStatus(input()), "granted");
  assert.equal(balance, 500);
  assert.equal(grantCalls, 1);
  assert.deepEqual(receipt(), immutable);
});

test("claim timeout after commit rereads ownership before granting exactly once", async () => {
  options.claimTimeoutAfterCommit = true;
  await grantCoinsOnce(input());
  assert.equal(balance, 500);
  assert.equal(grantCalls, 1);
  assert.equal(receipt().state, "granted");
});

test("a monetary timeout after credit stays pending and is never automatically regranted", async () => {
  options.grantTimeoutAfterCredit = true;
  await assert.rejects(grantCoinsOnce(input()), reviewed);
  assert.equal(balance, 500);
  assert.equal(grantCalls, 1);
  assert.equal(receipt().state, "pending");
  Date.now = () => originalNow() + 16 * 24 * 60 * 60 * 1000;
  await assert.rejects(grantCoinsOnce(input()), reviewed);
  assert.equal(grantCalls, 1);
  assert.equal(await getCoinReceiptStatus(input()), "pending");
});

test("definite-looking grant failures also retain the claim for manual review instead of risking duplication", async () => {
  options.grantRejected = true;
  await assert.rejects(grantCoinsOnce(input()), reviewed);
  assert.equal(balance, 0);
  assert.equal(receipt().state, "pending");
  delete options.grantRejected;
  await assert.rejects(grantCoinsOnce(input()), reviewed);
  assert.equal(grantCalls, 1);
});

test("receipt-save failure after credit never regrants Coins on retry", async () => {
  options.completeRejected = true;
  await assert.rejects(grantCoinsOnce(input()), reviewed);
  assert.equal(balance, 500);
  assert.equal(receipt().state, "pending");
  delete options.completeRejected;
  await assert.rejects(grantCoinsOnce(input()), reviewed);
  assert.equal(grantCalls, 1);
});

test("timeout after granted receipt commit is confirmed by reread without a second monetary call", async () => {
  options.completeTimeoutAfterCommit = true;
  await grantCoinsOnce(input());
  assert.equal(grantCalls, 1);
  assert.equal(receipt().state, "granted");
});

test("malformed write acknowledgments are not trusted without a persisted claim reread", async () => {
  options.malformedSetResponse = true;
  await grantCoinsOnce(input());
  assert.equal(grantCalls, 1);
  assert.equal(receipt().state, "granted");
});

test("an acknowledged but missing claim never grants any Coins", async () => {
  options.neverCommitClaim = true;
  await assert.rejects(grantCoinsOnce(input()), reviewed);
  assert.equal(grantCalls, 0);
  assert.equal(balance, 0);
});

test("CAS conflicts, a stale post-claim read, and transient read errors safely recover", async () => {
  options.conflictOnce = true;
  options.staleAfterClaim = true;
  options.readFailureCount = 1;
  await grantCoinsOnce(input());
  assert.equal(grantCalls, 1);
  assert.equal(balance, 500);
  assert.equal(receipt().state, "granted");
});

test("changed amount or currency cannot reuse the permanent order receipt", async () => {
  await grantCoinsOnce(input());
  await assert.rejects(grantCoinsOnce(input("coin-order-1", 1000)), reviewed);
  await assert.rejects(getCoinReceiptStatus({ ...input(), currencyCode: "ZZ" }), reviewed);
  assert.equal(grantCalls, 1);
});

test("fingerprint mismatch fails closed even when amount and currency match", async () => {
  await grantCoinsOnce(input());
  receipt().fingerprint = "f".repeat(64);
  await assert.rejects(grantCoinsOnce(input()), reviewed);
  assert.equal(grantCalls, 1);
});

test("a wrong receiving account or entity mapping grants nothing", async () => {
  options.wrongPlayer = true;
  await assert.rejects(grantCoinsOnce(input()), /receiving account|player/i);
  assert.equal(grantCalls, 0);
});

for (const change of [
  (data) => ({ ...data, ProfileVersion: undefined }),
  (data) => ({ ...data, ProfileVersion: -1 }),
  (data) => ({ ...data, ProfileVersion: 1.5 }),
  (data) => ({ ...data, Objects: null }),
  (data) => ({ ...data, Objects: [] }),
  (data) => ({ ...data, Entity: { ...ENTITY, Id: "BAD" } }),
  (data) => ({ ...data, Objects: { unrelated: { ObjectName: "wrong", DataObject: {} } } }),
])
  test(`malformed Entity Object response fails before any grant: ${change.toString()}`, async () => {
    options.readResponse = change;
    await assert.rejects(assertCoinCheckoutReady(input()), /unavailable/i);
    assert.equal(grantCalls, 0);
    assert.equal(ledger(), undefined);
  });

for (const mutate of [
  (data) => {
    data.titleId = "BAD";
  },
  (data) => {
    data.playFabId = "BAD";
  },
  (data) => {
    data.entityId = "BAD";
  },
  (data) => {
    data.schemaVersion = 2;
  },
  (data) => {
    data.extra = true;
  },
  (data) => {
    Object.values(data.receipts)[0].state = "unknown";
  },
  (data) => {
    Object.values(data.receipts)[0].amount = -1;
  },
  (data) => {
    Object.values(data.receipts)[0].attemptId = "invalid";
  },
])
  test(`corrupt receipt data cannot be overwritten: ${mutate.toString()}`, async () => {
    await grantCoinsOnce(input());
    mutate(ledger());
    const corrupted = structuredClone(objects);
    await assert.rejects(grantCoinsOnce(input("next-order")), /review/i);
    assert.equal(grantCalls, 1);
    assert.deepEqual(objects, corrupted);
  });

for (const response of [
  (result) => ({ ...result, PlayFabId: "BAD" }),
  (result) => ({ ...result, VirtualCurrency: "ZZ" }),
  (result) => ({ ...result, BalanceChange: 499 }),
  (result) => ({ ...result, Balance: 499 }),
  (result) => ({ ...result, Balance: "500" }),
  () => ({}),
])
  test(`partial or malformed monetary evidence requires review, not retry: ${response.toString()}`, async () => {
    options.grantResponse = response;
    await assert.rejects(grantCoinsOnce(input()), reviewed);
    assert.equal(receipt().state, "pending");
    assert.equal(balance, 500);
    await assert.rejects(grantCoinsOnce(input()), reviewed);
    assert.equal(grantCalls, 1);
  });

test("unavailable or malformed classic balance is never treated as an available zero", async () => {
  for (const inventory of [
    {},
    { VirtualCurrency: null },
    { VirtualCurrency: [] },
    { VirtualCurrency: { CO: "500" } },
    { VirtualCurrency: { CO: -1 } },
  ]) {
    options.inventory = inventory;
    await assert.rejects(assertCoinCheckoutReady(input()), /balance.*unavailable/i);
  }
  assert.equal(grantCalls, 0);
});

test("classic balance integer cap is checked before storing a monetary claim", async () => {
  balance = MAX_COINS - 499;
  await assert.rejects(grantCoinsOnce(input()), /capacity/i);
  assert.equal(ledger(), undefined);
  assert.equal(grantCalls, 0);
});

test("pending purchase reservations prevent competing orders from exceeding classic balance headroom", async () => {
  balance = MAX_COINS - 1000;
  options.grantRejected = true;
  await assert.rejects(grantCoinsOnce(input("reserved-order")), reviewed);
  balance = MAX_COINS - 750;
  await assert.rejects(assertCoinCheckoutReady(input("another-order")), /capacity/i);
  assert.equal(receipt("reserved-order").state, "pending");
  assert.equal(grantCalls, 1);
});

test("concurrent purchases near the classic balance cap reserve capacity for at most one grant", async () => {
  balance = MAX_COINS - 500;
  const outcomes = await Promise.allSettled([
    grantCoinsOnce(input("near-cap-a")),
    grantCoinsOnce(input("near-cap-b")),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((outcome) => outcome.status === "rejected").length, 1);
  assert.equal(grantCalls, 1);
  assert.equal(balance, MAX_COINS);
});

test("a full permanent ledger blocks new orders but never prunes old receipts or recredits replay", async () => {
  await grantCoinsOnce(input());
  for (let index = 0; index < 50; index++)
    ledger().receipts[key(`historic-${index}`)] = {
      fingerprint: "f".repeat(64),
      amount: 1,
      code: "CO",
      attemptId: crypto.randomUUID(),
      state: "granted",
    };
  const permanent = structuredClone(objects);
  await assert.rejects(assertCoinCheckoutReady(input("new-full-order")), /storage.*full/i);
  assert.deepEqual(await grantCoinsOnce(input()), { alreadyGranted: true });
  assert.equal(grantCalls, 1);
  assert.deepEqual(objects, permanent);
});

test("stale missing-receipt replay cannot overwrite a newer granted claim or duplicate the Coin grant", async () => {
  const empty = snapshot();
  await grantCoinsOnce(input());
  options.stale = [empty];
  assert.deepEqual(await grantCoinsOnce(input()), { alreadyGranted: true });
  assert.equal(grantCalls, 1);
  assert.equal(balance, 500);
  assert.equal(receipt().state, "granted");
});

test("all Entity Objects share the receipt byte budget; full unrelated data prevents checkout", async () => {
  objects.unrelated.DataObject.padding = "x".repeat(8192);
  await assert.rejects(assertCoinCheckoutReady(input()), /storage.*full/i);
  assert.equal(ledger(), undefined);
  assert.equal(grantCalls, 0);
});

test("a missing third free-tier object slot disables Coin checkout without changing existing data", async () => {
  objects.second = { ObjectName: "second", DataObject: {} };
  objects.third = { ObjectName: "third", DataObject: {} };
  const original = structuredClone(objects);
  await assert.rejects(assertCoinCheckoutReady(input()), /object slot/i);
  assert.deepEqual(objects, original);
  assert.equal(grantCalls, 0);
});

test("each verification and secret prerequisite fails closed before external operations", () => {
  for (const name of [
    "PLAYFAB_SECRET_KEY",
    "PLAYFAB_DIAMONDS_BOOTSTRAP_VERIFIED",
    "PLAYFAB_DIAMONDS_PLAYER_WRITES_DENIED",
    "PLAYFAB_DIAMONDS_CAPACITY_VERIFIED",
    "PLAYFAB_COINS_RECEIPTS_VERIFIED",
    "PLAYFAB_COINS_VERIFIED_TITLE_ID",
    "PLAYFAB_COINS_VERIFIED_CONFIG_SHA256",
    "PLAYFAB_DIAMONDS_VERIFIED_TITLE_ID",
    "PLAYFAB_DIAMONDS_VERIFIED_CONFIG_SHA256",
  ]) {
    const old = process.env[name];
    process.env[name] = "";
    assert.throws(requireCoinCheckoutReady, /verified.*setup/i, name);
    process.env[name] = old;
  }
  assert.equal(calls.length, 0);
});

test("an Economy v2 provider cannot silently activate the Entity Object Coin receipt protocol", () => {
  process.env.PLAYFAB_DIAMONDS_STORAGE = "economy-v2";
  process.env.PLAYFAB_DIAMONDS_ITEM_ID = "11111111-1111-4111-8111-111111111111";
  process.env.PLAYFAB_DIAMONDS_RECEIPT_ITEM_ID = "22222222-2222-4222-8222-222222222222";
  assert.throws(requireCoinCheckoutReady, /verified.*setup/i);
  assert.equal(calls.length, 0);
});

test("invalid server order values are rejected before reads or money writes", async () => {
  for (const value of [
    { orderId: "../bad" },
    { playFabId: "not-a-player" },
    { currencyCode: "co" },
    { rewardAmount: 0 },
    { rewardAmount: 1.5 },
    { rewardAmount: MAX_COINS + 1 },
  ])
    await assert.rejects(grantCoinsOnce({ ...input(), ...value }), /configuration.*review/i);
  assert.equal(calls.length, 0);
});

test("a verified v1 receipt remains the original Entity authority after the new-checkout default changes", async () => {
  await grantCoinsOnce(input());
  process.env.COIN_RECEIPTS_STORAGE = "postgres";
  assert.equal(await getCoinReceiptStatus(input()), "granted");
  assert.deepEqual(await grantCoinsOnce(input()), { alreadyGranted: true });
  assert.equal(grantCalls, 1);
  // New checkout uses its new default; it cannot opportunistically choose this old provider.
  await assert.rejects(
    assertCoinCheckoutReady(input("new-order")),
    (error) => error.status === 503,
  );
  assert.equal(grantCalls, 1);
});

test("legacy gate phases distinguish receipt-only reads from an attempted external credit", async () => {
  const phase = { monetaryAttempted: false, importAttempted: false };
  options.expectedGatePhase = phase;
  await walletGateContext.run(phase, () => grantCoinsOnce(input()));
  assert.equal(phase.monetaryAttempted, true);
  assert.equal(phase.legacyInput.orderId, "coin-order-1");
  const readOnly = { monetaryAttempted: false, importAttempted: false };
  await walletGateContext.run(readOnly, () => getCoinReceiptStatus(input()));
  await walletGateContext.run(readOnly, () => grantCoinsOnce(input()));
  assert.equal(readOnly.monetaryAttempted, false);
  assert.equal(grantCalls, 1);
});

test("a lost classic credit response leaves its gate phase marked as monetarily uncertain", async () => {
  const phase = { monetaryAttempted: false, importAttempted: false };
  options.expectedGatePhase = phase;
  options.grantTimeoutAfterCredit = true;
  await assert.rejects(
    walletGateContext.run(phase, () => grantCoinsOnce(input())),
    reviewed,
  );
  assert.equal(phase.monetaryAttempted, true);
  assert.equal(phase.legacyInput.orderId, "coin-order-1");
  assert.equal(receipt().state, "pending");
  assert.equal(grantCalls, 1);
});

test("an unavailable original v1 verification is held for review, never converted into a database grant", async () => {
  await grantCoinsOnce(input());
  process.env.COIN_RECEIPTS_STORAGE = "postgres";
  process.env.PLAYFAB_COINS_VERIFIED_CONFIG_SHA256 = "not-verified";
  const before = calls.length;
  await assert.rejects(getCoinReceiptStatus(input()), reviewed);
  await assert.rejects(grantCoinsOnce(input()), reviewed);
  assert.equal(calls.length, before);
  assert.equal(grantCalls, 1);
});
