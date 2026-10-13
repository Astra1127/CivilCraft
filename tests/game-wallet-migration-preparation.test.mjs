import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, symlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  validateMigrationBinding,
  migrationPreparationGuard,
  collectMigrationReview,
  readMigrationDatabase,
  readMigrationBinding,
  parsePreparationArguments,
  runMigrationPreparation,
} from "../scripts/prepare-game-wallet-migration.mjs";
import { collectEntityReviewCandidate } from "../scripts/collect-game-wallet-entity-review.mjs";
import {
  entityAuthoritySnapshotHash,
  parseOriginalEntityReceipts,
  postgresReceiptFingerprint,
} from "../src/lib/game-wallet/receipt-authority.server.ts";
import {
  currencyDatabaseConfig,
  currencyDatabaseVerificationFingerprint,
} from "../src/lib/payments/currency-database.server.ts";
import { gameWalletVerificationFingerprint } from "../src/lib/game-wallet/config.server.ts";

// Every provider dependency below is a fixture. No default collector or database
// adapter is invoked with external configuration, and the fake host is invalid.
const ENV = {
  VITE_PLAYFAB_TITLE_ID: "17FA03",
  PUBLIC_APP_URL: "https://civil-craft.vercel.app",
  PLAYFAB_SECRET_KEY: "fixture-only-PRIVATE",
  CURRENCY_DATABASE_URL:
    "postgres://fixture:fixture@migration-fixture.invalid/game?sslmode=require",
  CURRENCY_DATABASE_ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  CURRENCY_DATABASE_VERIFIED: "true",
  CURRENCY_DATABASE_VERIFIED_TITLE_ID: "17FA03",
  CURRENCY_DATABASE_VERIFIED_CONFIG_SHA256: "",
  GAME_WALLET_ENABLED: "true",
  GAME_WALLET_VERIFIED: "true",
  GAME_WALLET_LEGACY_HANDLERS_QUIESCED: "true",
  GAME_WALLET_VERIFIED_TITLE_ID: "17FA03",
  GAME_WALLET_VERIFIED_CONFIG_SHA256: "",
  COIN_FULFILLMENT_MAINTENANCE: "true",
  COIN_BETA_CHECKOUT_ENABLED: "false",
};
const PREVIOUS = Object.fromEntries(Object.keys(ENV).map((key) => [key, process.env[key]]));
Object.assign(process.env, ENV);
process.env.CURRENCY_DATABASE_VERIFIED_CONFIG_SHA256 = currencyDatabaseVerificationFingerprint();
process.env.GAME_WALLET_VERIFIED_CONFIG_SHA256 = gameWalletVerificationFingerprint();
after(() => {
  for (const [key, value] of Object.entries(PREVIOUS)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const CONFIG = {
  storage: "postgres",
  namespace: "civilcraft_game_wallet_v3",
  databaseId: ENV.CURRENCY_DATABASE_ID,
  targetId: "a".repeat(64),
  protocolVersion: 3,
};
const BINDING = {
  format: "civilcraft.game-wallet-migration-target.v1",
  origin: "https://civil-craft.vercel.app",
  titleId: "17FA03",
  databaseId: CONFIG.databaseId,
  targetId: CONFIG.targetId,
  protocolVersion: 3,
};
const PLAYER = "ABCDEF";
const ENTITY = { Id: "FACE123", Type: "title_player_account" };
const FAILURE = /could not be collected/i;

function fixture() {
  const calls = [];
  const state = {
    source: { Entity: ENTITY, ProfileVersion: 0, Objects: {} },
    database: {
      balanceRows: [
        {
          ready: false,
          coins: null,
          version: 0,
          lifetime_gold_earned: null,
          lifetime_gold_spent: null,
        },
      ],
      postgresRows: [],
      manifestRows: [],
    },
  };
  return {
    calls,
    state,
    deps: {
      playerId: PLAYER.toLowerCase(),
      binding: { ...BINDING },
      guard: (binding) => {
        calls.push("guard");
        assert.deepEqual(binding, BINDING);
        return { ...CONFIG };
      },
      healthCheck: async () => {
        calls.push("health");
        return {
          v1: { databaseId: CONFIG.databaseId, titleId: "17FA03", schemaVersion: 1 },
          v3: { databaseId: CONFIG.databaseId, titleId: "17FA03", protocolVersion: 3 },
        };
      },
      entityRead: async (player) => {
        calls.push("Admin/GetUserAccountInfo");
        assert.equal(player, PLAYER);
        return ENTITY;
      },
      objectsRead: async (operation, body) => {
        calls.push(operation);
        assert.equal(operation, "Object/GetObjects");
        assert.deepEqual(body, { Entity: ENTITY, EscapeObject: false });
        return state.source;
      },
      databaseRead: async (input) => {
        calls.push("database-read-only");
        assert.deepEqual(input.config, CONFIG);
        assert.equal(input.titleId, BINDING.titleId);
        assert.equal(input.playerId, PLAYER);
        assert.deepEqual(input.entity, ENTITY);
        assert.match(input.ledgerHash, /^[a-f0-9]{64}$/);
        return state.database;
      },
      now: () => new Date("2026-10-12T00:00:00.000Z"),
    },
  };
}

function entityLedger(receipts = {}) {
  return {
    ObjectName: "civilcraft.coin-purchases.v1",
    DataObject: {
      schemaVersion: 1,
      titleId: "17FA03",
      playFabId: PLAYER,
      entityId: ENTITY.Id,
      receipts,
    },
  };
}

function entityReceipt(state = "granted") {
  return {
    fingerprint: "2".repeat(64),
    code: "CO",
    amount: 500,
    attemptId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    state,
  };
}

function postgresReceipt(state = "granted", orderId = "CC-FIXTURE-500") {
  return {
    order_id: orderId,
    player_id: PLAYER,
    entity_id: ENTITY.Id,
    entity_type: ENTITY.Type,
    currency: "CO",
    amount: "500",
    original_fingerprint: postgresReceiptFingerprint(CONFIG, PLAYER, ENTITY, orderId, 500),
    state,
  };
}

function assertUnapproved(candidate) {
  assert.equal(candidate.format, "civilcraft.game-wallet-migration-review.v1");
  assert.equal(candidate.approval, "UNAPPROVED");
  assert.equal(candidate.historicalCompleteness, "NOT_ESTABLISHED");
  assert.equal(candidate.deploymentBinding, "NOT_ATTESTED");
  assert.equal(candidate.gateState, "UNKNOWN");
  assert.equal(candidate.selectedSaveReview, "NOT_COLLECTED");
  assert.equal(candidate.noMigrationAuthorityGranted, true);
  assert.equal(candidate.titleId, BINDING.titleId);
  assert.equal(candidate.playerId, PLAYER);
  assert.equal(candidate.entityId, ENTITY.Id);
  assert.equal(candidate.entityType, ENTITY.Type);
  assert.equal(candidate.databaseId, BINDING.databaseId);
  assert.equal(candidate.targetId, BINDING.targetId);
}

test("target binding has an exact credential-free main-site schema", () => {
  assert.deepEqual(validateMigrationBinding(BINDING), BINDING);
  for (const invalid of [
    undefined,
    null,
    [],
    {},
    { ...BINDING, extra: "PRIVATE" },
    { ...BINDING, format: "other" },
    { ...BINDING, origin: "https://civil-craft-website.vercel.app" },
    { ...BINDING, origin: "http://civil-craft.vercel.app" },
    { ...BINDING, origin: "https://civil-craft.vercel.app/dashboard" },
    { ...BINDING, origin: "https://user:PRIVATE@civil-craft.vercel.app" },
    { ...BINDING, titleId: "G17FA03" },
    { ...BINDING, titleId: "A".repeat(17) },
    { ...BINDING, databaseId: "not-a-uuid" },
    { ...BINDING, targetId: "a".repeat(63) },
    { ...BINDING, targetId: "A".repeat(64) },
    { ...BINDING, protocolVersion: "3" },
    { ...BINDING, protocolVersion: 2 },
  ])
    assert.throws(() => validateMigrationBinding(invalid), FAILURE);
});

test("default guard is config-only and requires both verified namespace bindings", () => {
  const actual = { ...BINDING, targetId: currencyDatabaseConfig().targetId };
  const result = migrationPreparationGuard(actual);
  assert.equal(result.databaseId, actual.databaseId);
  assert.equal(result.targetId, actual.targetId);
  assert.equal(result.namespace, CONFIG.namespace);
  for (const key of [
    "CURRENCY_DATABASE_VERIFIED",
    "CURRENCY_DATABASE_VERIFIED_CONFIG_SHA256",
    "GAME_WALLET_VERIFIED",
    "GAME_WALLET_LEGACY_HANDLERS_QUIESCED",
    "GAME_WALLET_VERIFIED_CONFIG_SHA256",
  ]) {
    const before = process.env[key];
    process.env[key] = key.endsWith("SHA256") ? "0".repeat(64) : "false";
    try {
      assert.throws(() => migrationPreparationGuard(actual));
    } finally {
      process.env[key] = before;
    }
  }
  assert.throws(() => migrationPreparationGuard(BINDING), FAILURE);
  assert.throws(() => migrationPreparationGuard({ ...actual, titleId: "18FA03" }), FAILURE);
});

test("active wallet collection stays unapproved without exporting unrelated source objects", async () => {
  for (const exists of [false, true]) {
    const h = fixture();
    if (exists) h.state.source.Objects["civilcraft.coin-purchases.v1"] = entityLedger();
    h.state.source.Objects.private = { DataObject: { ticket: "PRIVATE unrelated blob" } };
    const candidate = await collectMigrationReview(h.deps);
    assertUnapproved(candidate);
    assert.equal(candidate.preparationStatus, "ACCOUNT_AND_SAVE_REVIEW_REQUIRED");
    assert.equal(candidate.manifestStatus, "MISSING");
    assert.deepEqual(candidate.receiptSet, { exists, receipts: [] });
    assert.deepEqual(candidate.postgresReceipts, []);
    assert.equal(candidate.pendingReceiptCount, 0);
    assert.deepEqual(candidate.wallet, {
      imported: false,
      coins: null,
      version: 0,
      lifetimeGoldEarned: null,
      lifetimeGoldSpent: null,
    });
    assert.equal(
      candidate.ledgerHash,
      entityAuthoritySnapshotHash(
        CONFIG,
        PLAYER,
        ENTITY,
        parseOriginalEntityReceipts(h.state.source, PLAYER, ENTITY),
      ),
    );
    assert.equal(JSON.stringify(candidate).includes("PRIVATE"), false);
    assert.deepEqual(h.calls, [
      "guard",
      "health",
      "Admin/GetUserAccountInfo",
      "Object/GetObjects",
      "database-read-only",
    ]);
    assert.equal(process.env.GAME_WALLET_ENABLED, "true");
    assert.equal(process.env.COIN_FULFILLMENT_MAINTENANCE, "true");
    assert.equal(process.env.COIN_BETA_CHECKOUT_ENABLED, "false");
  }
});

test("profile version cannot export an arbitrary upstream blob after receipt parsing", async () => {
  const h = fixture();
  let reads = 0;
  Object.defineProperty(h.state.source, "ProfileVersion", {
    get: () => (reads++ === 0 ? 0 : { private: "PRIVATE unexpected profile data" }),
  });
  const candidate = await collectMigrationReview(h.deps);
  assert.equal(candidate.sourceProfileVersion, null);
  assert.equal(JSON.stringify(candidate).includes("PRIVATE"), false);
});

test("existing collector still refuses active wallet rather than weakening its approval window", async () => {
  const calls = [];
  await assert.rejects(
    collectEntityReviewCandidate({
      playerId: PLAYER,
      healthCheck: async () => calls.push("health"),
      configRead: () => calls.push("config"),
      entityRead: async () => calls.push("entity"),
      objectsRead: async () => calls.push("objects"),
    }),
    /could not be collected/,
  );
  assert.deepEqual(calls, []);
});

test("explicit maintenance and paused beta checkout are checked before injected guard or reads", async () => {
  for (const [key, value] of [
    ["COIN_FULFILLMENT_MAINTENANCE", undefined],
    ["COIN_FULFILLMENT_MAINTENANCE", "false"],
    ["COIN_FULFILLMENT_MAINTENANCE", "yes"],
    ["COIN_BETA_CHECKOUT_ENABLED", undefined],
    ["COIN_BETA_CHECKOUT_ENABLED", "true"],
    ["COIN_BETA_CHECKOUT_ENABLED", "0"],
    ["GAME_WALLET_ENABLED", undefined],
    ["GAME_WALLET_ENABLED", "maybe"],
  ]) {
    const h = fixture();
    const before = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    try {
      await assert.rejects(collectMigrationReview(h.deps), FAILURE);
      assert.deepEqual(h.calls, [], `${key} must fail closed before privileged reads`);
    } finally {
      process.env[key] = before;
    }
  }
});

test("explicit disabled wallet remains reviewable in the same paused window", async () => {
  const before = process.env.GAME_WALLET_ENABLED;
  process.env.GAME_WALLET_ENABLED = "false";
  try {
    assertUnapproved(await collectMigrationReview(fixture().deps));
  } finally {
    process.env.GAME_WALLET_ENABLED = before;
  }
});

test("bad classic identities and target bindings stop before all dependencies", async () => {
  for (const invalid of [
    undefined,
    "",
    "testBetaOmaygosh",
    "ABCD/secret",
    "a".repeat(33),
    { Id: PLAYER },
  ]) {
    const h = fixture();
    await assert.rejects(collectMigrationReview({ ...h.deps, playerId: invalid }), FAILURE);
    assert.deepEqual(h.calls, []);
  }
  const h = fixture();
  await assert.rejects(
    collectMigrationReview({ ...h.deps, binding: { ...BINDING, approve: true } }),
    FAILURE,
  );
  assert.deepEqual(h.calls, []);
});

test("wrong guard or health binding prevents PlayFab source reads", async () => {
  for (const config of [
    { ...CONFIG, storage: "entity-objects" },
    { ...CONFIG, namespace: "civilcraft_currency" },
    { ...CONFIG, databaseId: "11111111-bbbb-cccc-dddd-eeeeeeeeeeee" },
    { ...CONFIG, targetId: "b".repeat(64) },
    { ...CONFIG, protocolVersion: 2 },
  ]) {
    const h = fixture();
    await assert.rejects(collectMigrationReview({ ...h.deps, guard: () => config }), FAILURE);
    assert.deepEqual(h.calls, []);
  }
  for (const override of [
    { v1: { databaseId: CONFIG.databaseId, titleId: "18FA03", schemaVersion: 1 } },
    { v1: { databaseId: "wrong", titleId: "17FA03", schemaVersion: 1 } },
    { v1: { databaseId: CONFIG.databaseId, titleId: "17FA03", schemaVersion: 2 } },
    { v3: { databaseId: CONFIG.databaseId, titleId: "18FA03", protocolVersion: 3 } },
    { v3: { databaseId: "wrong", titleId: "17FA03", protocolVersion: 3 } },
    { v3: { databaseId: CONFIG.databaseId, titleId: "17FA03", protocolVersion: 1 } },
  ]) {
    const h = fixture();
    const health = await h.deps.healthCheck();
    h.calls.length = 0;
    await assert.rejects(
      collectMigrationReview({ ...h.deps, healthCheck: async () => ({ ...health, ...override }) }),
      FAILURE,
    );
    assert.deepEqual(h.calls, ["guard"]);
  }
});

test("invalid resolved entity or malformed current Entity ledger fails closed", async () => {
  for (const entity of [
    null,
    {},
    { ...ENTITY, Type: "master_player_account" },
    { ...ENTITY, Id: "nothex" },
  ]) {
    const h = fixture();
    await assert.rejects(
      collectMigrationReview({ ...h.deps, entityRead: async () => entity }),
      FAILURE,
    );
    assert.deepEqual(h.calls, ["guard", "health"]);
  }
  for (const mutate of [
    (s) => {
      s.Entity = { ...ENTITY, Id: "BADF00D" };
    },
    (s) => {
      s.ProfileVersion = -1;
    },
    (s) => {
      s.ProfileVersion = { private: "PRIVATE" };
    },
    (s) => {
      s.Objects = [];
    },
    (s) => {
      s.Objects["civilcraft.coin-purchases.v1"] = { DataObject: { arbitrary: "PRIVATE" } };
    },
  ]) {
    const h = fixture();
    mutate(h.state.source);
    await assert.rejects(collectMigrationReview(h.deps), FAILURE);
    assert.equal(h.calls.includes("database-read-only"), false);
  }
});

test("both permanent receipt sources are captured and pending grants demand separate review", async () => {
  for (const source of ["entity", "postgres", "both"]) {
    const h = fixture();
    h.state.source.Objects["civilcraft.coin-purchases.v1"] = entityLedger({
      [`order-${"1".repeat(64)}`]: entityReceipt(source === "postgres" ? "granted" : "pending"),
    });
    h.state.database.postgresRows = [postgresReceipt(source === "entity" ? "granted" : "pending")];
    const candidate = await collectMigrationReview(h.deps);
    assertUnapproved(candidate);
    assert.equal(candidate.preparationStatus, "PENDING_RECEIPTS_REQUIRE_REVIEW");
    assert.equal(candidate.pendingReceiptCount, source === "both" ? 2 : 1);
    assert.equal(
      candidate.receiptSet.receipts[0].receiptKey,
      `entity-objects:${ENTITY.Id}:order-${"1".repeat(64)}`,
    );
    assert.equal(candidate.postgresReceipts[0].receiptKey, "postgres:CC-FIXTURE-500");
    assert.equal(candidate.postgresReceipts[0].amount, 500);
    assert.equal(candidate.postgresReceipts[0].provider, "postgres");
  }
});

test("malformed or cross-account postgres receipts are never copied or treated as granted", async () => {
  for (const override of [
    { order_id: "bad/order" },
    { player_id: "DEADBEEF" },
    { entity_id: "DEADBEEF" },
    { entity_type: "master_player_account" },
    { currency: "DI" },
    { amount: "0" },
    { amount: "2147483648" },
    { amount: "1.5" },
    { original_fingerprint: "0".repeat(64) },
    { state: "fulfilled" },
  ]) {
    const h = fixture();
    h.state.database.postgresRows = [{ ...postgresReceipt(), ...override }];
    await assert.rejects(collectMigrationReview(h.deps), FAILURE);
  }
});

test("postgres source diagnostics are allowlist-projected; duplicate permanent keys fail closed", async () => {
  const h = fixture();
  h.state.database.postgresRows = [
    { ...postgresReceipt(), connection: "PRIVATE receipt metadata" },
  ];
  const candidate = await collectMigrationReview(h.deps);
  assert.equal(JSON.stringify(candidate).includes("PRIVATE"), false);
  h.state.database.postgresRows = [postgresReceipt(), postgresReceipt()];
  await assert.rejects(collectMigrationReview(h.deps), FAILURE);
});

test("matched manifest does not approve history or import; hash and full snapshot must match", async () => {
  for (const kind of ["MATCHED", "MISMATCHED"]) {
    const h = fixture();
    const receiptSet = parseOriginalEntityReceipts(h.state.source, PLAYER, ENTITY);
    const ledgerHash = entityAuthoritySnapshotHash(CONFIG, PLAYER, ENTITY, receiptSet);
    h.state.database.manifestRows = [
      {
        ledger_hash: ledgerHash,
        receipt_set: kind === "MATCHED" ? receiptSet : { exists: true, receipts: [] },
      },
    ];
    const candidate = await collectMigrationReview(h.deps);
    assertUnapproved(candidate);
    assert.equal(candidate.manifestStatus, kind);
    assert.equal(candidate.preparationStatus, "ACCOUNT_AND_SAVE_REVIEW_REQUIRED");
  }
  const h = fixture();
  h.state.database.manifestRows = [
    { ledger_hash: "0".repeat(64), receipt_set: { exists: false, receipts: [] } },
  ];
  assert.equal((await collectMigrationReview(h.deps)).manifestStatus, "MISMATCHED");
});

test("already imported accounts are explicitly DO_NOT_REIMPORT, never replayed", async () => {
  const h = fixture();
  h.state.database.balanceRows = [
    {
      ready: true,
      coins: "23320",
      version: "16",
      lifetime_gold_earned: "23020",
      lifetime_gold_spent: "200",
    },
  ];
  const candidate = await collectMigrationReview(h.deps);
  assertUnapproved(candidate);
  assert.equal(candidate.preparationStatus, "DO_NOT_REIMPORT");
  assert.deepEqual(candidate.wallet, {
    imported: true,
    coins: 23320,
    version: 16,
    lifetimeGoldEarned: 23020,
    lifetimeGoldSpent: 200,
  });
});

test("missing, duplicate and invalid balance rows never substitute zero", async () => {
  for (const balanceRows of [
    [],
    [{ ready: false }, { ready: false }],
    [{ ready: "false", coins: null, version: 0 }],
    [{ ready: true, coins: null, version: 0, lifetime_gold_earned: 0, lifetime_gold_spent: 0 }],
    [{ ready: true, coins: "-1", version: 0, lifetime_gold_earned: 0, lifetime_gold_spent: 0 }],
    [
      {
        ready: true,
        coins: "2147483648",
        version: 0,
        lifetime_gold_earned: 0,
        lifetime_gold_spent: 0,
      },
    ],
    [
      {
        ready: true,
        coins: 0,
        version: "9007199254740992",
        lifetime_gold_earned: 0,
        lifetime_gold_spent: 0,
      },
    ],
    [
      {
        ready: true,
        coins: 0,
        version: 0,
        lifetime_gold_earned: "PRIVATE",
        lifetime_gold_spent: 0,
      },
    ],
    [{ ready: true, coins: 0, version: 0, lifetime_gold_earned: 0, lifetime_gold_spent: -1 }],
  ]) {
    const h = fixture();
    h.state.database.balanceRows = balanceRows;
    await assert.rejects(collectMigrationReview(h.deps), FAILURE);
  }
});

test("fixed DB adapter uses a repeatable-read read-only transaction and only three vetted reads", async () => {
  const h = fixture();
  const rows = [h.state.database.balanceRows, [], []];
  const calls = [];
  const connection = {
    begin: async (mode, fn) => {
      calls.push({ mode });
      return fn({
        unsafe: async (sql, parameters) => {
          calls.push({ sql, parameters });
          return rows.shift();
        },
      });
    },
    unsafe: () => {
      throw new Error("must not query outside transaction");
    },
  };
  const ledgerHash = "b".repeat(64);
  const result = await readMigrationDatabase({
    config: CONFIG,
    titleId: BINDING.titleId,
    playerId: PLAYER,
    entity: ENTITY,
    ledgerHash,
    connection: () => connection,
  });
  assert.deepEqual(result, h.state.database);
  assert.equal(calls[0].mode, "isolation level repeatable read, read only");
  assert.equal(calls.length, 4);
  for (let index = 1; index < calls.length; index++) {
    assert.match(
      calls[index].sql,
      /^SELECT \* FROM civilcraft_game_wallet_v3\.(wallet_balance|legacy_receipts|entity_manifest)\(/i,
    );
    assert.match(calls[index].sql, /\$1::uuid/);
    assert.equal(calls[index].sql.includes(PLAYER), false);
    assert.deepEqual(calls[index].parameters.slice(0, 5), [
      CONFIG.databaseId,
      BINDING.titleId,
      PLAYER,
      ENTITY.Id,
      ENTITY.Type,
    ]);
    assert.doesNotMatch(
      calls[index].sql,
      /gate_|import_wallet|credit|purchase|reward|INSERT|UPDATE|DELETE|ALTER|DROP/i,
    );
  }
  assert.match(calls[1].sql, /wallet_balance/);
  assert.match(calls[2].sql, /legacy_receipts/);
  assert.match(calls[3].sql, /entity_manifest/);
  assert.deepEqual(calls[3].parameters, [
    CONFIG.databaseId,
    BINDING.titleId,
    PLAYER,
    ENTITY.Id,
    ENTITY.Type,
    CONFIG.targetId,
    ledgerHash,
  ]);
});

test("DB adapter rejects malicious identity and private DB errors without exposing diagnostics", async () => {
  const calls = [];
  const connection = {
    begin: async (...args) => {
      calls.push(args);
      throw new Error("PRIVATE postgres://credentials");
    },
  };
  const input = {
    config: CONFIG,
    titleId: BINDING.titleId,
    playerId: PLAYER,
    entity: ENTITY,
    ledgerHash: "b".repeat(64),
    connection: () => connection,
  };
  await assert.rejects(
    readMigrationDatabase({ ...input, playerId: "ABC');DROP TABLE wallet;--" }),
    FAILURE,
  );
  assert.deepEqual(calls, []);
  await assert.rejects(
    readMigrationDatabase(input),
    (error) => FAILURE.test(error.message) && !/PRIVATE|postgres:\/\//.test(error.message),
  );
  assert.equal(calls.length, 1);
});

test("CLI requires an explicit player, reviewed binding and output with no mass/approval/credential options", () => {
  assert.deepEqual(
    parsePreparationArguments([
      "--player",
      PLAYER,
      "--binding",
      "binding.json",
      "--output",
      "candidate.json",
    ]),
    {
      playerId: PLAYER,
      bindingPath: "binding.json",
      outputPath: "candidate.json",
    },
  );
  for (const args of [
    [],
    ["--player", PLAYER, "--output", "candidate.json"],
    ["--all", "--binding", "binding.json", "--output", "candidate.json"],
    ["--player", PLAYER, "--binding", "binding.json", "--output", "candidate.json", "--approve"],
    [
      "--player",
      PLAYER,
      "--binding",
      "binding.json",
      "--output",
      "candidate.json",
      "--ticket",
      "PRIVATE",
    ],
    [
      "--player",
      PLAYER,
      "--binding",
      "binding.json",
      "--output",
      "candidate.json",
      "--credit",
      "500",
    ],
  ])
    assert.throws(() => parsePreparationArguments(args), FAILURE);
});

test("CLI reserves private output before any configuration/provider read and logs no account data", async () => {
  const calls = [];
  const lines = [];
  const bindingPath = path.join(tmpdir(), "PRIVATE.binding.json");
  const outputPath = path.join(tmpdir(), "PRIVATE.unapproved.json");
  const result = await runMigrationPreparation({
    playerId: PLAYER,
    bindingPath,
    outputPath,
    bindingRead: async (input) => {
      calls.push("binding");
      assert.equal(input, bindingPath);
      return BINDING;
    },
    reserve: async (input) => {
      calls.push("reserve");
      assert.equal(input, outputPath);
      return {
        write: async (candidate) => {
          calls.push("write");
          assert.equal(candidate.approval, "UNAPPROVED");
        },
        close: async () => calls.push("reservation-close"),
      };
    },
    collect: async (input) => {
      calls.push("collect");
      assert.equal(input.playerId, PLAYER);
      assert.deepEqual(input.binding, BINDING);
      return { approval: "UNAPPROVED", privateSource: "PRIVATE" };
    },
    close: async () => calls.push("database-close"),
    writeLine: (line) => lines.push(line),
    writeError: (line) => lines.push(line),
  });
  assert.equal(result, 0);
  assert.deepEqual(calls, [
    "reserve",
    "binding",
    "collect",
    "write",
    "reservation-close",
    "database-close",
  ]);
  assert.match(lines.join(" "), /UNAPPROVED/);
  assert.equal(lines.join(" ").includes("PRIVATE"), false);
  assert.equal(lines.join(" ").includes(PLAYER), false);
  assert.equal(lines.join(" ").includes(CONFIG.targetId), false);
});

test("reservation failure stops binding/provider reads; all later errors close and stay sanitized", async () => {
  for (const failure of ["reserve", "binding", "collect", "write"]) {
    const calls = [];
    const lines = [];
    const fail = (stage) => {
      calls.push(stage);
      if (stage === failure) throw new Error("PRIVATE credentials postgres://secret");
    };
    const result = await runMigrationPreparation({
      playerId: PLAYER,
      bindingPath: "PRIVATE.binding.json",
      outputPath: "PRIVATE.output.json",
      reserve: async () => {
        fail("reserve");
        return {
          write: async () => fail("write"),
          close: async () => {
            calls.push("reservation-close");
            throw new Error("PRIVATE close");
          },
        };
      },
      bindingRead: async () => {
        fail("binding");
        return BINDING;
      },
      collect: async () => {
        fail("collect");
        return { approval: "UNAPPROVED" };
      },
      close: async () => {
        calls.push("database-close");
        throw new Error("PRIVATE close");
      },
      writeLine: (line) => lines.push(line),
      writeError: (line) => lines.push(line),
    });
    assert.equal(result, 1);
    assert.equal(calls.at(-1), "database-close");
    if (failure === "reserve") assert.deepEqual(calls, ["reserve", "database-close"]);
    else assert.equal(calls.includes("reservation-close"), true);
    assert.equal(lines.join(" ").includes("PRIVATE"), false);
    assert.equal(lines.join(" ").includes("postgres://"), false);
  }
});

test("private upstream errors and unsupported source data are sanitized at the collector boundary", async () => {
  for (const dependency of [
    "guard",
    "healthCheck",
    "entityRead",
    "objectsRead",
    "databaseRead",
    "now",
  ]) {
    const h = fixture();
    const boom = () => {
      throw new Error("PRIVATE ticket database URL and billing metadata");
    };
    await assert.rejects(
      collectMigrationReview({ ...h.deps, [dependency]: boom }),
      (error) => FAILURE.test(error.message) && !error.message.includes("PRIVATE"),
    );
  }
});

test("help is offline, and preparation source cannot delegate to a mutating wallet operation", async () => {
  const help = spawnSync(
    process.execPath,
    ["scripts/prepare-game-wallet-migration.mjs", "--help"],
    {
      cwd: new URL("..", import.meta.url),
      env: {
        ...process.env,
        CURRENCY_DATABASE_URL: "INVALID DO NOT CONNECT",
        PLAYFAB_SECRET_KEY: "PRIVATE",
      },
      encoding: "utf8",
      windowsHide: true,
    },
  );
  assert.equal(help.status, 0);
  assert.match(help.stdout, /UNAPPROVED/);
  assert.match(help.stdout, /--binding/);
  assert.equal((help.stdout + help.stderr).includes("PRIVATE"), false);
  const source = await readFile(
    new URL("../scripts/prepare-game-wallet-migration.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /\bwalletCall\s*\(/);
  assert.doesNotMatch(source, /\b(?:writeFileSync|appendFileSync)\s*\(/);
});

async function privateBindingRepository(prefix) {
  const repository = await mkdtemp(path.join(tmpdir(), prefix));
  assert.equal(
    spawnSync("git", ["init", "-q"], { cwd: repository, stdio: "ignore", windowsHide: true })
      .status,
    0,
  );
  await writeFile(path.join(repository, ".gitignore"), ".private-wallet-review/\n");
  const privateDirectory = path.join(repository, ".private-wallet-review");
  await mkdir(privateDirectory);
  return { repository, privateDirectory };
}

test("binding reader accepts only existing ignored private JSON and normalizes identity casing", async () => {
  const { repository, privateDirectory } = await privateBindingRepository(
    "civilcraft-migration-binding-valid-",
  );
  const bindingPath = path.join(privateDirectory, "target-pin.json");
  const source = JSON.stringify({
    ...BINDING,
    titleId: BINDING.titleId.toLowerCase(),
    databaseId: BINDING.databaseId.toUpperCase(),
  });
  await writeFile(bindingPath, source);
  assert.deepEqual(await readMigrationBinding(bindingPath, repository), BINDING);
  assert.equal(
    await readFile(bindingPath, "utf8"),
    source,
    "read does not replace or normalize the file",
  );
});

test("binding reader rejects relative, outside, nested, nonexistent and non-JSON paths", async () => {
  const { repository, privateDirectory } = await privateBindingRepository(
    "civilcraft-migration-binding-paths-",
  );
  const outside = path.join(repository, "target-pin.json");
  const text = path.join(privateDirectory, "target-pin.txt");
  const nestedDirectory = path.join(privateDirectory, "nested");
  await mkdir(nestedDirectory);
  const nested = path.join(nestedDirectory, "target-pin.json");
  for (const file of [outside, text, nested]) await writeFile(file, JSON.stringify(BINDING));
  for (const bindingPath of [
    undefined,
    "target-pin.json",
    outside,
    text,
    nested,
    path.join(privateDirectory, "missing.json"),
  ])
    await assert.rejects(readMigrationBinding(bindingPath, repository), FAILURE);
});

test("binding reader rejects oversized files, malformed JSON and extra private binding fields", async () => {
  const { repository, privateDirectory } = await privateBindingRepository(
    "civilcraft-migration-binding-content-",
  );
  const fixtures = [
    ["oversized.json", `${JSON.stringify(BINDING)}${" ".repeat(4097)}`],
    ["malformed.json", "{ PRIVATE malformed binding"],
    ["extra.json", JSON.stringify({ ...BINDING, sessionTicket: "PRIVATE unexpected credential" })],
    [
      "wrong-origin.json",
      JSON.stringify({ ...BINDING, origin: "https://civil-craft-website.vercel.app" }),
    ],
  ];
  for (const [name, source] of fixtures) {
    const bindingPath = path.join(privateDirectory, name);
    await writeFile(bindingPath, source);
    await assert.rejects(
      readMigrationBinding(bindingPath, repository),
      (error) => FAILURE.test(error.message) && !error.message.includes("PRIVATE"),
    );
    assert.equal(await readFile(bindingPath, "utf8"), source, "invalid bindings remain untouched");
  }
});

test("binding reader rejects a private JSON file if Git does not ignore it", async () => {
  const { repository, privateDirectory } = await privateBindingRepository(
    "civilcraft-migration-binding-notignored-",
  );
  const bindingPath = path.join(privateDirectory, "target-pin.json");
  await writeFile(bindingPath, JSON.stringify(BINDING));
  await writeFile(
    path.join(repository, ".gitignore"),
    "# PRIVATE bindings deliberately not ignored\n",
  );
  await assert.rejects(readMigrationBinding(bindingPath, repository), FAILURE);
});

test("binding reader rejects symlink-file aliases even when the symlink path is private and ignored", async (t) => {
  const { repository, privateDirectory } = await privateBindingRepository(
    "civilcraft-migration-binding-file-alias-",
  );
  const target = path.join(repository, "source-pin.json");
  const bindingPath = path.join(privateDirectory, "target-pin.json");
  await writeFile(target, JSON.stringify(BINDING));
  try {
    await symlink(target, bindingPath, "file");
  } catch (error) {
    if (process.platform === "win32" && error.code === "EPERM") {
      t.skip(
        "Windows file symlinks require Developer Mode or elevation; junction aliases are tested independently.",
      );
      return;
    }
    throw error;
  }
  await assert.rejects(readMigrationBinding(bindingPath, repository), FAILURE);
  assert.equal(await readFile(target, "utf8"), JSON.stringify(BINDING));
});

test("binding reader rejects a private-folder junction/symlink alias into source", async () => {
  const repository = await mkdtemp(
    path.join(tmpdir(), "civilcraft-migration-binding-folder-alias-"),
  );
  assert.equal(
    spawnSync("git", ["init", "-q"], { cwd: repository, stdio: "ignore", windowsHide: true })
      .status,
    0,
  );
  await writeFile(path.join(repository, ".gitignore"), ".private-wallet-review/\n");
  const sourceDirectory = path.join(repository, "src");
  await mkdir(sourceDirectory);
  const source = path.join(sourceDirectory, "target-pin.json");
  await writeFile(source, JSON.stringify(BINDING));
  await symlink(
    sourceDirectory,
    path.join(repository, ".private-wallet-review"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await assert.rejects(
    readMigrationBinding(
      path.join(repository, ".private-wallet-review", "target-pin.json"),
      repository,
    ),
    FAILURE,
  );
  assert.equal(await readFile(source, "utf8"), JSON.stringify(BINDING));
});
