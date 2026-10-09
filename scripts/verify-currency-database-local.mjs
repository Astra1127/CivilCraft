import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** Preserve the original .env behavior; fall back without copying credentials.
 * Never automatically load .env.production or .env.example. Node preserves
 * already-injected process variables over env-file values.
 */
export function selectVerificationEnv(cwd = process.cwd(), exists = existsSync) {
  return [".env", ".env.local"].find((file) => exists(resolve(cwd, file))) ?? null;
}

export function runLocalVerification({ cwd = process.cwd(), args = [], spawn = spawnSync } = {}) {
  if (args.length && !(args.length === 1 && args[0] === "--help")) {
    console.error("Unexpected verifier arguments. Use --help; no database check was performed.");
    return 1;
  }
  const file = selectVerificationEnv(cwd);
  const result = spawn(
    process.execPath,
    [
      ...(file ? [`--env-file=${file}`] : []),
      resolve(cwd, "scripts/verify-currency-database.mjs"),
      ...args,
    ],
    { cwd, env: process.env, stdio: "inherit" },
  );
  if (result.error || result.signal) {
    console.error(
      "The read-only verifier could not start or was interrupted. No credentials were printed.",
    );
    return 1;
  }
  return result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runLocalVerification({ args: process.argv.slice(2) });
}
