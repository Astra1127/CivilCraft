import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const v1 = readFileSync(new URL("../database/currency-schema.sql", import.meta.url), "utf8");
const old = readFileSync(
  new URL("./fixtures/game-wallet-v3-pre-coverage.sql", import.meta.url),
  "utf8",
);
const upgrade = readFileSync(
  new URL("../database/game-wallet-v3-receipt-coverage-upgrade.sql", import.meta.url),
  "utf8",
);
const hash = (x) => crypto.createHash("sha256").update(x).digest("hex");
async function fixture() {
  const db = await PGlite.create();
  await db.exec(v1);
  await db.exec(old);
  const id = (await db.query("SELECT database_id FROM civilcraft_currency.installation")).rows[0]
    .database_id;
  return { db, id, who: [id, "17FA03", "ABCDEF", "FACE123", "title_player_account"] };
}
const call = async (db, schema, name, args) =>
  (
    await db.query(
      `SELECT * FROM ${schema}.${name}(${args.map((_, i) => `$${i + 1}`).join(",")})`,
      args,
    )
  ).rows;
test("guarded unused-v3 upgrade preserves v1 health, UUID, link history and exact new restricted capability", async () => {
  const { db, id, who } = await fixture();
  try {
    await call(db, "civilcraft_game_wallet_v3", "link_issue", [
      id,
      "17FA03",
      "ABCDEF",
      hash("opaque"),
      "coins",
    ]);
    await db.exec(upgrade);
    await db.exec(
      "CREATE ROLE upgrade_fixture LOGIN; GRANT civilcraft_currency_app,civilcraft_game_wallet_app TO upgrade_fixture; SET SESSION AUTHORIZATION upgrade_fixture",
    );
    assert.equal(
      (await call(db, "civilcraft_currency", "health", [id, "17FA03", 1]))[0].healthy,
      true,
    );
    assert.equal(
      (await call(db, "civilcraft_game_wallet_v3", "health", [id, "17FA03", 3]))[0].healthy,
      true,
    );
    assert.equal(
      (await call(db, "civilcraft_game_wallet_v3", "link_read", [id, "17FA03", hash("opaque")]))
        .length,
      1,
    );
    assert.equal((await call(db, "civilcraft_game_wallet_v3", "legacy_receipts", who)).length, 0);
    await assert.rejects(
      db.query("SELECT * FROM civilcraft_currency.receipts"),
      /permission denied/,
    );
    await assert.rejects(
      call(db, "civilcraft_game_wallet_v3", "credit", [
        ...who,
        "old-route",
        500,
        hash("old"),
        "legacy",
      ]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
test("upgrade refuses imported/audit-derived money and preserves original balance/coverage/receipts", async () => {
  const { db, id, who } = await fixture();
  try {
    const owner = crypto.randomUUID();
    await call(db, "civilcraft_game_wallet_v3", "gate_acquire", [...who, owner, "import"]);
    await call(db, "civilcraft_game_wallet_v3", "import_wallet", [
      ...who,
      owner,
      0,
      500,
      hash("old-save"),
      JSON.stringify([{ orderId: "old-audit-derived", fingerprint: hash("audit") }]),
      "[]",
      "[]",
    ]);
    await call(db, "civilcraft_game_wallet_v3", "gate_release", [...who, owner]);
    await assert.rejects(db.exec(upgrade), /reviewed permanent-authority backfill/);
    await db.exec("ROLLBACK");
    assert.equal(
      Number((await call(db, "civilcraft_game_wallet_v3", "wallet_balance", who))[0].coins),
      500,
    );
    assert.equal(
      Number(
        (await db.query("SELECT count(*) AS n FROM civilcraft_game_wallet_v3.legacy_coverage"))
          .rows[0].n,
      ),
      1,
    );
    assert.equal(
      Number(
        (await db.query("SELECT count(*) AS n FROM civilcraft_game_wallet_v3.ledger")).rows[0].n,
      ),
      1,
    );
    assert.equal(
      (
        await db.query(
          "SELECT to_regclass('civilcraft_game_wallet_v3.entity_manifests') AS present",
        )
      ).rows[0].present,
      null,
    );
  } finally {
    await db.close();
  }
});
test("upgrade refuses held/uncertain durable gates even when money has not yet been imported", async () => {
  const { db, id, who } = await fixture();
  try {
    const owner = crypto.randomUUID();
    await call(db, "civilcraft_game_wallet_v3", "gate_acquire", [...who, owner, "legacy"]);
    await assert.rejects(db.exec(upgrade), /reviewed permanent-authority backfill/);
    await db.exec("ROLLBACK");
    assert.equal(
      (await db.query("SELECT gate_owner FROM civilcraft_game_wallet_v3.accounts")).rows[0]
        .gate_owner,
      owner,
    );
    assert.equal(
      (
        await db.query(
          "SELECT to_regclass('civilcraft_game_wallet_v3.entity_manifests') AS present",
        )
      ).rows[0].present,
      null,
    );
  } finally {
    await db.close();
  }
});
