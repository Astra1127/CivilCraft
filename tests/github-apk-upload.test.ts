import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, afterEach, beforeEach, test } from "node:test";
import { hashAdminPassword } from "../src/lib/admin-auth/password.server.ts";
import { getAdminAuthConfig } from "../src/lib/admin-auth/config.server.ts";
import {
  githubApkUploads,
  GITHUB_APK_CHUNK_BYTES,
  readGithubApkUploadTicket,
} from "../src/lib/cms/github-apk-upload.server.ts";
import { githubReleaseWriteLock } from "../src/lib/cms/github-release-write-lock.server.ts";
import { APK_CONTENT_TYPE } from "../src/lib/cms/apk.ts";

const passwordHash = await hashAdminPassword("github-upload-test-password");
const env = {
  ADMIN_AUTH_ORIGIN: "https://github-upload.test",
  ADMIN_SESSION_SECRET: "github-upload-test-secret-at-least-32-characters",
  ADMIN_USERS_JSON: JSON.stringify([
    { email: "upload@example.test", displayName: "Upload", passwordHash },
  ]),
  GITHUB_APK_TOKEN: "github-test-server-only-token",
  GITHUB_APK_CONTROL_RELEASE_ID: "99",
};
const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
const originalLock = githubReleaseWriteLock.runNamed;
type RemoteAsset = {
  id: number;
  name: string;
  size: number;
  state: "uploaded" | "starter";
  digest: string;
  bytes: Buffer;
};
type RemoteStage = {
  id: number;
  tag_name: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
};
let stages = new Map<number, RemoteStage>();
let assets = new Map<number, RemoteAsset>();
let nextAsset = 200,
  nextRelease = 100;
let apiCalls: { url: string; method: string }[] = [];
let uploadPosts: string[] = [];
let lostUploadResponse = false;
let rejectReceipt = false;
let rogueRedirect = false;
let deletes = 0;
let publications = 0;
const wireAsset = ({ bytes: _bytes, ...fields }: RemoteAsset) => fields;
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

