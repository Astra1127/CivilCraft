import { pathToFileURL } from "node:url";
import { assertGameWalletHealthy } from "../src/lib/game-wallet/database.server.ts";
import {
  gameWalletConfig,
  gameWalletVerificationFingerprint,
} from "../src/lib/game-wallet/config.server.ts";
import { closeCurrencyDatabasePool } from "../src/lib/payments/currency-database.server.ts";

const FAILURE =
  "Game wallet capability, identity and restricted runtime could not be verified. Keep GAME_WALLET_ENABLED=false; review setup privately. No provider details were printed.";
export async function verifyGameWallet({
  healthCheck = assertGameWalletHealthy,
  fingerprint = gameWalletVerificationFingerprint,
} = {}) {
  if (process.env["GAME_WALLET_ENABLED"]?.trim().toLowerCase() === "true")
    throw new Error("Keep GAME_WALLET_ENABLED=false during read-only capability verification.");
  try {
    const config = gameWalletConfig();
    const health = await healthCheck();
    const hash = fingerprint();
    if (
      health.databaseId !== config.databaseId ||
      health.protocolVersion !== 3 ||
      health.titleId !== (process.env["VITE_PLAYFAB_TITLE_ID"] || "17FA03").trim().toUpperCase() ||
      !/^[a-f0-9]{64}$/.test(hash)
    )
      throw new Error();
    return {
      attestations: {
        GAME_WALLET_VERIFIED: "true",
        GAME_WALLET_VERIFIED_TITLE_ID: health.titleId,
        GAME_WALLET_VERIFIED_CONFIG_SHA256: hash,
      },
    };
  } catch {
    throw new Error(FAILURE);
  }
}
export async function runGameWalletVerification({
  verify = verifyGameWallet,
  close = closeCurrencyDatabasePool,
  writeLine = console.log,
  writeError = console.error,
} = {}) {
  try {
    const result = await verify();
    writeLine(
      "Read-only v3 wallet checks passed. This did not migrate players, quiesce handlers, grant money, or enable checkout:",
    );
    for (const [key, value] of Object.entries(result.attestations)) writeLine(`${key}=${value}`);
    return 0;
  } catch {
    writeError(FAILURE);
    return 1;
  } finally {
    try {
      await close();
    } catch {
      /* No provider diagnostics. */
    }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--help"))
    console.log(
      "Usage: node --env-file=.env scripts/verify-game-wallet.mjs\nRead-only restricted-role/capability check. Never installs SQL, imports players, writes currency, sets environment flags, or claims legacy handlers are quiesced.",
    );
  else if (process.argv.length > 2) {
    console.error("Unexpected arguments; use --help.");
    process.exitCode = 1;
  } else process.exitCode = await runGameWalletVerification();
}
