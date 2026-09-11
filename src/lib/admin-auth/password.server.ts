import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Fixed, bounded OWASP scrypt work factors. Never accept weaker or unbounded costs.
const OPTIONS = { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 };
// Colon-delimited metadata avoids dotenv variable expansion when copied into JSON.
const PREFIX = "scrypt:131072:8:1:";
export const MAX_PASSWORD_BYTES = 1024;
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, OPTIONS, (error, result) =>
      error ? reject(error) : resolve(result),
    );
  });
}
export function validPasswordHash(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^scrypt:131072:8:1:[A-Za-z0-9_-]{32}:[A-Za-z0-9_-]{86}$/.test(value) &&
    Buffer.from(value.split(":")[5]!, "base64url").toString("base64url") === value.split(":")[5]
  );
}
export async function hashAdminPassword(password: string): Promise<string> {
  if ([...password].length < 15 || Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES)
    throw new Error("Use at least 15 characters and at most 1,024 UTF-8 bytes.");
  const salt = randomBytes(24);
  const key = await derive(password, salt);
  try {
    return `${PREFIX}${salt.toString("base64url")}:${key.toString("base64url")}`;
  } finally {
    key.fill(0);
  }
}
export async function verifyAdminPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  if (!validPasswordHash(passwordHash) || Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES)
    return false;
  const parts = passwordHash.split(":");
  const expected = Buffer.from(parts[5]!, "base64url");
  const derived = await derive(password, Buffer.from(parts[4]!, "base64url"));
  try {
    return timingSafeEqual(expected, derived);
  } finally {
    expected.fill(0);
    derived.fill(0);
  }
}
