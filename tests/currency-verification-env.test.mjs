import assert from "node:assert/strict";
import { test } from "node:test";
import { basename } from "node:path";
import {
  selectVerificationEnv,
  runLocalVerification,
} from "../scripts/verify-currency-database-local.mjs";

test("existing .env retains precedence when both local files exist", () => {
  assert.equal(
    selectVerificationEnv("/test", () => true),
    ".env",
  );
});
test(".env.local is selected without requiring duplicated .env secrets", () => {
  assert.equal(
    selectVerificationEnv("/test", (path) => basename(path) === ".env.local"),
    ".env.local",
  );
});
test("no local file uses injected environment rather than production/example files", () => {
  assert.equal(
    selectVerificationEnv("/test", () => false),
    null,
  );
});
test("launcher forwards help and failure status without altering environment or verifier", () => {
  let options;
  const status = runLocalVerification({
    args: ["--help"],
    spawn: (executable, args, opts) => {
      assert.equal(executable, process.execPath);
      assert.ok(args.some((arg) => arg.endsWith("verify-currency-database.mjs")));
      assert.equal(args.at(-1), "--help");
      options = opts;
      return { status: 7 };
    },
  });
  assert.equal(status, 7);
  assert.equal(options.env, process.env);
  assert.equal(options.stdio, "inherit");
});
