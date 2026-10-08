import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { after, beforeEach, test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

// The server's actual Postgres.js import is replaced in this VM. These tests never
// read private .env files, open a database socket, or grant PlayFab currency.
const source = readFileSync(
  new URL("../src/lib/payments/currency-database.server.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;
const DATABASE = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const ATTEMPT = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const environment = {
  CURRENCY_DATABASE_URL:
    "postgresql://currency-runtime:fixture-password@db.example.test/civilcraft?sslmode=require",
  CURRENCY_DATABASE_ID: DATABASE,
  CURRENCY_DATABASE_VERIFIED: "true",
  CURRENCY_DATABASE_VERIFIED_TITLE_ID: "17FA03",
  CURRENCY_DATABASE_VERIFIED_CONFIG_SHA256: "",
  VITE_PLAYFAB_TITLE_ID: "17FA03",
  PLAYFAB_DIAMONDS_ENABLED: "false",
};
const previous = Object.fromEntries(Object.keys(environment).map((key) => [key, process.env[key]]));
let api, calls, options, handlers, fail, health, receipts, balances, queue;

class AdminApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function input(overrides = {}) {
  return {
    orderId: "test-order-1",
    playFabId: "ABC123",
    entity: { Id: "FACE123", Type: "title_player_account" },
    currency: "DI",
    amount: 500,
    databaseId: DATABASE,
    targetId: api.currencyDatabaseConfig().targetId,
    schemaVersion: 1,
    ...overrides,
  };
}

const rejected = (error) => error.status === 503 && !String(error).includes("fixture-password");
const identity = (values) => JSON.stringify(values.slice(4, 10));

beforeEach(() => {
  Object.assign(process.env, environment);
  calls = [];
  options = [];
  handlers = {};
  fail = {};
  health = { healthy: true, database_id: DATABASE, title_id: "17FA03", schema_version: 1 };
  receipts = new Map();
  balances = new Map();
  queue = Promise.resolve();
  const driver = (url, config) => {
    options.push({ url, config });
    const sql = async (parts, ...values) => {
      const query = parts.join("?");
      const operation = query.match(/civilcraft_currency\.([a-z_]+)/)?.[1];
      calls.push({ query, operation, values });
      if (fail[operation]) throw new Error("provider SQL failure containing fixture-password");
      if (handlers[operation]) return handlers[operation](values);
      if (operation === "health") return [health];
      if (operation === "diamond_balance")
        return [{ balance: String(balances.get(values[3]) || 0) }];
      const order = values[3];
      const player = values[4];
      const amount = values[8];
      const matching = () => {
        const receipt = receipts.get(order);
        if (receipt && receipt.identity !== identity(values))
          throw new Error("receipt mismatch containing fixture-password");
        return receipt;
      };
      if (operation === "receipt_status") return [{ state: matching()?.state || "absent" }];
      if (operation === "coin_capacity") {
        matching();
        return [
          {
            pending_amount: String(
              [...receipts.values()]
                .filter((r) => r.player === player && r.state === "pending")
                .reduce((sum, r) => sum + r.amount, 0),
            ),
          },
        ];
      }
      // Models serial execution for API recovery tests; the companion SQL tests
      // execute the actual migration and transaction functions in PostgreSQL.
      const previousOperation = queue;
      let release;
      queue = new Promise((resolve) => {
        release = resolve;
      });
      await previousOperation;
      try {
        const receipt = matching();
        if (operation === "grant_diamonds") {
          if (receipt) return [{ already_granted: true, balance: String(balances.get(player)) }];
          balances.set(player, (balances.get(player) || 0) + amount);
          receipts.set(order, { identity: identity(values), state: "granted", player, amount });
          if (fail.commitAfterDiamond) throw new Error("lost committed response fixture-password");
          return [{ already_granted: false, balance: String(balances.get(player)) }];
        }
        if (operation === "claim_coins") {
          if (receipt) return [{ claimed: false }];
          receipts.set(order, {
            identity: identity(values),
            state: "pending",
            player,
            amount,
            attempt: values[10],
          });
          if (fail.commitAfterClaim) throw new Error("lost claim response fixture-password");
          return [{ claimed: true }];
        }
        if (operation === "complete_coins") {
          if (!receipt || receipt.attempt !== values[10])
            throw new Error("wrong claim owner fixture-password");
          receipt.state = "granted";
          return [{ completed: true }];
        }
        throw new Error("unhandled fixture operation");
      } finally {
        release();
      }
    };
    sql.end = async () => {
      calls.push({ operation: "close" });
    };
    return sql;
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require(name) {
      if (name === "node:crypto") return crypto;
      if (name === "postgres") return driver;
      if (name.endsWith("admin-client.server.ts"))
        return {
          AdminApiError,
          adminGameConfig: () => ({
            titleId: process.env.VITE_PLAYFAB_TITLE_ID,
            secret: "fixture-secret",
          }),
        };
      throw new Error(`Unexpected mock import ${name}`);
    },
    process,
    URL,
  });
  api = module.exports;
  process.env.CURRENCY_DATABASE_VERIFIED_CONFIG_SHA256 =
    api.currencyDatabaseVerificationFingerprint();
});

after(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("readiness is independent of Diamond enablement and binds exact installation configuration", () => {
  assert.equal(api.requireCurrencyDatabaseReady().databaseId, DATABASE);
  process.env.CURRENCY_DATABASE_ID = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
  assert.throws(() => api.requireCurrencyDatabaseReady(), rejected);
  assert.equal(calls.length, 0);
});

test("missing, malformed, privileged-option, or insecure remote URLs are rejected before connection", () => {
  for (const url of [
    "",
    "https://db.example.test",
    "postgresql://user@db.example.test/db",
    "postgresql://user:password@db.example.test/db?sslmode=disable",
    "postgresql://user:password@db.example.test/db?options=malicious",
    "postgresql://user:password@db.example.test/db#secret",
    "postgresql://user:password@db.example.test/%invalid",
  ]) {
    process.env.CURRENCY_DATABASE_URL = url;
    assert.throws(() => api.currencyDatabaseConfig(), rejected);
  }
  assert.equal(options.length, 0);
});

test("unverified/title-mismatched/hash-mismatched configuration cannot read or grant currency", async () => {
  for (const field of [
    "CURRENCY_DATABASE_VERIFIED",
    "CURRENCY_DATABASE_VERIFIED_TITLE_ID",
    "CURRENCY_DATABASE_VERIFIED_CONFIG_SHA256",
  ]) {
    const old = process.env[field];
    process.env[field] = "invalid";
    await assert.rejects(api.databaseDiamondBalance("ABC123", input().entity), rejected);
    await assert.rejects(api.grantDatabaseDiamonds(input()), rejected);
    process.env[field] = old;
  }
  assert.equal(calls.length, 0);
});

test("read-only health is allowed before verification and remote certificate validation is mandatory", async () => {
  process.env.CURRENCY_DATABASE_VERIFIED = "false";
  const result = await api.assertCurrencyDatabaseHealthy();
  assert.equal(result.databaseId, DATABASE);
  assert.equal(options[0].config.ssl.rejectUnauthorized, true);
  assert.equal(options[0].config.max, 2);
  assert.equal(options[0].config.connection.statement_timeout, 15000);
  assert.equal(options[0].config.prepare, false);
  assert.equal(calls[0].operation, "health");
});

test("health rejects unrestricted credentials, wrong installation, title, or schema", async () => {
  for (const changed of [
    { healthy: false },
    { database_id: "cccccccc-cccc-4ccc-cccc-cccccccccccc" },
    { title_id: "BAD" },
    { schema_version: 2 },
    { schema_version: "1" },
  ]) {
    health = {
      healthy: true,
      database_id: DATABASE,
      title_id: "17FA03",
      schema_version: 1,
      ...changed,
    };
    await assert.rejects(api.assertCurrencyDatabaseHealthy(), rejected);
  }
});

test("an absent wallet returns zero only after healthy DB evidence, without initialization or mutation", async () => {
  assert.equal(await api.databaseDiamondBalance("ABC123", input().entity), 0);
  assert.deepEqual(
    calls.map((r) => r.operation),
    ["health", "diamond_balance"],
  );
  assert.equal(receipts.size, 0);
  assert.equal(balances.size, 0);
});

test("backend failure or malformed balance is unavailable, never a fabricated zero", async () => {
  fail.diamond_balance = true;
  await assert.rejects(api.databaseDiamondBalance("ABC123", input().entity), rejected);
  delete fail.diamond_balance;
  for (const balance of [null, "-1", "1.5", "9007199254740992", {}, true]) {
    handlers.diamond_balance = () => [{ balance }];
    await assert.rejects(api.databaseDiamondBalance("ABC123", input().entity), rejected);
  }
});

test("all three Diamond packages credit exactly, duplicate/replay grants change nothing", async () => {
  for (const amount of [500, 1000, 2500]) {
    const request = input({ orderId: `package-${amount}`, amount });
    assert.equal((await api.grantDatabaseDiamonds(request)).alreadyGranted, false);
    assert.equal((await api.grantDatabaseDiamonds(request)).alreadyGranted, true);
  }
  assert.equal(await api.databaseDiamondBalance("ABC123", input().entity), 4000);
  assert.equal(receipts.size, 3);
});

test("duplicate simulated workers and different same-player orders preserve receipt-based totals", async () => {
  const results = await Promise.all(
    Array.from({ length: 8 }, () => api.grantDatabaseDiamonds(input())),
  );
  assert.equal(results.filter((r) => !r.alreadyGranted).length, 1);
  await Promise.all([
    api.grantDatabaseDiamonds(input({ orderId: "new-a", amount: 1000 })),
    api.grantDatabaseDiamonds(input({ orderId: "new-b", amount: 2500 })),
  ]);
  assert.equal(balances.get("ABC123"), 4000);
});

test("lost Diamond commit response rereads a permanent receipt without granting twice", async () => {
  fail.commitAfterDiamond = true;
  const result = await api.grantDatabaseDiamonds(input());
  assert.equal(result.alreadyGranted, true);
  assert.equal(result.balance, 500);
  assert.equal(calls.filter((r) => r.operation === "grant_diamonds").length, 1);
  assert.equal((await api.grantDatabaseDiamonds(input())).balance, 500);
});

test("unknown Diamond commit with failed reread is unavailable; later retry repairs through receipt", async () => {
  fail.commitAfterDiamond = true;
  fail.receipt_status = true;
  await assert.rejects(api.grantDatabaseDiamonds(input()), rejected);
  assert.equal(balances.get("ABC123"), 500);
  delete fail.receipt_status;
  assert.equal((await api.grantDatabaseDiamonds(input())).alreadyGranted, true);
  assert.equal(balances.get("ABC123"), 500);
});

test("same order cannot be replayed for another player, reward, entity, or currency", async () => {
  await api.grantDatabaseDiamonds(input());
  for (const altered of [
    { playFabId: "DEF456" },
    { amount: 501 },
    { entity: { Id: "FFFF123", Type: "title_player_account" } },
    { currency: "CO" },
  ]) {
    await assert.rejects(api.databaseReceiptStatus(input(altered)), rejected);
  }
  assert.equal(balances.get("ABC123"), 500);
});

test("receipt query fingerprints every immutable snapshot and uses SQL parameters, not SQL concatenation", async () => {
  for (const altered of [
    {},
    { orderId: "another-order" },
    { amount: 501 },
    { playFabId: "DEF456" },
    { entity: { Id: "AAAA123", Type: "title_player_account" } },
    { currency: "CO" },
  ]) {
    await api.databaseReceiptStatus(input(altered));
  }
  const queries = calls.filter((r) => r.operation === "receipt_status");
  assert.equal(new Set(queries.map((r) => r.values[9])).size, 6);
  assert.ok(queries.every((r) => !r.query.includes("test-order-1") && !r.query.includes("ABC123")));
});

test("invalid snapshots/rewards/identities never reach the DB", async () => {
  for (const changed of [
    { databaseId: "cccccccc-cccc-4ccc-cccc-cccccccccccc" },
    { schemaVersion: 2 },
    { amount: 0 },
    { amount: 1.5 },
    { amount: Number.MAX_SAFE_INTEGER + 1 },
    { orderId: "';DROP TABLE receipts;--" },
    { playFabId: "wrong owner" },
    { entity: { Id: "FACE123", Type: "title" } },
    { currency: "ZZ" },
  ]) {
    await assert.rejects(api.grantDatabaseDiamonds(input(changed)), rejected);
  }
  assert.equal(calls.length, 0);
});

test("fresh Coin claim is exclusive and cannot be reacquired even by the same attempt", async () => {
  const coin = input({ currency: "CO" });
  assert.equal(await api.claimDatabaseCoins(coin, ATTEMPT), true);
  assert.equal(await api.claimDatabaseCoins(coin, ATTEMPT), false);
  assert.equal(await api.claimDatabaseCoins(coin, "cccccccc-cccc-4ccc-cccc-cccccccccccc"), false);
  assert.equal(await api.databaseReceiptStatus(coin), "pending");
  assert.equal((await api.assertDatabaseCoinCapacity(coin)).pendingAmount, 500);
  assert.equal(balances.size, 0);
});

test("Coin completion requires original attempt and preserves immutable receipt", async () => {
  const coin = input({ currency: "CO" });
  await api.claimDatabaseCoins(coin, ATTEMPT);
  await assert.rejects(
    api.completeDatabaseCoins(coin, "cccccccc-cccc-4ccc-cccc-cccccccccccc"),
    rejected,
  );
  assert.equal(await api.databaseReceiptStatus(coin), "pending");
  await api.completeDatabaseCoins(coin, ATTEMPT);
  await api.completeDatabaseCoins(coin, ATTEMPT);
  assert.equal(await api.databaseReceiptStatus(coin), "granted");
  assert.equal((await api.assertDatabaseCoinCapacity(coin)).pendingAmount, 0);
  assert.equal(receipts.size, 1);
});

test("lost Coin claim response never rereads or infers permission to issue an external grant", async () => {
  const coin = input({ currency: "CO" });
  fail.commitAfterClaim = true;
  await assert.rejects(api.claimDatabaseCoins(coin, ATTEMPT), rejected);
  assert.deepEqual(
    calls.map((r) => r.operation),
    ["health", "claim_coins"],
  );
  assert.equal(await api.claimDatabaseCoins(coin, ATTEMPT), false);
  assert.equal(await api.databaseReceiptStatus(coin), "pending");
});

test("Coin capacity includes all pending claims, while granted claims and Diamonds are excluded", async () => {
  await api.grantDatabaseDiamonds(input());
  const first = input({ orderId: "coin-a", currency: "CO", amount: 500 });
  const second = input({ orderId: "coin-b", currency: "CO", amount: 1000 });
  await api.claimDatabaseCoins(first, ATTEMPT);
  await api.claimDatabaseCoins(second, ATTEMPT);
  assert.equal((await api.assertDatabaseCoinCapacity(first)).pendingAmount, 1500);
  await api.completeDatabaseCoins(first, ATTEMPT);
  assert.equal((await api.assertDatabaseCoinCapacity(second)).pendingAmount, 1000);
  assert.equal(balances.get("ABC123"), 500);
});

test("bounded Coin capacity, booleans, and receipt states reject malformed DB responses", async () => {
  const coin = input({ currency: "CO" });
  handlers.coin_capacity = () => [{ pending_amount: "2147483648" }];
  await assert.rejects(api.assertDatabaseCoinCapacity(coin), rejected);
  handlers.claim_coins = () => [{ claimed: "true" }];
  await assert.rejects(api.claimDatabaseCoins(coin, ATTEMPT), rejected);
  handlers.complete_coins = () => [{ completed: false }];
  await assert.rejects(api.completeDatabaseCoins(coin, ATTEMPT), rejected);
  handlers.receipt_status = () => [{ state: "expired" }];
  await assert.rejects(api.databaseReceiptStatus(coin), rejected);
});

test("all provider errors are sanitized and runtime pool closes without logging secrets", async () => {
  fail.health = true;
  await assert.rejects(
    api.assertCurrencyDatabaseHealthy(),
    (error) => rejected(error) && !error.message.includes("SQL"),
  );
  await api.closeCurrencyDatabasePool();
  assert.equal(calls.at(-1).operation, "close");
});

test("a changed database URL disposes the prior connection instead of reusing stale credentials", async () => {
  await api.assertCurrencyDatabaseHealthy();
  process.env.CURRENCY_DATABASE_URL =
    "postgresql://other-runtime:other-secret@other.example.test/civilcraft?sslmode=require";
  await api.assertCurrencyDatabaseHealthy();
  assert.equal(options.length, 2);
  assert.equal(calls.filter((r) => r.operation === "close").length, 1);
});

test("physical target fingerprint includes normalized host, port, protocol, and database, excluding credentials/query", () => {
  const expected = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        protocol: "postgresql:",
        hostname: "db.example.test",
        port: "5432",
        database: "civilcraft",
      }),
    )
    .digest("hex");
  assert.equal(api.currencyDatabaseConfig().targetId, expected);
  const fingerprint = api.currencyDatabaseVerificationFingerprint();
  process.env.CURRENCY_DATABASE_URL =
    "postgresql://rotated-user:rotated-password@DB.EXAMPLE.TEST:5432/civilcraft?sslmode=verify-full";
  assert.equal(api.currencyDatabaseConfig().targetId, expected);
  assert.equal(api.currencyDatabaseVerificationFingerprint(), fingerprint);
  assert.equal(api.requireCurrencyDatabaseReady().targetId, expected);
});

