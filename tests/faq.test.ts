import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { faqRequest } from "../src/lib/cms/faq.server.ts";
import { handlePlayFabAdminRequest } from "../src/lib/playfab/admin-api.server.ts";
import { getAdminAuthConfig } from "../src/lib/admin-auth/config.server.ts";
import { cookieName, issueAdminSession } from "../src/lib/admin-auth/session.server.ts";
import { hashAdminPassword } from "../src/lib/admin-auth/password.server.ts";

const origin = "https://faq.test";
const env = {
  ADMIN_AUTH_ORIGIN: origin,
  ADMIN_SESSION_SECRET: "faq-test-session-secret-at-least-32-bytes",
  ADMIN_USERS_JSON: JSON.stringify([
    {
      email: "editor@example.test",
      displayName: "Editor",
      passwordHash: await hashAdminPassword("faq-test-password"),
    },
  ]),
  VITE_PLAYFAB_TITLE_ID: "17FA03",
  PLAYFAB_SECRET_KEY: "faq-test-secret",
};
const previous = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
const originalFetch = globalThis.fetch;
let records: Record<string, string> = {};

beforeEach(() => {
  Object.assign(process.env, env);
  records = {};
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    if (String(_url).endsWith("SetTitleInternalData")) {
      if (body.Value === null) {
        delete records[body.Key];
      } else {
        records[body.Key] = body.Value;
      }
    }
    return Response.json({ code: 200, data: { Data: { ...records } } });
  };
});

after(() => {
  globalThis.fetch = originalFetch;
  for (const [k, v] of Object.entries(previous)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

async function cookie() {
  const config = getAdminAuthConfig()!;
  return cookieName(config) + "=" + (await issueAdminSession(config, config.users[0]!));
}

async function admin(body?: unknown, auth = true, requestOrigin = origin) {
  const headers: Record<string, string> = { origin: requestOrigin };
  if (auth) headers["cookie"] = await cookie();
  if (body) headers["content-type"] = "application/json";
  return (await handlePlayFabAdminRequest(
    new Request(origin + "/api/admin/faq", {
      method: body ? "POST" : "GET",
      headers,
      body: body ? JSON.stringify(body) : null,
    }),
  ))!;
}

const publicRead = () => faqRequest(new Request(origin + "/api/faq"));

test("public read returns default seed FAQ when Title Internal Data is empty", async () => {
  const res = (await publicRead())!;
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data));
  assert.ok(data.length >= 6);
  assert.ok(data.every((f: { published: boolean }) => f.published));
});

test("admin can add, update, reorder and delete FAQ entries, and public read reflects changes", async () => {
  // 1. Add new FAQ item
  const newFaq = {
    id: "custom-1",
    question: "How do I build a cantilever bridge?",
    answer: "Anchor both sides securely and build outward using trusses.",
    category: "Gameplay",
    order: 1,
    published: true,
  };
  const addRes = await admin({ action: "save", entry: newFaq });
  assert.equal(addRes.status, 200);

  // 2. Read publicly
  const publicData1 = await (await publicRead())!.json();
  const found = publicData1.find((f: { id: string }) => f.id === "custom-1");
  assert.ok(found);
  assert.equal(found.question, "How do I build a cantilever bridge?");

  // 3. Edit the FAQ item (change question, answer, category, unpublish)
  const editedFaq = {
    ...newFaq,
    question: "How do I construct a suspension bridge?",
    answer: "Erect main towers, anchor cables, and suspend the deck.",
    published: false,
  };
  const editRes = await admin({ action: "save", entry: editedFaq });
  assert.equal(editRes.status, 200);

  // Public read should NOT include unpublished item
  const publicData2 = await (await publicRead())!.json();
  assert.ok(!publicData2.some((f: { id: string }) => f.id === "custom-1"));

  // Admin read SHOULD include unpublished item
  const adminData = await (await admin())!.json();
  const adminFound = adminData.find((f: { id: string }) => f.id === "custom-1");
  assert.ok(adminFound);
  assert.equal(adminFound.question, "How do I construct a suspension bridge?");
  assert.equal(adminFound.published, false);

  // 4. Reorder
  const reorderRes = await admin({
    action: "reorder",
    orders: [{ id: "custom-1", order: 99 }],
  });
  assert.equal(reorderRes.status, 200);
  const reorderedData = await (await admin())!.json();
  assert.equal(reorderedData.find((f: { id: string }) => f.id === "custom-1").order, 99);

  // 5. Delete FAQ item
  const deleteRes = await admin({ action: "delete", id: "custom-1" });
  assert.equal(deleteRes.status, 200);
  const afterDelete = await (await admin())!.json();
  assert.ok(!afterDelete.some((f: { id: string }) => f.id === "custom-1"));
});

test("FAQ admin endpoints reject unauthenticated and cross-origin calls", async () => {
  const unauth = await admin(undefined, false);
  assert.equal(unauth.status, 401);

  const crossOrigin = await admin({ action: "delete", id: "f1" }, true, "https://evil.test");
  assert.equal(crossOrigin.status, 403);
});

