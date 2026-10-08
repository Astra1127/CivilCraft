import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import {
  FORBIDDEN_PLAYER_WRITES,
  policyBlocksPlayerInventoryWrites,
  verifyDiamondSetup,
} from "../scripts/verify-diamonds-setup.mjs";

const DIAMONDS = "11111111-1111-4111-8111-111111111111";
const RECEIPT = "22222222-2222-4222-8222-222222222222";
const PLAYER = "ABC123";
const ENTITY = { Id: "FACE123", Type: "title_player_account" };
const environment = {
  VITE_PLAYFAB_TITLE_ID: "17FA03",
  PLAYFAB_SECRET_KEY: "test-verification-secret",
  PAYMONGO_SECRET_KEY: "sk_test_mock",
  PLAYFAB_DIAMONDS_ENABLED: "false",
  PLAYFAB_DIAMONDS_STORAGE: "economy-v2",
  PLAYFAB_DIAMONDS_ITEM_ID: DIAMONDS,
  PLAYFAB_DIAMONDS_RECEIPT_ITEM_ID: RECEIPT,
  PLAYFAB_DIAMONDS_VERIFIED_TITLE_ID: "",
  PLAYFAB_DIAMONDS_VERIFIED_CONFIG_SHA256: "",
  PLAYFAB_DIAMONDS_BOOTSTRAP_VERIFIED: "false",
  PLAYFAB_DIAMONDS_PLAYER_WRITES_DENIED: "false",
};
const originalEnvironment = Object.fromEntries(
  Object.keys(environment).map((key) => [key, process.env[key]]),
);
const originalFetch = globalThis.fetch;
let inventory = [];
let version = 0;
let calls = [];
let grants = 0;
let policy = [];
let playerWriteAllowed = false;
let wrongPlayer = false;
let networkFailure = false;
let serial = 0;
const statements = () =>
  FORBIDDEN_PLAYER_WRITES.map((operation) => ({
    Resource: `pfrn:api--/Inventory/${operation}`,
    Action: "*",
    Effect: "Deny",
    Principal: "*",
  }));
