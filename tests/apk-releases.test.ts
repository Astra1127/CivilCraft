import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";
import { releaseRequest } from "../src/lib/cms/releases.server.ts";
import { apkStorage } from "../src/lib/cms/apk-storage.server.ts";
import { githubApkStorage } from "../src/lib/cms/github-apk.server.ts";
import {
  githubApkUploads,
  readGithubApkUploadTicket,
} from "../src/lib/cms/github-apk-upload.server.ts";
import { releaseWriteLock } from "../src/lib/cms/release-write-lock.server.ts";
import { releaseDownloadStats } from "../src/lib/cms/release-download-stats.server.ts";
import { APK_CONTENT_TYPE, MAX_APK_BYTES } from "../src/lib/cms/apk.ts";
import { handlePlayFabAdminRequest } from "../src/lib/playfab/admin-api.server.ts";
import { getAdminAuthConfig } from "../src/lib/admin-auth/config.server.ts";
import { cookieName, issueAdminSession } from "../src/lib/admin-auth/session.server.ts";
import { hashAdminPassword } from "../src/lib/admin-auth/password.server.ts";
import { AdminApiError } from "../src/lib/playfab/admin-client.server.ts";

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
const originalGithubVerify = githubApkStorage.verifyDownload;
const originalGithubUrl = githubApkStorage.downloadUrl;
const originalGithubUploads = { ...githubApkUploads };
const originalGithubEnv = {
  token: process.env["GITHUB_APK_TOKEN"],
  control: process.env["GITHUB_APK_CONTROL_RELEASE_ID"],
};
const originalLock = releaseWriteLock.run;
const originalDownloadRecord = releaseDownloadStats.record;
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
  delete process.env["GITHUB_APK_TOKEN"];
  delete process.env["GITHUB_APK_CONTROL_RELEASE_ID"];
  releaseWriteLock.run = async (task) => task();
  releaseDownloadStats.record = async () => undefined;
  apkStorage.listReleases = async () =>
    [...blobs].map(([pathname, b]) => ({ pathname, size: b.bytes.length, uploadedAt: new Date() }));
  apkStorage.remove = async (pathname) => {
    blobs.delete(pathname);
  };
  Object.assign(process.env, env);
  records = {};
  blobs = new Map();
  storageReads = [];
  uploadCalls = 0;
  globalThis.fetch = async (_url, init) => {
    if (String(_url).startsWith("https://api.github.com/repos/Astra1127/CivilCraft/releases")) {
      const body = JSON.parse(String(init?.body));
      return Response.json({
        id: 999,
        tag_name: body.tag_name ?? "stage",
        body: body.body,
        draft: true,
      });
    }
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
  apkStorage.verifyDownload = async () => undefined;
});