beforeEach(() => {
  Object.assign(process.env, env);
  stages = new Map();
  assets = new Map();
  nextAsset = 200;
  nextRelease = 100;
  apiCalls = [];
  uploadPosts = [];
  lostUploadResponse = false;
  rejectReceipt = false;
  rogueRedirect = false;
  deletes = 0;
  publications = 0;
  githubReleaseWriteLock.runNamed = async (_name, operation) => operation();
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    apiCalls.push({ url: `${url.origin}${url.pathname}`, method });
    if (url.hostname === "release-assets.githubusercontent.com" || url.hostname === "evil.test") {
      assert.equal(
        url.hostname,
        "release-assets.githubusercontent.com",
        "A foreign redirect must never be fetched",
      );
      assert.equal(
        headers.get("authorization"),
        null,
        "GitHub bearer must never reach a signed CDN",
      );
      const asset = assets.get(Number(url.pathname.split("/").at(-1)))!;
      assert.ok(asset);
      return new Response(new Uint8Array(asset.bytes), {
        headers: {
          "content-type": "application/octet-stream",
          "content-length": String(asset.size),
        },
      });
    }
    assert.equal(headers.get("authorization"), `Bearer ${env.GITHUB_APK_TOKEN}`);
    if (url.hostname === "uploads.github.com") {
      assert.equal(method, "POST");
      assert.equal(init?.redirect, "error");
      const name = url.searchParams.get("name")!;
      uploadPosts.push(name);
      if ([...assets.values()].some((asset) => asset.name === name))
        return Response.json({ message: "exists" }, { status: 422 });
      const bytes = Buffer.from(await new Response(init?.body).arrayBuffer());
      assert.equal(headers.get("content-length"), String(bytes.length));
      const asset: RemoteAsset = {
        id: nextAsset++,
        name,
        size: bytes.length,
        digest: `sha256:${sha(bytes)}`,
        state: "uploaded",
        bytes,
      };
      assets.set(asset.id, asset);
      if (lostUploadResponse) {
        lostUploadResponse = false;
        throw new TypeError("Lost upstream response after commit");
      }
      return Response.json(wireAsset(asset), { status: 201 });
    }
    assert.equal(url.hostname, "api.github.com");
    assert.equal(
      init?.redirect,
      url.pathname.includes("/releases/assets/") && method === "GET" ? "manual" : "error",
    );
    if (url.pathname.endsWith("/releases") && method === "POST") {
      const body = JSON.parse(String(init?.body));
      const stage: RemoteStage = {
        id: nextRelease++,
        tag_name: body.tag_name,
        body: body.body,
        draft: body.draft,
        prerelease: body.prerelease,
      };
      stages.set(stage.id, stage);
      return Response.json(stage, { status: 201 });
    }
    const assetId = url.pathname.match(/\/releases\/assets\/(\d+)$/)?.[1];
    if (assetId) {
      const asset = assets.get(Number(assetId));
      if (!asset) return Response.json({ message: "missing" }, { status: 404 });
      if (method === "DELETE") {
        assets.delete(asset.id);
        deletes++;
        return new Response(null, { status: 204 });
      }
      return new Response(null, {
        status: 302,
        headers: {
          location: rogueRedirect
            ? "https://evil.test/file"
            : `https://release-assets.githubusercontent.com/github-production-release-asset/123/${asset.id}?signature=private`,
        },
      });
    }
    const stageId = url.pathname.match(/\/releases\/(\d+)(?:\/assets)?$/)?.[1];
    const stage = stages.get(Number(stageId));
    assert.ok(stage, `Known stage ${url.pathname}`);
    if (url.pathname.endsWith("/assets")) {
      const perPage = Number(url.searchParams.get("per_page") ?? 100),
        page = Number(url.searchParams.get("page") ?? 1);
      return Response.json(
        [...assets.values()].slice((page - 1) * perPage, page * perPage).map(wireAsset),
      );
    }
    if (method === "PATCH") {
      const body = JSON.parse(String(init?.body));
      if (rejectReceipt && String(body.body).includes("civilcraft-apk-complete-v1"))
        return Response.json({ message: "failure" }, { status: 503 });
      if (body.draft === false) publications++;
      Object.assign(stage, body);
    }
    return Response.json(stage);
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  githubReleaseWriteLock.runNamed = originalLock;
});
after(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function apk(codeSize = 8): Buffer {
  const code = Buffer.alloc(codeSize, 0x61);
  Buffer.from("dex\n035\0").copy(code);
  const entries = [
    { name: "AndroidManifest.xml", bytes: Buffer.from([3, 0, 8, 0, 8, 0, 0, 0]) },
    { name: "classes.dex", bytes: code },
  ];
  const local: Buffer[] = [],
    directory: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(entry.bytes.length, 18);
    header.writeUInt32LE(entry.bytes.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, entry.bytes);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(entry.bytes.length, 20);
    central.writeUInt32LE(entry.bytes.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    directory.push(central, name);
    offset += header.length + name.length + entry.bytes.length;
  }
  const central = Buffer.concat(directory),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, central, end]);
}
function staff() {
  return getAdminAuthConfig()!.users[0]!.id;
}
async function prepare(bytes: Buffer) {
  return githubApkUploads.prepare({
    staffId: staff(),
    releaseId: "release-1",
    fileName: "Civil Craft.apk",
    fileSizeBytes: bytes.length,
    previousAttachment: "previous-server-identity",
  });
}
function body(bytes: Uint8Array) {
  return new Request("https://github-upload.test/api/admin/releases/github-apk/chunk", {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: new Uint8Array(bytes),
  });
}
async function upload(bytes: Buffer) {
  const prepared = await prepare(bytes);
  for (let index = 0; index < prepared.chunkCount; index++)
    await githubApkUploads.uploadChunk(
      prepared.ticket,
      staff(),
      index,
      body(bytes.subarray(index * prepared.chunkSize, (index + 1) * prepared.chunkSize)),
    );
  return prepared;
}

test("private multipart upload verifies the APK, keeps draft preview private, and publishes only on explicit activation", async () => {
  const bytes = apk(GITHUB_APK_CHUNK_BYTES + 100);
  const prepared = await upload(bytes);
  assert.equal(prepared.chunkSize, 3 * 1024 * 1024);
  assert.equal(prepared.chunkCount, 2);
  assert.equal(JSON.stringify(prepared).includes(env.GITHUB_APK_TOKEN), false);
  const attachment = await githubApkUploads.finalize(prepared.ticket, staff());
  assert.equal(attachment.sha256, sha(bytes));
  assert.equal(attachment.fileSizeBytes, bytes.length);
  assert.equal(attachment.published, false);
  assert.equal([...stages.values()][0]!.draft, true);
  assert.equal(assets.size, 1);
  assert.equal(deletes, 2);
  assert.equal(publications, 0);
  assert.deepEqual([...assets.values()][0]!.bytes, bytes);
  const published = await githubApkUploads.publish(attachment);
  assert.equal(published.published, true);
  assert.equal(publications, 1);
  const publicBody = [...stages.values()][0]!.body;
  assert.equal(publicBody.includes(prepared.ticket), false);
  assert.equal(publicBody.includes(staff()), false);
  assert.match(publicBody, /SHA-256/);
  const retried = await githubApkUploads.finalize(prepared.ticket, staff());
  assert.equal(retried.assetId, attachment.assetId);
  assert.equal(retried.sha256, attachment.sha256);
  assert.equal(retried.published, true);
  await githubApkUploads.publish(attachment);
  assert.equal(publications, 1);
});

