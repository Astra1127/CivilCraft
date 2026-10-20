import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";
import { BlobPreconditionFailedError, type GetBlobResult } from "@vercel/blob";
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import {
  releaseDownloadStorage,
  releaseDownloadStats,
  shouldCountReleaseDownload,
} from "../src/lib/cms/release-download-stats.server.ts";
import { releaseRequest } from "../src/lib/cms/releases.server.ts";
import { apkStorage } from "../src/lib/cms/apk-storage.server.ts";
import { releaseWriteLock } from "../src/lib/cms/release-write-lock.server.ts";
import { handlePlayFabAdminRequest } from "../src/lib/playfab/admin-api.server.ts";
import { getAdminAuthConfig } from "../src/lib/admin-auth/config.server.ts";
import { cookieName, issueAdminSession } from "../src/lib/admin-auth/session.server.ts";
import { hashAdminPassword } from "../src/lib/admin-auth/password.server.ts";

const pathname = "civilcraft/release-analytics/17FA03/downloads.json";
const originalStorage = { ...releaseDownloadStorage };
const originalApkStorage = { ...apkStorage };
const originalFetch = globalThis.fetch;
const originalLock = releaseWriteLock.run;
const origin = "https://release-download-stats.test";
const passwordHash = await hashAdminPassword("download-stats-test-only-password");
const envNames = [
  "BLOB_READ_WRITE_TOKEN",
  "BLOB_STORE_ID",
  "VERCEL_OIDC_TOKEN",
  "VITE_PLAYFAB_TITLE_ID",
  "PLAYFAB_TITLE_ID",
  "ADMIN_AUTH_ORIGIN",
  "ADMIN_SESSION_SECRET",
  "ADMIN_USERS_JSON",
  "PLAYFAB_SECRET_KEY",
  "VERCEL_BLOB_RETRIES",
];
const previousEnv = envNames.map((name) => process.env[name]);
let savedText: string | null = null;
let generation = 0;
let reads = 0;
let writes = 0;
let cancelledStreams = 0;
let records: Record<string, string> = {};
const apkPath = "civilcraft/releases/r1/00000000-0000-4000-8000-000000000001/CivilCraft.apk";
const release = {
  id: "r1",
  title: "Release",
  version: "1.0.0",
  build: "1",
  notes: "Published notes",
  releaseDate: "2026-10-01",
  published: true,
  status: "current",
  platform: "Android",
  fileName: "CivilCraft.apk",
  fileSizeBytes: 4,
  fileUrl: "/api/releases/r1/download",
  minAndroid: "8.0",
  minRequirements: [],
  recommendedRequirements: [],
  downloads: 742,
  apk: {
    storagePath: apkPath,
    fileName: "CivilCraft.apk",
    fileSizeBytes: 4,
    etag: "apk-etag",
    uploadedAt: "2026-10-01T00:00:00.000Z",
  },
};

function etag() {
  return `test-generation-${generation}`;
}

function blobResult(body: string, tag = etag()): GetBlobResult {
  const bytes = Buffer.from(body);
  return {
    statusCode: 200,
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
      cancel() {
        cancelledStreams++;
      },
    }),
    headers: new Headers({
      "content-type": "application/json",
      "content-length": String(bytes.length),
    }),
    blob: {
      pathname,
      size: bytes.length,
      etag: tag,
      contentType: "application/json",
      url: `https://download-stats.test/${pathname}`,
      downloadUrl: `https://download-stats.test/${pathname}`,
      contentDisposition: "attachment",
      cacheControl: "private, no-cache",
      uploadedAt: new Date(0),
    },
  };
}

