import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { verifyCoinSetup } from "../scripts/verify-coins-setup.mjs";
import { premiumWalletVerificationFingerprint } from "../src/lib/playfab/premium-wallet.server.ts";

const PLAYER = "ABC123";
const ENTITY = { Id: "FACE123", Type: "title_player_account" };
const DIAMOND_OBJECT = "civilcraft.premium-wallet.v1";
const COIN_OBJECT = "civilcraft.coin-purchases.v1";
const environment = {
  VITE_PLAYFAB_TITLE_ID: "17FA03",
  PLAYFAB_SECRET_KEY: "test-coin-verification-secret",
  PAYMONGO_SECRET_KEY: "sk_test_mock",
  PLAYFAB_COINS_CURRENCY_CODE: "CO",
  PLAYFAB_DIAMONDS_ENABLED: "false",
  PLAYFAB_DIAMONDS_STORAGE: "entity-objects",
  PLAYFAB_DIAMONDS_ITEM_ID: "",
  PLAYFAB_DIAMONDS_RECEIPT_ITEM_ID: "",
  PLAYFAB_DIAMONDS_BOOTSTRAP_VERIFIED: "true",
  PLAYFAB_DIAMONDS_PLAYER_WRITES_DENIED: "true",
  PLAYFAB_DIAMONDS_CAPACITY_VERIFIED: "true",
  PLAYFAB_DIAMONDS_VERIFIED_TITLE_ID: "17FA03",
  PLAYFAB_DIAMONDS_VERIFIED_CONFIG_SHA256: "",
  PLAYFAB_COINS_RECEIPTS_VERIFIED: "false",
  PLAYFAB_COINS_VERIFIED_TITLE_ID: "",
  PLAYFAB_COINS_VERIFIED_CONFIG_SHA256: "",
};
const previousEnvironment = Object.fromEntries(
  Object.keys(environment).map((key) => [key, process.env[key]]),
);
const originalFetch = globalThis.fetch;
const policyStatements = () => [
  { Resource: "pfrn:api--/Object/SetObjects", Action: "*", Effect: "Deny", Principal: "*" },
];
const initialObjects = () => ({
  [DIAMOND_OBJECT]: {
    ObjectName: DIAMOND_OBJECT,
    DataObject: {
      schemaVersion: 1,
      currency: "DI",
      titleId: "17FA03",
      playFabId: PLAYER,
      entityId: ENTITY.Id,
      balance: 1,
      receipts: { [`order-${"a".repeat(64)}`]: { fingerprint: "b".repeat(64), amount: 1 } },
    },
  },
});
const response = (data) => Response.json({ code: 200, data });
const failure = (error, status = 400) => Response.json({ code: status, error }, { status });
const args = () => ({
  testPlayerId: PLAYER,
  playerTicket: "valid-coin-verification-ticket",
  confirmTestWrites: true,
});
let objects;
let profileVersion;
let coins;
let calls;
let grants;
let coinWrites;
let policy;
let playerWriteAllowed;
let wrongPlayer;
let expired;
let wrongEntity;
let networkFailure;
let ignoreCas;
let quota;
let timeoutAfterGrant;
let failFinalReceipt;
let changeDiamonds;
let staleAfterWrites;
let serial = 0;

