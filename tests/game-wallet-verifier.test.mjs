import assert from "node:assert/strict";
import { after, test } from "node:test";
import { verifyGameWallet, runGameWalletVerification } from "../scripts/verify-game-wallet.mjs";
import {
  gameWalletConfig,
  gameWalletVerificationFingerprint,
  requireGameWalletReady,
  requireGameWalletSettlementReady,
} from "../src/lib/game-wallet/config.server.ts";

const env = {
  CURRENCY_DATABASE_URL: "postgres://fixture:fixture@wallet.invalid/game?sslmode=require",
  CURRENCY_DATABASE_ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  VITE_PLAYFAB_TITLE_ID: "17FA03",
  PLAYFAB_SECRET_KEY: "fixture-only",
  GAME_WALLET_ENABLED: "false",
  GAME_WALLET_VERIFIED: "false",
  GAME_WALLET_LEGACY_HANDLERS_QUIESCED: "false",
  GAME_WALLET_VERIFIED_TITLE_ID: "",
  GAME_WALLET_VERIFIED_CONFIG_SHA256: "",
};
const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
Object.assign(process.env, env);
after(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
const health = async () => ({
  databaseId: env.CURRENCY_DATABASE_ID,
  titleId: "17FA03",
  protocolVersion: 3,
});
test("read-only verifier emits capability attestations without enabling or claiming quiescence", async () => {
  const result = await verifyGameWallet({ healthCheck: health });
  assert.equal(result.attestations.GAME_WALLET_VERIFIED, "true");
  assert.equal(result.attestations.GAME_WALLET_VERIFIED_TITLE_ID, "17FA03");
  assert.equal(
    result.attestations.GAME_WALLET_VERIFIED_CONFIG_SHA256,
    gameWalletVerificationFingerprint(),
  );
  assert.equal("GAME_WALLET_ENABLED" in result.attestations, false);
  assert.equal("GAME_WALLET_LEGACY_HANDLERS_QUIESCED" in result.attestations, false);
  assert.equal(process.env.GAME_WALLET_ENABLED, "false");
});
test("verifier rejects enabled setup, wrong installation/protocol and suppresses private SQL diagnostics", async () => {
  process.env.GAME_WALLET_ENABLED = "true";
  await assert.rejects(verifyGameWallet({ healthCheck: health }), /false/);
  process.env.GAME_WALLET_ENABLED = "false";
  await assert.rejects(
    verifyGameWallet({ healthCheck: async () => ({ ...(await health()), protocolVersion: 1 }) }),
    /could not be verified/,
  );
  const lines = [];
  let closes = 0;
  const exit = await runGameWalletVerification({
    verify: async () => {
      throw new Error("PRIVATE fixture SQL connection ticket details");
    },
    close: async () => {
      closes++;
    },
    writeLine: (line) => lines.push(line),
    writeError: (line) => lines.push(line),
  });
  assert.equal(exit, 1);
  assert.equal(closes, 1);
  assert.equal(lines.join(" ").includes("PRIVATE"), false);
});
test("enabled new operations require verified target and real quiescence, immutable settlement survives maintenance", () => {
  process.env.GAME_WALLET_ENABLED = "true";
  assert.throws(() => requireGameWalletReady(), /verified setup/);
  process.env.GAME_WALLET_VERIFIED = "true";
  process.env.GAME_WALLET_VERIFIED_TITLE_ID = "17FA03";
  process.env.GAME_WALLET_VERIFIED_CONFIG_SHA256 = gameWalletVerificationFingerprint();
  assert.throws(() => requireGameWalletReady(), /cutover/);
  process.env.GAME_WALLET_LEGACY_HANDLERS_QUIESCED = "true";
  const expected = gameWalletConfig();
  assert.deepEqual(requireGameWalletReady(), expected);
  process.env.GAME_WALLET_ENABLED = "false";
  assert.throws(() => requireGameWalletReady(), /not enabled/);
  assert.deepEqual(requireGameWalletSettlementReady(), expected);
  const old = process.env.CURRENCY_DATABASE_URL;
  process.env.CURRENCY_DATABASE_URL =
    "postgres://fixture:fixture@other.invalid/game?sslmode=require";
  assert.throws(() => requireGameWalletSettlementReady(), /verified setup/);
  process.env.CURRENCY_DATABASE_URL = old;
});