beforeEach(() => {
  for (const name of envNames) delete process.env[name];
  process.env["BLOB_READ_WRITE_TOKEN"] = "vercel_blob_rw_download-stats-test-only";
  process.env["VITE_PLAYFAB_TITLE_ID"] = "17FA03";
  process.env["PLAYFAB_SECRET_KEY"] = "download-stats-transport-test-only";
  process.env["ADMIN_AUTH_ORIGIN"] = origin;
  process.env["ADMIN_SESSION_SECRET"] = "download-stats-test-session-secret-at-least-32-characters";
  process.env["ADMIN_USERS_JSON"] = JSON.stringify([
    { email: "staff@example.test", displayName: "Staff", passwordHash },
  ]);
  savedText = null;
  generation = 0;
  reads = 0;
  writes = 0;
  cancelledStreams = 0;
  records = {
    "civilcraft.website.v1.release-config": JSON.stringify({ currentId: "r1" }),
    "civilcraft.website.v1.releases.r1": JSON.stringify(release),
  };
  globalThis.fetch = async (url, init) => {
    assert.match(
      String(url),
      /^https:\/\/17FA03\.playfabapi\.com\/Admin\/(GetTitleInternalData|SetTitleInternalData)$/,
    );
    if (String(url).endsWith("SetTitleInternalData")) {
      const body = JSON.parse(String(init?.body));
      records[body.Key] = body.Value;
    }
    return Response.json({ code: 200, data: { Data: { ...records } } });
  };
  releaseWriteLock.run = async (task) => task();
  apkStorage.downloadUrl = async (path) => {
    assert.equal(path, apkPath);
    return "https://storage.example.test/current.apk?signature=test-only";
  };
  apkStorage.head = async (path) => ({
    pathname: path,
    size: 4,
    contentType: "application/vnd.android.package-archive",
    etag: "apk-etag",
  });
  apkStorage.listReleases = async () => [];
  apkStorage.remove = async () => undefined;
  releaseDownloadStorage.get = async (path, options) => {
    reads++;
    assert.equal(path, pathname);
    assert.equal(options.access, "private");
    assert.equal(options.useCache, false, "CAS must read origin, not a stale CDN copy");
    assert.ok(options.abortSignal instanceof AbortSignal);
    return savedText === null ? null : blobResult(savedText);
  };
  releaseDownloadStorage.put = async (path, body, options) => {
    writes++;
    assert.equal(path, pathname);
    assert.equal(options?.access, "private");
    assert.equal(options?.addRandomSuffix, false);
    assert.ok(options?.abortSignal instanceof AbortSignal);
    if (savedText === null) {
      assert.equal(
        options?.allowOverwrite,
        false,
        "First creation must not overwrite another creator",
      );
      assert.equal(options?.ifMatch, undefined);
    } else if (options?.allowOverwrite === false || options?.ifMatch !== etag()) {
      throw new BlobPreconditionFailedError();
    }
    savedText = String(body);
    generation++;
    return {
      pathname,
      etag: etag(),
      contentType: "application/json",
      contentDisposition: "attachment",
      url: `https://download-stats.test/${pathname}`,
      downloadUrl: `https://download-stats.test/${pathname}`,
    };
  };
});

afterEach(() => {
  Object.assign(releaseDownloadStorage, originalStorage);
  Object.assign(apkStorage, originalApkStorage);
  globalThis.fetch = originalFetch;
  releaseWriteLock.run = originalLock;
});
after(() => {
  envNames.forEach((name, index) => {
    const previous = previousEnv[index];
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  });
});

test("new tracking starts at zero, not legacy release metadata", async () => {
  const result = await releaseDownloadStats.read();
  assert.equal(result.total, 0);
  assert.deepEqual(result.byRelease, {});
  assert.equal(
    result.trackingSince,
    null,
    "There is no historical start date until the first tracked download",
  );
  assert.equal(reads, 1);
  assert.equal(writes, 0, "Reading the admin count must not manufacture a download");
  assert.equal(savedText, null);
});

test("private conditional writes count each release and preserve the tracking start", async () => {
  await releaseDownloadStats.record("release-1");
  const first = await releaseDownloadStats.read();
  assert.equal(first.total, 1);
  assert.deepEqual(first.byRelease, { "release-1": 1 });
  await releaseDownloadStats.record("release-2");
  await releaseDownloadStats.record("release-1");
  const result = await releaseDownloadStats.read();
  assert.equal(result.total, 3);
  assert.deepEqual(result.byRelease, { "release-1": 2, "release-2": 1 });
  assert.equal(result.trackingSince, first.trackingSince);
  assert.equal(writes, 3);
  assert.equal(generation, 3);
  assert.ok(savedText);
  assert.doesNotMatch(savedText, /ipAddress|userAgent|email|username|playFabId|accountId|cookie/i);
});