beforeEach(() => {
  Object.assign(process.env, environment, { PLAYFAB_SECRET_KEY: `coin-verification-${++serial}` });
  process.env["PLAYFAB_DIAMONDS_VERIFIED_CONFIG_SHA256"] = premiumWalletVerificationFingerprint();
  objects = initialObjects();
  profileVersion = 1;
  coins = 40;
  calls = [];
  grants = 0;
  coinWrites = 0;
  policy = policyStatements();
  playerWriteAllowed = false;
  wrongPlayer = false;
  expired = false;
  wrongEntity = false;
  networkFailure = false;
  ignoreCas = false;
  quota = 8192;
  timeoutAfterGrant = false;
  failFinalReceipt = false;
  changeDiamonds = false;
  staleAfterWrites = false;
  globalThis.fetch = async (url, init) => {
    const path = new URL(String(url)).pathname;
    const body = JSON.parse(String(init?.body || "{}"));
    const headers = new Headers(init?.headers);
    calls.push({ path, body, headers });
    if (networkFailure) throw new Error("private-payment-secret");
    if (path === "/Server/AuthenticateSessionTicket")
      return response({
        IsSessionTicketExpired: expired,
        UserInfo: { PlayFabId: wrongPlayer ? "BAD" : PLAYER },
      });
    if (path === "/Admin/GetUserAccountInfo")
      return response({
        UserInfo: { PlayFabId: PLAYER, TitleInfo: { TitlePlayerAccount: ENTITY } },
      });
    if (path === "/Admin/GetPolicy") return response({ Statements: policy });
    if (path === "/Authentication/GetEntityToken") {
      if (headers.has("X-Authorization"))
        return response({
          Entity: wrongEntity ? { ...ENTITY, Id: "BAD" } : ENTITY,
          EntityToken: "player-token",
        });
      return response({
        Entity: { Id: "17FA03", Type: "title" },
        EntityToken: "title-token",
        TokenExpiration: new Date(Date.now() + 3_600_000).toISOString(),
      });
    }
    if (path === "/Object/GetObjects") {
      assert.equal(headers.get("X-EntityToken"), "title-token");
      assert.deepEqual(body.Entity, ENTITY);
      return response({
        Entity: ENTITY,
        ProfileVersion: staleAfterWrites && coinWrites ? 1 : profileVersion,
        Objects: structuredClone(staleAfterWrites && coinWrites ? initialObjects() : objects),
      });
    }
    if (path === "/Object/SetObjects") {
      assert.deepEqual(body.Entity, ENTITY);
      assert.equal(
        Number.isSafeInteger(body.ExpectedProfileVersion),
        true,
        "all object mutations must carry CAS",
      );
      if (headers.get("X-EntityToken") === "player-token" && !playerWriteAllowed)
        return failure("APINotEnabledForGameClient", 403);
      if (!ignoreCas && body.ExpectedProfileVersion !== profileVersion)
        return failure("EntityProfileVersionMismatch");
      if (
        failFinalReceipt &&
        grants &&
        body.Objects.some((entry) => entry.ObjectName === COIN_OBJECT)
      )
        return failure("ServiceUnavailable", 503);
      const next = structuredClone(objects);
      for (const entry of body.Objects) {
        assert.equal(entry.DeleteObject, undefined, "this verifier never deletes objects");
        next[entry.ObjectName] = { ObjectName: entry.ObjectName, DataObject: entry.DataObject };
      }
      const bytes = Object.values(next).reduce(
        (sum, entry) => sum + Buffer.byteLength(JSON.stringify(entry), "utf8"),
        0,
      );
      if (bytes > quota || Object.keys(next).length > 3) return failure("EntityObjectSizeExceeded");
      const results = body.Objects.map((entry) => ({
        ObjectName: entry.ObjectName,
        SetResult: Object.hasOwn(objects, entry.ObjectName) ? "Updated" : "Created",
      }));
      objects = next;
      profileVersion++;
      if (body.Objects.some((entry) => entry.ObjectName === COIN_OBJECT)) coinWrites++;
      return response({ ProfileVersion: profileVersion, SetResults: results });
    }
    if (path === "/Server/GetUserInventory") {
      assert.equal(headers.get("X-SecretKey"), process.env["PLAYFAB_SECRET_KEY"]);
      assert.equal(body.PlayFabId, PLAYER);
      return response({ VirtualCurrency: { CO: coins }, Inventory: [] });
    }
    if (path === "/Server/AddUserVirtualCurrency") {
      assert.equal(headers.get("X-SecretKey"), process.env["PLAYFAB_SECRET_KEY"]);
      assert.equal(body.PlayFabId, PLAYER);
      assert.equal(body.VirtualCurrency, "CO");
      assert.equal(body.Amount, 1);
      grants++;
      coins += body.Amount;
      if (changeDiamonds) objects[DIAMOND_OBJECT].DataObject.balance = 2;
      if (timeoutAfterGrant) throw new Error("private-ambiguous-grant-timeout");
      return response({
        PlayFabId: PLAYER,
        VirtualCurrency: "CO",
        BalanceChange: body.Amount,
        Balance: coins,
      });
    }
    assert.fail(`Unexpected API ${path}`);
  };
});
after(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(previousEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("Coin setup refuses missing consent, existing verification, and live keys before network access", async () => {
  await assert.rejects(
    verifyCoinSetup({ ...args(), confirmTestWrites: false }),
    /confirm-test-writes/,
  );
  process.env["PLAYFAB_COINS_RECEIPTS_VERIFIED"] = "true";
  await assert.rejects(verifyCoinSetup(args()), /Disable Coin receipt/);
  process.env["PLAYFAB_COINS_RECEIPTS_VERIFIED"] = "false";
  process.env["PAYMONGO_SECRET_KEY"] = "sk_live_not_permitted";
  await assert.rejects(verifyCoinSetup(args()), /live payments/);
  assert.equal(calls.length, 0);
});

test("Coin setup requires the current full-capacity shared fingerprint but not enabled Diamonds checkout", async () => {
  process.env["PLAYFAB_DIAMONDS_CAPACITY_VERIFIED"] = "false";
  await assert.rejects(verifyCoinSetup(args()), /full Entity Objects Diamonds/);
  process.env["PLAYFAB_DIAMONDS_CAPACITY_VERIFIED"] = "true";
  process.env["PLAYFAB_DIAMONDS_VERIFIED_CONFIG_SHA256"] = "old-small-receipt-attestation";
  await assert.rejects(verifyCoinSetup(args()), /full Entity Objects Diamonds/);
  assert.equal(calls.length, 0);
});

test("wrong or expired tickets and mismatched player entity cannot emit attestations", async () => {
  wrongPlayer = true;
  await assert.rejects(verifyCoinSetup(args()), /explicitly selected fresh test player/);
  wrongPlayer = false;
  expired = true;
  await assert.rejects(verifyCoinSetup(args()), /explicitly selected fresh test player/);
  expired = false;
  wrongEntity = true;
  await assert.rejects(verifyCoinSetup(args()), /Player token does not resolve/);
  assert.equal(grants, 0);
  assert.equal(coinWrites, 0);
});

test("missing policy or an actually permitted player write blocks the monetary grant", async () => {
  policy = [];
  await assert.rejects(verifyCoinSetup(args()), /unconditionally denied/);
  policy = policyStatements();
  playerWriteAllowed = true;
  await assert.rejects(verifyCoinSetup(args()), /not explicitly denied/);
  assert.equal(grants, 0);
  assert.equal(coinWrites, 0);
});

test("ignored conditional versions cannot qualify even with a valid deny policy", async () => {
  ignoreCas = true;
  await assert.rejects(verifyCoinSetup(args()), /not explicitly rejected/);
  assert.equal(grants, 0);
  assert.equal(coinWrites, 0);
  assert.equal(process.env["PLAYFAB_COINS_RECEIPTS_VERIFIED"], "false");
});

test("successful second-object/concurrent/replay verification grants one Coin and preserves Diamonds", async () => {
  const diamond = structuredClone(objects[DIAMOND_OBJECT]);
  const result = await verifyCoinSetup(args());
  assert.equal(result.balanceBefore, 40);
  assert.equal(result.balance, 41);
  assert.equal(result.currencyCode, "CO");
  assert.equal(result.attestations.PLAYFAB_COINS_RECEIPTS_VERIFIED, "true");
  assert.match(result.attestations.PLAYFAB_COINS_VERIFIED_CONFIG_SHA256, /^[a-f0-9]{64}$/);
  assert.equal(grants, 1);
  assert.equal(Object.keys(objects).length, 2, "DI and CO use separate, preserved objects");
  assert.deepEqual(objects[DIAMOND_OBJECT], diamond);
  const receipts = Object.values(objects[COIN_OBJECT].DataObject.receipts);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].state, "granted");
  assert.equal(receipts[0].amount, 1);
  assert.equal(receipts[0].code, "CO");
  assert.equal(process.env["PLAYFAB_DIAMONDS_ENABLED"], "false");
  assert.equal(process.env["PLAYFAB_COINS_RECEIPTS_VERIFIED"], "false");
  assert.equal(
    calls.some((call) => /SetTitle|UpdatePolicy|Catalog|PayMongo|Delete/.test(call.path)),
    false,
  );
});

