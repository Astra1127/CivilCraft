import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, beforeEach, test } from "node:test";
import {
  assertDiamondCheckoutCapacity,
  getDiamondBalance,
  grantDiamonds,
  hasDiamondReceipt,
  premiumWalletConfig,
  premiumWalletVerificationFingerprint,
  requireDiamondCheckoutReady,
} from "../src/lib/playfab/premium-wallet.server.ts";
import {
  policyBlocksPlayerObjectWrites,
  verifyDiamondSetup,
} from "../scripts/verify-diamonds-setup.mjs";

const PLAYER = "ABC123";
const ENTITY = { Id: "FACE123", Type: "title_player_account" };
const NAME = "civilcraft.premium-wallet.v1";
const environment = {
  VITE_PLAYFAB_TITLE_ID: "17FA03",
  PLAYFAB_SECRET_KEY: "mock-object-secret",
  PAYMONGO_SECRET_KEY: "sk_test_mock",
  PLAYFAB_DIAMONDS_STORAGE: "entity-objects",
  PLAYFAB_DIAMONDS_ITEM_ID: "",
  PLAYFAB_DIAMONDS_RECEIPT_ITEM_ID: "",
  PLAYFAB_DIAMONDS_ENABLED: "true",
  PLAYFAB_DIAMONDS_BOOTSTRAP_VERIFIED: "true",
  PLAYFAB_DIAMONDS_PLAYER_WRITES_DENIED: "true",
  PLAYFAB_DIAMONDS_CAPACITY_VERIFIED: "true",
  PLAYFAB_DIAMONDS_VERIFIED_TITLE_ID: "17FA03",
  PLAYFAB_DIAMONDS_VERIFIED_CONFIG_SHA256: "",
};
const previous = Object.fromEntries(Object.keys(environment).map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
const originalNow = Date.now;
const statement = {
  Resource: "pfrn:api--/Object/SetObjects",
  Action: "*",
  Effect: "Deny",
  Principal: "*",
};
let objects,
  version,
  calls,
  commits,
  serial = 0;
let options;
const ok = (data) => Response.json({ code: 200, data });
const conflict = (error = "EntityProfileVersionMismatch") =>
  Response.json({ code: 400, error }, { status: 400 });
const grant = (orderId = "test-order-1", rewardAmount = 500) => ({
  orderId,
  rewardAmount,
  playFabId: PLAYER,
  entity: ENTITY,
  wallet: premiumWalletConfig(),
});
const wallet = () => objects[NAME]?.DataObject;
const verify = () =>
  verifyDiamondSetup({
    testPlayerId: PLAYER,
    playerTicket: "mock-player-ticket",
    confirmTestWrites: true,
  });

beforeEach(() => {
  Date.now = originalNow;
  Object.assign(process.env, environment, { PLAYFAB_SECRET_KEY: `mock-object-${++serial}` });
  process.env["PLAYFAB_DIAMONDS_VERIFIED_CONFIG_SHA256"] = premiumWalletVerificationFingerprint();
  objects = { unrelated: { ObjectName: "unrelated", DataObject: { theme: "town" } } };
  version = 0;
  calls = [];
  commits = 0;
  options = {};
  globalThis.fetch = async (url, init) => {
    const path = new URL(String(url)).pathname;
    const body = JSON.parse(String(init?.body || "{}"));
    const headers = new Headers(init?.headers);
    calls.push({ path, body, headers });
    if (path === "/Server/AuthenticateSessionTicket")
      return ok({
        IsSessionTicketExpired: false,
        UserInfo: { PlayFabId: options.wrongPlayer ? "BAD" : PLAYER },
      });
    if (path === "/Admin/GetUserAccountInfo")
      return ok({ UserInfo: { PlayFabId: PLAYER, TitleInfo: { TitlePlayerAccount: ENTITY } } });
    if (path === "/Authentication/GetEntityToken")
      return headers.has("X-Authorization")
        ? ok({ Entity: ENTITY, EntityToken: "player-token" })
        : ok({
            Entity: { Id: "17FA03", Type: "title" },
            EntityToken: "title-token",
            TokenExpiration: new Date(Date.now() + 3_600_000).toISOString(),
          });
    if (path === "/Admin/GetPolicy") return ok({ Statements: options.policy ?? [statement] });
    assert.equal(body.Entity.Id, ENTITY.Id);
    if (path === "/Object/GetObjects") {
      assert.equal(headers.get("X-EntityToken"), "title-token");
      if (options.readFailure) throw new Error("private-service-key");
      const data = options.stale ??
        options.staleProbe ?? {
          Entity: ENTITY,
          ProfileVersion: version,
          Objects: structuredClone(objects),
        };
      delete options.stale;
      delete options.staleProbe;
      return ok(options.transformRead ? options.transformRead(data) : data);
    }
    if (path === "/Object/SetObjects") {
      assert.equal(body.Objects.length, 1);
      assert.equal(body.IdempotencyId, undefined);
      if (headers.get("X-EntityToken") === "player-token")
        return options.allowPlayer
          ? ok({})
          : Response.json(
              { code: 403, error: options.playerError ?? "APINotEnabledForGameClient" },
              { status: 403 },
            );
      assert.equal(headers.get("X-EntityToken"), "title-token");
      assert.equal(Number.isSafeInteger(body.ExpectedProfileVersion), true);
      if (options.conflictOnce) {
        delete options.conflictOnce;
        version++;
        return conflict("ConcurrentEditError");
      }
      if (body.ExpectedProfileVersion !== version && !options.ignoreCAS) return conflict();
      if (options.rejectWrite)
        return Response.json({ code: 403, error: "NotAuthorized" }, { status: 403 });
      const item = body.Objects[0];
      const previousState = {
        Entity: ENTITY,
        ProfileVersion: version,
        Objects: structuredClone(objects),
      };
      if (item.DeleteObject === true) {
        assert.match(item.ObjectName, /^cc\.capacity\.[a-f0-9]{16}$/);
        assert.equal(item.DataObject, undefined);
        assert.equal(item.ObjectName === NAME, false);
        if (options.cleanupFailure)
          return Response.json({ code: 503, error: "ServiceUnavailable" }, { status: 503 });
        delete objects[item.ObjectName];
        version++;
        if (options.staleCleanupRead) options.staleProbe = previousState;
        return ok({
          ProfileVersion: version,
          SetResults: [{ ObjectName: item.ObjectName, SetResult: "Deleted" }],
        });
      }
      if (item.ObjectName.startsWith("cc.capacity.")) {
        assert.equal(Buffer.byteLength(JSON.stringify(item.DataObject), "utf8"), 8192);
        if (
          options.quotaBytes &&
          Buffer.byteLength(JSON.stringify(item.DataObject), "utf8") > options.quotaBytes
        )
          return Response.json(
            { code: 400, error: "EntityObjectExceededSizeLimit" },
            { status: 400 },
          );
        if (options.staleCapacityRead) options.staleProbe = previousState;
      }
      objects[item.ObjectName] = structuredClone(item);
      if (item.ObjectName.startsWith("cc.capacity.") && options.truncateCapacity)
        objects[item.ObjectName].DataObject.padding = item.DataObject.padding.slice(1);
      version++;
      if (item.ObjectName === NAME) commits++;
      if (options.timeoutAfterCommit) {
        delete options.timeoutAfterCommit;
        throw new Error("private-timeout-after-credit");
      }
      return ok(
        options.malformedWrite
          ? {}
          : {
              ProfileVersion: version,
              SetResults: [{ ObjectName: item.ObjectName, SetResult: "Updated" }],
            },
      );
    }
    assert.fail(`Unexpected external operation ${path}`);
  };
});
after(() => {
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("no-card provider defaults to Entity Objects and needs no catalog item IDs", () => {
  delete process.env["PLAYFAB_DIAMONDS_STORAGE"];
  assert.equal(premiumWalletConfig().storage, "entity-objects");
  assert.equal(requireDiamondCheckoutReady().objectName, NAME);
  assert.equal(calls.length, 0);
});
test("previous Economy IDs require explicit review, never silently become an empty wallet", () => {
  process.env["PLAYFAB_DIAMONDS_ITEM_ID"] = "11111111-1111-4111-8111-111111111111";
  assert.throws(premiumWalletConfig, /previous Diamonds wallet/);
});
test("empty wallet balance/preflight are read-only; version zero is valid", async () => {
  assert.equal(await getDiamondBalance(PLAYER), 0);
  await assertDiamondCheckoutCapacity(grant());
  assert.equal(await hasDiamondReceipt(grant()), false);
  assert.equal(commits, 0);
  assert.equal(wallet(), undefined);
});
test("first grant creates balance and receipt in ONE version-checked write, leaving other objects intact", async () => {
  const result = await grantDiamonds(grant());
  assert.equal(result.balance, 500);
  assert.equal(result.alreadyGranted, false);
  assert.equal(commits, 1);
  assert.equal(wallet().balance, 500);
  assert.equal(Object.keys(wallet().receipts).length, 1);
  assert.deepEqual(objects.unrelated.DataObject, { theme: "town" });
  assert.equal(
    calls.find((call) => call.path === "/Object/SetObjects").body.ExpectedProfileVersion,
    0,
  );
  assert.equal(
    calls.some((call) => /Inventory|Catalog|VirtualCurrency|File/.test(call.path)),
    false,
  );
});
test("first-wallet checkout is blocked when the free-tier object slots are full", async () => {
  objects.second = { ObjectName: "second", DataObject: {} };
  objects.third = { ObjectName: "third", DataObject: {} };
  await assert.rejects(assertDiamondCheckoutCapacity(grant()), /object slot/);
  assert.equal(commits, 0);
  assert.equal(wallet(), undefined);
});
test("duplicate and concurrent deliveries credit once", async () => {
  const input = grant();
  await Promise.all([grantDiamonds(input), grantDiamonds(input), grantDiamonds(input)]);
  assert.equal((await grantDiamonds(input)).alreadyGranted, true);
  assert.equal(wallet().balance, 500);
  assert.equal(commits, 1);
});
test("different simultaneous purchases keep every reward and receipt", async () => {
  await Promise.all([
    grantDiamonds(grant("pack-500", 500)),
    grantDiamonds(grant("pack-1000", 1000)),
    grantDiamonds(grant("pack-2500", 2500)),
  ]);
  assert.equal(wallet().balance, 4000);
  assert.equal(Object.keys(wallet().receipts).length, 3);
  assert.equal(commits, 3);
});
test("file/statistic profile version conflicts retry without losing the wallet", async () => {
  options.conflictOnce = true;
  await grantDiamonds(grant());
  assert.equal(wallet().balance, 500);
  assert.equal(commits, 1);
  assert.equal(version, 2);
});
test("timeout after credit rereads permanent receipt, never credits again", async () => {
  options.timeoutAfterCommit = true;
  assert.equal((await grantDiamonds(grant())).balance, 500);
  assert.equal(commits, 1);
});
test("ambiguous success payload is reconciled, never guessed or blindly repeated", async () => {
  options.malformedWrite = true;
  assert.equal((await grantDiamonds(grant())).balance, 500);
  assert.equal(commits, 1);
});
test("stale empty read cannot overwrite a previously credited balance", async () => {
  const empty = { Entity: ENTITY, ProfileVersion: version, Objects: structuredClone(objects) };
  await grantDiamonds(grant());
  options.stale = empty;
  await grantDiamonds(grant("different-order", 1000));
  assert.equal(wallet().balance, 1500);
  assert.equal(commits, 2);
});
test("replay after 15 days retains receipts and grants nothing", async () => {
  await grantDiamonds(grant());
  const now = originalNow();
  Date.now = () => now + 15 * 86400_000;
  assert.equal((await grantDiamonds(grant())).alreadyGranted, true);
  assert.equal(commits, 1);
});
test("receipt payload mismatch and wallet corruption fail closed", async () => {
  await grantDiamonds(grant());
  await assert.rejects(grantDiamonds(grant("test-order-1", 1000)), /receipt requires review/);
  wallet().balance++;
  await assert.rejects(getDiamondBalance(PLAYER), /unavailable/);
  assert.equal(commits, 1);
});
test("missing profile version, malformed objects and wrong entity never fabricate an empty balance", async () => {
  for (const transform of [
    (data) => ({ ...data, ProfileVersion: undefined }),
    (data) => ({ ...data, ProfileVersion: -1 }),
    (data) => ({ ...data, Objects: null }),
    (data) => ({ ...data, Objects: [] }),
    (data) => ({ ...data, Entity: { ...ENTITY, Id: "BAD" } }),
  ]) {
    options.transformRead = transform;
    await assert.rejects(grantDiamonds(grant()), /unavailable/);
  }
  assert.equal(commits, 0);
});
test("read outages are not receipt absence; private failures never leak", async () => {
  options.readFailure = true;
  await assert.rejects(
    grantDiamonds(grant()),
    (error) => /unavailable/.test(error.message) && !/private/.test(error.message),
  );
  assert.equal(commits, 0);
});
test("rejected writes do not change balance or leave a separate receipt", async () => {
  options.rejectWrite = true;
  await assert.rejects(grantDiamonds(grant()), /unavailable/);
  assert.equal(wallet(), undefined);
  assert.equal(commits, 0);
});
test("full ledger stops new payments/grants but keeps all historical receipts usable", async () => {
  await grantDiamonds(grant());
  for (let i = 0; i < 60; i++) {
    wallet().receipts[`order-${crypto.createHash("sha256").update(`old-${i}`).digest("hex")}`] = {
      fingerprint: "a".repeat(64),
      amount: 1,
    };
    wallet().balance++;
  }
  const saved = structuredClone(wallet());
  await assert.rejects(assertDiamondCheckoutCapacity(grant("new-order")), /storage limit/);
  await assert.rejects(grantDiamonds(grant("new-order")), /storage limit/);
  assert.equal((await grantDiamonds(grant())).alreadyGranted, true);
  assert.deepEqual(wallet(), saved);
  assert.equal(commits, 1);
});
test("unverified setup and old Economy snapshots cannot write to new storage", async () => {
  const input = grant();
  process.env["PLAYFAB_DIAMONDS_BOOTSTRAP_VERIFIED"] = "false";
  await assert.rejects(grantDiamonds(input), /verified/);
  process.env["PLAYFAB_DIAMONDS_BOOTSTRAP_VERIFIED"] = "true";
  input.wallet = {
    collectionId: "premium-wallet",
    diamondItemId: "11111111-1111-4111-8111-111111111111",
    receiptItemId: "22222222-2222-4222-8222-222222222222",
  };
  await assert.rejects(grantDiamonds(input), /approved wallet/);
  assert.equal(calls.length, 0);
});
test("Object write policy requires an unconditional player denial, not an inventory-only or conditional rule", () => {
  assert.equal(policyBlocksPlayerObjectWrites([statement]), true);
  assert.equal(
    policyBlocksPlayerObjectWrites([
      { ...statement, ApiConditions: { HasSignatureOrEncryption: false } },
    ]),
    false,
  );
  assert.equal(
    policyBlocksPlayerObjectWrites([{ ...statement, Resource: "pfrn:api--/Inventory/*" }]),
    false,
  );
  assert.equal(policyBlocksPlayerObjectWrites([{ ...statement, Effect: "Allow" }]), false);
});
test("actual-title verifier tests player denial, CAS enforcement, first write and duplicate before attesting", async () => {
  process.env["PLAYFAB_DIAMONDS_ENABLED"] = "false";
  objects = {};
  const result = await verify();
  assert.equal(result.storage, "entity-objects");
  assert.equal(result.balance, 1);
  assert.equal(commits, 1);
  assert.equal(Object.keys(wallet().receipts).length, 1);
  assert.equal(result.verifiedCapacityBytes, 8192);
  assert.equal(result.attestations.PLAYFAB_DIAMONDS_CAPACITY_VERIFIED, "true");
  assert.deepEqual(Object.keys(objects), [NAME]);
  const sizeWrite = calls.find(
    (call) =>
      call.path === "/Object/SetObjects" &&
      call.body.Objects[0].ObjectName.startsWith("cc.capacity.") &&
      !call.body.Objects[0].DeleteObject,
  );
  const firstMoney = calls.findIndex(
    (call) => call.path === "/Object/SetObjects" && call.body.Objects[0].ObjectName === NAME,
  );
  assert.equal(
    Buffer.byteLength(JSON.stringify(sizeWrite.body.Objects[0].DataObject), "utf8"),
    8192,
  );
  assert.ok(calls.indexOf(sizeWrite) < firstMoney);
  assert.equal(
    calls.some((call) => /Catalog|Inventory/.test(call.path)),
    false,
  );
  assert.equal(process.env["PLAYFAB_DIAMONDS_ENABLED"], "false");
});
test("verifier refuses an allowed player write, missing denial or invalid player identity", async () => {
  process.env["PLAYFAB_DIAMONDS_ENABLED"] = "false";
  objects = {};
  options.allowPlayer = true;
  await assert.rejects(verify(), /not explicitly denied/);
  options.allowPlayer = false;
  options.policy = [];
  await assert.rejects(verify(), /not unconditionally denied/);
  options.policy = [statement];
  options.wrongPlayer = true;
  await assert.rejects(verify(), /does not belong/);
  assert.equal(commits, 0);
});
test("permission probe must fail with an authorization error, not bad input or quota", async () => {
  process.env["PLAYFAB_DIAMONDS_ENABLED"] = "false";
  objects = {};
  options.playerError = "EntityProfileVersionMismatch";
  await assert.rejects(verify(), /not explicitly denied/);
  assert.equal(commits, 0);
});
test("service ignoring expected version cannot emit an attestation or monetary grant", async () => {
  process.env["PLAYFAB_DIAMONDS_ENABLED"] = "false";
  objects = {};
  options.ignoreCAS = true;
  await assert.rejects(verify(), /Conditional object writes/);
  assert.equal(commits, 0);
});
test("verifier never replaces existing premium wallet data", async () => {
  await grantDiamonds(grant());
  process.env["PLAYFAB_DIAMONDS_ENABLED"] = "false";
  const saved = structuredClone(wallet());
  await assert.rejects(verify(), /Existing data is never removed/);
  assert.deepEqual(wallet(), saved);
  assert.equal(commits, 1);
});

test("old one-receipt attestations and missing full-capacity flag cannot enable new checkout", () => {
  process.env["PLAYFAB_DIAMONDS_CAPACITY_VERIFIED"] = "false";
  assert.throws(requireDiamondCheckoutReady, /verified/);
  process.env["PLAYFAB_DIAMONDS_CAPACITY_VERIFIED"] = "true";
  process.env["PLAYFAB_DIAMONDS_VERIFIED_CONFIG_SHA256"] = crypto
    .createHash("sha256")
    .update(JSON.stringify({ version: 2, titleId: "17FA03", ...premiumWalletConfig() }))
    .digest("hex");
  assert.throws(requireDiamondCheckoutReady, /verified/);
  assert.equal(calls.length, 0);
});

test("checkout and grant count unrelated object bytes in the VERIFIED shared allowance", async () => {
  objects.unrelated.DataObject = { text: "x".repeat(8000) };
  await assert.rejects(assertDiamondCheckoutCapacity(grant()), /storage limit/);
  await assert.rejects(grantDiamonds(grant()), /storage limit/);
  assert.equal(commits, 0);
  assert.equal(objects.unrelated.DataObject.text.length, 8000);
});

test("shared budget measures UTF-8 bytes, not characters", async () => {
  objects.unrelated.DataObject = { text: "🌊".repeat(2000) };
  await assert.rejects(assertDiamondCheckoutCapacity(grant()), /storage limit/);
  assert.equal(commits, 0);
});

test("unrelated object growth blocks new payments but never deletes or invalidates existing receipts", async () => {
  await grantDiamonds(grant());
  const saved = structuredClone(wallet());
  objects.unrelated.DataObject = { text: "x".repeat(8000) };
  await assert.rejects(assertDiamondCheckoutCapacity(grant("later")), /storage limit/);
  assert.equal((await grantDiamonds(grant())).alreadyGranted, true);
  assert.deepEqual(wallet(), saved);
  assert.equal(commits, 1);
});

test("small title quota cannot pass using a tiny receipt; no money or attestation is emitted", async () => {
  objects = {};
  process.env["PLAYFAB_DIAMONDS_ENABLED"] = "false";
  process.env["PLAYFAB_DIAMONDS_CAPACITY_VERIFIED"] = "false";
  options.quotaBytes = 1024;
  await assert.rejects(verify(), /could not complete Object\/SetObjects/);
  assert.equal(commits, 0);
  assert.deepEqual(objects, {});
  assert.equal(process.env["PLAYFAB_DIAMONDS_CAPACITY_VERIFIED"], "false");
});

test("full-size proof waits for eventual read visibility and verified cleanup", async () => {
  objects = {};
  process.env["PLAYFAB_DIAMONDS_ENABLED"] = "false";
  options.staleCapacityRead = true;
  options.staleCleanupRead = true;
  const result = await verify();
  assert.equal(result.verifiedCapacityBytes, 8192);
  assert.equal(commits, 1);
  assert.deepEqual(Object.keys(objects), [NAME]);
});

test("truncated full-size readback cannot attest and altered marker is never deleted", async () => {
  objects = {};
  process.env["PLAYFAB_DIAMONDS_ENABLED"] = "false";
  options.truncateCapacity = true;
  await assert.rejects(verify(), /Capacity probe changed unexpectedly/);
  assert.equal(commits, 0);
  assert.equal(Object.keys(objects).length, 1);
  assert.equal(
    calls.some((call) => call.body.Objects?.some((entry) => entry.DeleteObject)),
    false,
  );
});

test("uncertain full-size write cannot attest even when exact probe cleanup succeeds", async () => {
  objects = {};
  process.env["PLAYFAB_DIAMONDS_ENABLED"] = "false";
  options.timeoutAfterCommit = true;
  await assert.rejects(verify(), /connection unavailable/);
  assert.equal(commits, 0);
  assert.deepEqual(objects, {});
});

test("cleanup failure cannot emit readiness or reach a monetary test", async () => {
  objects = {};
  process.env["PLAYFAB_DIAMONDS_ENABLED"] = "false";
  options.cleanupFailure = true;
  await assert.rejects(verify(), /cleanup was not confirmed/);
  assert.equal(commits, 0);
  const names = Object.keys(objects);
  assert.equal(names.length, 1);
  assert.match(names[0], /^cc\.capacity\./);
  assert.equal(wallet(), undefined);
});

test("shared-capacity verification requires an EMPTY disposable profile and preserves unrelated data", async () => {
  process.env["PLAYFAB_DIAMONDS_ENABLED"] = "false";
  const saved = structuredClone(objects);
  await assert.rejects(verify(), /EMPTY Entity Objects/);
  assert.deepEqual(objects, saved);
  assert.equal(commits, 0);
  assert.equal(
    calls.some((call) => call.path === "/Object/SetObjects"),
    false,
  );
});
