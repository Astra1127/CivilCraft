import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { after, test } from "node:test";
import ts from "typescript";
import { AdminApiError, adminGameConfig } from "../src/lib/playfab/admin-client.server.ts";
import {
  gameWalletConfig,
  isGameWalletInstalled,
  requireGameShopLinkReady,
  requireGameWalletReady,
  requireGameWalletSettlementReady,
} from "../src/lib/game-wallet/config.server.ts";
import { currencyDatabaseVerificationFingerprint } from "../src/lib/payments/currency-database.server.ts";

// All database execution below is a deterministic mock. No provider/network writes.
const require = createRequire(import.meta.url);
const fixture = {
  CURRENCY_DATABASE_URL: "postgres://fixture:fixture@wallet.invalid/game?sslmode=require",
  CURRENCY_DATABASE_ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  CURRENCY_DATABASE_VERIFIED: "true",
  CURRENCY_DATABASE_VERIFIED_TITLE_ID: "17FA03",
  CURRENCY_DATABASE_VERIFIED_CONFIG_SHA256: "",
  VITE_PLAYFAB_TITLE_ID: "17FA03",
  PLAYFAB_SECRET_KEY: "fixture-only",
  GAME_WALLET_ENABLED: "false",
  GAME_WALLET_VERIFIED: "false",
  GAME_WALLET_LEGACY_HANDLERS_QUIESCED: "false",
  GAME_WALLET_VERIFIED_TITLE_ID: "",
  GAME_WALLET_VERIFIED_CONFIG_SHA256: "",
};
const previous = Object.fromEntries(Object.keys(fixture).map((key) => [key, process.env[key]]));
Object.assign(process.env, fixture);
fixture.CURRENCY_DATABASE_VERIFIED_CONFIG_SHA256 = currencyDatabaseVerificationFingerprint();
Object.assign(process.env, fixture);
after(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function databaseHarness(options = {}) {
  const config = gameWalletConfig();
  const state = { queries: [], importAttempts: 0, guardChecks: 0 };
  const health = {
    healthy: true,
    database_id: config.databaseId,
    title_id: "17FA03",
    protocol_version: 3,
    ...options.health,
  };
  const connection = {
    unsafe: async (sql, args) => {
      state.queries.push({ sql, args });
      if (sql.includes(".health(")) {
        if (options.failHealth) throw new Error("PRIVATE database details");
        return options.healthRows ?? [health];
      }
      if (options.failLink) throw new Error("PRIVATE link/database details");
      return [{ expires_at: "2026-10-10T12:00:00Z" }];
    },
  };
  const mocks = {
    "../playfab/admin-client.server.ts": { AdminApiError, adminGameConfig },
    "../payments/currency-database.server.ts": { currencyDatabaseConnection: () => connection },
    "./config.server.ts": {
      gameWalletConfig,
      requireGameShopLinkReady: () => {
        state.guardChecks++;
        return requireGameShopLinkReady();
      },
      requireGameWalletReady,
      requireGameWalletSettlementReady,
    },
    "./types.ts": { MAX_GAME_COINS: 2147483647 },
    "./gate-context.server.ts": { markGameWalletImportAttempted: () => state.importAttempts++ },
  };
  const exports = {};
  const compiled = ts.transpileModule(
    readFileSync(new URL("../src/lib/game-wallet/database.server.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      if (name in mocks) return mocks[name];
      if (name.startsWith("node:")) return require(name);
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return { database: exports, state };
}

test("navigation requires verified currency configuration without changing wallet/cutover flags", () => {
  Object.assign(process.env, fixture);
  const flags = Object.fromEntries(
    Object.keys(fixture)
      .filter((key) => key.startsWith("GAME_WALLET_"))
      .map((key) => [key, process.env[key]]),
  );
  assert.deepEqual(requireGameShopLinkReady(), gameWalletConfig());
  assert.equal(isGameWalletInstalled(), false);
  assert.throws(
    () => requireGameWalletReady(),
    (error) => error.status === 503 && error.code === "GAME_WALLET_DISABLED",
  );
  assert.throws(() => requireGameWalletSettlementReady(), /verified setup/);
  for (const [key, value] of Object.entries(flags)) assert.equal(process.env[key], value);
});

test("navigation rejects missing server secret and unverified/wrong physical database/title", () => {
  for (const change of [
    { PLAYFAB_SECRET_KEY: "" },
    { CURRENCY_DATABASE_VERIFIED: "false" },
    { CURRENCY_DATABASE_VERIFIED_TITLE_ID: "OTHER" },
    { CURRENCY_DATABASE_VERIFIED_CONFIG_SHA256: "0".repeat(64) },
    { CURRENCY_DATABASE_ID: "" },
    { CURRENCY_DATABASE_URL: "postgres://fixture:fixture@other.invalid/game?sslmode=require" },
    { VITE_PLAYFAB_TITLE_ID: "17FA04" },
  ]) {
    Object.assign(process.env, fixture, change);
    assert.throws(
      () => requireGameShopLinkReady(),
      (error) => error.status === 503,
    );
  }
  Object.assign(process.env, fixture);
});

test("only opaque link issue/read can run with disabled wallet and real restricted v3 health", async () => {
  Object.assign(process.env, fixture);
  const { database, state } = databaseHarness();
  for (const name of ["link_issue", "link_read"])
    await database.shopLinkCall(name, [fixture.CURRENCY_DATABASE_ID, "17FA03", "opaque-hash"]);
  assert.equal(state.guardChecks, 2);
  assert.equal(state.queries.length, 4);
  assert.ok(state.queries[0].sql.includes(".health("));
  assert.ok(state.queries[1].sql.includes(".link_issue($1,$2,$3)"));
  assert.ok(state.queries[2].sql.includes(".health("));
  assert.ok(state.queries[3].sql.includes(".link_read($1,$2,$3)"));
  assert.equal(state.importAttempts, 0);
  assert.equal(isGameWalletInstalled(), false);
});

test("navigation runtime allowlist rejects every non-link operation before guard or SQL", async () => {
  const { database, state } = databaseHarness();
  for (const name of [
    "wallet_balance",
    "gate_acquire",
    "gate_release",
    "import_wallet",
    "credit",
    "receipt",
    "reward",
    "purchase",
    "reject_purchase",
    "purchase_status",
    "entitlements",
    "legacy_receipts",
    "entity_manifest",
    "health",
    "link_issue;SELECT 1",
    "LINK_ISSUE",
    "",
    null,
  ]) {
    await assert.rejects(database.shopLinkCall(name, []), (error) => error.status === 503);
  }
  assert.equal(state.guardChecks, 0);
  assert.equal(state.queries.length, 0);
  assert.equal(state.importAttempts, 0);
});

test("navigation does not weaken disabled monetary database operations", async () => {
  const { database, state } = databaseHarness();
  for (const name of ["import_wallet", "credit", "reward", "purchase"]) {
    await assert.rejects(
      database.walletCall(name, []),
      (error) => error.status === 503 && error.code === "GAME_WALLET_DISABLED",
    );
    await assert.rejects(
      database.walletCall(name, [], true),
      (error) => error.status === 503 && error.code === "GAME_WALLET_NOT_READY",
    );
  }
  assert.equal(state.queries.length, 0);
  assert.equal(state.importAttempts, 0);
});

test("navigation health mismatch or unrestricted role never proceeds to link SQL", async () => {
  for (const options of [
    { health: { healthy: false } }, // Health includes restricted runtime/no-direct-table-access checks.
    { health: { database_id: "00000000-0000-0000-0000-000000000000" } },
    { health: { title_id: "17FA04" } },
    { health: { protocol_version: 1 } },
    { healthRows: [] },
    { failHealth: true },
  ]) {
    const { database, state } = databaseHarness(options);
    await assert.rejects(
      database.shopLinkCall("link_issue", []),
      (error) => error.status === 503 && !error.message.includes("PRIVATE"),
    );
    assert.equal(state.queries.length, 1);
    assert.ok(state.queries[0].sql.includes(".health("));
    assert.equal(state.importAttempts, 0);
  }
});

test("missing verified navigation config performs no database query and link SQL errors are sanitized", async () => {
  const { database, state } = databaseHarness();
  process.env.CURRENCY_DATABASE_VERIFIED = "false";
  try {
    await assert.rejects(database.shopLinkCall("link_read", []), (error) => error.status === 503);
    assert.equal(state.queries.length, 0);
  } finally {
    Object.assign(process.env, fixture);
  }
  const failed = databaseHarness({ failLink: true });
  await assert.rejects(
    failed.database.shopLinkCall("link_read", []),
    (error) => error.status === 503 && !error.message.includes("PRIVATE"),
  );
  assert.equal(failed.state.queries.length, 2);
});
