import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

// Synthetic local SQL fixtures only: no credentials, live accounts or provider calls.
// These tests exercise the actual import function, not its HTTP/service guards.
const MAX_COINS = 2_147_483_647;
const TITLE = "17FA03";
const ENTITY = "FACE123";
const RUNTIME = "game_import_boundaries_fixture";
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const v1 = readFileSync(new URL("../database/currency-schema.sql", import.meta.url), "utf8");
const v3 = readFileSync(new URL("../database/game-wallet-v3.sql", import.meta.url), "utf8");
let db, databaseId;

before(async () => {
  db = await PGlite.create();
  await db.exec(v1);
  await db.exec(v3);
  databaseId = (await db.query("SELECT database_id FROM civilcraft_currency.installation")).rows[0]
    .database_id;
  await db.exec(
    `CREATE ROLE ${RUNTIME} LOGIN; GRANT civilcraft_currency_app,civilcraft_game_wallet_app TO ${RUNTIME}; SET SESSION AUTHORIZATION ${RUNTIME}`,
  );
});

after(async () => {
  await db?.close();
});

const identity = (player) => [databaseId, TITLE, player, ENTITY, "title_player_account"];
async function one(name, parameters) {
  return (
    await db.query(
      `SELECT * FROM civilcraft_game_wallet_v3.${name}(${parameters.map((_, index) => `$${index + 1}`).join(",")})`,
      parameters,
    )
  ).rows[0];
}

async function acquire(player) {
  const owner = crypto.randomUUID();
  assert.equal((await one("gate_acquire", [...identity(player), owner, "import"])).acquired, true);
  return owner;
}

function snapshot(player, overrides = {}) {
  return {
    gold: 5,
    classic: 5,
    earned: 3,
    spent: 2,
    saveHash: hash({ player, save: "selected-source" }),
    covered: [
      {
        orderId: `postgres:fixture-${player}`,
        fingerprint: hash({ player, coverage: true }),
        provider: "postgres",
        entityId: ENTITY,
        amount: 1,
        originalFingerprint: hash({ player, receipt: true }),
      },
    ],
    rewards: [{ key: "contract:fixture-completed", fingerprint: hash({ player, reward: true }) }],
    entitlements: [
      {
        kind: "cosmetic",
        targetKey: "fixture-hat",
        payload: { itemId: "fixture-hat", cosmeticId: "FixtureHat" },
      },
      {
        kind: "material",
        targetKey: "FixtureContract_FixtureBeam",
        payload: {
          contractId: "FixtureContract",
          materialId: "FixtureBeam",
          saveKey: "FixtureContract_FixtureBeam",
        },
      },
    ],
    ...overrides,
  };
}

function importSnapshot(player, owner, source) {
  return one("import_wallet", [
    ...identity(player),
    owner,
    source.gold,
    source.classic,
    source.saveHash,
    JSON.stringify(source.covered),
    JSON.stringify(source.rewards),
    JSON.stringify(source.entitlements),
    source.earned,
    source.spent,
  ]);
}

// Administrator READS inspect local rollback evidence; the restricted runtime gets no table access.
async function state(player) {
  await db.exec("SET SESSION AUTHORIZATION postgres");
  try {
    return (
      await db.query(
        `SELECT a.coins,a.imported,a.version,a.lifetime_gold_earned,a.lifetime_gold_spent,a.gate_owner,a.gate_reason,
          (SELECT count(*) FROM civilcraft_game_wallet_v3.ledger l WHERE l.title_id=a.title_id AND l.player_id=a.player_id) AS ledger_count,
          (SELECT count(*) FROM civilcraft_game_wallet_v3.ledger l WHERE l.title_id=a.title_id AND l.player_id=a.player_id AND l.kind='opening') AS opening_count,
          (SELECT count(*) FROM civilcraft_game_wallet_v3.ledger l WHERE l.title_id=a.title_id AND l.player_id=a.player_id AND l.kind='tombstone') AS tombstone_count,
          (SELECT count(*) FROM civilcraft_game_wallet_v3.legacy_coverage c WHERE c.title_id=a.title_id AND c.player_id=a.player_id) AS coverage_count,
          (SELECT count(*) FROM civilcraft_game_wallet_v3.entitlements e WHERE e.title_id=a.title_id AND e.player_id=a.player_id) AS entitlement_count,
          (SELECT count(*) FROM civilcraft_game_wallet_v3.operations o WHERE o.title_id=a.title_id AND o.player_id=a.player_id) AS operation_count,
          (SELECT l.payload FROM civilcraft_game_wallet_v3.ledger l WHERE l.title_id=a.title_id AND l.player_id=a.player_id AND l.kind='opening') AS opening_payload
        FROM civilcraft_game_wallet_v3.accounts a WHERE a.title_id=$1 AND a.player_id=$2`,
        [TITLE, player],
      )
    ).rows[0];
  } finally {
    await db.exec(`SET SESSION AUTHORIZATION ${RUNTIME}`);
  }
}

const accepted = [
  ["legacy gold alone", "B001", { gold: MAX_COINS, classic: 0 }],
  ["classic CO alone", "B002", { gold: 0, classic: MAX_COINS }],
  [
    "combined balances and historical counters",
    "B003",
    { gold: MAX_COINS - 500, classic: 500, earned: MAX_COINS, spent: MAX_COINS },
  ],
];

