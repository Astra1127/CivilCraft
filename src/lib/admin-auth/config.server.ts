import { createHash } from "node:crypto";
import { validPasswordHash } from "./password.server.ts";
import type { AdminUser } from "./types.ts";

export interface AdminAccount extends AdminUser {
  passwordHash: string;
}
export interface AdminAuthConfig {
  origin: string;
  secure: boolean;
  sessionSecret: string;
  users: AdminAccount[];
}
export function normalizeAdminEmail(value: string): string {
  return value.trim().toLowerCase();
}
export function validAdminEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
/** Server environment only. Any malformed account makes configuration fail closed. */
export function getAdminAuthConfig(): AdminAuthConfig | null {
  const env = process.env;
  const sessionSecret = env["ADMIN_SESSION_SECRET"]?.trim() ?? "";
  if (Buffer.byteLength(sessionSecret) < 32) return null;
  try {
    const origin = new URL(
      env["ADMIN_AUTH_ORIGIN"]?.trim() ||
        (env["NODE_ENV"] === "production"
          ? "https://civil-craft.vercel.app"
          : "http://localhost:5173"),
    );
    const secure = origin.protocol === "https:";
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
    if (
      (!secure && !(local && origin.protocol === "http:" && env["NODE_ENV"] !== "production")) ||
      origin.username ||
      origin.password ||
      origin.search ||
      origin.hash ||
      origin.pathname !== "/"
    )
      return null;
    const raw: unknown = JSON.parse(env["ADMIN_USERS_JSON"] ?? "");
    if (!Array.isArray(raw) || !raw.length || raw.length > 20) return null;
    const users: AdminAccount[] = [];
    for (const item of raw) {
      if (
        !item ||
        typeof item !== "object" ||
        typeof item.email !== "string" ||
        typeof item.displayName !== "string" ||
        !validPasswordHash(item.passwordHash)
      )
        return null;
      const email = normalizeAdminEmail(item.email),
        displayName = item.displayName.trim();
      if (
        !validAdminEmail(email) ||
        !displayName ||
        displayName.length > 200 ||
        users.some((u) => u.email === email)
      )
        return null;
      users.push({
        id: createHash("sha256").update(email).digest("hex"),
        email,
        displayName,
        passwordHash: item.passwordHash,
      });
    }
    return {
      origin: origin.origin,
      secure,
      sessionSecret,
      users,
    };
  } catch {
    return null;
  }
}
