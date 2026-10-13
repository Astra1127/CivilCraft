import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("TEST exclusions block credit and false coverage without rewriting receipts or expanding runtime access", async () => {
  const db = await PGlite.create();
  try {
    for (const name of [
      "currency-schema",
      "game-wallet-v3",
      "game-wallet-new-account-cohort",
      "game-wallet-test-order-exclusions",
    ])
      await db.exec(readFileSync(new URL(`../database/${name}.sql`, import.meta.url), "utf8"));
    const id = (await db.query("SELECT database_id FROM civilcraft_currency.installation")).rows[0]
      .database_id;
    const who = [id, "17FA03", "ABC123", "FACE123", "title_player_account"];
    const call = async (name, args) =>
      (
        await db.query(
          `SELECT * FROM civilcraft_game_wallet_v3.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")})`,
          args,
        )
      ).rows[0];
    const owner = randomUUID(),
      sha = "a".repeat(64);
    await call("gate_acquire", [...who, owner, "import"]);
    await call("import_wallet", [...who, owner, 73711, 10500, sha, "[]", "[]", "[]", 76911, 3200]);
    await call("gate_release", [...who, owner]);
    const insert = `INSERT INTO civilcraft_game_wallet_v3.test_order_exclusions(title_id,order_id,player_id,entity_id,amount,source_protocol,test_only,source_sha256,evidence_sha256,approval) VALUES('17FA03',$1,'ABC123','FACE123',1000,0,true,$2,$2,'Explicit TEST-only waiver fixture')`;
    await db.query(insert, ["CC-OLD", sha]);
    await assert.rejects(
      db.exec("UPDATE civilcraft_game_wallet_v3.test_order_exclusions SET amount=500"),
      /permanent/,
    );
    await assert.rejects(
      db.exec("DELETE FROM civilcraft_game_wallet_v3.test_order_exclusions"),
      /permanent/,
    );
    await assert.rejects(
      db.exec("TRUNCATE civilcraft_game_wallet_v3.test_order_exclusions"),
      /permanent/,
    );
    await db.exec(
      "CREATE ROLE exclusion_fixture LOGIN; GRANT civilcraft_currency_app,civilcraft_game_wallet_app TO exclusion_fixture; SET SESSION AUTHORIZATION exclusion_fixture",
    );
    assert.equal((await call("health", [id, "17FA03", 3])).healthy, true);
    assert.equal(
      (await db.query("SELECT * FROM civilcraft_currency.health($1,'17FA03',1)", [id])).rows[0]
        .healthy,
      true,
    );
    await assert.rejects(
      db.exec("SELECT * FROM civilcraft_game_wallet_v3.test_order_exclusions"),
      /permission denied/,
    );
    await assert.rejects(db.query(insert, ["CC-OTHER", sha]), /permission denied/);
    for (let retry = 0; retry < 2; retry++)
      for (const kind of ["payment", "legacy"])
        await assert.rejects(
          call("credit", [
            ...who,
            "CC-OLD",
            1000,
            sha,
            kind,
            kind === "legacy" ? "postgres:CC-OLD" : null,
          ]),
          /permanently excluded/,
        );
    assert.equal(Number((await call("wallet_balance", who)).coins), 84211);
    await call("credit", [...who, "CC-NEW", 500, sha, "payment", null]);
    assert.equal(Number((await call("wallet_balance", who)).coins), 84711);
    assert.equal(
      (await call("credit", [...who, "CC-NEW", 500, sha, "payment", null])).already_granted,
      true,
    );
    await db.exec("SET SESSION AUTHORIZATION postgres");
    await assert.rejects(db.query(insert, ["CC-NEW", sha]), /Existing receipt conflicts/);
    await db.exec(
      "INSERT INTO civilcraft_currency.accounts VALUES('17FA03','ABC123','FACE123','title_player_account',0)",
    );
    await assert.rejects(
      db.query(
        "INSERT INTO civilcraft_currency.receipts VALUES('17FA03','CC-OLD','ABC123','FACE123','title_player_account','CO',1000,$1,$2,'pending',clock_timestamp())",
        [sha, randomUUID()],
      ),
      /permanently excluded/,
    );
    for (const key of ["CC-OLD", "postgres:CC-OLD", "entity-objects:CC-OLD"])
      await assert.rejects(
        db.query(
          "INSERT INTO civilcraft_game_wallet_v3.legacy_coverage VALUES('17FA03',$1,'ABC123',$2,'postgres','FACE123',1000,$2)",
          [key, sha],
        ),
        /permanently excluded/,
      );
    // An order must not escape exclusion by changing its player or amount.
    await db.exec(
      "INSERT INTO civilcraft_game_wallet_v3.accounts(title_id,player_id,entity_id,entity_type,imported) VALUES('17FA03','ABC456','FACE456','title_player_account',true)",
    );
    await assert.rejects(
      call("credit", [
        id,
        "17FA03",
        "ABC456",
        "FACE456",
        "title_player_account",
        "CC-OLD",
        1,
        sha,
        "payment",
        null,
      ]),
      /permanently excluded/,
    );
    assert.equal(Number((await call("wallet_balance", who)).coins), 84711);
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM civilcraft_game_wallet_v3.ledger WHERE kind='opening'",
        )
      ).rows[0].n,
      1,
    );
    const repeated = await call("import_wallet", [
      ...who,
      randomUUID(),
      73711,
      10500,
      sha,
      "[]",
      "[]",
      "[]",
      76911,
      3200,
    ]);
    assert.equal(repeated.already_imported, true);
    assert.equal(Number(repeated.coins), 84711);
  } finally {
    await db.close();
  }
});
