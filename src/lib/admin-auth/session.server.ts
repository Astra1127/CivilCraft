import { createHmac, randomBytes } from "node:crypto";
import { SignJWT, decodeJwt, jwtVerify } from "jose";
import { getAdminAuthConfig, type AdminAuthConfig, type AdminAccount } from "./config.server.ts";
import type { AdminSessionStatus, AdminUser } from "./types.ts";

export const SESSION_SECONDS = 8 * 60 * 60;
const ISSUER = "civilcraft-admin:v3:session";
export function cookieName(config: AdminAuthConfig, _purpose: "session" = "session"): string {
  return (config.secure ? "__Host-" : "") + "civilcraft-admin-session";
}
export function cookie(config: AdminAuthConfig, purpose: "session", value: string, maxAge: number) {
  return (
    cookieName(config, purpose) +
    "=" +
    value +
    "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" +
    maxAge +
    (config.secure ? "; Secure" : "")
  );
}
function signingKey(config: AdminAuthConfig, account: AdminAccount) {
  // Bind signatures to both the session secret and current account credentials, without
  // putting a credential hash or fingerprint in the token. Password changes invalidate it.
  return createHmac("sha256", config.sessionSecret)
    .update(ISSUER)
    .update(account.id)
    .update(account.passwordHash)
    .digest();
}
export function isAuthorizedStaff(config: AdminAuthConfig, user: AdminUser): boolean {
  return config.users.some((u) => u.id === user.id && u.email === user.email);
}
export function safeAdminUser(user: AdminUser): AdminUser {
  return { id: user.id, email: user.email, displayName: user.displayName };
}
export async function issueAdminSession(config: AdminAuthConfig, user: AdminUser) {
  const account = config.users.find((u) => u.id === user.id && u.email === user.email);
  if (!account) throw new Error("Administrator access denied");
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(config.origin)
    .setSubject(account.id)
    .setJti(randomBytes(16).toString("base64url"))
    .setIssuedAt()
    .setExpirationTime(SESSION_SECONDS + "s")
    .sign(signingKey(config, account));
}
export async function readAdminSession(request: Request): Promise<AdminSessionStatus> {
  const config = getAdminAuthConfig();
  if (!config) return { configured: false, authenticated: false, user: null };
  const denied: AdminSessionStatus = { configured: true, authenticated: false, user: null };
  const name = cookieName(config);
  const matches = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.startsWith(name + "="));
  if (matches.length !== 1) return denied;
  const token = matches[0]!.slice(name.length + 1);
  if (!token || token.length > 4096) return denied;
  try {
    // Unverified subject only selects a key. It never authorizes the request.
    const untrusted = decodeJwt(token);
    if (typeof untrusted.sub !== "string" || !/^[a-f0-9]{64}$/.test(untrusted.sub)) return denied;
    const account = config.users.find((u) => u.id === untrusted.sub);
    if (!account) return denied;
    const { payload } = await jwtVerify(token, signingKey(config, account), {
      algorithms: ["HS256"],
      typ: "JWT",
      issuer: ISSUER,
      audience: config.origin,
      subject: account.id,
      requiredClaims: ["sub", "iat", "exp", "jti"],
      maxTokenAge: SESSION_SECONDS,
    });
    if (
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number" ||
      !Number.isInteger(payload.iat) ||
      !Number.isInteger(payload.exp) ||
      payload.exp <= payload.iat ||
      payload.exp - payload.iat > SESSION_SECONDS ||
      typeof payload.jti !== "string" ||
      !/^[\w-]{22}$/.test(payload.jti) ||
      Object.keys(payload).some((k) => !["sub", "iat", "exp", "jti", "iss", "aud"].includes(k))
    )
      return denied;
    return { configured: true, authenticated: true, user: safeAdminUser(account) };
  } catch {
    return denied;
  }
}
