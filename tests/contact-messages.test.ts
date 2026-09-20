import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { messageRequest } from "../src/lib/cms/messages.server.ts";
import { handlePlayFabAdminRequest } from "../src/lib/playfab/admin-api.server.ts";
import { getAdminAuthConfig } from "../src/lib/admin-auth/config.server.ts";
import { cookieName, issueAdminSession } from "../src/lib/admin-auth/session.server.ts";
import { hashAdminPassword } from "../src/lib/admin-auth/password.server.ts";

const origin = "https://contact.test";
const env = {
  ADMIN_AUTH_ORIGIN: origin,
  ADMIN_SESSION_SECRET: "contact-test-only-session-secret-at-least-32-bytes",
  ADMIN_USERS_JSON: JSON.stringify([
    {
      email: "editor@example.test",
      displayName: "Editor",
      passwordHash: await hashAdminPassword("test-only-password"),
    },
  ]),
  VITE_PLAYFAB_TITLE_ID: "17FA03",
  PLAYFAB_SECRET_KEY: "contact-test-secret-canary",
};
const previous = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
const originalFetch = globalThis.fetch;
let storage: Record<string, string> = {};
let calls = 0;
beforeEach(() => {
  Object.assign(process.env, env);
  storage = {};
  calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.match(String(url), /^https:\/\/17FA03\.playfabapi\.com\/Admin\//);
    assert.equal(new Headers(init?.headers).get("X-SecretKey"), env.PLAYFAB_SECRET_KEY);
    const body = JSON.parse(String(init?.body));
    if (String(url).endsWith("SetTitleInternalData")) {
      if (body.Value === null) delete storage[body.Key];
      else storage[body.Key] = body.Value;
    }
    return Response.json({ code: 200, data: { Data: { ...storage } } });
  };
});
after(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
const input = {
  name: "Contact Tester",
  email: "contact@example.test",
  subject: "Persistence check",
  inquiryType: "General",
  message: "A new contact message for the administrator.",
};
function submit(body: unknown = input, requestOrigin = origin) {
  return messageRequest(
    new Request(origin + "/api/contact", {
      method: "POST",
      headers: { origin: requestOrigin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}
async function admin(body?: unknown, auth = true, requestOrigin = origin) {
  const config = getAdminAuthConfig()!;
  const headers: Record<string, string> = {
    origin: requestOrigin,
    "Content-Type": "application/json",
  };
  if (auth)
    headers["cookie"] =
      cookieName(config) + "=" + (await issueAdminSession(config, config.users[0]!));
  return (await handlePlayFabAdminRequest(
    new Request(origin + "/api/admin/messages", {
      method: body === undefined ? "GET" : "POST",
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  ))!;
}

test("public submission persists centrally and fresh admin requests retrieve it without browser state", async () => {
  const response = (await submit())!;
  assert.equal(response.status, 201);
  const { id } = await response.json();
  assert.equal(
    Object.keys(storage).filter((k) => k.startsWith("civilcraft.website.v1.messages.")).length,
    1,
  );
  for (let refresh = 0; refresh < 2; refresh++) {
    const inbox = await admin();
    assert.equal(inbox.status, 200);
    assert.equal(inbox.headers.get("cache-control"), "no-store, private");
    const { messages } = await inbox.json();
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0], {
      ...input,
      ownerId: null,
      replies: [],
      notificationStatus: "not_configured",
      id,
      status: "New",
      createdAt: messages[0].createdAt,
    });
    assert.ok(Number.isFinite(Date.parse(messages[0].createdAt)));
  }
});
test("status updates and deletion survive fresh retrieval", async () => {
  const { id } = await (await submit())!.json();
  assert.equal((await admin({ action: "status", id, status: "Resolved" })).status, 200);
  assert.equal((await (await admin()).json()).messages[0].status, "Resolved");
  assert.equal((await admin({ action: "delete", id })).status, 200);
  assert.deepEqual((await (await admin()).json()).messages, []);
  assert.equal((await admin({ action: "status", id, status: "New" })).status, 404);
});
test("guest reads and writes and cross-origin submissions are rejected before storage access", async () => {
  assert.equal((await admin(undefined, false)).status, 401);
  assert.equal((await admin({ action: "delete" }, false)).status, 401);
  assert.equal((await admin({ action: "delete" }, true, "https://other.test")).status, 403);
  assert.equal((await submit(input, "https://other.test"))!.status, 403);
  assert.equal((await messageRequest(new Request(origin + "/api/contact")))!.status, 405);
  assert.equal(calls, 0);
});
test("invalid fields, inquiry types and oversized requests never persist", async () => {
  for (const body of [
    { ...input, email: "invalid" },
    { ...input, inquiryType: "Invented" },
    { ...input, message: "short" },
  ])
    assert.equal((await submit(body))!.status, 400);
  assert.equal((await submit({ ...input, message: "a".repeat(9000) }))!.status, 413);
  assert.equal(calls, 0);
});
test("client cannot choose stored id, status, or creation timestamp", async () => {
  const response = (await submit({
    ...input,
    id: "m1",
    status: "Resolved",
    createdAt: "yesterday",
  }))!;
  assert.equal(response.status, 201);
  const messages = (await (await admin()).json()).messages;
  assert.notEqual(messages[0].id, "m1");
  assert.equal(messages[0].status, "New");
  assert.notEqual(messages[0].createdAt, "yesterday");
});
test("concurrent submissions use separate keys and do not overwrite one another", async () => {
  const responses = await Promise.all(
    Array.from({ length: 5 }, (_, i) => submit({ ...input, subject: `Message ${i}` })),
  );
  assert.ok(responses.every((r) => r?.status === 201));
  assert.equal((await (await admin()).json()).messages.length, 5);
});
test("provider failure is an error, never a false success or leaked secret", async () => {
  globalThis.fetch = async () => {
    throw new Error(env.PLAYFAB_SECRET_KEY);
  };
  const response = (await submit())!;
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /contact-test-secret-canary/);
  assert.deepEqual(storage, {});
  assert.equal((await admin()).status, 503);
});
test("empty central storage shows no browser-local sample data", async () => {
  assert.deepEqual((await (await admin()).json()).messages, []);
});
