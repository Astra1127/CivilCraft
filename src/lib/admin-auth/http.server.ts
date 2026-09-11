import { getAdminAuthConfig, normalizeAdminEmail, validAdminEmail } from "./config.server.ts";
import {
  cookie,
  issueAdminSession,
  readAdminSession,
  safeAdminUser,
  SESSION_SECONDS,
} from "./session.server.ts";
import { MAX_PASSWORD_BYTES, verifyAdminPassword } from "./password.server.ts";
import { limitLoginAttempts } from "./throttle.server.ts";
import { ADMIN_AUTH_MESSAGES } from "./types.ts";

const PRIVATE_HEADERS = {
  "Cache-Control": "no-store, private",
  Pragma: "no-cache",
  Vary: "Cookie",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
export function privateResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: PRIVATE_HEADERS });
}
function redirect(location: string) {
  return new Response(null, { status: 303, headers: { ...PRIVATE_HEADERS, Location: location } });
}
function audit(operation: string, result: string, administrator?: string) {
  console.info(
    JSON.stringify({
      operation,
      result,
      at: new Date().toISOString(),
      ...(administrator ? { administrator } : {}),
    }),
  );
}
let activeVerifications = 0;
async function credentials(request: Request): Promise<{ email: string; password: string } | null> {
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json")
    return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 8192) return null;
      parts.push(part.value);
    }
    const body = JSON.parse(Buffer.concat(parts).toString("utf8")) as Record<string, unknown>;
    if (!body || typeof body["email"] !== "string" || typeof body["password"] !== "string")
      return null;
    const email = normalizeAdminEmail(body["email"]),
      password = body["password"];
    if (
      !validAdminEmail(email) ||
      !password ||
      Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES
    )
      return null;
    return { email, password };
  } catch {
    return null;
  } finally {
    await reader.cancel();
  }
}
/** Server gate for all staff pages and the entire authentication namespace. */
export async function handleAdminRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  let path: string;
  try {
    path = decodeURIComponent(url.pathname).replace(/\/+$/, "") || "/";
  } catch {
    return privateResponse({ error: "Invalid request." }, 400);
  }
  if (path.toLowerCase() === "/admin" || path.toLowerCase().startsWith("/admin/")) {
    const status = await readAdminSession(request);
    if (path.toLowerCase() === "/admin/login")
      return status.authenticated ? redirect("/admin") : null;
    return status.authenticated ? null : redirect("/admin/login");
  }
  if (!path.startsWith("/api/auth/admin/")) return null;
  if (path === "/api/auth/admin/session") {
    if (request.method !== "GET") return privateResponse({ error: "Method not allowed." }, 405);
    return privateResponse(await readAdminSession(request));
  }
  if (!["/api/auth/admin/login", "/api/auth/admin/logout"].includes(path))
    return privateResponse({ error: "Not found." }, 404);
  if (request.method !== "POST") return privateResponse({ error: "Method not allowed." }, 405);
  const config = getAdminAuthConfig();
  if (!config) return privateResponse({ error: ADMIN_AUTH_MESSAGES.not_configured }, 503);
  if (
    request.headers.get("origin") !== config.origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return privateResponse({ error: "Request not allowed." }, 403);
  if (path.endsWith("/logout")) {
    try {
      const status = await readAdminSession(request);
      const response = privateResponse({ success: true });
      response.headers.append("Set-Cookie", cookie(config, "session", "", 0));
      audit("admin_logout", "success", status.user?.id);
      return response;
    } catch {
      return privateResponse({ error: "Administrator sign-out failed. Please try again." }, 503);
    }
  }
  const input = await credentials(request);
  if (!input) {
    audit("admin_login", "invalid");
    return privateResponse({ error: ADMIN_AUTH_MESSAGES.invalid }, 400);
  }
  try {
    const retry = await limitLoginAttempts(config, input.email);
    if (retry > 0) {
      const response = privateResponse({ error: ADMIN_AUTH_MESSAGES.limited }, 429);
      response.headers.set("Retry-After", String(retry));
      audit("admin_login", "limited");
      return response;
    }
    // Bound memory use in a warm instance alongside the per-instance attempt limits.
    if (activeVerifications >= 2)
      return privateResponse({ error: ADMIN_AUTH_MESSAGES.limited }, 429);
    const account = config.users.find((u) => u.email === input.email);
    activeVerifications++;
    let matches: boolean;
    try {
      matches = await verifyAdminPassword(
        input.password,
        (account ?? config.users[0]!).passwordHash,
      );
    } finally {
      activeVerifications--;
      input.password = "";
    }
    if (!account || !matches) {
      audit("admin_login", "invalid");
      return privateResponse({ error: ADMIN_AUTH_MESSAGES.invalid }, 401);
    }
    // Issue a fresh signed cookie. Older copies expire naturally; no per-session denylist.
    const token = await issueAdminSession(config, account);
    const response = privateResponse({ authenticated: true, user: safeAdminUser(account) });
    response.headers.append("Set-Cookie", cookie(config, "session", token, SESSION_SECONDS));
    audit("admin_login", "success", account.id);
    return response;
  } catch {
    return privateResponse({ error: ADMIN_AUTH_MESSAGES.failed }, 503);
  } finally {
    input.password = "";
  }
}
