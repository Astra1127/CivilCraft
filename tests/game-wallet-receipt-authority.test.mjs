import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import * as coinMaintenance from "../src/lib/payments/coin-maintenance.server.ts";
import { PGlite } from "@electric-sql/pglite";
import * as catalog from "../src/lib/game-wallet/catalog.server.ts";
import { AdminApiError } from "../src/lib/playfab/admin-client.server.ts";
import * as gateContext from "../src/lib/game-wallet/gate-context.server.ts";

const require = createRequire(import.meta.url),
  PLAYER = "ABCDEF",
  ENTITY = { Id: "FACE123", Type: "title_player_account" };
const CONFIG = {
  storage: "postgres",
  namespace: "civilcraft_game_wallet_v3",
  databaseId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  targetId: "a".repeat(64),
  protocolVersion: 3,
};
const OBJECT = "civilcraft.coin-purchases.v1",
  ORDER = "orphan-old-order";
const hash = (x) => crypto.createHash("sha256").update(x).digest("hex");
const deny = {
  PolicyName: "ApiPolicy",
  Statements: [
    { Resource: "pfrn:api--*", Effect: "Allow", Action: "*", Principal: "*" },
    { Resource: "pfrn:api--/Object/SetObjects", Effect: "Deny", Action: "*", Principal: "*" },
  ],
};
function load(file, mocks) {
  const exports = {};
  const source = ts.transpileModule(
    readFileSync(new URL(`../src/lib/game-wallet/${file}`, import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  vm.runInNewContext(source, {
    exports,
    Buffer,
    require(name) {
      if (name.endsWith("coin-maintenance.server.ts")) return coinMaintenance;
      if (name in mocks) return mocks[name];
      if (name.startsWith("node:")) return require(name);
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return exports;
}
function harness() {
  const state = {
    config: { ...CONFIG },
    pg: [],
    policy: deny,
    objects: { Entity: ENTITY, ProfileVersion: 0, Objects: {} },
    calls: [],
    manifest: "matching",
    inventory: 500,
    coverage: [],
    customCall: null,
  };
  const admin = {
    AdminApiError,
    adminGameConfig: () => ({ titleId: "17FA03", secret: "fixture" }),
    object: (n) => (n && typeof n === "object" && !Array.isArray(n) ? n : {}),
    playFabAdmin: async (operation) => {
      state.calls.push(operation);
      if (operation === "Admin/GetPolicy") {
        if (state.policy instanceof Error) throw state.policy;
        return state.policy;
      }
      if (operation === "Server/GetUserInventory")
        return { VirtualCurrency: { CO: state.inventory } };
      throw new Error("Mutable audit records must not be read");
    },
  };
  const premium = {
    resolvePremiumEntity: async () => ENTITY,
    entityObjectsRequest: async (operation) => {
      assert.equal(operation, "Object/GetObjects");
      state.calls.push(operation);
      return state.objects;
    },
  };
  const config = {
    isLegacyCoinGateRequired: () => true,
    requireGameWalletSettlementReady: () => state.config,
  };
  const db = {
    walletIdentity: () => [state.config.databaseId, "17FA03", PLAYER, ENTITY.Id, ENTITY.Type],
    walletInteger: (n) => {
      const value = Number(n);
      if (!Number.isSafeInteger(value) || value < 0 || value > 2147483647)
        throw new AdminApiError(503, "badinteger");
      return value;
    },
    walletUnavailable: () => new AdminApiError(503, "Unavailable"),
    walletCall: async (name, args) => {
      state.calls.push(name);
      if (state.customCall) return state.customCall(name, args);
      if (name === "legacy_receipts") return state.pg;
      if (name === "entity_manifest") {
        if (state.manifest === "matching") {
          const snap = authority.parseOriginalEntityReceipts(state.objects, PLAYER, ENTITY);
          return [{ ledger_hash: args.at(-1), receipt_set: JSON.parse(JSON.stringify(snap)) }];
        }
        return state.manifest;
      }
      if (name === "credit") {
        const covered = state.coverage.find((c) => c.orderId === args.at(-1));
        if (covered) assert.equal(covered.fingerprint, args[7]);
        return [{ already_granted: !!covered, covered: !!covered }];
      }
      throw new Error(name);
    },
  };
  const common = {
    "../playfab/admin-client.server.ts": admin,
    "../playfab/premium-wallet.server.ts": premium,
    "../payments/products.ts": {
      normalizeOrderReward: (o) => ({
        rewardCurrency: o.rewardCurrency ?? "CO",
        rewardAmount: o.rewardAmount ?? o.expectedCoins,
      }),
    },
    "./config.server.ts": config,
    "./database.server.ts": db,
    "./catalog.server.ts": catalog,
  };
  const authority = load("receipt-authority.server.ts", common);
  const legacy = load("legacy.server.ts", {
    ...common,
    "../payments/coin-receipts.server.ts": { getCoinReceiptStatus: async () => "granted" },
    "./gate-context.server.ts": gateContext,
    "./receipt-authority.server.ts": authority,
  });
  const pg = (status = "granted", order = ORDER, amount = 500) => ({
    order_id: order,
    player_id: PLAYER,
    entity_id: ENTITY.Id,
    entity_type: ENTITY.Type,
    currency: "CO",
    amount: String(amount),
    original_fingerprint: authority.postgresReceiptFingerprint(
      CONFIG,
      PLAYER,
      ENTITY,
      order,
      amount,
    ),
    state: status,
  });
  const original = (status = "granted", order = ORDER) => {
    const fingerprint = catalog.digest({
      version: 1,
      orderId: order,
      titleId: "17FA03",
      playFabId: PLAYER,
      entityId: ENTITY.Id,
      code: "CO",
      amount: 500,
      objectName: OBJECT,
    });
    return {
      Entity: ENTITY,
      ProfileVersion: 1,
      Objects: {
        [OBJECT]: {
          ObjectName: OBJECT,
          DataObject: {
            schemaVersion: 1,
            titleId: "17FA03",
            playFabId: PLAYER,
            entityId: ENTITY.Id,
            receipts: {
              [`order-${hash(order)}`]: {
                fingerprint,
                amount: 500,
                code: "CO",
                attemptId: "11111111-2222-3333-4444-555555555555",
                state: status,
              },
            },
          },
        },
      },
    };
  };
  const order = (version = 2) => ({
    orderId: ORDER,
    playFabId: PLAYER,
    expectedCoins: 500,
    rewardCurrency: "CO",
    rewardAmount: 500,
    status: "fulfilled",
    coinCurrencyCode: "CO",
    coinReceiptVersion: version,
    ...(version === 2
      ? {
          coinReceipt: {
            storage: "postgres",
            databaseId: CONFIG.databaseId,
            targetId: CONFIG.targetId,
            schemaVersion: 1,
          },
        }
      : {}),
  });
  return { state, authority, legacy, pg, original, order };
}
test("orphan PG grant discovered with no audit row remains covered when original order is restored", async () => {
  const h = harness();
  h.state.pg = [h.pg()];
  const opening = await h.legacy.legacyOpeningSnapshot(PLAYER);
  assert.equal(opening.classic, 500);
  assert.equal(opening.covered.length, 1);
  assert.equal(opening.covered[0].orderId, `postgres:${ORDER}`);
  assert.equal(opening.covered[0].originalFingerprint, h.state.pg[0].original_fingerprint);
  h.state.coverage = opening.covered;
  assert.deepEqual(JSON.parse(JSON.stringify(await h.legacy.recordLegacyCoinGrant(h.order()))), {
    alreadyGranted: true,
    covered: true,
  });
  assert.equal(h.state.calls.includes("Admin/GetTitleInternalData"), false);
});
test("orphan pending PG claim blocks before Entity or inventory reads", async () => {
  const h = harness();
  h.state.pg = [h.pg("pending")];
  await assert.rejects(h.legacy.legacyOpeningSnapshot(PLAYER), /permanent Coin claim/);
  assert.equal(h.state.calls.includes("Server/GetUserInventory"), false);
  assert.equal(h.state.calls.includes("Object/GetObjects"), false);
});
test("PG malformed identity/amount/fingerprint and moved target fail closed without classic lookup", async () => {
  for (const change of [
    { player_id: "OTHER" },
    { entity_id: "AAAA" },
    { currency: "DI" },
    { amount: "-1" },
    { original_fingerprint: "b".repeat(64) },
  ]) {
    const h = harness();
    h.state.pg = [{ ...h.pg(), ...change }];
    await assert.rejects(h.legacy.legacyOpeningSnapshot(PLAYER));
    assert.equal(h.state.calls.includes("Server/GetUserInventory"), false);
  }
  const h = harness();
  h.state.pg = [h.pg()];
  h.state.config.targetId = "b".repeat(64);
  await assert.rejects(h.legacy.legacyOpeningSnapshot(PLAYER));
  const k = harness();
  k.state.pg = [k.pg()];
  await assert.rejects(
    k.legacy.recordLegacyCoinGrant({
      ...k.order(),
      coinReceipt: { ...k.order().coinReceipt, targetId: "b".repeat(64) },
    }),
  );
  assert.equal(k.state.calls.includes("credit"), false);
});
test("original Entity orphan hashed key is discovered independent of current Diamond provider/capacity", async () => {
  const h = harness();
  h.state.objects = h.original();
  const opening = await h.legacy.legacyOpeningSnapshot(PLAYER);
  assert.equal(opening.covered[0].orderId, `entity-objects:${ENTITY.Id}:order-${hash(ORDER)}`);
  assert.equal(opening.covered[0].provider, "entity-objects");
  h.state.coverage = opening.covered;
  assert.deepEqual(JSON.parse(JSON.stringify(await h.legacy.recordLegacyCoinGrant(h.order(1)))), {
    alreadyGranted: true,
    covered: true,
  });
});
test("pending original Entity claim blocks before inventory even with trusted live policy", async () => {
  const h = harness();
  h.state.objects = h.original("pending");
  await assert.rejects(h.legacy.legacyOpeningSnapshot(PLAYER), /original Entity Coin claim/);
  assert.equal(h.state.calls.includes("Server/GetUserInventory"), false);
});
test("missing/conditional/narrow policy never proves history; immutable manifest remains required", async () => {
  const cases = [
    { PolicyName: "ApiPolicy", Statements: [] },
    {
      PolicyName: "ApiPolicy",
      Statements: [{ ...deny.Statements[1], Principal: '{"title_player_account":"*"}' }],
    },
    {
      PolicyName: "ApiPolicy",
      Statements: [{ ...deny.Statements[1], ApiConditions: { HasSignatureOrEncryption: "False" } }],
    },
    {
      PolicyName: "ApiPolicy",
      Statements: [{ ...deny.Statements[1], Resource: "pfrn:api--/Object/GetObjects" }],
    },
    new Error("policy unavailable"),
  ];
  for (const policy of cases) {
    const h = harness();
    assert.equal(h.authority.policyProvesServerOnlyObjects(policy), false);
    h.state.policy = policy;
    h.state.manifest = [];
    await assert.rejects(h.legacy.legacyOpeningSnapshot(PLAYER), /authority requires review/);
    assert.equal(h.state.calls.includes("entity_manifest"), true);
    assert.equal(h.state.calls.includes("Server/GetUserInventory"), false);
  }
});
test("explicit owner-approved EMPTY manifest exactly matching bound current snapshot is accepted", async () => {
  const h = harness();
  h.state.policy = { PolicyName: "ApiPolicy", Statements: [] };
  h.state.manifest = "matching";
  assert.equal((await h.legacy.legacyOpeningSnapshot(PLAYER)).covered.length, 0);
  assert.equal(h.state.calls.includes("Server/GetUserInventory"), true);
});
test("nonempty manifest is stable across JSONB key ordering, but stale source/hash fails closed", async () => {
  const h = harness();
  h.state.objects = h.original();
  h.state.policy = new Error("unavailable");
  h.state.manifest = "matching";
  assert.equal((await h.legacy.legacyOpeningSnapshot(PLAYER)).covered.length, 1);
  const snap = h.authority.parseOriginalEntityReceipts(h.state.objects, PLAYER, ENTITY),
    fp = h.authority.entityAuthoritySnapshotHash(CONFIG, PLAYER, ENTITY, snap);
  h.state.manifest = [
    {
      ledger_hash: fp,
      receipt_set: {
        receipts: [
          {
            state: "granted",
            amount: 500,
            originalFingerprint: snap.receipts[0].originalFingerprint,
            receiptKey: snap.receipts[0].receiptKey,
            provider: "entity-objects",
          },
        ],
        exists: true,
      },
    },
  ];
  assert.equal((await h.legacy.legacyOpeningSnapshot(PLAYER)).covered.length, 1);
  h.state.manifest = [{ ledger_hash: fp, receipt_set: { exists: false, receipts: [] } }];
  await assert.rejects(h.legacy.legacyOpeningSnapshot(PLAYER));
  h.state.manifest = [{ ledger_hash: "0".repeat(64), receipt_set: snap }];
  await assert.rejects(h.legacy.legacyOpeningSnapshot(PLAYER));
});
test("malformed/wrong-owner Entity ledger and changed restored order cannot produce credit", async () => {
  const h = harness();
  h.state.objects = h.original();
  h.state.objects.Objects[OBJECT].DataObject.playFabId = "OTHER";
  await assert.rejects(h.legacy.legacyOpeningSnapshot(PLAYER));
  assert.equal(h.state.calls.includes("Server/GetUserInventory"), false);
  const k = harness();
  k.state.objects = k.original();
  await assert.rejects(
    k.legacy.recordLegacyCoinGrant({ ...k.order(1), expectedCoins: 501, rewardAmount: 501 }),
  );
  assert.equal(k.state.calls.includes("credit"), false);
});
test("current global deny cannot authorize absent/empty/nonempty history without a manifest", async () => {
  const h = harness();
  assert.equal(h.authority.policyProvesServerOnlyObjects(deny), true);
  h.state.manifest = [];
  await assert.rejects(h.legacy.legacyOpeningSnapshot(PLAYER));
  h.state.objects = h.original();
  await assert.rejects(h.legacy.legacyOpeningSnapshot(PLAYER));
  h.state.objects.Objects[OBJECT].DataObject.receipts = {};
  await assert.rejects(h.legacy.legacyOpeningSnapshot(PLAYER));
  assert.equal(h.state.calls.includes("Server/GetUserInventory"), false);
});
test("manifest-approved namespace absence is read-only and does not require free object slots", async () => {
  const h = harness();
  h.state.objects.Objects = { unrelated1: {}, unrelated2: {}, unrelated3: {} };
  assert.equal((await h.legacy.legacyOpeningSnapshot(PLAYER)).covered.length, 0);
  assert.equal(h.state.calls.includes("entity_manifest"), true);
  assert.equal(h.state.calls.includes("Admin/GetPolicy"), false);
});
test("actual permanent v2 orphan500 discovery/import/restored-order replay stays500 end to end", async () => {
  const db = await PGlite.create();
  try {
    await db.exec(
      readFileSync(new URL("../database/currency-schema.sql", import.meta.url), "utf8"),
    );
    await db.exec(readFileSync(new URL("../database/game-wallet-v3.sql", import.meta.url), "utf8"));
    const id = (await db.query("SELECT database_id FROM civilcraft_currency.installation")).rows[0]
      .database_id;
    const h = harness();
    h.state.config.databaseId = id;
    const snap = h.authority.parseOriginalEntityReceipts(h.state.objects, PLAYER, ENTITY),
      snapshotHash = h.authority.entityAuthoritySnapshotHash(h.state.config, PLAYER, ENTITY, snap);
    await db.query(
      "INSERT INTO civilcraft_game_wallet_v3.entity_manifests(title_id,player_id,entity_id,target_id,ledger_hash,receipt_set,approved_by,completeness_evidence) VALUES($1,$2,$3,$4,$5,$6,'fixture-owner','verified complete original source fixture')",
      ["17FA03", PLAYER, ENTITY.Id, CONFIG.targetId, snapshotHash, JSON.stringify(snap)],
    );
    await db.exec(
      "CREATE ROLE authority_fixture LOGIN; GRANT civilcraft_currency_app,civilcraft_game_wallet_app TO authority_fixture; SET SESSION AUTHORIZATION authority_fixture",
    );
    const call = async (schema, name, args) =>
      (
        await db.query(
          `SELECT * FROM ${schema}.${name}(${args.map((_, i) => `$${i + 1}`).join(",")})`,
          args,
        )
      ).rows;
    h.state.customCall = (name, args) => call("civilcraft_game_wallet_v3", name, args);
    const originalFp = h.authority.postgresReceiptFingerprint(
      h.state.config,
      PLAYER,
      ENTITY,
      ORDER,
      500,
    );
    const old = [id, "17FA03", 1, ORDER, PLAYER, ENTITY.Id, ENTITY.Type, "CO", 500, originalFp],
      attempt = crypto.randomUUID();
    await call("civilcraft_currency", "claim_coins", [...old, attempt]);
    await call("civilcraft_currency", "complete_coins", [...old, attempt]);
    const who = [id, "17FA03", PLAYER, ENTITY.Id, ENTITY.Type],
      owner = crypto.randomUUID();
    await call("civilcraft_game_wallet_v3", "gate_acquire", [...who, owner, "import"]);
    const opening = await h.legacy.legacyOpeningSnapshot(PLAYER);
    assert.equal(opening.covered[0].originalFingerprint, originalFp);
    await call("civilcraft_game_wallet_v3", "import_wallet", [
      ...who,
      owner,
      0,
      opening.classic,
      hash("approved-save"),
      JSON.stringify(opening.covered),
      "[]",
      "[]",
    ]);
    await call("civilcraft_game_wallet_v3", "gate_release", [...who, owner]);
    const restored = { ...h.order(), coinReceipt: { ...h.order().coinReceipt, databaseId: id } };
    assert.equal((await h.legacy.recordLegacyCoinGrant(restored)).covered, true);
    assert.equal(
      Number((await call("civilcraft_game_wallet_v3", "wallet_balance", who))[0].coins),
      500,
    );
    assert.equal(h.state.calls.includes("Admin/GetTitleInternalData"), false);
  } finally {
    await db.close();
  }
});