test("concurrent successful increments do not overwrite one another", async () => {
  await Promise.all(
    Array.from({ length: 5 }, (_, index) => releaseDownloadStats.record(`build-${index % 2}`)),
  );
  const result = await releaseDownloadStats.read();
  assert.equal(result.total, 5);
  assert.deepEqual(result.byRelease, { "build-0": 3, "build-1": 2 });
  assert.equal(generation, 5);
  assert.ok(writes > 5, "The fixture must exercise a real compare-and-swap collision");
});

test("a definitive conditional-write conflict is retried at most five times", async () => {
  await releaseDownloadStats.record("r1");
  const before = savedText;
  writes = 0;
  releaseDownloadStorage.put = async () => {
    writes++;
    throw new BlobPreconditionFailedError();
  };
  await assert.rejects(releaseDownloadStats.record("r1"));
  assert.equal(writes, 5);
  assert.equal(savedText, before);
});

test("an ambiguous committed write is never repeated and cannot double count", async () => {
  await releaseDownloadStats.record("r1");
  const put = releaseDownloadStorage.put;
  writes = 0;
  releaseDownloadStorage.put = async (...args) => {
    await put(...args);
    throw new Error("Connection lost after the provider committed the counter");
  };
  await assert.rejects(releaseDownloadStats.record("r1"));
  assert.equal(writes, 1);
  assert.equal((await releaseDownloadStats.read()).total, 2);
});

test("an SDK-retried committed write ending in a conflict is recognized without another increment", async () => {
  await releaseDownloadStats.record("r1");
  const put = releaseDownloadStorage.put;
  writes = 0;
  releaseDownloadStorage.put = async (...args) => {
    await put(...args);
    // The installed Blob SDK may retry after a lost response. Its replay of the
    // same ETag then reports a conflict even though the first request committed.
    throw new BlobPreconditionFailedError();
  };
  await releaseDownloadStats.record("r1");
  assert.equal(writes, 1);
  assert.equal((await releaseDownloadStats.read()).total, 2);
  assert.ok(
    !("recentRequests" in (await releaseDownloadStats.read())),
    "Private retry receipts are not admin-facing metrics",
  );
});

test("another counter update between a committed SDK retry and reconciliation cannot double count", async () => {
  await releaseDownloadStats.record("r1");
  const put = releaseDownloadStorage.put;
  let injectOtherWrites = true;
  writes = 0;
  releaseDownloadStorage.put = async (...args) => {
    await put(...args);
    if (!injectOtherWrites) return {} as Awaited<ReturnType<typeof originalStorage.put>>;
    injectOtherWrites = false;
    await releaseDownloadStats.record("r2");
    await releaseDownloadStats.record("r3");
    throw new BlobPreconditionFailedError();
  };
  await releaseDownloadStats.record("r1");
  const result = await releaseDownloadStats.read();
  assert.equal(result.total, 4);
  assert.deepEqual(result.byRelease, { r1: 2, r2: 1, r3: 1 });
  assert.equal(writes, 3);
});

test("an exhausted retry-receipt window fails safely rather than replaying an uncertain write", async () => {
  await releaseDownloadStats.record("r1");
  const put = releaseDownloadStorage.put;
  let injectOtherWrites = true;
  writes = 0;
  releaseDownloadStorage.put = async (...args) => {
    await put(...args);
    if (!injectOtherWrites) return {} as Awaited<ReturnType<typeof originalStorage.put>>;
    injectOtherWrites = false;
    for (let index = 0; index < 128; index++) await releaseDownloadStats.record("r2");
    throw new BlobPreconditionFailedError();
  };
  await assert.rejects(releaseDownloadStats.record("r1"));
  const result = await releaseDownloadStats.read();
  assert.equal(result.total, 130);
  assert.deepEqual(result.byRelease, { r1: 2, r2: 128 });
  assert.equal(writes, 129);
});