for (const [label, player, values] of accepted) {
  test(`first import accepts the exact Int32 maximum for ${label}`, async () => {
    const owner = await acquire(player);
    const source = snapshot(player, values);
    const result = await importSnapshot(player, owner, source);
    assert.equal(result.ready, true);
    assert.equal(result.already_imported, false);
    assert.equal(Number(result.coins), MAX_COINS);
    assert.equal(Number(result.version), 1);
    assert.equal((await one("gate_release", [...identity(player), owner])).released, true);
    const saved = await state(player);
    assert.equal(saved.imported, true);
    assert.equal(Number(saved.coins), MAX_COINS);
    assert.equal(Number(saved.lifetime_gold_earned), source.earned);
    assert.equal(Number(saved.lifetime_gold_spent), source.spent);
    assert.equal(Number(saved.opening_count), 1);
    assert.equal(Number(saved.tombstone_count), 1);
    assert.equal(Number(saved.coverage_count), 1);
    assert.equal(Number(saved.entitlement_count), 2);
    assert.deepEqual(saved.opening_payload, {
      gold: source.gold,
      classic: source.classic,
      saveHash: source.saveHash,
    });
  });
}

const rejected = [
  ["MAX gold plus one classic Coin", "B101", { gold: MAX_COINS, classic: 1 }],
  ["one gold plus MAX classic Coins", "B102", { gold: 1, classic: MAX_COINS }],
  [
    "two individually valid half-balances exceeding MAX together",
    "B103",
    { gold: 1_073_741_824, classic: 1_073_741_824 },
  ],
  ["negative gold", "B104", { gold: -1 }],
  ["negative classic Coins", "B105", { classic: -1 }],
  ["gold above MAX", "B106", { gold: MAX_COINS + 1, classic: 0 }],
  ["classic Coins above MAX", "B107", { gold: 0, classic: MAX_COINS + 1 }],
  ["negative earned counter", "B108", { earned: -1 }],
  ["negative spent counter", "B109", { spent: -1 }],
  ["earned counter above MAX", "B10A", { earned: MAX_COINS + 1 }],
  ["spent counter above MAX", "B10B", { spent: MAX_COINS + 1 }],
];

for (const [label, player, values] of rejected) {
  test(`first import rejects ${label} without committing any source data`, async () => {
    const owner = await acquire(player);
    const beforeImport = await state(player);
    try {
      await assert.rejects(
        importSnapshot(player, owner, snapshot(player, values)),
        /Invalid import/,
      );
      assert.deepEqual(await state(player), beforeImport);
      const wallet = await one("wallet_balance", identity(player));
      assert.equal(wallet.ready, false);
      assert.equal(wallet.coins, null);
      assert.equal(Number(wallet.version), 0);
      for (const field of [
        "ledger_count",
        "opening_count",
        "tombstone_count",
        "coverage_count",
        "entitlement_count",
        "operation_count",
      ])
        assert.equal(Number(beforeImport[field]), 0, field);
      // A rejected request is not an import marker: a corrected same-source retry may succeed.
      const corrected = await importSnapshot(player, owner, snapshot(player));
      assert.equal(corrected.ready, true);
      assert.equal(corrected.already_imported, false);
      assert.equal(Number(corrected.coins), 10);
      assert.equal(Number((await state(player)).opening_count), 1);
    } finally {
      await one("gate_release", [...identity(player), owner]);
    }
  });
}

test("late ownership constraint failure rolls back opening, coverage and historical tombstones", async () => {
  const player = "B201";
  const owner = await acquire(player);
  const beforeImport = await state(player);
  try {
    await assert.rejects(
      importSnapshot(
        player,
        owner,
        snapshot(player, {
          entitlements: [{ kind: "invalid-kind", targetKey: "invalid", payload: {} }],
        }),
      ),
      /entitlements_kind_check/,
    );
    assert.deepEqual(await state(player), beforeImport);
    assert.equal((await one("wallet_balance", identity(player))).ready, false);
  } finally {
    await one("gate_release", [...identity(player), owner]);
  }
});

test("zero opening permanently binds the first save and another save cannot add money or ownership", async () => {
  const player = "B202";
  const owner = await acquire(player);
  const original = snapshot(player, {
    gold: 0,
    classic: 0,
    earned: 0,
    spent: 0,
    covered: [],
    rewards: [],
    entitlements: [],
  });
  const result = await importSnapshot(player, owner, original);
  assert.equal(result.ready, true);
  assert.equal(result.already_imported, false);
  assert.equal(Number(result.coins), 0);
  await one("gate_release", [...identity(player), owner]);
  const originalState = await state(player);
  assert.equal(Number(originalState.opening_count), 1);
  assert.equal(Number(originalState.ledger_count), 1);
  assert.equal(originalState.opening_payload.saveHash, original.saveHash);
  const changed = snapshot(player, {
    gold: MAX_COINS,
    classic: 0,
    earned: MAX_COINS,
    spent: MAX_COINS,
    saveHash: hash("another-device-or-Start-Fresh"),
  });
  const retry = await importSnapshot(player, crypto.randomUUID(), changed);
  assert.equal(retry.ready, true);
  assert.equal(retry.already_imported, true);
  assert.equal(Number(retry.coins), 0);
  assert.equal(Number(retry.version), 1);
  assert.deepEqual(await state(player), originalState);
});
