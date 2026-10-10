import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";
import { releaseRequest } from "../src/lib/cms/releases.server.ts";
import { apkStorage } from "../src/lib/cms/apk-storage.server.ts";
import { APK_CONTENT_TYPE, MAX_APK_BYTES } from "../src/lib/cms/apk.ts";
import { handlePlayFabAdminRequest } from "../src/lib/playfab/admin-api.server.ts";
import { getAdminAuthConfig } from "../src/lib/admin-auth/config.server.ts";
import { cookieName, issueAdminSession } from "../src/lib/admin-auth/session.server.ts";
import { hashAdminPassword } from "../src/lib/admin-auth/password.server.ts";

const origin = "https://apk-releases.test";
const passwordHash = await hashAdminPassword("apk-test-password");
const env = {
  ADMIN_AUTH_ORIGIN: origin,
  ADMIN_SESSION_SECRET: "apk-test-session-secret-at-least-32-bytes",
  ADMIN_USERS_JSON: JSON.stringify([
    { email: "editor@example.test", displayName: "Editor", passwordHash },
    { email: "other-editor@example.test", displayName: "Other Editor", passwordHash },
  ]),
  VITE_PLAYFAB_TITLE_ID: "17FA03",
  PLAYFAB_SECRET_KEY: "apk-test-playfab-secret",
  BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_apk-test-placeholder",
};
const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
const originalDateNow = Date.now;
const originalStorage = { ...apkStorage };
const uploadResult = {
  type: "blob.generate-presigned-url" as const,
  presignedUrlPayload: {
    delegationToken: "mock-delegation-token",
    signature: "mock-signature",
    params: {},
  },
};
type BlobFixture = { bytes: Buffer; size?: number; contentType?: string; etag?: string };
let records: Record<string, string> = {};
let blobs = new Map<string, BlobFixture>();
let storageReads: [string, number, number][] = [];
let uploadCalls = 0;

beforeEach(() => {
  Object.assign(process.env, env);
  records = {};
  blobs = new Map();
  storageReads = [];
  uploadCalls = 0;
  globalThis.fetch = async (_url, init) => {
    assert.match(
      String(_url),
      /\.playfabapi\.com\/Admin\/(GetTitleInternalData|SetTitleInternalData)$/,
    );
    const body = JSON.parse(String(init?.body));
    if (String(_url).endsWith("SetTitleInternalData")) records[body.Key] = body.Value;
    return Response.json({ code: 200, data: { Data: { ...records } } });
  };
  apkStorage.head = async (pathname) => {
    const blob = blobs.get(pathname);
    if (!blob) throw new Error("Object is missing.");
    return {
      pathname,
      size: blob.size ?? blob.bytes.length,
      contentType: blob.contentType ?? APK_CONTENT_TYPE,
      etag: blob.etag ?? "fixture-etag",
    };
  };
  apkStorage.readRange = async (pathname, start, end) => {
    const blob = blobs.get(pathname);
    assert.ok(blob, "Only prepared fixture paths may be read");
    storageReads.push([pathname, start, end]);
    return blob.bytes.subarray(start, end + 1);
  };
  apkStorage.upload = async () => {
    uploadCalls++;
    return uploadResult;
  };
  apkStorage.downloadUrl = async (pathname) => signedUrl(pathname);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  Date.now = originalDateNow;
  Object.assign(apkStorage, originalStorage);
});
after(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const base = {
  id: "r1",
  title: "Prototype",
  version: "0.1.0",
  build: "100",
  releaseDate: "2026-08-10",
  notes: "Existing private notes",
  published: false,
  status: "current",
  platform: "Android",
  fileName: "legacy.apk",
  fileSizeBytes: 123456,
  fileUrl: "https://legacy.test/game.apk",
  minAndroid: "9.0",
  minRequirements: ["4 GB RAM"],
  recommendedRequirements: [],
  downloads: 4,
};

/** An in-memory ZIP with compiled XML and a classes.dex entry. */
function apk(manifest = Buffer.from([3, 0, 8, 0, 8, 0, 0, 0])) {
  const entries = [
    { name: "AndroidManifest.xml", bytes: manifest },
    { name: "classes.dex", bytes: Buffer.from("dex\n035\0") },
  ];
  const localParts: Buffer[] = [];
  const directoryParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(entry.bytes.length, 18);
    local.writeUInt32LE(entry.bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, entry.bytes);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(entry.bytes.length, 20);
    central.writeUInt32LE(entry.bytes.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    directoryParts.push(central, name);
    offset += local.length + name.length + entry.bytes.length;
  }
  const directory = Buffer.concat(directoryParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, directory, end]);
}

