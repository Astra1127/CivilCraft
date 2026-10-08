import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

let db, installation;
const migration = readFileSync(new URL("../database/currency-schema.sql", import.meta.url), "utf8");
before(async () => {
  db = await PGlite.create();
  await db.exec(migration);
  installation = (await db.query("SELECT * FROM civilcraft_currency.installation")).rows[0];
  await db.exec(
    "CREATE ROLE fixture_runtime LOGIN; GRANT civilcraft_currency_app TO fixture_runtime; SET SESSION AUTHORIZATION fixture_runtime;",
  );
});
after(async () => {
  await db?.close();
});
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const input = (order, currency = "DI", amount = 500, player = "ABC123", entity = "FACE123") => {
  const values = [
    installation.database_id,
    "17FA03",
    1,
    order,
    player,
    entity,
    "title_player_account",
    currency,
    amount,
  ];
  return [...values, hash(values)];
};
const call = async (name, args) =>
  (
    await db.query(
      `SELECT * FROM civilcraft_currency.${name}(${args.map((_, i) => `$${i + 1}`).join(",")})`,
      args,
    )
  ).rows[0];
const health = () => call("health", [installation.database_id, "17FA03", 1]);
async function admin(sql) {
  // PGlite retains the changed reset value between calls; select the original
  // fixture administrator explicitly rather than relying on RESET semantics.
  await db.exec("SET SESSION AUTHORIZATION postgres");
  try {
    return await db.exec(sql);
  } finally {
    await db.exec("SET SESSION AUTHORIZATION fixture_runtime");
  }
}