test("an existing Coin ledger or nonverification DI balance is preserved and rejected", async () => {
  objects[COIN_OBJECT] = { ObjectName: COIN_OBJECT, DataObject: { receipts: {} } };
  await assert.rejects(verifyCoinSetup(args()), /one-Diamond wallet and no Coin ledger/);
  assert.equal(Object.hasOwn(objects, COIN_OBJECT), true);
  objects = initialObjects();
  objects[DIAMOND_OBJECT].DataObject.balance = 42;
  await assert.rejects(verifyCoinSetup(args()), /one-Diamond wallet and no Coin ledger/);
  assert.equal(objects[DIAMOND_OBJECT].DataObject.balance, 42);
  assert.equal(grants, 0);
});

test("a lower combined quota prevents receipt creation and emits no attestation", async () => {
  quota = Buffer.byteLength(JSON.stringify(objects[DIAMOND_OBJECT]), "utf8");
  await assert.rejects(verifyCoinSetup(args()), /Concurrent Coin verification did not complete/);
  assert.equal(grants, 0);
  assert.equal(coinWrites, 0);
  assert.equal(process.env["PLAYFAB_COINS_RECEIPTS_VERIFIED"], "false");
});

test("timeout after the one currency increment leaves a pending receipt without granting twice", async () => {
  timeoutAfterGrant = true;
  await assert.rejects(verifyCoinSetup(args()), /Concurrent Coin verification did not complete/);
  assert.equal(grants, 1);
  assert.equal(coins, 41);
  assert.equal(Object.values(objects[COIN_OBJECT].DataObject.receipts)[0].state, "pending");
  assert.equal(process.env["PLAYFAB_COINS_RECEIPTS_VERIFIED"], "false");
  assert.equal(process.env["PLAYFAB_COINS_VERIFIED_CONFIG_SHA256"], "");
});