test("a stale clone with the same installation UUID cannot receive an old immutable Diamond or Coin order", async () => {
  const diamond = input();
  const coin = input({ orderId: "old-coin", currency: "CO" });
  await api.grantDatabaseDiamonds(diamond);
  await api.claimDatabaseCoins(coin, ATTEMPT);
  const originalFingerprint = api.currencyDatabaseVerificationFingerprint();
  process.env.CURRENCY_DATABASE_URL =
    "postgresql://currency-runtime:fixture-password@stale-clone.example.test/civilcraft?sslmode=require";
  assert.notEqual(api.currencyDatabaseVerificationFingerprint(), originalFingerprint);
  assert.throws(() => api.requireCurrencyDatabaseReady(), rejected);
  process.env.CURRENCY_DATABASE_VERIFIED_CONFIG_SHA256 =
    api.currencyDatabaseVerificationFingerprint();
  const previousCalls = calls.length;
  await assert.rejects(api.grantDatabaseDiamonds(diamond), rejected);
  await assert.rejects(api.claimDatabaseCoins(coin, ATTEMPT), rejected);
  await assert.rejects(api.databaseReceiptStatus(coin), rejected);
  assert.equal(calls.length, previousCalls);
  assert.equal(balances.get("ABC123"), 500);
  assert.equal(receipts.size, 2);
});

test("changing database path or endpoint port invalidates verification even when installation UUID stays the same", () => {
  const target = api.currencyDatabaseConfig().targetId;
  for (const url of [
    "postgresql://currency-runtime:fixture-password@db.example.test/otherdb?sslmode=require",
    "postgresql://currency-runtime:fixture-password@db.example.test:6543/civilcraft?sslmode=require",
  ]) {
    process.env.CURRENCY_DATABASE_URL = url;
    assert.notEqual(api.currencyDatabaseConfig().targetId, target);
    assert.throws(() => api.requireCurrencyDatabaseReady(), rejected);
  }
});
