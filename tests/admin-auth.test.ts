import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { decodeJwt, SignJWT } from "jose";
import { limitLoginAttempts } from "../src/lib/admin-auth/throttle.server.ts";
import { after, beforeEach, test } from "node:test";
import { getAdminAuthConfig } from "../src/lib/admin-auth/config.server.ts";
import { handleAdminRequest } from "../src/lib/admin-auth/http.server.ts";
import { cookie, cookieName, readAdminSession } from "../src/lib/admin-auth/session.server.ts";
import {
  hashAdminPassword,
  validPasswordHash,
  verifyAdminPassword,
} from "../src/lib/admin-auth/password.server.ts";

// Random credentials exist only in test memory, never in source, output or external services.
const password = randomBytes(32).toString("base64url");
const passwordHash = await hashAdminPassword(password);
const accounts = [
  { email: "staff@example.test", displayName: "Staff", passwordHash },
  { email: "second@example.test", displayName: "Second", passwordHash },
];
const origin = "https://civilcraft.test";
const env = {
  ADMIN_USERS_JSON: JSON.stringify(accounts),
  ADMIN_AUTH_ORIGIN: origin,
  ADMIN_SESSION_SECRET: randomBytes(32).toString("base64url"),
};
const saved = Object.fromEntries([...Object.keys(env), "NODE_ENV"].map((k) => [k, process.env[k]]));
const originalFetch = globalThis.fetch,
  originalLog = console.info;