test("actual migration installs and restricted runtime role passes read-only health", async () => {
  assert.equal((await health()).healthy, true);
  await assert.rejects(call("health", [crypto.randomUUID(), "17FA03", 1]), /installation mismatch/);
  await assert.rejects(
    call("health", [installation.database_id, "BAD", 1]),
    /installation mismatch/,
  );
});
test("first Diamond balance read is zero without creating a wallet or receipt", async () => {
  assert.equal(
    Number(
      (
        await call("diamond_balance", [
          installation.database_id,
          "17FA03",
          1,
          "AAA",
          "EEE",
          "title_player_account",
        ])
      ).balance,
    ),
    0,
  );
  const rows = await admin(
    "SELECT count(*) AS n FROM civilcraft_currency.accounts WHERE player_id = 'AAA'",
  );
  assert.equal(Number(rows[0].rows[0].n), 0);
});
test("actual SQL atomically credits each Diamond package and keeps duplicate receipt permanent", async () => {
  for (const amount of [500, 1000, 2500]) {
    const args = input(`diamond-${amount}`, "DI", amount);
    const first = await call("grant_diamonds", args);
    assert.equal(first.already_granted, false);
    const retry = await call("grant_diamonds", args);
    assert.equal(retry.already_granted, true);
    assert.equal(Number(retry.balance), Number(first.balance));
  }
  const balance = await call("diamond_balance", [
    installation.database_id,
    "17FA03",
    1,
    "ABC123",
    "FACE123",
    "title_player_account",
  ]);
  assert.equal(Number(balance.balance), 4000);
});
test("order collision across account/currency/reward rolls back without crediting another wallet", async () => {
  await assert.rejects(
    call("grant_diamonds", input("diamond-500", "DI", 999)),
    /receipt identity mismatch/,
  );
  await assert.rejects(
    call("grant_diamonds", input("diamond-500", "DI", 500, "BBB", "FFF")),
    /receipt identity mismatch/,
  );
  await assert.rejects(
    call("claim_coins", [...input("diamond-500", "CO", 500), crypto.randomUUID()]),
    /receipt identity mismatch/,
  );
  const rows = await admin(
    "SELECT count(*) AS n FROM civilcraft_currency.accounts WHERE player_id = 'BBB'",
  );
  assert.equal(Number(rows[0].rows[0].n), 0);
});
test("Diamond overflow rolls back both receipt and balance", async () => {
  const max = Number.MAX_SAFE_INTEGER;
  await call("grant_diamonds", input("maximum", "DI", max, "CCC", "DDD"));
  await assert.rejects(
    call("grant_diamonds", input("overflow", "DI", 1, "CCC", "DDD")),
    /capacity exceeded/,
  );
  assert.equal(
    (await call("receipt_status", input("overflow", "DI", 1, "CCC", "DDD"))).state,
    "absent",
  );
  assert.equal(
    Number(
      (
        await call("diamond_balance", [
          installation.database_id,
          "17FA03",
          1,
          "CCC",
          "DDD",
          "title_player_account",
        ])
      ).balance,
    ),
    max,
  );
});
test("same order submitted repeatedly acquires only one Coin claim; pending claims cannot be stolen", async () => {
  const args = input("coin-claim", "CO", 500);
  const attempt = crypto.randomUUID();
  assert.equal((await call("claim_coins", [...args, attempt])).claimed, true);
  assert.equal((await call("claim_coins", [...args, attempt])).claimed, false);
  assert.equal((await call("claim_coins", [...args, crypto.randomUUID()])).claimed, false);
  assert.equal((await call("receipt_status", args)).state, "pending");
  await assert.rejects(
    call("complete_coins", [...args, crypto.randomUUID()]),
    /ownership mismatch/,
  );
  assert.equal((await call("receipt_status", args)).state, "pending");
  assert.equal((await call("complete_coins", [...args, attempt])).completed, true);
  assert.equal((await call("receipt_status", args)).state, "granted");
  assert.equal((await call("claim_coins", [...args, crypto.randomUUID()])).claimed, false);
});
test("different simultaneous purchase requests retain distinct Diamond receipts", async () => {
  const outcomes = await Promise.all(
    [1, 2, 3].map((n) =>
      call("grant_diamonds", input(`simultaneous-${n}`, "DI", 10, "AA11", "EE11")),
    ),
  );
  assert.equal(outcomes.filter((x) => x.already_granted === false).length, 3);
  assert.equal(
    Number(
      (
        await call("diamond_balance", [
          installation.database_id,
          "17FA03",
          1,
          "AA11",
          "EE11",
          "title_player_account",
        ])
      ).balance,
    ),
    30,
  );
});
test("runtime cannot directly read, mutate, delete or truncate monetary tables or call private helpers", async () => {
  for (const sql of [
    "SELECT * FROM civilcraft_currency.receipts",
    "DELETE FROM civilcraft_currency.receipts",
    "TRUNCATE civilcraft_currency.receipts",
    "UPDATE civilcraft_currency.accounts SET diamond_balance = 0",
    "SELECT civilcraft_currency._lock_account('17FA03','ABC123','FACE123','title_player_account')",
  ])
    await assert.rejects(db.exec(sql), /permission denied/);
});
test("administrator is not accepted as runtime; accidental inherited table privileges fail health", async () => {
  await db.exec("SET SESSION AUTHORIZATION postgres");
  try {
    assert.equal((await health()).healthy, false);
  } finally {
    await db.exec("SET SESSION AUTHORIZATION fixture_runtime");
  }
  await admin("GRANT SELECT ON civilcraft_currency.receipts TO civilcraft_currency_app");
  try {
    assert.equal((await health()).healthy, false);
  } finally {
    await admin("REVOKE SELECT ON civilcraft_currency.receipts FROM civilcraft_currency_app");
  }
  assert.equal((await health()).healthy, true);
});
test("permanent receipt and installation triggers block deletion and rewriting even for routine administrators", async () => {
  await assert.rejects(
    admin("DELETE FROM civilcraft_currency.receipts WHERE order_id = 'diamond-500'"),
    /never be deleted/,
  );
  await assert.rejects(
    admin("UPDATE civilcraft_currency.receipts SET amount = 501 WHERE order_id = 'diamond-500'"),
    /immutable/,
  );
  await assert.rejects(
    admin("UPDATE civilcraft_currency.installation SET database_id = gen_random_uuid()"),
    /immutable/,
  );
  assert.equal((await call("receipt_status", input("diamond-500"))).state, "granted");
});

