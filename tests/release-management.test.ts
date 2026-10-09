import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { handlePlayFabAdminRequest } from "../src/lib/playfab/admin-api.server.ts";
import { releaseRequest } from "../src/lib/cms/releases.server.ts";
import { getAdminAuthConfig } from "../src/lib/admin-auth/config.server.ts";
import { issueAdminSession, cookieName } from "../src/lib/admin-auth/session.server.ts";
import { hashAdminPassword } from "../src/lib/admin-auth/password.server.ts";

const origin = "https://release-management.test";
const keys = [
  "ADMIN_AUTH_ORIGIN",
  "ADMIN_SESSION_SECRET",
  "ADMIN_USERS_JSON",
  "VITE_PLAYFAB_TITLE_ID",
  "PLAYFAB_SECRET_KEY",
  "PLAYFAB_RELEASE_EMAIL_TEMPLATE_ID",
  "GMAIL_SMTP_USER",
  "GMAIL_SMTP_APP_PASSWORD",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_PASS",
  "BLOB_STORE_ID",
  "VERCEL_OIDC_TOKEN",
  "CRON_SECRET",
];
const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
const env = {
  ADMIN_AUTH_ORIGIN: origin,
  ADMIN_SESSION_SECRET: "release-management-test-secret-at-least-32-chars",
  ADMIN_USERS_JSON: JSON.stringify([
    {
      email: "staff@example.test",
      displayName: "Staff",
      passwordHash: await hashAdminPassword("test-only-password"),
    },
  ]),
  VITE_PLAYFAB_TITLE_ID: "17FA03",
  PLAYFAB_SECRET_KEY: "release-management-test-canary",
};
const originalFetch = globalThis.fetch;
let records: Record<string, string>;
let failWrite = false;
let failConfigWrite = false;
const release = {
  id: "active",
  title: "Current release",
  version: "1.0.0",
  build: "1",
  notes: "Published notes",
  published: true,
  releaseDate: "2026-10-01",
  status: "current",
  platform: "Android",
  minAndroid: "8.0",
  fileName: "game.apk",
  fileSizeBytes: 10,
  fileUrl: "https://example.test/game.apk",
  minRequirements: [],
  recommendedRequirements: [],
  downloads: 0,
};
const configKey = "civilcraft.website.v1.release-config";
const prefix = "civilcraft.website.v1.releases.";
beforeEach(() => {
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, env);
  records = {
    [configKey]: JSON.stringify({ currentId: "active" }),
    [prefix + "active"]: JSON.stringify(release),
    [prefix + "draft"]: JSON.stringify({
      ...release,
      id: "draft",
      status: "draft",
      published: false,
    }),
    [prefix + "backup"]: JSON.stringify({
      ...release,
      id: "backup",
      status: "archived",
      version: "0.9.0",
    }),
  };
  failWrite = false;
  failConfigWrite = false;
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/Admin\/(GetTitleInternalData|SetTitleInternalData)$/);
    const body = JSON.parse(String(init?.body));
    if (String(url).endsWith("SetTitleInternalData")) {
      if (failWrite || (failConfigWrite && body.Key === configKey))
        return Response.json({ code: 503 }, { status: 503 });
      records[body.Key] = body.Value;
    }
    return Response.json({ code: 200, data: { Data: { ...records } } });
  };
});
after(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
async function admin(body?: unknown, auth = true, trustedOrigin = origin) {
  const config = getAdminAuthConfig()!;
  const headers = new Headers({ origin: trustedOrigin, "Content-Type": "application/json" });
  if (auth)
    headers.set(
      "cookie",
      cookieName(config) + "=" + (await issueAdminSession(config, config.users[0]!)),
    );
  return (await handlePlayFabAdminRequest(
    new Request(origin + "/api/admin/releases", {
      method: body === undefined ? "GET" : "POST",
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  ))!;
}
async function publicData() {
  return (await releaseRequest(new Request(origin + "/api/releases")))!.json();
}

test("delete drafts and published backups without changing the current build or removing APK metadata", async () => {
  const active = records[prefix + "active"];
  for (const id of ["draft", "backup"]) {
    const original = records[prefix + id];
    assert.equal((await admin({ action: "delete", id })).status, 200);
    assert.equal(records[prefix + id], original);
    assert.ok(records["civilcraft.website.v1.release-deleted." + id]);
    assert.equal((await admin({ action: "delete", id })).status, 200);
  }
  const state = await (await admin()).json();
  assert.deepEqual(
    state.releases.map((r: { id: string }) => r.id),
    ["active"],
  );
  assert.equal(records[prefix + "active"], active);
  assert.equal((await publicData()).current.id, "active");
  assert.equal((await publicData()).latest.id, "active");
});
test("active, missing, anonymous, invalid-ID, and cross-origin deletions fail safely", async () => {
  const before = { ...records };
  assert.equal((await admin({ action: "delete", id: "active" })).status, 409);
  assert.equal((await admin({ action: "delete", id: "missing" })).status, 404);
  assert.equal((await admin({ action: "delete", id: "../active" })).status, 400);
  assert.equal((await admin({ action: "delete", id: "backup" }, false)).status, 401);
  assert.equal(
    (await admin({ action: "delete", id: "backup" }, true, "https://forged.test")).status,
    403,
  );
  assert.deepEqual(records, before);
});
test("permanent tombstones block stale saves, activation, and uploads from resurrecting a deleted release", async () => {
  const stale = JSON.parse(records[prefix + "backup"]!);
  await admin({ action: "delete", id: "backup" });
  assert.equal((await admin({ action: "save", release: stale })).status, 409);
  assert.equal((await admin({ action: "current", id: "backup" })).status, 404);
  // Even a concurrently accepted older writer cannot make the record visible.
  records[prefix + "backup"] = JSON.stringify({ ...stale, version: "stale-writer" });
  assert.ok(
    !(await (await admin()).json()).releases.some((r: { id: string }) => r.id === "backup"),
  );
  const config = getAdminAuthConfig()!;
  const response = await handlePlayFabAdminRequest(
    new Request(origin + "/api/admin/releases/apk/prepare", {
      method: "POST",
      headers: {
        origin,
        "Content-Type": "application/json",
        cookie: cookieName(config) + "=" + (await issueAdminSession(config, config.users[0]!)),
      },
      body: JSON.stringify({ releaseId: "backup", fileName: "game.apk", fileSizeBytes: 10 }),
    }),
  );
  assert.equal(response!.status, 404);
});
test("deletion failure is not success and preserves public content", async () => {
  failWrite = true;
  assert.equal((await admin({ action: "delete", id: "backup" })).status, 503);
  assert.equal((await (await admin()).json()).releases.length, 3);
  assert.equal((await publicData()).current.id, "active");
});
test("delete rechecks the active pointer after the request body finishes", async () => {
  const config = getAdminAuthConfig()!;
  const requestInit = {
    method: "POST",
    headers: {
      origin,
      "Content-Type": "application/json",
      cookie: cookieName(config) + "=" + (await issueAdminSession(config, config.users[0]!)),
    },
    body: new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          records[configKey] = JSON.stringify({ currentId: "backup" });
          controller.enqueue(Buffer.from(JSON.stringify({ action: "delete", id: "backup" })));
          controller.close();
        },
      },
      { highWaterMark: 0 },
    ),
    duplex: "half",
  };
  const request = new Request(origin + "/api/admin/releases", requestInit);
  assert.equal((await handlePlayFabAdminRequest(request))!.status, 409);
  assert.equal(records["civilcraft.website.v1.release-deleted.backup"], undefined);
});