test("failed final receipt persistence restores the process gate and never retries Coin credit", async () => {
  failFinalReceipt = true;
  await assert.rejects(verifyCoinSetup(args()), /Concurrent Coin verification did not complete/);
  assert.equal(grants, 1);
  assert.equal(coins, 41);
  assert.equal(Object.values(objects[COIN_OBJECT].DataObject.receipts)[0].state, "pending");
  assert.equal(process.env["PLAYFAB_COINS_RECEIPTS_VERIFIED"], "false");
});

test("persistent stale receipt reads cannot emit a successful verification", async () => {
  staleAfterWrites = true;
  await assert.rejects(verifyCoinSetup(args()), /Concurrent Coin verification did not complete/);
  assert.equal(grants, 0);
  assert.equal(process.env["PLAYFAB_COINS_RECEIPTS_VERIFIED"], "false");
});

test("a changed Diamonds wallet prevents attestation even if Coin balance and receipt succeed", async () => {
  changeDiamonds = true;
  await assert.rejects(verifyCoinSetup(args()), /unchanged-Diamonds verification failed/);
  assert.equal(grants, 1);
  assert.equal(process.env["PLAYFAB_COINS_RECEIPTS_VERIFIED"], "false");
});

test("verification connection errors hide private upstream messages", async () => {
  networkFailure = true;
  await assert.rejects(verifyCoinSetup(args()), (error) => {
    assert.match(error.message, /connection unavailable/);
    assert.doesNotMatch(error.message, /private-payment-secret/);
    return true;
  });
  assert.equal(grants, 0);
});

test("the verification grant accepts the final available Coin without exceeding the legacy cap", async () => {
  coins = 2_147_483_646;
  const result = await verifyCoinSetup(args());
  assert.equal(result.balance, 2_147_483_647);
  assert.equal(grants, 1);
});

test("an account already at the legacy Coin cap is rejected before any monetary operation", async () => {
  coins = 2_147_483_647;
  await assert.rejects(verifyCoinSetup(args()), /cannot safely receive/);
  assert.equal(grants, 0);
  assert.equal(coinWrites, 0);
});