afterEach(() => {
  releaseWriteLock.run = originalLock;
  releaseDownloadStats.record = originalDownloadRecord;
  globalThis.fetch = originalFetch;
  Date.now = originalDateNow;
  Object.assign(apkStorage, originalStorage);
  githubApkStorage.verifyDownload = originalGithubVerify;
  githubApkStorage.downloadUrl = originalGithubUrl;
  Object.assign(githubApkUploads, originalGithubUploads);
  if (originalGithubEnv.token === undefined) delete process.env["GITHUB_APK_TOKEN"];
  else process.env["GITHUB_APK_TOKEN"] = originalGithubEnv.token;
  if (originalGithubEnv.control === undefined) delete process.env["GITHUB_APK_CONTROL_RELEASE_ID"];
  else process.env["GITHUB_APK_CONTROL_RELEASE_ID"] = originalGithubEnv.control;
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

function seedGithubRelease(current = true) {
  const id = "1db44dc0-eea1-43a1-8aeb-a4109fbf13e3";
  const release = {
    ...base,
    id,
    version: "BETA 0.0.0.6",
    build: "7",
    androidVersionCode: 13,
    fileName: "CivilCraft_10-29-26.apk",
    fileSizeBytes: 128537911,
    fileUrl: `/api/releases/${id}/download`,
    apk: {
      storagePath: `civilcraft/releases/${id}/00000000-0000-4000-8000-000000000001/CivilCraft_10-29-26.apk`,
      fileName: "CivilCraft_10-29-26.apk",
      fileSizeBytes: 128537911,
      etag: "original-etag",
      uploadedAt: "2026-10-29T03:00:00Z",
    },
  };
  records["civilcraft.website.v1.release-config"] = JSON.stringify({
    currentId: current ? id : null,
  });
  records["civilcraft.website.v1.releases." + id] = JSON.stringify(release);
  return release;
}

test("reviewed GitHub delivery recovers cached URLs without Blob calls, metadata writes or emails", async () => {
  const release = seedGithubRelease();
  const initialRecords = JSON.stringify(records);
  let verified = 0;
  let blobCalls = 0;
  githubApkStorage.verifyDownload = async () => {
    verified++;
  };
  const blocked = async () => {
    blobCalls++;
    throw new Error("Suspended Blob must not be called");
  };
  apkStorage.downloadUrl = blocked;
  apkStorage.verifyDownload = blocked;
  apkStorage.head = blocked;
  releaseWriteLock.run = blocked;
  releaseDownloadStats.record = blocked;
  const current = (await publicData()).current;
  assert.equal(current.downloadProvider, "github");
  assert.equal(current.fileUrl, release.fileUrl);
  assert.equal(current.version, release.version);
  assert.equal(current.notes, ""); // Unpublished notes stay private.
  const ready = await publicRequest(`${release.fileUrl}-link`, "POST");
  assert.equal(ready.status, 200);
  const result = await ready.json();
  assert.equal(
    result.url,
    "https://github.com/Astra1127/CivilCraft/releases/download/android-2026-10-29/CivilCraft_10-29-26.apk",
  );
  assert.equal(result.fileSizeBytes, release.fileSizeBytes);
  const legacy = await publicRequest(release.fileUrl);
  assert.equal(legacy.status, 307);
  assert.equal(legacy.headers.get("location"), result.url);
  const preview = await admin(`/api/admin/releases/${release.id}/download-link`, {});
  assert.equal(preview.status, 200);
  assert.equal((await preview.json()).url, result.url);
  assert.equal(verified, 3);
  assert.equal(blobCalls, 0);
  assert.equal(JSON.stringify(records), initialRecords);
});

test("GitHub preparation failures remain truthful JSON errors; non-current builds stay private", async () => {
  const release = seedGithubRelease();
  githubApkStorage.verifyDownload = async () => {
    throw new AdminApiError(
      503,
      "The APK download is temporarily unavailable from GitHub. Please try again.",
    );
  };
  const response = await publicRequest(`${release.fileUrl}-link`, "POST");
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /unavailable from GitHub/);
  assert.equal(response.headers.get("content-disposition"), null);
  seedGithubRelease(false);
  assert.equal((await publicRequest(`${release.fileUrl}-link`, "POST")).status, 404);
  assert.equal((await publicRequest(release.fileUrl)).status, 404);
});

test("replacing even the same-sized APK expires the reviewed GitHub delivery", async () => {
  const release = seedGithubRelease();
  release.apk.uploadedAt = "2026-11-06T03:04:55Z";
  records["civilcraft.website.v1.releases." + release.id] = JSON.stringify(release);
  assert.equal((await publicData()).current.downloadProvider, "vercel-blob");
  let legacyProvider = false;
  apkStorage.downloadUrl = async () => {
    legacyProvider = true;
    throw new AdminApiError(503, "Blob unavailable");
  };
  assert.equal((await publicRequest(`${release.fileUrl}-link`, "POST")).status, 503);
  assert.equal(legacyProvider, true);
});

type Prepared = { ticket: string; pathname: string; fileName: string; fileSizeBytes: number };
function enableGithub() {
  process.env["GITHUB_APK_TOKEN"] = "test-github-token-server-only";
  process.env["GITHUB_APK_CONTROL_RELEASE_ID"] = "99";
}
async function prepareGithub() {
  const response = await admin("/api/admin/releases/github-apk/prepare", {
    releaseId: base.id,
    fileName: "new.apk",
    fileSizeBytes: 5000,
  });
  assert.equal(response.status, 200, await response.clone().text());
  const prepared = await response.json();
  const claim = readGithubApkUploadTicket(prepared.ticket, getAdminAuthConfig()!.users[0]!.id);
  const attachment = {
    tag: claim.tag,
    githubReleaseId: claim.githubReleaseId,
    assetId: 1234,
    fileName: claim.fileName,
    fileSizeBytes: claim.fileSizeBytes,
    sha256: "a".repeat(64),
    uploadedAt: new Date().toISOString(),
    published: false,
    url: `https://github.com/Astra1127/CivilCraft/releases/download/${claim.tag}/${claim.fileName}`,
  };
  return { prepared, claim, attachment };
}

test("GitHub endpoints retain staff/origin gates and never accept forged attachment metadata", async () => {
  await initialize();
  enableGithub();
  for (const endpoint of ["prepare", "chunk", "finalize"]) {
    const path = `/api/admin/releases/github-apk/${endpoint}`;
    assert.equal((await admin(path, {}, { auth: false })).status, 401);
    assert.equal((await admin(path, {}, { origin: "https://foreign.test" })).status, 403);
  }
  const ready = (await adminData()).githubUploads;
  assert.equal(ready.configured, true);
  assert.equal(JSON.stringify(ready).includes(process.env["GITHUB_APK_TOKEN"]!), false);
  assert.equal(
    (await admin("/api/admin/releases", { action: "save", release: { ...base, githubApk: {} } }))
      .status,
    400,
  );
  assert.equal(
    (
      await admin("/api/admin/releases/apk/prepare", {
        releaseId: base.id,
        fileName: "old.apk",
        fileSizeBytes: 5000,
      })
    ).status,
    409,
  );
});

test("editing the original release retains GitHub delivery when version labels change", async () => {
  seedGithubRelease();
  const original = (await adminData()).releases[0];
  const response = await admin("/api/admin/releases", {
    action: "save",
    release: { ...original, build: "updated-label", notes: "Reviewed notes" },
  });
  assert.equal(response.status, 200, await response.clone().text());
  const persisted = rawRelease(original.id);
  assert.equal(persisted.githubApk.tag, "android-2026-10-29");
  assert.equal(persisted.githubApk.assetId, 715709073);
  assert.equal(persisted.build, "updated-label");
  assert.equal((await publicData()).current.downloadProvider, "github");
});

test("new GitHub chunks use a staff-bound ticket and reject edits to the prepared build", async () => {
  await initialize();
  enableGithub();
  const { prepared } = await prepareGithub();
  let received = 0;
  githubApkUploads.uploadChunk = async (value, actor, index, request) => {
    assert.equal(value, prepared.ticket);
    assert.equal(actor, getAdminAuthConfig()!.users[0]!.id);
    assert.equal(index, 0);
    assert.equal(request.headers.get("content-type"), "application/octet-stream");
    assert.equal((await request.arrayBuffer()).byteLength, 5000);
    received++;
    return { success: true, index: 0, uploadedBytes: 5000 };
  };
  const config = getAdminAuthConfig()!;
  const issued = await issueAdminSession(config, config.users[0]!);
  const request = () =>
    new Request(origin + "/api/admin/releases/github-apk/chunk?index=0", {
      method: "POST",
      headers: {
        origin,
        cookie: `${cookieName(config)}=${issued}`,
        "content-type": "application/octet-stream",
        "x-apk-upload-ticket": prepared.ticket,
      },
      body: new Uint8Array(5000),
    });
  assert.equal((await handlePlayFabAdminRequest(request()))?.status, 200);
  const newer = rawRelease();
  newer.build = "different";
  records["civilcraft.website.v1.releases." + base.id] = JSON.stringify(newer);
  assert.equal((await handlePlayFabAdminRequest(request()))?.status, 409);
  assert.equal(received, 1);
});

test("GitHub current replacement publishes verified bytes before metadata commit and retries without publishing twice", async () => {
  await initialize();
  enableGithub();
  const { prepared, attachment } = await prepareGithub();
  let finalized = 0,
    published = 0;
  githubApkUploads.finalize = async () => {
    finalized++;
    return attachment;
  };
  githubApkUploads.publish = async (value) => {
    published++;
    assert.equal(rawRelease().fileName, "legacy.apk");
    return { ...value, published: true };
  };
  const result = await admin("/api/admin/releases/github-apk/finalize", {
    ticket: prepared.ticket,
  });
  assert.equal(result.status, 200, await result.clone().text());
  assert.equal(rawRelease().githubApk.assetId, attachment.assetId);
  assert.equal(rawRelease().githubApk.published, true);
  assert.equal(rawRelease().notes, base.notes);
  assert.equal((await publicData()).current.downloadProvider, "github");
  assert.equal(JSON.stringify(await publicData()).includes("githubReleaseId"), false);
  assert.equal(
    (await admin("/api/admin/releases/github-apk/finalize", { ticket: prepared.ticket })).status,
    200,
  );
  assert.equal(finalized, 1);
  assert.equal(published, 1);
  assert.equal(rawRelease().version, base.version);
  assert.equal(
    JSON.parse(records["civilcraft.website.v1.release-config"]!).notification,
    undefined,
  );
});

test("draft GitHub upload stays private until Make current and stale note saves preserve the server attachment", async () => {
  await initialize();
  records["civilcraft.website.v1.release-config"] = JSON.stringify({ currentId: null });
  enableGithub();
  const { prepared, attachment } = await prepareGithub();
  let published = 0;
  githubApkUploads.finalize = async () => attachment;
  githubApkUploads.publish = async (value) => {
    published++;
    return { ...value, published: true };
  };
  assert.equal(
    (await admin("/api/admin/releases/github-apk/finalize", { ticket: prepared.ticket })).status,
    200,
  );
  assert.equal(published, 0);
  assert.equal(rawRelease().githubApk.published, false);
  assert.equal((await publicRequest(`/api/releases/${base.id}/download-link`, "POST")).status, 404);
  assert.equal(
    (
      await admin("/api/admin/releases", {
        action: "save",
        release: { ...base, notes: "Edited notes" },
      })
    ).status,
    200,
  );
  assert.equal(rawRelease().githubApk.assetId, attachment.assetId);
  assert.equal(rawRelease().fileName, attachment.fileName);
  assert.equal(
    (await admin("/api/admin/releases", { action: "current", id: base.id })).status,
    200,
  );
  assert.equal(published, 1);
  assert.equal(rawRelease().githubApk.published, true);
  assert.equal((await publicData()).current.id, base.id);
});

test("concurrent edits and failed publication preserve the active APK", async () => {
  for (const failure of ["concurrent", "publication"]) {
    records = {};
    await initialize();
    enableGithub();
    const { prepared, attachment } = await prepareGithub();
    githubApkUploads.finalize = async () => {
      if (failure === "concurrent") {
        const newer = rawRelease();
        newer.build = "newer";
        records["civilcraft.website.v1.releases." + base.id] = JSON.stringify(newer);
      }
      return attachment;
    };
    githubApkUploads.publish = async () => {
      throw new AdminApiError(503, "GitHub publication unavailable");
    };
    const response = await admin("/api/admin/releases/github-apk/finalize", {
      ticket: prepared.ticket,
    });
    assert.equal(response.status, failure === "concurrent" ? 409 : 503);
    assert.equal(rawRelease().fileUrl, base.fileUrl);
    assert.equal(rawRelease().githubApk, undefined);
    assert.equal(JSON.parse(records["civilcraft.website.v1.release-config"]!).currentId, base.id);
  }
});
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

test("download preparation checks actual storage delivery, returns a short-lived link and counts once", async () => {
  await initialize();
  const prepared = await attach();
  let verified = 0;
  let counted = 0;
  const before = JSON.stringify(records);
  apkStorage.verifyDownload = async (url, size) => {
    assert.equal(url, signedUrl(prepared.pathname));
    assert.equal(size, apk().length);
    verified++;
  };
  releaseDownloadStats.record = async (id) => {
    assert.equal(verified, 1);
    assert.equal(id, base.id);
    counted++;
  };
  const response = await publicRequest("/api/releases/r1/download-link", "POST");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    url: signedUrl(prepared.pathname),
    fileName: prepared.fileName,
    fileSizeBytes: apk().length,
  });
  assert.equal(response.headers.get("content-disposition"), null);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(verified, 1);
  assert.equal(counted, 1);
  assert.equal(
    JSON.stringify(records),
    before,
    "Read-only preparation must not edit a release or active pointer",
  );
});

