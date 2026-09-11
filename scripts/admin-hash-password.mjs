import { emitKeypressEvents } from "node:readline";
import { hashAdminPassword, MAX_PASSWORD_BYTES } from "../src/lib/admin-auth/password.server.ts";

// stdout contains only the hash. Prompts/errors go to stderr; input is never echoed.
async function hiddenPrompt(label) {
  if (!process.stdin.isTTY) throw new Error("Run this command in an interactive terminal.");
  process.stderr.write(label);
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const done = (error) => {
      process.stdin.off("keypress", onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stderr.write("\n");
      if (error) {
        value = "";
        reject(error);
      } else {
        resolve(value);
        value = "";
      }
    };
    const onKey = (text, key) => {
      if (key?.ctrl && (key.name === "c" || key.name === "d")) return done(new Error("Cancelled."));
      if (key?.name === "return" || key?.name === "enter") return done();
      if (key?.name === "backspace") {
        value = [...value].slice(0, -1).join("");
        return;
      }
      if (
        key?.ctrl ||
        key?.meta ||
        !text ||
        [...text].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
      )
        return;
      if (Buffer.byteLength(value + text, "utf8") > MAX_PASSWORD_BYTES)
        return done(new Error("Password exceeds 1,024 UTF-8 bytes."));
      value += text;
    };
    process.stdin.on("keypress", onKey);
  });
}
let password = "",
  confirmation = "";
try {
  if (process.argv.length !== 2)
    throw new Error("Do not pass passwords as command-line arguments.");
  password = await hiddenPrompt("Administrator password (hidden, at least 15 characters): ");
  confirmation = await hiddenPrompt("Confirm password (hidden): ");
  if (password !== confirmation) throw new Error("Passwords do not match.");
  const hash = await hashAdminPassword(password);
  process.stdout.write(hash + "\n");
} catch (error) {
  process.stderr.write(
    error instanceof Error ? error.message + "\n" : "Unable to generate a password hash.\n",
  );
  process.exitCode = 1;
} finally {
  password = "";
  confirmation = "";
}