test("ordinary storage failures are not mistaken for a conditional-write conflict", async () => {
  for (const error of [
    new Error("precondition failed"),
    Object.assign(new Error("busy"), { name: "BlobPreconditionFailedError" }),
  ]) {
    reads = 0;
    writes = 0;
    releaseDownloadStorage.put = async () => {
      writes++;
      throw error;
    };
    await assert.rejects(releaseDownloadStats.record("r1"));
    assert.equal(reads, 1);
    assert.equal(writes, 1);
  }
});

test("corrupt or invalid persisted counts are never reset or overwritten", async () => {
  await releaseDownloadStats.record("r1");
  const valid = JSON.parse(savedText!);
  for (const invalid of [
    "{not json",
    JSON.stringify({ ...valid, total: -1 }),
    JSON.stringify({ ...valid, total: 1.5 }),
    JSON.stringify({ ...valid, total: Number.MAX_SAFE_INTEGER + 1 }),
    JSON.stringify({ ...valid, byRelease: { r1: -1 } }),
    JSON.stringify({ ...valid, byRelease: { r1: "1" } }),
    JSON.stringify({ ...valid, trackingSince: "not-a-date" }),
    JSON.stringify({ ...valid, total: 2, byRelease: { r1: 1 } }),
  ]) {
    savedText = invalid;
    writes = 0;
    await assert.rejects(releaseDownloadStats.read());
    await assert.rejects(releaseDownloadStats.record("r1"));
    assert.equal(writes, 0);
    assert.equal(savedText, invalid);
  }
});

test("invalid release IDs cannot reach storage or create arbitrary counter keys", async () => {
  for (const id of ["", "../private", "r1/other", "a".repeat(65), "__proto__"]) {
    reads = 0;
    writes = 0;
    await assert.rejects(releaseDownloadStats.record(id));
    assert.equal(reads, 0);
    assert.equal(writes, 0);
  }
});

test("valid inherited property names are counted as own numeric release keys", async () => {
  await releaseDownloadStats.record("constructor");
  await releaseDownloadStats.record("toString");
  await releaseDownloadStats.record("constructor");
  const result = await releaseDownloadStats.read();
  assert.equal(result.total, 3);
  assert.equal(result.byRelease["constructor"], 2);
  assert.equal(result.byRelease["toString"], 1);
  assert.ok(Object.hasOwn(result.byRelease, "constructor"));
});

test("missing ETags fail closed instead of permitting an unconditional overwrite", async () => {
  await releaseDownloadStats.record("r1");
  const before = savedText;
  releaseDownloadStorage.get = async () => blobResult(savedText!, "");
  writes = 0;
  await assert.rejects(releaseDownloadStats.record("r1"));
  assert.equal(writes, 0);
  assert.equal(savedText, before);
});

test("stream bodies are bounded and cancelled when they exceed the document size limit", async () => {
  let emitted = false;
  let cancelled = false;
  releaseDownloadStorage.get = async () => {
    const result = blobResult("{}");
    result.stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          assert.equal(emitted, false, "Must stop before requesting more oversized data");
          emitted = true;
          controller.enqueue(new Uint8Array(256 * 1024 + 1));
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 },
    );
    return result;
  };
  await assert.rejects(releaseDownloadStats.read());
  assert.equal(cancelled, true);
  assert.equal(writes, 0);
});

test("invalid storage metadata is rejected and its unread stream is cancelled", async () => {
  for (const invalid of [
    { pathname: "civilcraft/gallery/foreign.json" },
    { etag: "" },
    { size: 0 },
    { size: 256 * 1024 + 1 },
    { size: 1.5 },
  ]) {
    let cancelled = false;
    releaseDownloadStorage.get = async () => {
      const result = blobResult("{}");
      Object.assign(result.blob, invalid);
      result.stream = new ReadableStream<Uint8Array>(
        {
          cancel() {
            cancelled = true;
          },
        },
        { highWaterMark: 0 },
      );
      return result;
    };
    await assert.rejects(releaseDownloadStats.record("r1"));
    assert.equal(cancelled, true, "Rejected metadata must release the provider response body");
    assert.equal(writes, 0);
  }
});

test("truncated storage responses are never accepted as valid counters", async () => {
  await releaseDownloadStats.record("r1");
  const get = releaseDownloadStorage.get;
  releaseDownloadStorage.get = async (...args) => {
    const result = await get(...args);
    assert.ok(result);
    assert.equal(result.statusCode, 200);
    result.blob.size++;
    return result;
  };
  writes = 0;
  await assert.rejects(releaseDownloadStats.read());
  await assert.rejects(releaseDownloadStats.record("r1"));
  assert.equal(writes, 0);
});

