import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

const diamondEnv = {
  PLAYFAB_DIAMONDS_ENABLED: "true",
  PLAYFAB_DIAMONDS_STORAGE: "entity-objects",
  PLAYFAB_DIAMONDS_ITEM_ID: "",
  PLAYFAB_DIAMONDS_RECEIPT_ITEM_ID: "",
  PLAYFAB_DIAMONDS_VERIFIED_TITLE_ID: "TEST_TITLE",
  PLAYFAB_DIAMONDS_VERIFIED_CONFIG_SHA256: "test-verification-fingerprint",
  PLAYFAB_DIAMONDS_BOOTSTRAP_VERIFIED: "true",
  PLAYFAB_DIAMONDS_PLAYER_WRITES_DENIED: "true",
  PLAYFAB_DIAMONDS_CAPACITY_VERIFIED: "true",
};

const coinReceiptEnv = {
  PLAYFAB_COINS_RECEIPTS_VERIFIED: "true",
  PLAYFAB_COINS_VERIFIED_TITLE_ID: "TEST_TITLE",
  PLAYFAB_COINS_VERIFIED_CONFIG_SHA256: "test-coin-verification-fingerprint",
};

function configuration({ command = "serve", fileEnv = {}, shellEnv = {} } = {}) {
  const env = { ...shellEnv };
  const calls = [];
  const exports = {};
  const plugin = () => ({ name: "mock-plugin" });
  runInNewContext(source, {
    exports,
    process: { env, cwd: () => "/isolated-env-fixture" },
    require: (name) => {
      if (name === "vite")
        return {
          defineConfig: (config) => config,
          loadEnv: (mode, directory, prefix) => {
            calls.push({ mode, directory, prefix });
            return Object.fromEntries(
              Object.entries(fileEnv).filter(([key]) => key.startsWith(prefix)),
            );
          },
        };
      if (name === "@tanstack/react-start/plugin/vite") return { tanstackStart: plugin };
      if (name === "nitro/vite") return { nitro: plugin };
      if (["@vitejs/plugin-react", "@tailwindcss/vite", "vite-tsconfig-paths"].includes(name))
        return { default: plugin };
      throw new Error(`Unexpected configuration dependency: ${name}`);
    },
  });
  const config = exports.default({ command, mode: "development" });
  return { env, config, calls };
}

test("Vite dev loads every runtime Diamond setting from its server-only env fixture", () => {
  const fixture = {
    ...diamondEnv,
    ...coinReceiptEnv,
    VITE_PLAYFAB_TITLE_ID: "TEST_TITLE",
    PLAYFAB_SECRET_KEY: "fixture-server-secret",
    PLAYFAB_DIAMONDS_VERIFICATION_PLAYER_TICKET: "fixture-cli-only-player-ticket",
    PLAYFAB_COINS_VERIFICATION_PLAYER_TICKET: "fixture-cli-only-coin-ticket",
    UNRELATED_PRIVATE_VALUE: "not-allowlisted",
  };
  const { env, config, calls } = configuration({ fileEnv: fixture });
  for (const [key, value] of Object.entries(diamondEnv)) assert.equal(env[key], value, key);
  for (const [key, value] of Object.entries(coinReceiptEnv)) assert.equal(env[key], value, key);
  assert.equal(env.PLAYFAB_SECRET_KEY, "fixture-server-secret");
  assert.equal(env.PLAYFAB_DIAMONDS_VERIFICATION_PLAYER_TICKET, undefined);
  assert.equal(env.PLAYFAB_COINS_VERIFICATION_PLAYER_TICKET, undefined);
  assert.equal(env.UNRELATED_PRIVATE_VALUE, undefined);
  assert.deepEqual(calls, [
    { mode: "development", directory: "/isolated-env-fixture", prefix: "" },
    { mode: "development", directory: "/isolated-env-fixture", prefix: "VITE_" },
  ]);
  assert.deepEqual(Object.keys(config.define), ["import.meta.env.VITE_PLAYFAB_TITLE_ID"]);
  assert.equal(config.define["import.meta.env.VITE_PLAYFAB_TITLE_ID"], '"TEST_TITLE"');
  const clientDefines = JSON.stringify(config.define);
  assert.doesNotMatch(
    clientDefines,
    /PLAYFAB_DIAMONDS|PLAYFAB_COINS|fixture-server-secret|fixture-cli-only/,
  );
});

test("Vite dev preserves nonempty shell settings and disabled checkout values", () => {
  const { env } = configuration({
    fileEnv: diamondEnv,
    shellEnv: {
      PLAYFAB_DIAMONDS_ENABLED: "false",
      PLAYFAB_DIAMONDS_STORAGE: "economy-v2",
      PLAYFAB_DIAMONDS_VERIFIED_CONFIG_SHA256: "existing-server-attestation",
      PLAYFAB_DIAMONDS_VERIFIED_TITLE_ID: " ",
    },
  });
  assert.equal(env.PLAYFAB_DIAMONDS_ENABLED, "false");
  assert.equal(env.PLAYFAB_DIAMONDS_STORAGE, "economy-v2");
  assert.equal(env.PLAYFAB_DIAMONDS_VERIFIED_CONFIG_SHA256, "existing-server-attestation");
  assert.equal(env.PLAYFAB_DIAMONDS_VERIFIED_TITLE_ID, "TEST_TITLE");
});

test("Vite dev does not enable Diamonds or invent attestations when env settings are absent", () => {
  const { env } = configuration();
  for (const key of Object.keys(diamondEnv)) assert.equal(env[key], undefined, key);
});

test("Vite builds never load Diamond server settings into the process or client definitions", () => {
  const { env, config, calls } = configuration({
    command: "build",
    fileEnv: { ...diamondEnv, VITE_PLAYFAB_TITLE_ID: "TEST_TITLE" },
  });
  for (const key of Object.keys(diamondEnv)) assert.equal(env[key], undefined, key);
  assert.deepEqual(calls, [
    { mode: "development", directory: "/isolated-env-fixture", prefix: "VITE_" },
  ]);
  assert.deepEqual(Object.keys(config.define), ["import.meta.env.VITE_PLAYFAB_TITLE_ID"]);
});