test("part retries reconcile a lost committed response and never duplicate or replace bytes", async () => {
  const bytes = apk();
  const prepared = await prepare(bytes);
  lostUploadResponse = true;
  await githubApkUploads.uploadChunk(prepared.ticket, staff(), 0, body(bytes));
  await githubApkUploads.uploadChunk(prepared.ticket, staff(), 0, body(bytes));
  assert.deepEqual(uploadPosts, ["cc-part-00000"]);
  const changed = Buffer.from(bytes);
  changed[0] = changed[0]! ^ 1;
  await assert.rejects(
    githubApkUploads.uploadChunk(prepared.ticket, staff(), 0, body(changed)),
    /different bytes/,
  );
  assert.equal(uploadPosts.length, 1);
});

test("tickets bind the original staff, selected build, expiration, and previous attachment without accepting tampering", async () => {
  const prepared = await prepare(apk());
  const claim = readGithubApkUploadTicket(prepared.ticket, staff());
  assert.equal(claim.previousAttachment, "previous-server-identity");
  assert.equal(claim.releaseId, "release-1");
  assert.throws(() => readGithubApkUploadTicket(prepared.ticket + "a", staff()), /authorization/);
  assert.throws(
    () => readGithubApkUploadTicket(prepared.ticket, "f".repeat(64)),
    /sign-in|authorization/,
  );
  const old = Date.now;
  Date.now = () => claim.expiresAt + 1;
  try {
    assert.throws(() => readGithubApkUploadTicket(prepared.ticket, staff()), /expired/);
  } finally {
    Date.now = old;
  }
});

test("oversized, incomplete, wrong-type and invalid-index parts fail before contacting GitHub", async () => {
  const bytes = apk();
  const prepared = await prepare(bytes);
  const before = apiCalls.length;
  await assert.rejects(
    githubApkUploads.uploadChunk(prepared.ticket, staff(), 1, body(bytes)),
    /valid APK upload part/,
  );
  await assert.rejects(
    githubApkUploads.uploadChunk(prepared.ticket, staff(), 0, body(bytes.subarray(1))),
    /incomplete/,
  );
  await assert.rejects(
    githubApkUploads.uploadChunk(
      prepared.ticket,
      staff(),
      0,
      body(Buffer.concat([bytes, Buffer.from([1])])),
    ),
    /too large/,
  );
  await assert.rejects(
    githubApkUploads.uploadChunk(
      prepared.ticket,
      staff(),
      0,
      new Request("https://test", { method: "POST", body: "bad" }),
    ),
    /part is required/,
  );
  assert.equal(apiCalls.length, before);
});

test("missing parts, malformed APKs and private CDN redirect attacks never publish or clean staging", async () => {
  const bytes = apk();
  const prepared = await prepare(bytes);
  await assert.rejects(githubApkUploads.finalize(prepared.ticket, staff()), /parts are missing/);
  await githubApkUploads.uploadChunk(prepared.ticket, staff(), 0, body(bytes));
  rogueRedirect = true;
  await assert.rejects(githubApkUploads.finalize(prepared.ticket, staff()), /could not finish/);
  rogueRedirect = false;
  const part = [...assets.values()][0]!;
  part.bytes[0] = 0;
  part.digest = `sha256:${sha(part.bytes)}`;
  await assert.rejects(
    githubApkUploads.finalize(prepared.ticket, staff()),
    /supported Android APK/,
  );
  assert.equal(publications, 0);
  assert.equal(deletes, 0);
});

test("failed verification receipt commits keep all parts for safe retry; completed retries need no deleted parts", async () => {
  const bytes = apk();
  const prepared = await upload(bytes);
  rejectReceipt = true;
  await assert.rejects(githubApkUploads.finalize(prepared.ticket, staff()));
  assert.equal(assets.size, 2);
  assert.equal(deletes, 0);
  assert.equal(publications, 0);
  rejectReceipt = false;
  const verified = await githubApkUploads.finalize(prepared.ticket, staff());
  assert.equal(assets.size, 1);
  const uploads = uploadPosts.length;
  const retried = await githubApkUploads.finalize(prepared.ticket, staff());
  assert.equal(retried.assetId, verified.assetId);
  assert.equal(uploadPosts.length, uploads);
  await assert.rejects(
    githubApkUploads.uploadChunk(prepared.ticket, staff(), 0, body(bytes)),
    /already finished/,
  );
});

test("activation checks the persisted hash and rejects changed or unexpected release assets", async () => {
  const bytes = apk();
  const prepared = await upload(bytes);
  const verified = await githubApkUploads.finalize(prepared.ticket, staff());
  await assert.rejects(
    githubApkUploads.publish({ ...verified, sha256: "0".repeat(64) }),
    /changed/,
  );
  const asset = [...assets.values()][0]!;
  asset.digest = `sha256:${"0".repeat(64)}`;
  await assert.rejects(githubApkUploads.publish(verified), /unavailable or changed/);
  assert.equal(publications, 0);
});