test("missing RPC permission or unsafe function security mode invalidates readiness", async () => {
  await admin(
    "REVOKE EXECUTE ON FUNCTION civilcraft_currency.grant_diamonds(uuid,text,integer,text,text,text,text,text,bigint,text) FROM civilcraft_currency_app",
  );
  try {
    assert.equal((await health()).healthy, false);
  } finally {
    await admin(
      "GRANT EXECUTE ON FUNCTION civilcraft_currency.grant_diamonds(uuid,text,integer,text,text,text,text,text,bigint,text) TO civilcraft_currency_app",
    );
  }
  await admin(
    "ALTER FUNCTION civilcraft_currency.grant_diamonds(uuid,text,integer,text,text,text,text,text,bigint,text) SECURITY INVOKER",
  );
  try {
    assert.equal((await health()).healthy, false);
  } finally {
    await admin(
      "ALTER FUNCTION civilcraft_currency.grant_diamonds(uuid,text,integer,text,text,text,text,text,bigint,text) SECURITY DEFINER",
    );
  }
  assert.equal((await health()).healthy, true);
});
test("public RPC or column-level privileges invalidate readiness", async () => {
  await admin(
    "GRANT EXECUTE ON FUNCTION civilcraft_currency.grant_diamonds(uuid,text,integer,text,text,text,text,text,bigint,text) TO PUBLIC",
  );
  try {
    assert.equal((await health()).healthy, false);
  } finally {
    await admin(
      "REVOKE EXECUTE ON FUNCTION civilcraft_currency.grant_diamonds(uuid,text,integer,text,text,text,text,text,bigint,text) FROM PUBLIC",
    );
  }
  await admin(
    "GRANT UPDATE (diamond_balance) ON civilcraft_currency.accounts TO civilcraft_currency_app",
  );
  try {
    assert.equal((await health()).healthy, false);
  } finally {
    await admin(
      "REVOKE UPDATE (diamond_balance) ON civilcraft_currency.accounts FROM civilcraft_currency_app",
    );
  }
  assert.equal((await health()).healthy, true);
});

test("all currency functions explicitly put pg_temp last and unsafe RPC paths invalidate readiness", async () => {
  const result = await admin(
    "SELECT p.proname, p.proconfig FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'civilcraft_currency'",
  );
  assert.equal(result[0].rows.length, 15);
  for (const row of result[0].rows) {
    assert.ok(
      row.proconfig.includes("search_path=pg_catalog, civilcraft_currency, pg_temp"),
      `${row.proname} must explicitly search the temporary schema last`,
    );
  }
  await admin(
    "ALTER FUNCTION civilcraft_currency.grant_diamonds(uuid,text,integer,text,text,text,text,text,bigint,text) SET search_path = pg_catalog, civilcraft_currency",
  );
  try {
    assert.equal((await health()).healthy, false);
  } finally {
    await admin(
      "ALTER FUNCTION civilcraft_currency.grant_diamonds(uuid,text,integer,text,text,text,text,text,bigint,text) SET search_path = pg_catalog, civilcraft_currency, pg_temp",
    );
  }
  assert.equal((await health()).healthy, true);
});

test("temporary catalog shadows cannot interfere with SECURITY DEFINER health or grants", async () => {
  // A fresh PostgreSQL instance ensures the health function has not cached any
  // catalog relation plans before the attacker's temporary tables are present.
  const isolated = await PGlite.create();
  try {
    await isolated.exec(migration);
    const metadata = (await isolated.query("SELECT * FROM civilcraft_currency.installation"))
      .rows[0];
    await isolated.exec(
      "CREATE ROLE shadow_runtime LOGIN; GRANT civilcraft_currency_app TO shadow_runtime; SET SESSION AUTHORIZATION shadow_runtime; CREATE TEMP TABLE pg_roles (attacker text); CREATE TEMP TABLE pg_class (attacker text); CREATE TEMP TABLE pg_namespace (attacker text); CREATE TEMP TABLE pg_proc (attacker text); SET search_path = pg_temp, public;",
    );
    const probe = await isolated.query("SELECT * FROM civilcraft_currency.health($1,'17FA03',1)", [
      metadata.database_id,
    ]);
    assert.equal(probe.rows[0].healthy, true);
    const args = [
      metadata.database_id,
      "17FA03",
      1,
      "shadow-order",
      "AAA123",
      "EEE123",
      "title_player_account",
      "DI",
      500,
    ];
    const request = [...args, hash(args)];
    const query =
      "SELECT * FROM civilcraft_currency.grant_diamonds($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)";
    assert.equal((await isolated.query(query, request)).rows[0].already_granted, false);
    const retry = (await isolated.query(query, request)).rows[0];
    assert.equal(retry.already_granted, true);
    assert.equal(Number(retry.balance), 500);
    await assert.rejects(
      isolated.exec("DELETE FROM civilcraft_currency.receipts"),
      /permission denied/,
    );
    assert.equal(
      (
        await isolated.query("SELECT * FROM civilcraft_currency.health($1,'17FA03',1)", [
          metadata.database_id,
        ])
      ).rows[0].healthy,
      true,
    );
  } finally {
    await isolated.close();
  }
});