test("counter and release-count capacity limits fail without dropping retained history", async () => {
  await releaseDownloadStats.record("r1");
  const valid = JSON.parse(savedText!);
  savedText = JSON.stringify({
    ...valid,
    total: Number.MAX_SAFE_INTEGER,
    byRelease: { r1: Number.MAX_SAFE_INTEGER },
  });
  const full = savedText;
  writes = 0;
  await assert.rejects(releaseDownloadStats.record("r1"));
  assert.equal(writes, 0);
  assert.equal(savedText, full);
  savedText = JSON.stringify({
    ...valid,
    total: 1000,
    byRelease: Object.fromEntries(Array.from({ length: 1000 }, (_, index) => [`r${index}`, 1])),
  });
  const atCapacity = savedText;
  await assert.rejects(releaseDownloadStats.record("one-more-release"));
  assert.equal(writes, 0);
  assert.equal(savedText, atCapacity);
});

test("title-scoped storage prevents a shared Blob store from mixing game counters", async () => {
  process.env["VITE_PLAYFAB_TITLE_ID"] = "abc123";
  releaseDownloadStorage.get = async (path) => {
    assert.equal(path, "civilcraft/release-analytics/ABC123/downloads.json");
    return null;
  };
  assert.equal((await releaseDownloadStats.read()).total, 0);
  process.env["VITE_PLAYFAB_TITLE_ID"] = "not-a-title";
  reads = 0;
  releaseDownloadStorage.get = async () => {
    reads++;
    return null;
  };
  await assert.rejects(releaseDownloadStats.read());
  assert.equal(reads, 0);
});

test("installed Blob SDK emits conditional private writes and reconciles its own committed retry", async () => {
  await releaseDownloadStats.record("r1");
  const dispatcher = getGlobalDispatcher();
  const agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
  const token = "vercel_blob_rw_downloadstats_synthetic-test-only-token";
  process.env["BLOB_READ_WRITE_TOKEN"] = token;
  process.env["VERCEL_BLOB_RETRIES"] = "1";
  globalThis.fetch = originalFetch;
  Object.assign(releaseDownloadStorage, originalStorage);
  let sdkReads = 0;
  let sdkWrites = 0;
  const privateOrigin = "https://downloadstats.private.blob.vercel-storage.com";
  agent
    .get(privateOrigin)
    .intercept({ path: `/${pathname}?cache=0`, method: "GET" })
    .reply((options) => {
      sdkReads++;
      assert.equal(
        new Headers(options.headers as Record<string, string>).get("authorization"),
        `Bearer ${token}`,
      );
      return {
        statusCode: 200,
        data: savedText!,
        responseOptions: {
          headers: {
            "content-type": "application/json",
            "content-length": String(Buffer.byteLength(savedText!)),
            etag: etag(),
          },
        },
      };
    })
    .persist();
  const initialEtag = etag();
  agent
    .get("https://vercel.com")
    .intercept({ path: /^\/api\/blob\/\?pathname=/, method: "PUT" })
    .reply((options) => {
      sdkWrites++;
      const headers = new Headers(options.headers as Record<string, string>);
      assert.equal(
        new URL(options.path, "https://vercel.com").searchParams.get("pathname"),
        pathname,
      );
      assert.equal(headers.get("authorization"), `Bearer ${token}`);
      assert.equal(headers.get("x-vercel-blob-access"), "private");
      assert.equal(headers.get("x-if-match"), initialEtag);
      assert.equal(headers.get("x-allow-overwrite"), "1");
      assert.equal(headers.get("x-add-random-suffix"), "0");
      const next = JSON.parse(String(options.body));
      assert.equal(next.total, 2);
      if (sdkWrites === 1) {
        savedText = JSON.stringify(next);
        generation++;
        // Model a committed operation whose response is not trustworthy. The SDK
        // retries this response on its own before returning control to our code.
        return {
          statusCode: 503,
          data: JSON.stringify({ error: { code: "service_unavailable" } }),
        };
      }
      return { statusCode: 412, data: JSON.stringify({ error: { code: "precondition_failed" } }) };
    })
    .persist();
  try {
    await releaseDownloadStats.record("r1");
    assert.equal(
      sdkWrites,
      2,
      "Installed SDK, not the counter's loop, must generate the transport replay",
    );
    assert.equal(sdkReads, 2, "Counter must reread after the SDK's final conditional failure");
    assert.equal(
      JSON.parse(savedText!).total,
      2,
      "The committed request must be counted exactly once",
    );
  } finally {
    setGlobalDispatcher(dispatcher);
    await agent.close();
  }
});

