import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
let db, id;
const cutoff = "2026-01-01T00:00:00Z",
  created = "2026-01-02T00:00:00Z";
before(async () => {
  db = await PGlite.create();
  for (const file of [
    "currency-schema.sql",
    "game-wallet-v3.sql",
    "game-wallet-new-account-cohort.sql",
  ])
    await db.exec(readFileSync(new URL(`../database/${file}`, import.meta.url), "utf8"));
  id = (await db.query("SELECT database_id FROM civilcraft_currency.installation")).rows[0]
    .database_id;
  await db.exec(
    "CREATE ROLE cohort_fixture LOGIN; GRANT civilcraft_game_wallet_app TO cohort_fixture; SET SESSION AUTHORIZATION cohort_fixture",
  );
});
after(async () => await db?.close());
const who = (p) => [id, "17FA03", p, `FACE${p}`, "title_player_account"];
const call = async (name, args) =>
  (
    await db.query(
      `SELECT * FROM civilcraft_game_wallet_v3.${name}(${args.map((_, i) => `$${i + 1}`).join(",")})`,
      args,
    )
  ).rows;
const enroll = (p, date = created, boundary = cutoff) =>
  call("new_account_open", [...who(p), date, boundary, "a".repeat(64)]);
test("no owner policy means no enrollment; runtime cannot configure policy", async () => {
  await assert.rejects(enroll("A1"), /cohort unavailable/);
  await assert.rejects(
    db.query("INSERT INTO civilcraft_game_wallet_v3.new_account_policy(cutoff_at) VALUES($1)", [
      cutoff,
    ]),
    /permission denied/,
  );
  await db.exec("SET SESSION AUTHORIZATION postgres");
  await db.query("INSERT INTO civilcraft_game_wallet_v3.new_account_policy(cutoff_at) VALUES($1)", [
    cutoff,
  ]);
  await assert.rejects(
    db.query("UPDATE civilcraft_game_wallet_v3.new_account_policy SET cutoff_at=now()"),
    /permanent/i,
  );
  await db.exec("SET SESSION AUTHORIZATION cohort_fixture");
});
test("only after-cutoff accounts get one permanent zero opening", async () => {
  await assert.rejects(enroll("A2", "2025-12-31T23:59:59Z"), /cohort unavailable/);
  await assert.rejects(enroll("A2", created, "2025-01-01T00:00:00Z"), /cohort unavailable/);
  await assert.rejects(enroll("A2", "2999-01-01T00:00:00Z"), /cohort unavailable/);
  const [first, second] = await Promise.all([enroll("A2"), enroll("A2")]);
  assert.equal(Number(first[0].coins), 0);
  assert.equal(Number(second[0].version), 1);
  const balance = await call("wallet_balance", who("A2"));
  assert.equal(balance[0].ready, true);
  await call("credit", [...who("A2"), "test-payment", 500, "b".repeat(64), "payment", null]);
  assert.equal(Number((await enroll("A2"))[0].coins), 500);
  await db.exec("SET SESSION AUTHORIZATION postgres");
  assert.equal(
    Number(
      (
        await db.query(
          "SELECT count(*) AS n FROM civilcraft_game_wallet_v3.ledger WHERE player_id='A2' AND kind='opening'",
        )
      ).rows[0].n,
    ),
    1,
  );
  await db.exec("SET SESSION AUTHORIZATION cohort_fixture");
});
test("holds and crossed entities cannot be overwritten", async () => {
  await call("gate_acquire", [...who("A3"), "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "import"]);
  await assert.rejects(enroll("A3"), /remains held/);
  await assert.rejects(
    call("new_account_open", [
      id,
      "17FA03",
      "A2",
      "BAD",
      "title_player_account",
      created,
      cutoff,
      "a".repeat(64),
    ]),
    /entity mismatch/,
  );
  assert.equal((await call("health", [id, "17FA03", 3]))[0].healthy, true);
});