test("changing the public version atomically stores its announcement with activation, without exposing the event publicly", async () => {
  const response = await admin({ action: "current", id: "backup" });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.success, true);
  assert.equal(result.notification.status, "not-configured");
  const config = JSON.parse(records[configKey]!);
  assert.equal(config.currentId, "backup");
  assert.equal(config.notification.releaseId, "backup");
  assert.equal(config.notification.version, "0.9.0");
  assert.match(config.notification.id, /^[a-f0-9]{64}$/);
  assert.equal((await publicData()).notification, undefined);
  const before = records[configKey];
  assert.equal(
    (await (await admin({ action: "current", id: "backup" })).json()).notification.status,
    "unchanged",
  );
  assert.equal(records[configKey], before);
});
test("drafts, notes, same-version selection and build-only edits never create a version announcement", async () => {
  await admin({ action: "save", release: { ...release, notes: "New notes" } });
  await admin({ action: "save", release: { ...release, build: "2" } });
  await admin({
    action: "save",
    release: { ...release, id: "unpublished", version: "2.0.0", published: false },
  });
  assert.deepEqual(JSON.parse(records[configKey]!), { currentId: "active" });
  const response = await admin({ action: "current", id: "draft" });
  assert.equal((await response.json()).notification.status, "unchanged");
  assert.deepEqual(JSON.parse(records[configKey]!), { currentId: "draft" });
});
test("active version edits queue once and same-version build or target changes retain the original event identity", async () => {
  const updated = { ...release, version: "1.1.0" };
  const response = await admin({ action: "save", release: updated });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).notification.status, "not-configured");
  const first = JSON.parse(records[configKey]!).notification;
  await admin({ action: "save", release: { ...updated, build: "2" } });
  const buildChanged = JSON.parse(records[configKey]!).notification;
  assert.equal(buildChanged.id, first.id);
  assert.equal(buildChanged.announcedAtISO, first.announcedAtISO);
  assert.equal(buildChanged.build, "2");
  await admin({ action: "save", release: { ...updated, id: "same-version", build: "3" } });
  const switched = await admin({ action: "current", id: "same-version" });
  assert.equal((await switched.json()).notification.status, "unchanged");
  const targetChanged = JSON.parse(records[configKey]!).notification;
  assert.equal(targetChanged.id, first.id);
  assert.equal(targetChanged.announcedAtISO, first.announcedAtISO);
  assert.equal(targetChanged.releaseId, "same-version");
  assert.equal(targetChanged.build, "3");
});
test("failed email queue persistence does not falsely report that a committed active-version save failed", async () => {
  failConfigWrite = true;
  const response = await admin({ action: "save", release: { ...release, version: "1.1.0" } });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.success, true);
  assert.equal(result.notification.status, "not-configured");
  assert.match(result.notification.message, /Build saved/);
  assert.equal((await publicData()).current.version, "1.1.0");
  assert.equal(JSON.parse(records[configKey]!).notification, undefined);
});