test("read and write deadlines release callers even when a storage adapter ignores abort", async () => {
  let calls = 0;
  let readSignal: AbortSignal | undefined;
  let writeSignal: AbortSignal | undefined;
  releaseDownloadStorage.get = async (_path, options) => {
    calls++;
    if (calls === 1) {
      readSignal = options.abortSignal;
      return new Promise<never>(() => {});
    }
    return null;
  };
  releaseDownloadStorage.put = async (_path, _body, options) => {
    writeSignal = options?.abortSignal;
    return new Promise<never>(() => {});
  };
  const started = Date.now();
  const results = await Promise.allSettled([
    releaseDownloadStats.read(),
    releaseDownloadStats.record("r1"),
  ]);
  const elapsed = Date.now() - started;
  assert.ok(
    elapsed >= 2500 && elapsed < 5000,
    `Both operations must stop near the 3-second deadline, not SDK retry duration (${elapsed}ms)`,
  );
  for (const result of results) assert.equal(result.status, "rejected");
  for (const signal of [readSignal, writeSignal]) {
    assert.ok(signal?.aborted);
    assert.equal(
      signal.reason?.name,
      "AbortError",
      "SDK cancellation must not be the retriable TimeoutError variant",
    );
  }
});

test("installed SDK immediately bails on a deliberately aborted PUT rather than retrying", async () => {
  const dispatcher = getGlobalDispatcher();
  const agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
  const controller = new AbortController();
  controller.abort();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(
      () => reject(new Error("SDK ignored AbortError and entered its retry loop")),
      750,
    );
  });
  try {
    await assert.rejects(
      Promise.race([
        originalStorage.put(pathname, "{}", {
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: false,
          abortSignal: controller.signal,
        }),
        timedOut,
      ]),
      /request was aborted/i,
    );
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    setGlobalDispatcher(dispatcher);
    await agent.close();
  }
});