const args = () => ({
  testPlayerId: PLAYER,
  playerTicket: "valid-verification-ticket",
  confirmTestWrites: true,
});
const response = (data) => Response.json({ code: 200, data });
beforeEach(() => {
  Object.assign(process.env, environment, { PLAYFAB_SECRET_KEY: `mock-verify-${++serial}` });
  inventory = [];
  version = 0;
  calls = [];
  grants = 0;
  policy = statements();
  playerWriteAllowed = false;
  wrongPlayer = false;
  networkFailure = false;
  globalThis.fetch = async (url, init) => {
    const path = new URL(String(url)).pathname;
    const body = JSON.parse(String(init?.body || "{}"));
    const headers = new Headers(init?.headers);
    calls.push({ path, body, headers });
    if (networkFailure) throw new Error("private-secret-from-upstream");
    if (path === "/Server/AuthenticateSessionTicket")
      return response({
        IsSessionTicketExpired: false,
        UserInfo: { PlayFabId: wrongPlayer ? "BAD" : PLAYER },
      });
    if (path === "/Admin/GetUserAccountInfo")
      return response({
        UserInfo: { PlayFabId: PLAYER, TitleInfo: { TitlePlayerAccount: ENTITY } },
      });
    if (path === "/Authentication/GetEntityToken") {
      if (headers.has("X-Authorization"))
        return response({ Entity: ENTITY, EntityToken: "player-token" });
      return response({
        Entity: { Id: "17FA03", Type: "title" },
        EntityToken: "title-token",
        TokenExpiration: new Date(Date.now() + 3_600_000).toISOString(),
      });
    }
    if (path === "/Admin/GetPolicy") return response({ Statements: policy });
    if (path === "/Catalog/GetItem")
      return response({
        Item: {
          Id: body.Id,
          Type: body.Id === DIAMONDS ? "currency" : "catalogItem",
          IsHidden: body.Id === RECEIPT,
        },
      });
    if (
      path === "/Inventory/AddInventoryItems" &&
      headers.get("X-EntityToken") === "player-token"
    ) {
      assert.equal(body.CollectionId, "premium-wallet-verification");
      assert.equal(body.Item.Id, RECEIPT);
      return playerWriteAllowed
        ? response({})
        : Response.json({ code: 403, error: "APINotEnabledForGameClient" }, { status: 403 });
    }
    assert.equal(headers.get("X-EntityToken"), "title-token");
    if (path === "/Inventory/GetInventoryItems") {
      const stack = body.Filter?.match(/stackId eq '([^']+)'/)?.[1];
      return response({
        Items: structuredClone(
          body.Filter
            ? inventory.filter(
                (item) => item.Id === DIAMONDS || (item.Id === RECEIPT && item.StackId === stack),
              )
            : inventory,
        ),
        ...(version ? { ETag: `v${version}` } : {}),
      });
    }
    if (path === "/Inventory/AddInventoryItems") {
      assert.equal(body.Item.Id, RECEIPT);
      assert.equal(headers.get("X-PlayFab-Economy-If-None-Match"), "*");
      if (inventory.some((item) => item.StackId === body.Item.StackId))
        return Response.json({ code: 412, errorCode: 1610 }, { status: 412 });
      inventory.push({ ...body.Item, Amount: 1 });
      version++;
      return response({ ETag: `v${version}` });
    }
    if (path === "/Inventory/ExecuteInventoryOperations") {
      if (headers.get("X-PlayFab-Economy-If-Match") !== `v${version}`)
        return Response.json({ code: 412, errorCode: 1610 }, { status: 412 });
      for (const operation of body.Operations) {
        const add = operation.Add;
        const existing = inventory.find(
          (item) => item.Id === add.Item.Id && item.StackId === add.Item.StackId,
        );
        if (existing) existing.Amount += add.Amount;
        else inventory.push({ ...add.Item, Amount: add.Amount, ...(add.NewStackValues || {}) });
      }
      grants++;
      version++;
      return response({ ETag: `v${version}`, TransactionIds: ["mock-transaction"] });
    }
    assert.fail(`Unexpected API ${path}`);
  };
});
after(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("verification policy requires every mutating inventory API to be unconditionally denied", () => {
  assert.equal(policyBlocksPlayerInventoryWrites(statements()), true);
  for (const operation of FORBIDDEN_PLAYER_WRITES) {
    assert.equal(
      policyBlocksPlayerInventoryWrites(
        statements().filter((statement) => !statement.Resource.endsWith(`/${operation}`)),
      ),
      false,
      operation,
    );
  }
  assert.equal(
    policyBlocksPlayerInventoryWrites([
      { Resource: "pfrn:api--/Inventory/*", Action: "*", Principal: "*", Effect: "Deny" },
    ]),
    true,
  );
  assert.equal(
    policyBlocksPlayerInventoryWrites([
      {
        Resource: "pfrn:api--/Inventory/*",
        Action: "*",
        Principal: "*",
        Effect: "Deny",
        ApiConditions: { HasSignatureOrEncryption: false },
      },
    ]),
    false,
  );
  assert.equal(
    policyBlocksPlayerInventoryWrites([
      {
        Resource: "pfrn:api--/Inventory/*",
        Action: "*",
        Principal: '{"title_player_account":"*"}',
        Effect: "Deny",
      },
    ]),
    false,
  );
});

test("verification requires explicit test-write consent and a sandbox payment configuration before network access", async () => {
  await assert.rejects(
    verifyDiamondSetup({ ...args(), confirmTestWrites: false }),
    /confirm-test-writes/,
  );
  process.env["PAYMONGO_SECRET_KEY"] = "sk_live_not_permitted";
  await assert.rejects(verifyDiamondSetup(args()), /Live payment keys/);
  assert.equal(calls.length, 0);
});

test("failed policy, player mismatch, and enabled production gate cannot emit an attestation", async () => {
  process.env["PLAYFAB_DIAMONDS_ENABLED"] = "true";
  await assert.rejects(verifyDiamondSetup(args()), /Disable Diamonds/);
  assert.equal(calls.length, 0);
  process.env["PLAYFAB_DIAMONDS_ENABLED"] = "false";
  wrongPlayer = true;
  await assert.rejects(verifyDiamondSetup(args()), /explicitly selected test player/);
  wrongPlayer = false;
  policy = [];
  await assert.rejects(verifyDiamondSetup(args()), /not unconditionally denied/);
  assert.equal(grants, 0);
  assert.equal(process.env["PLAYFAB_DIAMONDS_BOOTSTRAP_VERIFIED"], "false");
});

test("an allowed player-token mutation stops verification before any monetary grant", async () => {
  playerWriteAllowed = true;
  await assert.rejects(verifyDiamondSetup(args()), /not explicitly denied/);
  assert.equal(grants, 0);
  assert.equal(process.env["PLAYFAB_DIAMONDS_PLAYER_WRITES_DENIED"], "false");
});

test("mocked first-empty-wallet check emits attestations only after concurrent grant, replay and receipt pass", async () => {
  const result = await verifyDiamondSetup(args());
  assert.equal(result.balance, 1);
  assert.equal(result.titleId, "17FA03");
  assert.equal(result.attestations.PLAYFAB_DIAMONDS_BOOTSTRAP_VERIFIED, "true");
  assert.match(result.attestations.PLAYFAB_DIAMONDS_VERIFIED_CONFIG_SHA256, /^[a-f0-9]{64}$/);
  assert.equal(grants, 1);
  assert.equal(
    process.env["PLAYFAB_DIAMONDS_ENABLED"],
    "false",
    "does not silently enable deployment",
  );
  assert.equal(process.env["PLAYFAB_DIAMONDS_BOOTSTRAP_VERIFIED"], "false");
  assert.equal(
    calls.some((call) => /SetTitle|UpdatePolicy|CreateDraft|Publish|Delete/.test(call.path)),
    false,
  );
});

test("verification preserves existing test-wallet data and rejects nonempty accounts", async () => {
  inventory = [{ Id: DIAMONDS, StackId: "default", Amount: 42 }];
  version = 1;
  await assert.rejects(verifyDiamondSetup(args()), /fresh disposable player/);
  assert.equal(inventory[0].Amount, 42);
  assert.equal(grants, 0);
});

test("verification connection errors never include private upstream messages", async () => {
  networkFailure = true;
  await assert.rejects(verifyDiamondSetup(args()), (error) => {
    assert.match(error.message, /connection unavailable/);
    assert.doesNotMatch(error.message, /private-secret/);
    return true;
  });
  assert.equal(grants, 0);
});