test("failed signing or Blob delivery returns a safe error without a download link or counted success", async () => {
  await initialize();
  await attach();
  let counted = 0;
  releaseDownloadStats.record = async () => {
    counted++;
  };
  for (const failure of ["signing", "delivery"]) {
    apkStorage.downloadUrl = async (pathname) => {
      if (failure === "signing")
        throw new AdminApiError(503, "APK downloads are temporarily unavailable.");
      return signedUrl(pathname);
    };
    apkStorage.verifyDownload = async () => {
      throw new AdminApiError(503, "APK downloads are temporarily unavailable.");
    };
    const response = await publicRequest("/api/releases/r1/download-link", "POST");
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.error, "APK downloads are temporarily unavailable.");
    assert.equal(body.url, undefined);
    assert.equal(response.headers.get("location"), null);
    assert.equal(response.headers.get("content-disposition"), null);
  }
  assert.equal(counted, 0);
});

test("download preparation keeps archived APKs private and admin previews behind origin and staff checks", async () => {
  await initialize();
  await attach();
  assert.equal((await publicRequest("/api/releases/missing/download-link", "POST")).status, 404);
  assert.equal((await publicRequest("/api/releases/r1/download-link")).status, 405);
  const endpoint = "/api/admin/releases/r1/download-link";
  assert.equal((await admin(endpoint, {}, { auth: false })).status, 401);
  assert.equal((await admin(endpoint, {}, { origin: "https://other.test" })).status, 403);
  releaseWriteLock.run = async () => {
    throw new Error("Read-only download must not take the release writer lock");
  };
  let counted = 0;
  releaseDownloadStats.record = async () => {
    counted++;
  };
  assert.equal((await admin(endpoint, {})).status, 200);
  assert.equal(counted, 0, "Admin previews are not public download counts");
  records["civilcraft.website.v1.release-config"] = JSON.stringify({ currentId: null });
  assert.equal((await publicRequest("/api/releases/r1/download-link", "POST")).status, 404);
});

