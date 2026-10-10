import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { before, after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

let db, id;
const v1 = readFileSync(new URL("../database/currency-schema.sql", import.meta.url), "utf8");
const v3 = readFileSync(new URL("../database/game-wallet-v3.sql", import.meta.url), "utf8");
const hash = (x) => crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex");
before(async () => {
  db = await PGlite.create();
  await db.exec(v1);
  await db.exec(v3);
  id = (await db.query("SELECT database_id FROM civilcraft_currency.installation")).rows[0]
    .database_id;
  await db.exec(
    "CREATE ROLE game_fixture LOGIN; GRANT civilcraft_currency_app,civilcraft_game_wallet_app TO game_fixture; SET SESSION AUTHORIZATION game_fixture",
  );
});
after(async () => {
  await db?.close();
});
const identity = (player = "ABC123", entity = "FACE123") => [
  id,
  "17FA03",
  player,
  entity,
  "title_player_account",
];
const call = async (name, args) =>
  (
    await db.query(
      `SELECT * FROM civilcraft_game_wallet_v3.${name}(${args.map((_, i) => `$${i + 1}`).join(",")})`,
      args,
    )
  ).rows;
const one = async (name, args) => (await call(name, args))[0];
async function admin(sql) {
  await db.exec("SET SESSION AUTHORIZATION postgres");
  try {
    return await db.exec(sql);
  } finally {
    await db.exec("SET SESSION AUTHORIZATION game_fixture");
  }
}
async function opening(player, amount = 1000, extra = {}) {
  const who = identity(player);
  const owner = crypto.randomUUID();
  assert.equal((await one("gate_acquire", [...who, owner, "import"])).acquired, true);
  const r = await one("import_wallet", [
    ...who,
    owner,
    amount,
    extra.classic ?? 0,
    hash(player),
    JSON.stringify(extra.covered ?? []),
    JSON.stringify(extra.rewards ?? []),
    JSON.stringify(extra.entitlements ?? []),
  ]);
  await one("gate_release", [...who, owner]);
  return r;
}
test("additive capability passes restricted-role health and leaves v1 identity/health unchanged", async () => {
  const health = await one("health", [id, "17FA03", 3]);
  assert.equal(health.healthy, true);
  assert.equal(health.database_id, id);
  const old = (await db.query("SELECT * FROM civilcraft_currency.health($1,'17FA03',1)", [id]))
    .rows[0];
  assert.equal(old.healthy, true);
  await assert.rejects(one("health", [crypto.randomUUID(), "17FA03", 3]), /installation mismatch/);
  await assert.rejects(one("health", [id, "17FA03", 1]), /installation mismatch/);
  await assert.rejects(
    db.query("SELECT * FROM civilcraft_game_wallet_v3.accounts"),
    /permission denied/,
  );
  await assert.rejects(
    db.query(
      "INSERT INTO civilcraft_game_wallet_v3.accounts VALUES ('17FA03','ABC','DEF','title_player_account',100,true,0,NULL,NULL)",
    ),
    /permission denied/,
  );
});
test("zero opening still creates a permanent import marker and ignores second save amounts", async () => {
  assert.equal((await one("wallet_balance", identity("A001"))).ready, false);
  const zero = await opening("A001", 0);
  assert.equal(zero.ready, true);
  assert.equal(Number(zero.coins), 0);
  const retry = await one("import_wallet", [
    ...identity("A001"),
    crypto.randomUUID(),
    999,
    999,
    hash("different"),
    "[]",
    "[]",
    "[]",
  ]);
  assert.equal(retry.already_imported, true);
  assert.equal(Number(retry.coins), 0);
});
test("import adds classic balance and earned gold once and snapshots entitlements/reward tombstones", async () => {
  const e = { kind: "cosmetic", targetKey: "hat", payload: { itemId: "hat", cosmeticId: "Hat" } };
  const r = await opening("A002", 200, {
    classic: 500,
    rewards: [{ key: "contract:ShopKeeper", fingerprint: hash("old") }],
    entitlements: [e],
  });
  assert.equal(Number(r.coins), 700);
  const skipped = await one("reward", [
    ...identity("A002"),
    "contract:ShopKeeper",
    10000,
    hash("new"),
    "{}",
  ]);
  assert.equal(skipped.already_granted, true);
  assert.equal(Number(skipped.coins), 700);
  assert.equal((await call("entitlements", identity("A002")))[0].payload.itemId, "hat");
});
test("gate cannot be reacquired, stolen, expired or released by another worker", async () => {
  const owner = crypto.randomUUID(),
    who = identity("A003");
  assert.equal((await one("gate_acquire", [...who, owner, "legacy"])).acquired, true);
  assert.equal((await one("gate_acquire", [...who, owner, "legacy"])).acquired, false);
  assert.equal(
    (await one("gate_acquire", [...who, crypto.randomUUID(), "import"])).acquired,
    false,
  );
  await assert.rejects(one("gate_release", [...who, crypto.randomUUID()]), /ownership mismatch/);
  await assert.rejects(
    one("import_wallet", [...who, owner, 10, 0, hash("a"), "[]", "[]", "[]"]),
    /Import gate required/,
  );
  await one("gate_release", [...who, owner]);
});
test("v3 payment atomically credits once; identity/amount changes cannot reuse receipt", async () => {
  await opening("A004", 100);
  const args = [...identity("A004"), "order-v3", 500, hash("order-v3"), "payment"];
  assert.equal((await one("credit", args)).already_granted, false);
  assert.equal((await one("credit", args)).already_granted, true);
  assert.equal(Number((await one("wallet_balance", identity("A004"))).coins), 600);
  await assert.rejects(
    one("credit", [...identity("A004"), "order-v3", 501, hash("order-v3"), "payment"]),
    /Receipt identity mismatch/,
  );
  await opening("A005", 0);
  await assert.rejects(
    one("credit", [...identity("A005"), "order-v3", 500, hash("order-v3"), "payment"]),
    /Receipt identity mismatch/,
  );
  assert.equal(
    (await one("receipt", [...identity("A004"), "order-v3", 500, hash("order-v3")])).granted,
    true,
  );
});
test("included legacy receipt never recredits; confirmed late legacy receipt overlays once", async () => {
  await opening("A006", 10, {
    classic: 500,
    covered: [{ orderId: "included", fingerprint: hash("included") }],
  });
  const included = await one("credit", [
    ...identity("A006"),
    "included",
    500,
    hash("included"),
    "legacy",
  ]);
  assert.deepEqual(included, { already_granted: true, covered: true });
  const args = [...identity("A006"), "late", 100, hash("late"), "legacy"];
  assert.equal((await one("credit", args)).already_granted, false);
  assert.equal((await one("credit", args)).already_granted, true);
  assert.equal(Number((await one("wallet_balance", identity("A006"))).coins), 610);
  await assert.rejects(
    one("credit", [...identity("A006"), "included", 500, hash("changed"), "legacy"]),
    /identity mismatch/,
  );
});
test("unimported legacy credit remains only classic while new v3 checkout credit is blocked", async () => {
  const who = identity("A007");
  assert.deepEqual(await one("credit", [...who, "before-opening", 50, hash("before"), "legacy"]), {
    already_granted: false,
    covered: false,
  });
  assert.equal((await one("wallet_balance", who)).ready, false);
  await assert.rejects(
    one("credit", [...who, "new-payment", 50, hash("before"), "payment"]),
    /import required/,
  );
});
test("capacity errors roll back both payment receipt and balance", async () => {
  await opening("A008", 2147483647);
  await assert.rejects(
    one("credit", [...identity("A008"), "overflow", 1, hash("overflow"), "payment"]),
    /capacity exceeded/,
  );
  assert.equal(
    (await one("receipt", [...identity("A008"), "overflow", 1, hash("overflow")])).granted,
    false,
  );
  assert.equal(Number((await one("wallet_balance", identity("A008"))).coins), 2147483647);
});
test("reward first settlement is permanent and another valid completion cannot mint more", async () => {
  await opening("A009", 0);
  const args = [...identity("A009"), "achievement:ACH_001", 150, hash("reward"), "{}"];
  assert.equal((await one("reward", args)).already_granted, false);
  assert.equal((await one("reward", args)).already_granted, true);
  assert.equal(
    (await one("reward", [...identity("A009"), "achievement:ACH_001", 151, hash("other"), "{}"]))
      .already_granted,
    true,
  );
  assert.equal(Number((await one("wallet_balance", identity("A009"))).coins), 150);
  const rows = await admin(
    "SELECT amount,fingerprint FROM civilcraft_game_wallet_v3.ledger WHERE entry_id='reward:A009:achievement:ACH_001'",
  );
  assert.equal(Number(rows[0].rows[0].amount), 150);
  assert.equal(rows[0].rows[0].fingerprint, hash("reward"));
});
test("purchase commits debit+entitlement+status together and rejects conflicting replay", async () => {
  await opening("A010", 500);
  const op = crypto.randomUUID();
  const args = [
    ...identity("A010"),
    op,
    hash(op),
    "cosmetic",
    "hat",
    100,
    JSON.stringify({ itemId: "hat", cosmeticId: "Hat" }),
  ];
  const first = (await one("purchase", args)).result;
  assert.equal(first.status, "fulfilled");
  assert.equal(Number(first.coins), 400);
  assert.deepEqual((await one("purchase", args)).result, first);
  assert.deepEqual((await one("purchase_status", [...identity("A010"), op])).result, first);
  assert.equal((await call("purchase_status", [...identity("A005"), op])).length, 0);
  await assert.rejects(
    one("purchase", [...identity("A010"), op, hash("conflict"), "cosmetic", "hat", 100, "{}"]),
    /identity mismatch/,
  );
  const other = (
    await one("purchase", [
      ...identity("A010"),
      crypto.randomUUID(),
      hash("other-op"),
      "cosmetic",
      "hat",
      100,
      "{}",
    ])
  ).result;
  assert.equal(other.status, "already-owned");
  assert.equal(Number(other.coins), 400);
});
test("simultaneous spends cannot overspend or double-buy nonrepeat items", async () => {
  await opening("A011", 100);
  const results = await Promise.all(
    ["one", "two"].map(
      async (key) =>
        (
          await one("purchase", [
            ...identity("A011"),
            crypto.randomUUID(),
            hash(key),
            "cosmetic",
            key,
            100,
            "{}",
          ])
        ).result,
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  assert.equal(Number((await one("wallet_balance", identity("A011"))).coins), 0);
});
test("insufficient funds is a terminal operation, not a delayed surprise charge after top-up", async () => {
  await opening("A012", 0);
  const op = crypto.randomUUID();
  const args = [...identity("A012"), op, hash(op), "material", "ShopKeeper_Beam", 500, "{}"];
  assert.equal((await one("purchase", args)).result.status, "rejected");
  await one("credit", [...identity("A012"), "top-up", 500, hash("top-up"), "payment"]);
  assert.equal((await one("purchase", args)).result.status, "rejected");
  assert.equal(Number((await one("wallet_balance", identity("A012"))).coins), 500);
});
test("account entity and ledger history remain permanent even to migration administrator", async () => {
  await assert.rejects(one("wallet_balance", identity("A004", "OTHER")), /identity mismatch/);
  await assert.rejects(one("wallet_balance", identity("A004", "AAAA")), /entity mismatch/);
  await assert.rejects(
    admin("DELETE FROM civilcraft_game_wallet_v3.ledger WHERE player_id='A004'"),
    /permanent/,
  );
  await assert.rejects(
    admin("UPDATE civilcraft_game_wallet_v3.accounts SET imported=false WHERE player_id='A004'"),
    /permanent/,
  );
  await assert.rejects(
    admin("UPDATE civilcraft_game_wallet_v3.installation SET protocol_version=3"),
    /permanent/,
  );
});
test("opaque link stores only hash, binds account/currency and has a one-hour expiry", async () => {
  const before = Date.now();
  const token = hash("opaque");
  const issued = await one("link_issue", [id, "17FA03", "A004", token, "diamonds"]);
  const row = await one("link_read", [id, "17FA03", token]);
  assert.equal(row.player_id, "A004");
  assert.equal(row.currency, "diamonds");
  const expiry = Date.parse(issued.expires_at);
  assert.ok(expiry >= before + 3599000 && expiry < before + 3602000);
  assert.equal((await call("link_read", [id, "17FA03", hash("missing")])).length, 0);
});
test("durable invalid-catalog tombstone prevents a delayed valid purchase with the same operation", async () => {
  await opening("A013", 100);
  const op = crypto.randomUUID();
  const proof = (await one("reject_purchase", [...identity("A013"), op, hash("bad-catalog")]))
    .result;
  assert.equal(proof.reason, "invalid-catalog");
  await assert.rejects(
    one("purchase", [...identity("A013"), op, hash("good-catalog"), "cosmetic", "hat", 100, "{}"]),
    /identity mismatch/,
  );
  assert.equal(Number((await one("wallet_balance", identity("A013"))).coins), 100);
  assert.equal(
    (await one("purchase_status", [...identity("A013"), op])).result.reason,
    "invalid-catalog",
  );
});
test("gameplay counters preserve opening baselines but exclude purchased payment credit", async () => {
  const who = identity("A014"),
    owner = crypto.randomUUID();
  await one("gate_acquire", [...who, owner, "import"]);
  await one("import_wallet", [
    ...who,
    owner,
    200,
    500,
    hash("baseline"),
    "[]",
    "[]",
    "[]",
    900,
    700,
  ]);
  await one("gate_release", [...who, owner]);
  await one("credit", [...who, "purchased-counter", 500, hash("purchased"), "payment"]);
  let row = await one("wallet_balance", who);
  assert.equal(Number(row.lifetime_gold_earned), 900);
  assert.equal(Number(row.lifetime_gold_spent), 700);
  await one("reward", [...who, "achievement:ACH_001", 150, hash("earned"), "{}"]);
  const op = crypto.randomUUID();
  await one("purchase", [...who, op, hash(op), "cosmetic", "hat", 100, "{}"]);
  row = await one("wallet_balance", who);
  assert.equal(Number(row.lifetime_gold_earned), 1050);
  assert.equal(Number(row.lifetime_gold_spent), 800);
});
test("health fails when restricted runtime gains forbidden CRUD, and v1 migration is never rerun", async () => {
  await admin("GRANT SELECT ON civilcraft_game_wallet_v3.accounts TO game_fixture");
  assert.equal((await one("health", [id, "17FA03", 3])).healthy, false);
  await admin("REVOKE SELECT ON civilcraft_game_wallet_v3.accounts FROM game_fixture");
  assert.equal((await one("health", [id, "17FA03", 3])).healthy, true);
  await db.exec("SET SESSION AUTHORIZATION postgres");
  await assert.rejects(db.exec(v3), /already exists/);
  await db.exec("ROLLBACK; SET SESSION AUTHORIZATION game_fixture");
});
