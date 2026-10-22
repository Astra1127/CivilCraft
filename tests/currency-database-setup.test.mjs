import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import {
  runCurrencyDatabaseVerification,
  verifyCurrencyDatabase,
} from "../scripts/verify-currency-database.mjs";

const DATABASE_ID = "11111111-1111-4111-8111-111111111111";
const environment = {
  VITE_PLAYFAB_TITLE_ID: "17FA03",
  PAYMONGO_SECRET_KEY: "sk_test_setup_fixture",
  PLAYFAB_DIAMONDS_STORAGE: "postgres",
  COIN_RECEIPTS_STORAGE: "postgres",
  PLAYFAB_DIAMONDS_ENABLED: "false",
  COIN_CHECKOUT_ENABLED: "false",
  PLAYFAB_COINS_RECEIPTS_VERIFIED: "false",
  CURRENCY_DATABASE_URL:
    "postgresql://runtime:private-database-fixture@db.example/currency?sslmode=require",
  CURRENCY_DATABASE_ID: DATABASE_ID,
  CURRENCY_DATABASE_VERIFIED: "false",
  CURRENCY_DATABASE_VERIFIED_TITLE_ID: "",
  CURRENCY_DATABASE_VERIFIED_CONFIG_SHA256: "",
};
const originalEnvironment = Object.fromEntries(
  Object.keys(environment).map((key) => [key, process.env[key]]),
);
const originalFetch = globalThis.fetch;
let healthCalls;
let networkCalls;
const metadata = () => ({ databaseId: DATABASE_ID, titleId: "17FA03", schemaVersion: 1 });
const healthCheck = async () => {
  healthCalls++;
  return metadata();
};

beforeEach(() => {
  Object.assign(process.env, environment);
  healthCalls = 0;
  networkCalls = 0;
  globalThis.fetch = async () => {
    networkCalls++;
    assert.fail("Setup mocks must not call PlayFab, PayMongo, or a real database.");
  };
});

after(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("database setup outputs installation-bound readiness only after successful health verification", async () => {
  const result = await verifyCurrencyDatabase({ healthCheck });
  assert.equal(healthCalls, 1);
  assert.equal(networkCalls, 0);
  assert.equal(result.databaseId, DATABASE_ID);
  assert.equal(result.titleId, "17FA03");
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.attestations.CURRENCY_DATABASE_VERIFIED, "true");
  assert.equal(result.attestations.CURRENCY_DATABASE_VERIFIED_TITLE_ID, "17FA03");
  assert.match(result.attestations.CURRENCY_DATABASE_VERIFIED_CONFIG_SHA256, /^[a-f0-9]{64}$/);
  for (const [key, value] of Object.entries(environment))
    assert.equal(process.env[key], value, key);
  assert.doesNotMatch(JSON.stringify(result), /private-database-fixture|sk_test_setup_fixture/);
});

for (const flag of [
  "PLAYFAB_DIAMONDS_ENABLED",
  "COIN_CHECKOUT_ENABLED",
  "PLAYFAB_COINS_RECEIPTS_VERIFIED",
]) {
  test(`enabled ${flag} blocks setup before a database check`, async () => {
    process.env[flag] = " true ";
    await assert.rejects(verifyCurrencyDatabase({ healthCheck }), /Disable .*checkout gates/);
    assert.equal(healthCalls, 0);
  });
}

for (const key of ["PLAYFAB_DIAMONDS_STORAGE", "COIN_RECEIPTS_STORAGE"]) {
  test(`database setup requires explicit ${key}=postgres and never falls back`, async () => {
    process.env[key] = "entity-objects";
    await assert.rejects(verifyCurrencyDatabase({ healthCheck }), /Explicitly select postgres/);
    delete process.env[key];
    await assert.rejects(verifyCurrencyDatabase({ healthCheck }), /no fallback/);
    assert.equal(healthCalls, 0);
  });
  test(`database setup rejects uppercase ${key} just like the runtime selector`, async () => {
    process.env[key] = "POSTGRES";
    await assert.rejects(verifyCurrencyDatabase({ healthCheck }), /Explicitly select postgres/);
    assert.equal(healthCalls, 0);
  });
}

test("live, public, or missing PayMongo keys and absent title IDs cannot produce readiness", async () => {
  for (const key of ["sk_live_unpermitted", "pk_test_public", ""]) {
    process.env.PAYMONGO_SECRET_KEY = key;
    await assert.rejects(verifyCurrencyDatabase({ healthCheck }), /sk_test_/);
  }
  process.env.PAYMONGO_SECRET_KEY = environment.PAYMONGO_SECRET_KEY;
  for (const title of ["", "not-a-title"]) {
    process.env.VITE_PLAYFAB_TITLE_ID = title;
    await assert.rejects(verifyCurrencyDatabase({ healthCheck }), /explicit valid .*TITLE_ID/);
  }
  assert.equal(healthCalls, 0);
});

