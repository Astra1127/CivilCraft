import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { releaseRequest } from "../src/lib/cms/releases.server.ts";
import { handlePlayFabAdminRequest } from "../src/lib/playfab/admin-api.server.ts";
import { getAdminAuthConfig } from "../src/lib/admin-auth/config.server.ts";
import { cookieName, issueAdminSession } from "../src/lib/admin-auth/session.server.ts";
import { hashAdminPassword } from "../src/lib/admin-auth/password.server.ts";

const origin = "https://releases.test";
const env = {
  ADMIN_AUTH_ORIGIN: origin,
  ADMIN_SESSION_SECRET: "release-test-session-secret-at-least-32-bytes",
  ADMIN_USERS_JSON: JSON.stringify([
    {
      email: "editor@example.test",
      displayName: "Editor",
      passwordHash: await hashAdminPassword("release-test-password"),
    },
  ]),
  VITE_PLAYFAB_TITLE_ID: "17FA03",
  PLAYFAB_SECRET_KEY: "release-test-secret",
};
const previous = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
const originalFetch = globalThis.fetch;
let records: Record<string, string> = {};
beforeEach(() => {
  Object.assign(process.env, env);
  records = {};
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    if (String(_url).endsWith("SetTitleInternalData")) records[body.Key] = body.Value;
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
const base = {
  id: "r1",
  title: "Prototype",
  version: "0.1.0",
  build: "100",
  releaseDate: "2026-08-10",
  notes: "Existing notes",
  status: "current",
  platform: "Android",
  fileName: "game.apk",
  fileSizeBytes: 123456,
  fileUrl: "https://example.test/game.apk",
  minAndroid: "9.0",
  minRequirements: ["4 GB RAM"],
  recommendedRequirements: [],
  downloads: 4,
};
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
    new Request(origin + "/api/admin/releases", {
      method: body === undefined ? "GET" : "POST",
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  ))!;
}
async function publicRead() {
  return (await releaseRequest(new Request(origin + "/api/releases")))!;
}
const initialize = () => admin({ action: "initialize", releases: [base] });
test("import preserves APK and current selection, keeps old notes private and is idempotent", async () => {
  assert.equal((await initialize()).status, 200);
  const data = await (await publicRead()).json();
  assert.equal(data.current.fileUrl, base.fileUrl);
  assert.equal(data.current.id, base.id);
  assert.equal(data.current.notes, "");
  assert.equal(data.latest, null);
  assert.equal((await (await admin()).json()).releases[0].notes, base.notes);
  await admin({ action: "initialize", releases: [{ ...base, version: "overwritten" }] });
  assert.equal((await (await admin()).json()).releases[0].version, base.version);
});
test("create draft, edit, publish and unpublish independently of current APK", async () => {
  await initialize();
  const post = {
    ...base,
    id: "new-post",
    title: "Bridge improvements",
    version: "0.2.0",
    build: "200",
    releaseDate: "2026-09-20",
    notes: "Improved bridge loads",
    status: "draft",
    published: false,
    fileUrl: null,
  };
  assert.equal((await admin({ action: "save", release: post })).status, 200);
  assert.equal((await (await publicRead()).json()).latest, null);
  await admin({ action: "save", release: { ...post, published: true } });
  for (let refresh = 0; refresh < 2; refresh++) {
    const data = await (await publicRead()).json();
    assert.deepEqual(data.latest, {
      id: post.id,
      title: post.title,
      version: post.version,
      build: post.build,
      releaseDate: post.releaseDate,
      notes: post.notes,
    });
    assert.equal(data.current.id, base.id);
    assert.equal(data.current.fileUrl, base.fileUrl);
  }
  await admin({ action: "save", release: { ...post, published: true, notes: "Edited notes" } });
  assert.equal((await (await publicRead()).json()).latest.notes, "Edited notes");
  await admin({ action: "save", release: post });
  assert.equal((await (await publicRead()).json()).latest, null);
});
test("latest published selection uses date, ignores newer drafts and stores version only on release", async () => {
  await initialize();
  await admin({ action: "save", release: { ...base, published: true } });
  await admin({
    action: "save",
    release: { ...base, id: "older", published: true, releaseDate: "2025-01-01" },
  });
  await admin({
    action: "save",
    release: { ...base, id: "draft", published: false, releaseDate: "2026-09-20" },
  });
  assert.equal((await (await publicRead()).json()).latest.id, base.id);
  assert.equal(Object.keys(records).filter((k) => k.includes("releases.")).length, 3);
  assert.deepEqual(JSON.parse(records["civilcraft.website.v1.release-config"]!), {
    currentId: base.id,
  });
});
test("changing current build does not publish it or change latest post", async () => {
  await initialize();
  await admin({ action: "save", release: { ...base, published: true } });
  await admin({ action: "save", release: { ...base, id: "next", published: false } });
  await admin({ action: "current", id: "next" });
  const data = await (await publicRead()).json();
  assert.equal(data.current.id, "next");
  assert.equal(data.latest.id, base.id);
});
test("invalid publication and dates fail; anonymous and cross-origin writes are rejected", async () => {
  assert.equal((await admin(undefined, false)).status, 401);
  assert.equal(
    (await admin({ action: "initialize", releases: [base] }, true, "https://other.test")).status,
    403,
  );
  await initialize();
  for (const release of [
    { ...base, published: true, title: "" },
    { ...base, published: true, notes: "" },
    { ...base, releaseDate: "2026-02-30" },
  ])
    assert.equal((await admin({ action: "save", release })).status, 400);
  assert.equal(
    (await releaseRequest(new Request(origin + "/api/releases", { method: "POST" })))!.status,
    405,
  );
});
test("backend failures remain errors instead of publishing unsaved state", async () => {
  globalThis.fetch = async () => {
    throw new Error("release-test-secret");
  };
  const response = await publicRead();
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /release-test-secret/);
});