test("APK completion rereads and preserves an Android version code edited during upload", async () => {
  await initialize();
  const bytes = apk();
  const prepared = await prepare(bytes);
  assert.equal(
    (
      await admin("/api/admin/releases", {
        action: "save",
        release: { ...base, androidVersionCode: 123 },
      })
    ).status,
    200,
  );
  blobs.set(prepared.pathname, { bytes });
  assert.equal((await finalize(prepared)).status, 200);
  assert.equal(rawRelease().androidVersionCode, 123);
  assert.equal((await publicData()).current.androidVersionCode, 123);
  assert.equal((await publicData()).current.notes, "");
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

test("activation deletes retired APKs, protects the new current, and rejects stale tickets", async () => {
  await initialize();
  const old = await attach();
  const stale = await prepare(apk());
  blobs.set(stale.pathname, { bytes: apk() });
  await admin("/api/admin/releases", {
    action: "save",
    release: { ...base, id: "next", status: "draft", fileUrl: null },
  });
  const next = await attach(apk(), "next");
  assert.ok(blobs.has(old.pathname), "draft upload must not remove current");
  const activated = await admin("/api/admin/releases", { action: "current", id: "next" });
  assert.equal((await activated.json()).cleanup.status, "complete");
  assert.equal(blobs.has(old.pathname), false);
  assert.ok(blobs.has(next.pathname));
  assert.equal((await publicData()).current.id, "next");
  assert.equal((await finalize(stale)).status, 404);
});

test("failed cleanup is retryable and sweeps only expired APK orphans", async () => {
  await initialize();
  const old = await attach();
  const remove = apkStorage.remove;
  apkStorage.remove = async () => {
    throw new Error("storage unavailable");
  };
  const prepared = await prepare(apk(), base.id, "new.apk");
  blobs.set(prepared.pathname, { bytes: apk() });
  assert.equal((await (await finalize(prepared)).json()).cleanup.status, "pending");
  assert.ok(blobs.has(old.pathname));
  assert.equal(rawRelease().apk.storagePath, prepared.pathname);
  const recent = `civilcraft/releases/r1/11111111-1111-1111-1111-111111111111/recent.apk`;
  const gallery = "civilcraft/gallery/picture.png";
  blobs.set(recent, { bytes: apk() });
  blobs.set(gallery, { bytes: Buffer.from("picture") });
  apkStorage.listReleases = async () =>
    [...blobs].map(([pathname, b]) => ({
      pathname,
      size: b.bytes.length,
      uploadedAt: pathname === recent ? new Date() : new Date(0),
    }));
  apkStorage.remove = remove;
  const response = await admin("/api/admin/releases", { action: "cleanup" });
  assert.equal((await response.json()).cleanup.status, "complete");
  assert.equal(blobs.has(old.pathname), false);
  assert.ok(blobs.has(prepared.pathname));
  assert.ok(blobs.has(recent));
  assert.ok(blobs.has(gallery));
});

test("cleanup refuses deletion when current APK cannot be verified", async () => {
  await initialize();
  await attach();
  const before = [...blobs.keys()];
  apkStorage.head = async () => {
    throw new Error("offline");
  };
  const response = await admin("/api/admin/releases", { action: "cleanup" });
  assert.equal((await response.json()).cleanup.status, "pending");
  assert.deepEqual([...blobs.keys()], before);
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
