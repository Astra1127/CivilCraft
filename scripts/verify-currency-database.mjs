import { pathToFileURL } from "node:url";
import {
  assertCurrencyDatabaseHealthy,
  closeCurrencyDatabasePool,
  currencyDatabaseConfig,
  currencyDatabaseVerificationFingerprint,
} from "../src/lib/payments/currency-database.server.ts";

const HEALTH_FAILURE =
  "Database schema, installation binding, and restricted runtime role could not be verified. Keep checkout disabled; review the migration and runtime credentials privately. No connection details were printed.";

class VerificationError extends Error {}

/** Read-only installation check; never installs SQL, writes money, or edits environment files. */
export async function verifyCurrencyDatabase({
  healthCheck = assertCurrencyDatabaseHealthy,
  fingerprint = currencyDatabaseVerificationFingerprint,
} = {}) {
  if (
    process.env["PLAYFAB_DIAMONDS_ENABLED"]?.trim().toLowerCase() === "true" ||
    process.env["COIN_CHECKOUT_ENABLED"]?.trim().toLowerCase() === "true" ||
    process.env["PLAYFAB_COINS_RECEIPTS_VERIFIED"]?.trim().toLowerCase() === "true"
  )
    throw new VerificationError(
      "Disable Diamond, PostgreSQL Coin, and legacy Coin checkout gates before setup verification.",
    );
  if (
    process.env["PLAYFAB_DIAMONDS_STORAGE"]?.trim() !== "postgres" ||
    process.env["COIN_RECEIPTS_STORAGE"]?.trim() !== "postgres"
  )
    throw new VerificationError(
      "Explicitly select postgres for PLAYFAB_DIAMONDS_STORAGE and COIN_RECEIPTS_STORAGE. Existing wallets and receipts require a reviewed migration; no fallback is performed.",
    );
  if (!process.env["PAYMONGO_SECRET_KEY"]?.trim().startsWith("sk_test_"))
    throw new VerificationError(
      "Keep PayMongo configured with a server-only sk_test_ key for this simulation phase.",
    );
  const titleId = process.env["VITE_PLAYFAB_TITLE_ID"]?.trim().toUpperCase() || "";
  if (!/^[a-f0-9]{1,16}$/i.test(titleId))
    throw new VerificationError(
      "An explicit valid VITE_PLAYFAB_TITLE_ID is required before database verification.",
    );
  try {
    const config = currencyDatabaseConfig();
    const health = await healthCheck();
    if (
      !health ||
      health.databaseId !== config.databaseId ||
      health.titleId !== titleId ||
      health.schemaVersion !== config.schemaVersion
    )
      throw new VerificationError(HEALTH_FAILURE);
    const hash = fingerprint();
    if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash))
      throw new VerificationError(HEALTH_FAILURE);
    return Object.freeze({
      databaseId: config.databaseId,
      titleId,
      schemaVersion: config.schemaVersion,
      attestations: Object.freeze({
        CURRENCY_DATABASE_ID: config.databaseId,
        CURRENCY_DATABASE_VERIFIED: "true",
        CURRENCY_DATABASE_VERIFIED_TITLE_ID: titleId,
        CURRENCY_DATABASE_VERIFIED_CONFIG_SHA256: hash,
      }),
    });
  } catch {
    // All provider/SQL messages are private; do not print arbitrary upstream errors.
    throw new VerificationError(HEALTH_FAILURE);
  }
}

/** Injectable output is used by mocked tests; the CLI uses only real health verification. */
export async function runCurrencyDatabaseVerification({
  verify = verifyCurrencyDatabase,
  close = closeCurrencyDatabasePool,
  writeLine = (line) => console.log(line),
  writeError = (line) => console.error(line),
} = {}) {
  try {
    const result = await verify();
    writeLine(
      "Read-only database setup checks passed. Review these nonsecret outputs before configuring deployment; checkout remains disabled:",
    );
    for (const [key, value] of Object.entries(result.attestations)) writeLine(`${key}=${value}`);
    return 0;
  } catch (error) {
    writeError(error instanceof VerificationError ? error.message : HEALTH_FAILURE);
    return 1;
  } finally {
    try {
      await close();
    } catch {
      // Never expose a provider error while closing a failed connection.
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--help")) {
    console.log(
      "Usage: npm run verify:currencies (uses .env, otherwise .env.local, otherwise injected environment)\nExplicit file: node --env-file=<private-file> scripts/verify-currency-database.mjs\nRead-only database schema/installation/restricted-role check. Requires explicit postgres storage selections, disabled checkout, and a PayMongo test key. Does not grant currency, create receipts, alter SQL/roles, or edit environment files. No player session ticket is required.",
    );
  } else if (process.argv.length > 2) {
    console.error("Unexpected verifier arguments. Use --help; no database check was performed.");
    process.exitCode = 1;
  } else {
    process.exitCode = await runCurrencyDatabaseVerification();
  }
}
