import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import {
  getDiamondBalance,
  grantDiamonds,
  hasDiamondReceipt,
  premiumWalletConfig,
  premiumWalletVerificationFingerprint,
  requireDiamondCheckoutReady,
  resolvePremiumEntity,
} from "../src/lib/playfab/premium-wallet.server.ts";
import { authenticatePaymentPlayer } from "../src/lib/payments/player-auth.server.ts";

const DIAMONDS = "11111111-1111-4111-8111-111111111111";
const RECEIPT = "22222222-2222-4222-8222-222222222222";
const PLAYER = "ABC123";
const ENTITY = { Id: "FACE123", Type: "title_player_account" as const };
const environment = {
  VITE_PLAYFAB_TITLE_ID: "17FA03",
  PLAYFAB_SECRET_KEY: "mock-premium-secret",
  PLAYFAB_DIAMONDS_ENABLED: "true",
  PLAYFAB_DIAMONDS_ITEM_ID: DIAMONDS,
  PLAYFAB_DIAMONDS_RECEIPT_ITEM_ID: RECEIPT,
  PLAYFAB_DIAMONDS_VERIFIED_TITLE_ID: "17FA03",
  PLAYFAB_DIAMONDS_VERIFIED_CONFIG_SHA256: "",
  PLAYFAB_DIAMONDS_BOOTSTRAP_VERIFIED: "true",
  PLAYFAB_DIAMONDS_PLAYER_WRITES_DENIED: "true",
};
const oldEnvironment = Object.fromEntries(
  Object.keys(environment).map((key) => [key, process.env[key]]),
);
const oldFetch = globalThis.fetch;
let serial = 0;
let version = 0;
let inventory: Array<Record<string, unknown>> = [];
type MockRequestBody = {
  SessionTicket?: string;
  Entity?: unknown;
  CollectionId?: string;
  Filter?: string;
  Item: { Id: string; StackId: string };
  Amount: number;
  IdempotencyId?: string;
  Operations: Array<{
    Add: {
      Item: { Id: string; StackId: string };
      Amount: number;
      DurationInSeconds?: number;
      NewStackValues?: Record<string, unknown>;
    };
  }>;
};
let calls: Array<{ path: string; body: MockRequestBody; headers: Headers }> = [];
let commits = 0;
let timeoutAfterCommit = false;
let rejectAtomicWrite = false;
let badTitleToken = false;
let wrongAccount = false;
let corruptReceipt = false;
let staleReadOnce: Record<string, unknown> | null = null;
let expireEconomyTokenOnce = false;
let failReads = false;
let preserveMissingETag = false;