let audit: string[] = [];
beforeEach(() => {
  env.ADMIN_SESSION_SECRET = randomBytes(32).toString("base64url");
  Object.assign(process.env, env);
  audit = [];
  console.info = (...values: unknown[]) => {
    audit.push(values.map(String).join(" "));
  };
  globalThis.fetch = async () => {
    throw new Error("Authentication must not contact any external service");
  };
});
after(() => {
  globalThis.fetch = originalFetch;
  console.info = originalLog;
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
function request(
  path: string,
  options: { cookie?: string; method?: string; body?: unknown; origin?: string } = {},
) {
  return new Request(origin + path, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers: {
      cookie: options.cookie ?? "",
      origin: options.origin ?? origin,
      "content-type": "application/json",
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
}
async function login(email = accounts[0]!.email, supplied = password, oldCookie = "") {
  const result = await handleAdminRequest(
    request("/api/auth/admin/login", { body: { email, password: supplied }, cookie: oldCookie }),
  );
  assert.ok(result);
  return result;
}
async function signedIn() {
  const response = await login();
  assert.equal(response.status, 200);
  const value = response.headers.get("set-cookie");
  assert.ok(value);
  return value.split(";")[0]!;
}
test("scrypt verifies generated salted hashes, rejects wrong input and unsupported formats", async () => {
  assert.ok(validPasswordHash(passwordHash));
  assert.ok(await verifyAdminPassword(password, passwordHash));
  assert.ok(!(await verifyAdminPassword(randomBytes(20).toString("hex"), passwordHash)));
  const second = await hashAdminPassword(password);
  assert.ok(second !== passwordHash);
  assert.ok(!validPasswordHash("plain"));
  assert.ok(!validPasswordHash(passwordHash.replace("131072", "1024")));
  await assert.rejects(hashAdminPassword(""));
});
test("required configuration, duplicate emails and invalid hashes fail closed", () => {
  for (const key of ["ADMIN_USERS_JSON", "ADMIN_SESSION_SECRET"]) {
    delete process.env[key];
    assert.equal(getAdminAuthConfig(), null);
    Object.assign(process.env, env);
  }
  for (const raw of [
    "[]",
    "invalid-json",
    JSON.stringify([accounts[0], accounts[0]]),
    JSON.stringify([{ ...accounts[0], passwordHash: "invalid" }]),
  ]) {
    process.env["ADMIN_USERS_JSON"] = raw;
    assert.equal(getAdminAuthConfig(), null);
  }
});
test("production requires HTTPS; local and production defaults use the intended origins", () => {
  process.env["NODE_ENV"] = "production";
  process.env["ADMIN_AUTH_ORIGIN"] = "http://localhost:5173";
  assert.equal(getAdminAuthConfig(), null);
  delete process.env["ADMIN_AUTH_ORIGIN"];
  assert.ok(getAdminAuthConfig()?.origin === "https://civil-craft.vercel.app");
  process.env["NODE_ENV"] = "development";
  assert.ok(getAdminAuthConfig()?.origin === "http://localhost:5173");
  for (const value of [
    "https://civilcraft.test/path",
    "https://user:pass@civilcraft.test",
    "http://remote.test",
  ]) {
    process.env["ADMIN_AUTH_ORIGIN"] = value;
    assert.equal(getAdminAuthConfig(), null);
  }
});
test("valid normalized credentials create a safe HttpOnly server session and allow protected pages", async () => {
  const response = await login("  STAFF@EXAMPLE.TEST  ");
  assert.equal(response.status, 200);
  const header = response.headers.get("set-cookie")!;
  assert.match(header, /HttpOnly/);
  assert.match(header, /Secure/);
  assert.match(header, /SameSite=Lax/);
  assert.match(header, /Path=\//);
  assert.match(header, /Max-Age=28800/);
  const raw = await response.text();
  assert.ok(!raw.includes(password));
  assert.ok(!raw.includes(passwordHash));
  assert.ok(!raw.includes("passwordHash"));
  assert.ok(!raw.includes(env.ADMIN_SESSION_SECRET));
  const token = header.split(";")[0]!;
  for (const path of ["/admin", "/admin/players", "/admin/settings", "/admin/integration"])
    assert.equal(await handleAdminRequest(request(path, { cookie: token })), null);
  const session = await handleAdminRequest(request("/api/auth/admin/session", { cookie: token }));
  assert.ok(session);
  const status = await session.json();
  assert.equal(status.authenticated, true);
  assert.equal(status.user.email, accounts[0]!.email);
  const payload = decodeJwt(token.slice(token.indexOf("=") + 1));
  assert.equal(payload.exp! - payload.iat!, 28800);
  assert.deepEqual(Object.keys(payload).sort(), ["aud", "exp", "iat", "iss", "jti", "sub"]);
  assert.ok(audit.some((s) => s.includes("admin_login")));
  assert.ok(!audit.join("").includes(password));
  assert.ok(!audit.join("").includes(passwordHash));
});
test("unknown email and incorrect password receive the same generic error and no cookie", async () => {
  const wrong = randomBytes(32).toString("base64url");
  const a = await login(accounts[0]!.email, wrong),
    b = await login("unknown@example.test", password);
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.equal(await a.text(), await b.text());
  assert.equal(a.headers.get("set-cookie"), null);
  assert.equal(b.headers.get("set-cookie"), null);
});
test("guests, forged cookies, query roles, and PlayFab sessions never unlock admin pages", async () => {
  for (const value of [
    "",
    "civilcraft.player=player-ticket",
    "__Host-civilcraft-admin-session=forged",
  ]) {
    for (const path of [
      "/admin?role=admin",
      "/admin/gallery",
      "/admin/players",
      "/admin/settings",
    ]) {
      const r = await handleAdminRequest(request(path, { cookie: value }));
      assert.equal(r?.status, 303);
      assert.equal(r?.headers.get("location"), "/admin/login");
    }
  }
  assert.equal(await handleAdminRequest(request("/login")), null);
  assert.equal(await handleAdminRequest(request("/signup")), null);
});
test("login requires POST, JSON, bounded input, same origin and a configured server", async () => {
  assert.equal((await handleAdminRequest(request("/api/auth/admin/login")))?.status, 405);
  assert.equal(
    (
      await handleAdminRequest(
        request("/api/auth/admin/login", {
          origin: "https://attacker.test",
          body: { email: accounts[0]!.email, password },
        }),
      )
    )?.status,
    403,
  );
  for (const body of [
    {},
    { email: [], password },
    { email: "invalid", password },
    { email: accounts[0]!.email, password: "x".repeat(9000) },
  ])
    assert.equal(
      (await handleAdminRequest(request("/api/auth/admin/login", { body })))?.status,
      400,
    );
  delete process.env["ADMIN_USERS_JSON"];
  const r = await login();
  assert.equal(r.status, 503);
  assert.ok((await r.text()).includes("not configured"));
});
test("best-effort instance throttling stops rapid account attempts", async () => {
  for (let i = 0; i < 5; i++) assert.equal((await login("unknown@example.test")).status, 401);
  const r = await login("unknown@example.test");
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get("retry-after")) > 0);
});
test("instance limiter is bounded across changing submitted emails", () => {
  const config = getAdminAuthConfig()!;
  for (let i = 0; i < 30; i++)
    assert.equal(limitLoginAttempts(config, "user" + i + "@example.test"), 0);
  assert.ok(limitLoginAttempts(config, "another@example.test") > 0);
});
test("fresh login issues another signed session; existing copies retain their finite lifetime", async () => {
  const first = await signedIn();
  const response = await login(accounts[0]!.email, password, first);
  const second = response.headers.get("set-cookie")!.split(";")[0]!;
  assert.notEqual(first, second);
  assert.equal((await readAdminSession(request("/admin", { cookie: first }))).authenticated, true);
  assert.equal((await readAdminSession(request("/admin", { cookie: second }))).authenticated, true);
});
test("logout clears only the browser admin cookie; copied tokens remain valid until expiry", async () => {
  const token = await signedIn();
  const r = await handleAdminRequest(
    request("/api/auth/admin/logout", {
      method: "POST",
      cookie: token + "; civilcraft.player=player-ticket",
    }),
  );
  assert.equal(r?.status, 200);
  const header = r?.headers.get("set-cookie") ?? "";
  assert.match(header, /Max-Age=0/);
  assert.ok(!header.includes("civilcraft.player"));
  assert.equal((await readAdminSession(request("/admin", { cookie: token }))).authenticated, true);
  assert.ok(audit.some((s) => s.includes("admin_logout")));
});
test("logout rejects GET and cross-site POST without revoking the session", async () => {
  const token = await signedIn();
  assert.equal(
    (await handleAdminRequest(request("/api/auth/admin/logout", { cookie: token })))?.status,
    405,
  );
  assert.equal(
    (
      await handleAdminRequest(
        request("/api/auth/admin/logout", {
          cookie: token,
          method: "POST",
          origin: "https://attacker.test",
        }),
      )
    )?.status,
    403,
  );
  assert.equal((await readAdminSession(request("/admin", { cookie: token }))).authenticated, true);
});
test("removing an account or changing its password revokes access immediately", async () => {
  const token = await signedIn();
  process.env["ADMIN_USERS_JSON"] = JSON.stringify([accounts[1]]);
  assert.equal((await readAdminSession(request("/admin", { cookie: token }))).authenticated, false);
  const nextHash = await hashAdminPassword(randomBytes(32).toString("base64url"));
  process.env["ADMIN_USERS_JSON"] = JSON.stringify([
    { ...accounts[0], passwordHash: nextHash },
    accounts[1],
  ]);
  assert.equal((await readAdminSession(request("/admin", { cookie: token }))).authenticated, false);
});
test("expired and tampered cookies fail closed", async () => {
  const token = await signedIn(),
    config = getAdminAuthConfig()!;
  const account = config.users[0]!;
  const signingKey = createHmac("sha256", config.sessionSecret)
    .update("civilcraft-admin:v3:session")
    .update(account.id)
    .update(account.passwordHash)
    .digest();
  const expired = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("civilcraft-admin:v3:session")
    .setAudience(config.origin)
    .setSubject(account.id)
    .setJti(randomBytes(16).toString("base64url"))
    .setIssuedAt(Math.floor(Date.now() / 1000) - 28801)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 1)
    .sign(signingKey);
  assert.equal(
    (await readAdminSession(request("/admin", { cookie: cookie(config, "session", expired, 1) })))
      .authenticated,
    false,
  );
  assert.equal(
    (await readAdminSession(request("/admin", { cookie: token + "corrupt" }))).authenticated,
    false,
  );
  assert.equal(
    (await readAdminSession(request("/admin", { cookie: token + "; " + token }))).authenticated,
    false,
  );
});
test("authentication works without external services; secret rotation invalidates every session", async () => {
  const token = await signedIn();
  assert.equal((await readAdminSession(request("/admin", { cookie: token }))).authenticated, true);
  process.env["ADMIN_SESSION_SECRET"] = randomBytes(32).toString("base64url");
  assert.equal((await readAdminSession(request("/admin", { cookie: token }))).authenticated, false);
});
test("removed identity-provider endpoints have no authentication effect", async () => {
  for (const path of ["/api/auth/admin/start", "/api/auth/admin/callback"])
    assert.equal((await handleAdminRequest(request(path)))?.status, 404);
});