async function admin(
  path = "/api/admin/releases/download-stats",
  body?: unknown,
  authenticated = true,
) {
  const config = getAdminAuthConfig()!;
  const headers: Record<string, string> = { origin, "Content-Type": "application/json" };
  if (authenticated)
    headers["cookie"] =
      `${cookieName(config)}=${await issueAdminSession(config, config.users[0]!)}`;
  const response = await handlePlayFabAdminRequest(
    new Request(origin + path, {
      method: body === undefined ? "GET" : "POST",
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
  assert.ok(response);
  return response;
}

async function download(method = "GET", headers: Record<string, string> = {}, id = "r1") {
  const response = await releaseRequest(
    new Request(`${origin}/api/releases/${id}/download`, { method, headers }),
  );
  assert.ok(response);
  return response;
}

test("only the authenticated admin endpoint returns statistics and never caches them", async () => {
  assert.equal((await admin(undefined, undefined, false)).status, 401);
  assert.equal(reads, 0);
  globalThis.fetch = async () => {
    assert.fail("Stats must not require a PlayFab metadata round trip");
  };
  const response = await admin();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    available: true,
    total: 0,
    byRelease: {},
    trackingSince: null,
  });
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.equal((await admin(undefined, {})).status, 405);
});

test("missing Blob credentials are unavailable rather than a fabricated zero", async () => {
  const dispatcher = getGlobalDispatcher();
  const agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
  for (const name of ["BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "VERCEL_OIDC_TOKEN"])
    delete process.env[name];
  Object.assign(releaseDownloadStorage, originalStorage);
  try {
    await assert.rejects(releaseDownloadStats.read(), /credentials|token/i);
    const response = await admin();
    assert.deepEqual(await response.json(), {
      available: false,
      total: null,
      byRelease: {},
      trackingSince: null,
    });
  } finally {
    setGlobalDispatcher(dispatcher);
    await agent.close();
  }
});

test("public hosted-current GET counts only after a download URL has been signed", async () => {
  apkStorage.downloadUrl = async () => {
    assert.equal(reads, 0, "A failed signing attempt must never register a download");
    return "https://storage.example.test/current.apk?signature=test-only";
  };
  const response = await download("GET", {
    "user-agent": "private-user-agent-canary",
    "x-forwarded-for": "203.0.113.20",
  });
  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    "https://storage.example.test/current.apk?signature=test-only",
  );
  assert.deepEqual((await releaseDownloadStats.read()).byRelease, { r1: 1 });
  assert.equal(
    JSON.parse(records["civilcraft.website.v1.releases.r1"]!).downloads,
    742,
    "Legacy counters are neither incremented nor imported",
  );
  assert.doesNotMatch(savedText!, /private-user-agent-canary|203\.0\.113\.20/);
});

test("HEAD, ranges, prefetches and staff previews do not count", async () => {
  for (const [method, headers] of [
    ["HEAD", {}],
    ["GET", { range: "bytes=0-100" }],
    ["GET", { purpose: "prefetch" }],
    ["GET", { "sec-purpose": "prefetch;prerender" }],
    ["GET", { "x-purpose": "Prerender" }],
  ] as const) {
    assert.ok([200, 307].includes((await download(method, headers)).status));
    assert.equal(
      shouldCountReleaseDownload(new Request(origin, { method, headers }), false),
      false,
    );
  }
  assert.equal((await admin("/api/admin/releases/r1/download")).status, 307);
  assert.equal(reads, 0);
  assert.equal(writes, 0);
  assert.equal(savedText, null);
});

test("draft, missing, invalid and failed-signature downloads never count", async () => {
  records["civilcraft.website.v1.releases.draft"] = JSON.stringify({
    ...release,
    id: "draft",
    status: "draft",
    apk: { ...release.apk, storagePath: apkPath.replace("/r1/", "/draft/") },
  });
  for (const id of ["draft", "missing"]) assert.equal((await download("GET", {}, id)).status, 404);
  assert.equal((await download("POST")).status, 405);
  apkStorage.downloadUrl = async () => {
    throw new Error("signing-secret-canary");
  };
  const response = await download();
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /signing-secret-canary/);
  assert.equal(writes, 0);
});

test("counter failure leaves the APK redirect working and reports admin counts as unavailable", async () => {
  savedText = "corrupt private stats token-canary";
  const response = await download();
  assert.equal(response.status, 307);
  assert.ok(response.headers.get("location"));
  const stats = await admin();
  assert.equal(stats.status, 200);
  assert.deepEqual(await stats.json(), {
    available: false,
    total: null,
    byRelease: {},
    trackingSince: null,
  });
  assert.equal(writes, 0);
  assert.equal(savedText, "corrupt private stats token-canary");
});

test("metadata edits and retired-APK cleanup preserve independent historical counts", async () => {
  await releaseDownloadStats.record("r1");
  await releaseDownloadStats.record("retired");
  const before = savedText;
  const { apk: _privateApk, ...editable } = release;
  const saved = await admin("/api/admin/releases", {
    action: "save",
    release: { ...editable, title: "Edited notes", downloads: 0 },
  });
  assert.equal(saved.status, 200, await saved.clone().text());
  records["civilcraft.website.v1.releases.retired"] = JSON.stringify({
    ...editable,
    id: "retired",
    status: "archived",
    apk: { ...release.apk, storagePath: apkPath.replace("/r1/", "/retired/") },
  });
  const deleted = await admin("/api/admin/releases", { action: "delete", id: "retired" });
  assert.equal(deleted.status, 200);
  const cleanup = await admin("/api/admin/releases", { action: "cleanup" });
  assert.equal(cleanup.status, 200);
  assert.equal(savedText, before);
  assert.deepEqual((await releaseDownloadStats.read()).byRelease, { r1: 1, retired: 1 });
});