test("invalid database configuration does not open a connection or expose its supplied value", async () => {
  for (const [key, value] of [
    ["CURRENCY_DATABASE_URL", "https://runtime:private-database-fixture@db.example/currency"],
    [
      "CURRENCY_DATABASE_URL",
      "postgresql://runtime:private-database-fixture@db.example/currency?sslmode=disable",
    ],
    ["CURRENCY_DATABASE_ID", "private-database-fixture"],
  ]) {
    Object.assign(process.env, environment, { [key]: value });
    await assert.rejects(verifyCurrencyDatabase({ healthCheck }), (error) => {
      assert.match(error.message, /could not be verified/);
      assert.doesNotMatch(error.message, /private-database-fixture/);
      return true;
    });
  }
  assert.equal(healthCalls, 0);
});

for (const [description, health] of [
  ["wrong installation", { ...metadata(), databaseId: "22222222-2222-4222-8222-222222222222" }],
  ["wrong title", { ...metadata(), titleId: "BAD" }],
  ["wrong schema", { ...metadata(), schemaVersion: 2 }],
  ["missing metadata", undefined],
]) {
  test(`${description} cannot emit a verification attestation`, async () => {
    await assert.rejects(
      verifyCurrencyDatabase({ healthCheck: async () => health }),
      /could not be verified/,
    );
    assert.equal(process.env.CURRENCY_DATABASE_VERIFIED, "false");
    assert.equal(process.env.CURRENCY_DATABASE_VERIFIED_CONFIG_SHA256, "");
    assert.equal(networkCalls, 0);
  });
}

test("role/schema/database failures and malformed fingerprints are private and do not enable checkout", async () => {
  await assert.rejects(
    verifyCurrencyDatabase({
      healthCheck: async () => {
        throw new Error("postgresql://owner:private-database-fixture@db.example/secret");
      },
    }),
    (error) => {
      assert.match(error.message, /restricted runtime role/);
      assert.doesNotMatch(error.message, /private-database-fixture|postgresql|owner:/);
      return true;
    },
  );
  await assert.rejects(
    verifyCurrencyDatabase({ healthCheck, fingerprint: () => "private-database-fixture" }),
    /could not be verified/,
  );
  assert.equal(process.env.CURRENCY_DATABASE_VERIFIED, "false");
  assert.equal(process.env.PLAYFAB_DIAMONDS_ENABLED, "false");
  assert.equal(process.env.COIN_CHECKOUT_ENABLED, "false");
});

test("CLI-style success prints only exact nonsecret readiness lines and closes its pool", async () => {
  const lines = [];
  const errors = [];
  let closeCalls = 0;
  const exitCode = await runCurrencyDatabaseVerification({
    verify: () => verifyCurrencyDatabase({ healthCheck }),
    close: async () => {
      closeCalls++;
    },
    writeLine: (line) => lines.push(line),
    writeError: (line) => errors.push(line),
  });
  assert.equal(exitCode, 0);
  assert.equal(closeCalls, 1);
  assert.deepEqual(errors, []);
  assert.equal(lines.length, 5);
  assert.equal(lines[1], `CURRENCY_DATABASE_ID=${DATABASE_ID}`);
  assert.equal(lines[2], "CURRENCY_DATABASE_VERIFIED=true");
  assert.equal(lines[3], "CURRENCY_DATABASE_VERIFIED_TITLE_ID=17FA03");
  assert.match(lines[4], /^CURRENCY_DATABASE_VERIFIED_CONFIG_SHA256=[a-f0-9]{64}$/);
  assert.doesNotMatch(
    lines.join("\n"),
    /private-database-fixture|sk_test_|DATABASE_URL|COIN_CHECKOUT_ENABLED=true|PLAYFAB_DIAMONDS_ENABLED=true/,
  );
  assert.equal(process.env.CURRENCY_DATABASE_VERIFIED, "false");
});

test("CLI-style failure emits no readiness lines or arbitrary provider/close errors", async () => {
  const lines = [];
  const errors = [];
  let closeCalls = 0;
  const exitCode = await runCurrencyDatabaseVerification({
    verify: async () => {
      throw new Error("private-database-fixture-provider-error");
    },
    close: async () => {
      closeCalls++;
      throw new Error("private-database-fixture-close-error");
    },
    writeLine: (line) => lines.push(line),
    writeError: (line) => errors.push(line),
  });
  assert.equal(exitCode, 1);
  assert.equal(closeCalls, 1);
  assert.deepEqual(lines, []);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Keep checkout disabled/);
  assert.doesNotMatch(errors[0], /private-database-fixture|VERIFIED=true/);
});

test("setup script exposes no migration, monetary grant, receipt creation, or environment write path", () => {
  const source = readFileSync(
    new URL("../scripts/verify-currency-database.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /grantDiamonds|AddUserVirtualCurrency|CREATE ROLE|INSERT INTO|writeFile|process\.env\[[^\]]+\]\s*=/,
  );
  assert.match(source, /assertCurrencyDatabaseHealthy/);
  assert.match(source, /Unexpected verifier arguments/);
});