function data(body: Record<string, unknown>) {
  return Response.json({ code: 200, data: body });
}
function conflict() {
  return Response.json(
    { code: 412, error: "PreconditionFailed", errorCode: 1610 },
    { status: 412 },
  );
}
function input(orderId = "CC-DIAMONDS-TEST-1", rewardAmount = 500) {
  return {
    orderId,
    playFabId: PLAYER,
    entity: ENTITY,
    wallet: premiumWalletConfig(),
    rewardAmount,
  };
}
function initialize() {
  inventory = [{ Id: RECEIPT, StackId: "wallet-initialized-v1", Amount: 1 }];
  version = 1;
}
beforeEach(() => {
  Object.assign(process.env, environment, { PLAYFAB_SECRET_KEY: `mock-secret-${++serial}` });
  process.env["PLAYFAB_DIAMONDS_VERIFIED_CONFIG_SHA256"] = premiumWalletVerificationFingerprint();
  version = 0;
  inventory = [];
  calls = [];
  commits = 0;
  timeoutAfterCommit = false;
  rejectAtomicWrite = false;
  badTitleToken = false;
  wrongAccount = false;
  corruptReceipt = false;
  staleReadOnce = null;
  expireEconomyTokenOnce = false;
  failReads = false;
  preserveMissingETag = false;
  globalThis.fetch = async (url, init) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.hostname, "17fa03.playfabapi.com");
    const path = parsed.pathname;
    const body = JSON.parse(String(init?.body || "{}"));
    const headers = new Headers(init?.headers);
    calls.push({ path, body, headers });
    if (path === "/Server/AuthenticateSessionTicket") {
      assert.equal(headers.get("X-SecretKey"), process.env["PLAYFAB_SECRET_KEY"]);
      return data({
        UserInfo: { PlayFabId: PLAYER },
        IsSessionTicketExpired: body.SessionTicket !== "valid-ticket",
      });
    }
    if (path === "/Admin/GetUserAccountInfo") {
      assert.equal(headers.get("X-SecretKey"), process.env["PLAYFAB_SECRET_KEY"]);
      return data({
        UserInfo: {
          PlayFabId: wrongAccount ? "DEADBEEF" : PLAYER,
          TitleInfo: { TitlePlayerAccount: ENTITY },
        },
      });
    }
    if (path === "/Authentication/GetEntityToken") {
      assert.equal(headers.get("X-SecretKey"), process.env["PLAYFAB_SECRET_KEY"]);
      return data({
        EntityToken: "mock-title-token",
        Entity: { Id: "17FA03", Type: badTitleToken ? "title_player_account" : "title" },
        TokenExpiration: new Date(Date.now() + 3_600_000).toISOString(),
      });
    }
    assert.equal(headers.get("X-EntityToken"), "mock-title-token");
    assert.equal(headers.get("X-SecretKey"), null);
    assert.deepEqual(body.Entity, ENTITY);
    assert.equal(body.CollectionId, "premium-wallet");
    if (expireEconomyTokenOnce) {
      expireEconomyTokenOnce = false;
      return Response.json({ code: 401, error: "EntityTokenExpired" }, { status: 401 });
    }
    if (path === "/Inventory/GetInventoryItems") {
      if (failReads) throw new Error("private upstream credentials must not leak");
      if (staleReadOnce) {
        const stale = staleReadOnce;
        staleReadOnce = null;
        return data(stale);
      }
      const stack = String(body.Filter).match(/stackId eq '([^']+)'/)?.[1];
      const items = inventory.filter(
        (item) => item["Id"] === DIAMONDS || (item["Id"] === RECEIPT && item["StackId"] === stack),
      );
      return data({
        Items: structuredClone(items).map((item) =>
          corruptReceipt && item["StackId"] === stack
            ? { ...item, DisplayProperties: { grantFingerprint: "tampered" } }
            : item,
        ),
        ...(version && !preserveMissingETag ? { ETag: `v${version}` } : {}),
      });
    }
    if (path === "/Inventory/AddInventoryItems") {
      assert.equal(body.Item.Id, RECEIPT, "bootstrap must never add currency");
      assert.equal(body.Item.StackId, "wallet-initialized-v1");
      assert.equal(body.Amount, 1);
      assert.equal(headers.get("X-PlayFab-Economy-If-None-Match"), "*");
      if (inventory.some((item) => item["StackId"] === body.Item.StackId)) return conflict();
      inventory.push({ ...body.Item, Amount: body.Amount });
      version++;
      return data({ ETag: `v${version}` });
    }
    if (path === "/Inventory/ExecuteInventoryOperations") {
      assert.equal(
        body.IdempotencyId,
        undefined,
        "ETag retries must not use a changing Idempotency request",
      );
      assert.equal(body.Operations.length, 2);
      if (rejectAtomicWrite)
        return Response.json(
          { code: 400, error: "InvalidCatalogItemConfiguration" },
          { status: 400 },
        );
      if (headers.get("X-PlayFab-Economy-If-Match") !== `v${version}`) return conflict();
      const next = structuredClone(inventory);
      for (const operation of body.Operations) {
        const add = operation.Add;
        assert.equal(add.DurationInSeconds, undefined, "purchase receipts never expire");
        const existing = next.find(
          (item) => item["Id"] === add.Item.Id && item["StackId"] === add.Item.StackId,
        );
        if (existing) existing["Amount"] = Number(existing["Amount"]) + add.Amount;
        else next.push({ ...add.Item, Amount: add.Amount, ...(add.NewStackValues || {}) });
      }
      inventory = next;
      version++;
      commits++;
      if (timeoutAfterCommit) {
        timeoutAfterCommit = false;
        throw new TypeError("Network timeout after committed write");
      }
      return data({ ETag: `v${version}`, TransactionIds: [`transaction-${commits}`] });
    }
    assert.fail(`Unexpected external API ${path}`);
  };
});
after(() => {
  globalThis.fetch = oldFetch;
  for (const [key, value] of Object.entries(oldEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("Diamonds gate is disabled by default and binds every setup attestation to exact configuration", () => {
  assert.equal(Object.isFrozen(requireDiamondCheckoutReady()), true);
  for (const key of [
    "PLAYFAB_DIAMONDS_ENABLED",
    "PLAYFAB_DIAMONDS_BOOTSTRAP_VERIFIED",
    "PLAYFAB_DIAMONDS_PLAYER_WRITES_DENIED",
  ]) {
    process.env[key] = "false";
    assert.throws(() => requireDiamondCheckoutReady(), /not available|verified PlayFab/i);
    process.env[key] = "true";
  }
  process.env["PLAYFAB_DIAMONDS_VERIFIED_TITLE_ID"] = "BAD";
  assert.throws(() => requireDiamondCheckoutReady(), /verified PlayFab/);
  process.env["PLAYFAB_DIAMONDS_VERIFIED_TITLE_ID"] = "17FA03";
  process.env["PLAYFAB_DIAMONDS_ITEM_ID"] = "33333333-3333-4333-8333-333333333333";
  assert.throws(() => requireDiamondCheckoutReady(), /verified PlayFab/);
  process.env["PLAYFAB_DIAMONDS_ITEM_ID"] = RECEIPT;
  assert.throws(() => premiumWalletConfig(), /configuration/);
});

test("verified payment authentication keeps Coins free of any new entity lookup", async () => {
  assert.deepEqual(
    await authenticatePaymentPlayer(
      new Request("https://civilcraft.test", { headers: { Authorization: "Bearer valid-ticket" } }),
    ),
    { playFabId: PLAYER },
  );
  assert.deepEqual(
    calls.map((call) => call.path),
    ["/Server/AuthenticateSessionTicket"],
  );
  await assert.rejects(
    authenticatePaymentPlayer(new Request("https://civilcraft.test")),
    /sign-in/,
  );
  await assert.rejects(
    authenticatePaymentPlayer(
      new Request("https://civilcraft.test", { headers: { Authorization: "Bearer expired" } }),
    ),
    /sign-in|session expired/,
  );
});

test("premium entity comes only from the server account mapping and must match the player", async () => {
  assert.deepEqual(await resolvePremiumEntity(PLAYER), ENTITY);
  wrongAccount = true;
  await assert.rejects(resolvePremiumEntity(PLAYER), /resolve/);
  await assert.rejects(resolvePremiumEntity("untrusted-browser-id"), /identity/);
});

test("balance and receipt status reads never bootstrap or grant an empty wallet", async () => {
  assert.equal(await getDiamondBalance(PLAYER), 0);
  assert.equal(await hasDiamondReceipt(input()), false);
  assert.equal(inventory.length, 0);
  assert.equal(
    calls.some(
      (call) =>
        call.path === "/Inventory/AddInventoryItems" ||
        call.path === "/Inventory/ExecuteInventoryOperations",
    ),
    false,
  );
  assert.equal(calls.filter((call) => call.path === "/Authentication/GetEntityToken").length, 1);
});

test("first-wallet bootstrap adds no money and Diamonds+receipt commit in one conditional batch", async () => {
  const result = await grantDiamonds(input());
  assert.equal(result.alreadyGranted, false);
  assert.equal(result.balance, 500);
  assert.equal(commits, 1);
  assert.equal(await getDiamondBalance(PLAYER), 500);
  assert.equal(await hasDiamondReceipt(input()), true);
  const batch = calls.find((call) => call.path === "/Inventory/ExecuteInventoryOperations")!;
  assert.equal(batch.headers.get("X-PlayFab-Economy-If-Match"), "v1");
  assert.equal(batch.body["Operations"][0]!.Add.Item.Id, RECEIPT);
  assert.equal(batch.body["Operations"][1]!.Add.Item.Id, DIAMONDS);
  assert.match(batch.body["Operations"][0]!.Add.Item.StackId, /^order-[a-f0-9]{64}$/);
});

test("permanent receipt prevents repeated grants even after process/token-cache replacement", async () => {
  await grantDiamonds(input());
  process.env["PLAYFAB_SECRET_KEY"] = "replacement-secret-after-14-days";
  const repeat = await grantDiamonds(input());
  assert.equal(repeat.alreadyGranted, true);
  assert.equal(repeat.balance, 500);
  assert.equal(commits, 1);
});

test("receipt still prevents replay 15 days later, beyond PlayFab's 14-day idempotency retention", async () => {
  await grantDiamonds(input());
  const originalNow = Date.now;
  try {
    Date.now = () => originalNow() + 15 * 24 * 60 * 60 * 1000;
    const repeat = await grantDiamonds(input());
    assert.equal(repeat.alreadyGranted, true);
    assert.equal(repeat.balance, 500);
    assert.equal(commits, 1);
  } finally {
    Date.now = originalNow;
  }
});

test("concurrent identical orders grant only once", async () => {
  initialize();
  const results = await Promise.all([grantDiamonds(input()), grantDiamonds(input())]);
  assert.equal(commits, 1);
  assert.equal(results.filter((result) => result.alreadyGranted).length, 1);
  assert.equal(await getDiamondBalance(PLAYER), 500);
});

test("concurrent distinct orders preserve both rewards", async () => {
  initialize();
  await Promise.all([grantDiamonds(input("order-a", 500)), grantDiamonds(input("order-b", 1000))]);
  assert.equal(commits, 2);
  assert.equal(await getDiamondBalance(PLAYER), 1500);
});

test("timeout after atomic commit is reconciled from receipt, never credited again", async () => {
  initialize();
  timeoutAfterCommit = true;
  const result = await grantDiamonds(input());
  assert.equal(result.alreadyGranted, true);
  assert.equal(commits, 1);
  assert.equal(result.balance, 500);
});

test("stale receipt absence is protected by the authoritative ETag check", async () => {
  initialize();
  await grantDiamonds(input());
  staleReadOnce = { Items: [], ETag: "v1" };
  assert.equal((await grantDiamonds(input())).alreadyGranted, true);
  assert.equal(commits, 1);
});

test("receipt reward mismatch and corruption fail closed", async () => {
  initialize();
  await grantDiamonds(input());
  await assert.rejects(grantDiamonds(input("CC-DIAMONDS-TEST-1", 1000)), /receipt requires review/);
  corruptReceipt = true;
  await assert.rejects(hasDiamondReceipt(input()), /receipt requires review/);
  assert.equal(commits, 1);
});

test("failed atomic receipt operation cannot add Diamonds", async () => {
  initialize();
  rejectAtomicWrite = true;
  await assert.rejects(grantDiamonds(input()), /temporarily unavailable/);
  assert.equal(commits, 0);
  assert.equal(await getDiamondBalance(PLAYER), 0);
});

test("unverified title tokens are rejected without inventory writes", async () => {
  badTitleToken = true;
  await assert.rejects(grantDiamonds(input()), /temporarily unavailable/);
  assert.equal(
    calls.some((call) => call.path.startsWith("/Inventory/")),
    false,
  );
});

test("expired token refresh is bounded and does not expose privileged credentials", async () => {
  initialize();
  expireEconomyTokenOnce = true;
  assert.equal((await grantDiamonds(input())).balance, 500);
  assert.equal(calls.filter((call) => call.path === "/Authentication/GetEntityToken").length, 2);
  assert.equal(commits, 1);
});

test("read outage is not mistaken for receipt absence and never writes", async () => {
  failReads = true;
  await assert.rejects(grantDiamonds(input()), (error: Error) => {
    assert.match(error.message, /temporarily unavailable/);
    assert.doesNotMatch(error.message, /private upstream|mock-secret/);
    return true;
  });
  assert.equal(
    calls.some(
      (call) =>
        call.path === "/Inventory/AddInventoryItems" ||
        call.path === "/Inventory/ExecuteInventoryOperations",
    ),
    false,
  );
});

test("missing ETag never falls back to an unconditional monetary operation", async () => {
  preserveMissingETag = true;
  await assert.rejects(grantDiamonds(input()), /temporarily unavailable/);
  assert.equal(commits, 0);
  assert.equal(calls.filter((call) => call.path === "/Inventory/AddInventoryItems").length, 1);
});

test("captured wallet config is not rerouted after configuration changes", async () => {
  const captured = input();
  process.env["PLAYFAB_DIAMONDS_ITEM_ID"] = "33333333-3333-4333-8333-333333333333";
  process.env["PLAYFAB_DIAMONDS_VERIFIED_CONFIG_SHA256"] = premiumWalletVerificationFingerprint();
  await assert.rejects(grantDiamonds(captured), /approved wallet configuration/);
  assert.equal(calls.length, 0);
});