async function admin(
  path = "/api/admin/releases",
  body?: unknown,
  options: { auth?: boolean; origin?: string; user?: number; cookie?: string } = {},
) {
  const config = getAdminAuthConfig()!;
  const headers: Record<string, string> = {
    origin: options.origin ?? origin,
    "Content-Type": "application/json",
  };
  if (options.auth !== false)
    headers["cookie"] =
      options.cookie ??
      cookieName(config) +
        "=" +
        (await issueAdminSession(config, config.users[options.user ?? 0]!));
  const response = await handlePlayFabAdminRequest(
    new Request(origin + path, {
      method: body === undefined ? "GET" : "POST",
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
  assert.ok(response, "The privileged API namespace must handle this request");
  return response;
}

async function publicRequest(path = "/api/releases", method = "GET") {
  const response = await releaseRequest(new Request(origin + path, { method }));
  assert.ok(response, "The release API must handle this request");
  return response;
}
const initialize = () => admin("/api/admin/releases", { action: "initialize", releases: [base] });
const publicData = async () => (await publicRequest()).json();
const adminData = async () => (await admin()).json();
const rawRelease = (id = base.id) => JSON.parse(records["civilcraft.website.v1.releases." + id]!);
const signedUrl = (pathname: string) =>
  "https://storage.test/" + encodeURIComponent(pathname) + "?signature=private-download";

type Prepared = { ticket: string; pathname: string; fileName: string; fileSizeBytes: number };
async function prepare(bytes: Buffer, releaseId = base.id, fileName = "Civil Craft.apk") {
  const response = await admin("/api/admin/releases/apk/prepare", {
    releaseId,
    fileName,
    fileSizeBytes: bytes.length,
  });
  assert.equal(response.status, 200, await response.clone().text());
  const prepared: Prepared = await response.json();
  assert.equal(typeof prepared.ticket, "string");
  assert.ok(prepared.ticket && prepared.pathname);
  assert.equal(prepared.fileSizeBytes, bytes.length);
  return prepared;
}
const finalize = (prepared: Prepared, options: Parameters<typeof admin>[2] = {}) =>
  admin("/api/admin/releases/apk/finalize", { ticket: prepared.ticket }, options);
const uploadBody = (prepared: Prepared, pathname = prepared.pathname) => ({
  type: "blob.generate-presigned-url",
  payload: { pathname, clientPayload: prepared.ticket, multipart: true },
});
async function attach(bytes = apk(), releaseId = base.id, fileName = "Civil Craft.apk") {
  const prepared = await prepare(bytes, releaseId, fileName);
  blobs.set(prepared.pathname, { bytes });
  const response = await finalize(prepared);
  assert.equal(response.status, 200, await response.clone().text());
  const data = await response.json();
  assert.equal(data.success, true);
  assert.equal(data.release.apkHosted, true);
  return prepared;
}

test("every upload endpoint requires a staff cookie and same-origin POST", async () => {
  for (const path of ["prepare", "upload", "finalize"]) {
    const endpoint = "/api/admin/releases/apk/" + path;
    assert.equal((await admin(endpoint, {}, { auth: false })).status, 401);
    assert.equal((await admin(endpoint, {}, { origin: "https://other.test" })).status, 403);
  }
  assert.equal(uploadCalls, 0);
  assert.deepEqual(records, {});
});

test("prepare rejects invalid filenames, sizes and missing releases without changing legacy downloads", async () => {
  assert.equal((await initialize()).status, 200);
  for (const change of [
    { fileName: "game.zip" },
    { fileName: "game.aab" },
    { fileName: "../game.apk" },
    { fileSizeBytes: 0 },
    { fileSizeBytes: 1.5 },
    { fileSizeBytes: MAX_APK_BYTES + 1 },
  ]) {
    const response = await admin("/api/admin/releases/apk/prepare", {
      releaseId: base.id,
      fileName: "game.apk",
      fileSizeBytes: apk().length,
      ...change,
    });
    assert.equal(response.status, 400);
  }
  assert.equal(
    (
      await admin("/api/admin/releases/apk/prepare", {
        releaseId: "missing",
        fileName: "game.apk",
        fileSizeBytes: apk().length,
      })
    ).status,
    404,
  );
  assert.equal((await publicData()).current.fileUrl, base.fileUrl);
  assert.equal(rawRelease().fileUrl, base.fileUrl);
});

test("upload delegation is bound to the prepared path and original staff account", async () => {
  await initialize();
  const prepared = await prepare(apk());
  const response = await admin("/api/admin/releases/apk/upload", uploadBody(prepared));
  assert.equal(response.status, 200, await response.clone().text());
  assert.deepEqual(await response.json(), uploadResult);
  assert.equal(uploadCalls, 1);
  for (const [body, options] of [
    [uploadBody(prepared, prepared.pathname + "-other"), {}],
    [uploadBody(prepared), { user: 1 }],
  ] as const) {
    const denied = await admin("/api/admin/releases/apk/upload", body, options);
    assert.ok(denied.status >= 400 && denied.status < 500);
  }
  assert.equal(uploadCalls, 1, "Invalid tickets must never reach storage authorization");
  assert.equal((await publicData()).current.fileUrl, base.fileUrl);
});

test("finalize verifies the private blob then returns stable URLs without exposing storage paths", async () => {
  await initialize();
  const prepared = await attach();
  assert.equal(prepared.fileName, "Civil-Craft.apk");
  const data = await publicData();
  const privateData = await adminData();
  assert.equal(data.current.apkHosted, true);
  assert.equal(data.current.fileUrl, "/api/releases/r1/download");
  assert.equal(data.current.fileName, prepared.fileName);
  assert.equal(data.current.fileSizeBytes, apk().length);
  assert.equal(data.current.notes, "");
  assert.equal(privateData.releases[0].apkHosted, true);
  assert.equal(privateData.releases[0].fileUrl, data.current.fileUrl);
  assert.ok(
    JSON.stringify(rawRelease()).includes(prepared.pathname),
    "Private storage metadata must be persisted server-side",
  );
  for (const value of [data, privateData]) {
    assert.ok(!JSON.stringify(value).includes(prepared.pathname));
    assert.doesNotMatch(JSON.stringify(value), /private-download|presignedUrl|pathname/);
  }
  assert.ok(
    storageReads.length > 0,
    "A file extension and blob metadata are insufficient validation",
  );
  const download = await publicRequest("/api/releases/r1/download");
  assert.equal(download.status, 307);
  assert.equal(download.headers.get("location"), signedUrl(prepared.pathname));
  assert.match(download.headers.get("cache-control") ?? "", /no-store/);
  const head = await publicRequest("/api/releases/r1/download", "HEAD");
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-type"), APK_CONTENT_TYPE);
  assert.equal(head.headers.get("content-length"), String(apk().length));
  assert.match(head.headers.get("content-disposition") ?? "", /Civil-Craft\.apk/);
  assert.equal(await head.text(), "");
});

test("invalid binary XML, object size and content type leave the old current APK untouched", async () => {
  await initialize();
  const before = { ...records };
  const invalidManifest = apk(Buffer.from("<manifest package='fake' />"));
  for (const fixture of [
    { bytes: invalidManifest },
    { bytes: apk(), size: apk().length + 1 },
    { bytes: apk(), size: MAX_APK_BYTES + 1 },
    { bytes: apk(), contentType: "text/plain" },
  ]) {
    const prepared = await prepare(fixture.bytes);
    blobs.set(prepared.pathname, fixture);
    const response = await finalize(prepared);
    assert.equal(response.status, 400, await response.clone().text());
    assert.deepEqual(records, before);
    assert.equal((await publicData()).current.fileUrl, base.fileUrl);
  }
});

test("tampered, expired and another editor's finalize tickets are rejected", async () => {
  await initialize();
  const bytes = apk();
  const prepared = await prepare(bytes);
  blobs.set(prepared.pathname, { bytes });
  const denied = await finalize(prepared, { user: 1 });
  assert.ok(denied.status >= 400 && denied.status < 500);
  const index = Math.floor(prepared.ticket.length / 2);
  const tampered =
    prepared.ticket.slice(0, index) +
    (prepared.ticket[index] === "a" ? "b" : "a") +
    prepared.ticket.slice(index + 1);
  const badSignature = await finalize({ ...prepared, ticket: tampered });
  assert.ok(badSignature.status >= 400 && badSignature.status < 500);
  const config = getAdminAuthConfig()!;
  const cookie = cookieName(config) + "=" + (await issueAdminSession(config, config.users[0]!));
  Date.now = () => originalDateNow() + 31 * 60 * 1000;
  const expired = await finalize(prepared, { cookie });
  assert.ok(expired.status >= 400 && expired.status < 500);
  Date.now = originalDateNow;
  assert.equal((await publicData()).current.fileUrl, base.fileUrl);
  assert.equal(rawRelease().fileUrl, base.fileUrl);
});

test("replacing an APK changes its private object while keeping its public download URL", async () => {
  await initialize();
  const first = await attach(apk(), base.id, "first.apk");
  const firstPublic = (await publicData()).current;
  const second = await attach(apk(), base.id, "second.apk");
  assert.notEqual(second.pathname, first.pathname);
  const secondPublic = (await publicData()).current;
  assert.equal(secondPublic.fileUrl, firstPublic.fileUrl);
  assert.equal(secondPublic.fileName, "second.apk");
  assert.equal(
    (await publicRequest("/api/releases/r1/download")).headers.get("location"),
    signedUrl(second.pathname),
  );
  assert.ok(JSON.stringify(rawRelease()).includes(second.pathname));
  assert.ok(!JSON.stringify(rawRelease()).includes(first.pathname));
});

test("an older pending upload cannot overwrite a newer finalized attachment", async () => {
  await initialize();
  const stale = await prepare(apk(), base.id, "stale.apk");
  blobs.set(stale.pathname, { bytes: apk() });
  const latest = await attach(apk(), base.id, "latest.apk");
  assert.equal((await finalize(stale)).status, 409);
  assert.equal((await publicData()).current.fileName, "latest.apk");
  assert.equal(
    (await publicRequest("/api/releases/r1/download")).headers.get("location"),
    signedUrl(latest.pathname),
  );
});

test("stale editor note saves retain hosted attachments and client-forged storage metadata is rejected", async () => {
  await initialize();
  const stale = (await adminData()).releases[0];
  const attached = await attach();
  const privateRecord = rawRelease();
  assert.equal(
    (
      await admin("/api/admin/releases", {
        action: "save",
        release: { ...stale, title: "Published update", notes: "Fresh notes", published: true },
      })
    ).status,
    200,
  );
  const saved = (await publicData()).current;
  assert.equal(saved.apkHosted, true);
  assert.equal(saved.fileName, attached.fileName);
  assert.equal(saved.fileSizeBytes, attached.fileSizeBytes);
  assert.equal(saved.fileUrl, "/api/releases/r1/download");
  assert.deepEqual(rawRelease().apk, privateRecord.apk);
  assert.equal((await publicData()).latest.notes, "Fresh notes");
  for (const forged of [null, { pathname: "private/someone-elses.apk", size: 42 }]) {
    const response = await admin("/api/admin/releases", {
      action: "save",
      release: { ...stale, apk: forged },
    });
    assert.equal(response.status, 400);
  }
  assert.equal((await publicData()).current.fileUrl, saved.fileUrl);
});

test("a save whose JSON body arrives after APK finalization preserves the newly attached APK", async () => {
  await initialize();
  const stale = (await adminData()).releases[0];
  const config = getAdminAuthConfig()!;
  const cookie = cookieName(config) + "=" + (await issueAdminSession(config, config.users[0]!));
  let bodyController!: ReadableStreamDefaultController<Uint8Array>;
  let markBodyRead!: () => void;
  const readingBody = new Promise<void>((resolve) => {
    markBodyRead = resolve;
  });
  const body = new ReadableStream<Uint8Array>(
    {
      start(controller) {
        bodyController = controller;
      },
      pull() {
        markBodyRead();
      },
    },
    { highWaterMark: 0 },
  );
  const requestInit = {
    method: "POST",
    headers: { origin, cookie, "Content-Type": "application/json" },
    body,
    duplex: "half",
  };
  const pendingSave = handlePlayFabAdminRequest(
    new Request(origin + "/api/admin/releases", requestInit),
  );
  await Promise.race([
    readingBody,
    pendingSave.then(() => {
      throw new Error("The save returned before reading its delayed JSON body");
    }),
  ]);
  assert.equal(rawRelease().fileUrl, base.fileUrl);
  let attached: Prepared;
  let attachedRecord: ReturnType<typeof rawRelease>;
  try {
    attached = await attach(apk(), base.id, "during-save.apk");
    attachedRecord = rawRelease();
  } finally {
    bodyController.enqueue(
      Buffer.from(
        JSON.stringify({
          action: "save",
          release: {
            ...stale,
            title: "Delayed update",
            notes: "Notes saved after the APK",
            published: true,
          },
        }),
      ),
    );
    bodyController.close();
  }
  const response = await pendingSave;
  assert.ok(response);
  assert.equal(response.status, 200, await response.clone().text());
  const saved = (await publicData()).current;
  assert.equal(saved.apkHosted, true);
  assert.equal(saved.fileName, attached.fileName);
  assert.equal(saved.fileSizeBytes, attached.fileSizeBytes);
  assert.equal(saved.fileUrl, "/api/releases/r1/download");
  assert.deepEqual(rawRelease().apk, attachedRecord.apk);
  assert.equal((await publicData()).latest.notes, "Notes saved after the APK");
  assert.equal(
    (await publicRequest("/api/releases/r1/download")).headers.get("location"),
    signedUrl(attached.pathname),
  );
});

test("public downloads expose only the configured current APK and never draft or archived attachments", async () => {
  await initialize();
  await attach();
  for (const id of ["draft-build", "archived-build"]) {
    assert.equal(
      (
        await admin("/api/admin/releases", {
          action: "save",
          release: { ...base, id, status: "draft", fileUrl: null },
        })
      ).status,
      200,
    );
    await attach(apk(), id, id + ".apk");
  }
  await admin("/api/admin/releases", { action: "current", id: "archived-build" });
  await admin("/api/admin/releases", { action: "current", id: base.id });
  for (const id of ["draft-build", "archived-build", "missing"]) {
    for (const method of ["GET", "HEAD"]) {
      const response = await publicRequest("/api/releases/" + id + "/download", method);
      assert.equal(response.status, 404);
      assert.equal(response.headers.get("location"), null);
      const text = await response.text();
      assert.doesNotMatch(text, /private-download|pathname|private\/|Existing private notes/);
    }
  }
  const data = await publicData();
  assert.equal(data.current.id, base.id);
  assert.equal(data.latest, null);
});

test("staff can preview a draft APK through the admin download route while public access stays closed", async () => {
  await initialize();
  const id = "preview-draft";
  assert.equal(
    (
      await admin("/api/admin/releases", {
        action: "save",
        release: { ...base, id, status: "draft", fileUrl: null },
      })
    ).status,
    200,
  );
  const attached = await attach(apk(), id, "preview.apk");
  let signedDownloads = 0;
  apkStorage.downloadUrl = async (pathname) => {
    signedDownloads++;
    return signedUrl(pathname);
  };
  const path = `/api/admin/releases/${id}/download`;
  for (const options of [{ auth: false }, { cookie: "invalid-session-cookie" }]) {
    const denied = await admin(path, undefined, options);
    assert.equal(denied.status, 401);
    assert.equal(denied.headers.get("location"), null);
  }
  assert.equal(
    signedDownloads,
    0,
    "Unauthorized requests must never generate a download signature",
  );
  for (const user of [0, 1]) {
    const preview = await admin(path, undefined, { user });
    assert.equal(preview.status, 307);
    assert.equal(preview.headers.get("location"), signedUrl(attached.pathname));
    assert.match(preview.headers.get("cache-control") ?? "", /no-store/);
  }
  assert.equal(signedDownloads, 2);
  const publicDownload = await publicRequest(`/api/releases/${id}/download`);
  assert.equal(publicDownload.status, 404);
  assert.equal(publicDownload.headers.get("location"), null);
  assert.equal(signedDownloads, 2);
  const data = await publicData();
  assert.equal(data.current.id, base.id);
  assert.equal(data.latest, null);
  assert.equal(
    (await adminData()).releases.find((release: { id: string }) => release.id === id).status,
    "draft",
  );
});

test("making a release current requires a verified APK or a non-empty legacy download URL", async () => {
  await initialize();
  for (const [index, fileUrl] of [null, "", "   "].entries()) {
    const id = `without-apk-${index}`;
    assert.equal(
      (
        await admin("/api/admin/releases", {
          action: "save",
          release: {
            ...base,
            id,
            status: "draft",
            fileUrl,
            fileName: "unverified.apk",
            fileSizeBytes: 100,
          },
        })
      ).status,
      200,
    );
    const before = { ...records };
    const rejected = await admin("/api/admin/releases", { action: "current", id });
    assert.equal(rejected.status, 400);
    assert.deepEqual(records, before);
    assert.equal((await publicData()).current.id, base.id);
  }
  const legacyId = "legacy-download";
  await admin("/api/admin/releases", {
    action: "save",
    release: { ...base, id: legacyId, status: "draft" },
  });
  assert.equal(
    (await admin("/api/admin/releases", { action: "current", id: legacyId })).status,
    200,
  );
  assert.equal((await publicData()).current.fileUrl, base.fileUrl);
  const hostedId = "verified-download";
  await admin("/api/admin/releases", {
    action: "save",
    release: { ...base, id: hostedId, status: "draft", fileUrl: null },
  });
  await attach(apk(), hostedId, "verified.apk");
  assert.equal(
    (await admin("/api/admin/releases", { action: "current", id: hostedId })).status,
    200,
  );
  const current = (await publicData()).current;
  assert.equal(current.id, hostedId);
  assert.equal(current.apkHosted, true);
  assert.equal(current.fileUrl, `/api/releases/${hostedId}/download`);
});

test("failed storage verification reports an error without replacing the existing legacy link", async () => {
  await initialize();
  const prepared = await prepare(apk());
  apkStorage.head = async () => {
    throw new Error("private-provider-token-do-not-expose");
  };
  const response = await finalize(prepared);
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /private-provider-token-do-not-expose/);
  assert.equal((await publicData()).current.fileUrl, base.fileUrl);
  assert.equal(rawRelease().fileUrl, base.fileUrl);
});
