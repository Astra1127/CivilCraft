import assert from "node:assert/strict";
import { beforeEach, test, type TestContext } from "node:test";
import {
  githubApkStorage,
  resolveGithubApk,
  type GithubApkBinding,
} from "../src/lib/cms/github-apk.server.ts";
import { AdminApiError } from "../src/lib/playfab/admin-client.server.ts";

let instant = Date.parse("2026-11-06T04:00:00Z");
beforeEach((context) => {
  instant += 24 * 60 * 60 * 1000;
  if ("mock" in context) context.mock.method(Date, "now", () => instant);
});

function release() {
  return {
    id: "1db44dc0-eea1-43a1-8aeb-a4109fbf13e3",
    version: "BETA 0.0.0.6",
    build: "7",
    androidVersionCode: 13,
    fileName: "CivilCraft_10-29-26.apk",
    fileSizeBytes: 128537911,
    apk: {
      fileName: "CivilCraft_10-29-26.apk",
      fileSizeBytes: 128537911,
      storagePath:
        "civilcraft/releases/1db44dc0-eea1-43a1-8aeb-a4109fbf13e3/00000000-0000-4000-8000-000000000001/CivilCraft_10-29-26.apk",
      etag: "original-attachment-etag",
      uploadedAt: "2026-10-29T03:00:00.000Z",
    },
  };
}
const asset =
  "https://release-assets.githubusercontent.com/github-production-release-asset/1410627697/00000000-0000-4000-8000-000000000001?sp=r&sig=public-asset-temporary-link";
function binding(): GithubApkBinding {
  const value = resolveGithubApk(release());
  assert.ok(value);
  return value;
}
function range(body: BodyInit = new Uint8Array([0x50, 0x4b, 0x03, 0x04]), headers = {}) {
  return new Response(body, {
    status: 206,
    headers: Object.assign(
      {
        "content-type": "application/octet-stream",
        "content-range": "bytes 0-3/128537911",
        "content-length": "4",
      },
      headers,
    ),
  });
}
function observeStream(chunks: Uint8Array[]) {
  const metrics = { pulls: 0, cancels: 0 };
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        metrics.pulls++;
        const next = chunks.shift();
        if (next) controller.enqueue(next);
        else controller.close();
      },
      cancel() {
        metrics.cancels++;
      },
    },
    { highWaterMark: 0 },
  );
  return { body, metrics };
}
function mockFetch(context: TestContext, handler: typeof fetch) {
  context.mock.method(globalThis, "fetch", handler);
}

test("only the reviewed existing APK resolves to the fixed public GitHub asset", () => {
  const value = binding();
  assert.equal(Object.isFrozen(value), true);
  assert.equal(
    value.url,
    "https://github.com/Astra1127/CivilCraft/releases/download/android-2026-10-29/CivilCraft_10-29-26.apk",
  );
  assert.equal(value.fileSizeBytes, 128537911);
  assert.equal(value.sha256, "86e57ece9dfcbed4763108f0d66f035c9060e31eb080e147cc186bfc9608025c");
  assert.doesNotMatch(JSON.stringify(value), /etag|storagePath|uploadedAt|signature/);
  for (const patch of [
    { id: "another-release" },
    { version: "BETA 0.0.0.7" },
    { build: "8" },
    { androidVersionCode: 14 },
    { androidVersionCode: null },
    { fileName: "another.apk" },
    { fileSizeBytes: 128537912 },
    { apk: undefined },
  ])
    assert.equal(resolveGithubApk({ ...release(), ...patch }), undefined);
  for (const patch of [
    { fileName: "another.apk" },
    { fileSizeBytes: 128537912 },
    { etag: "" },
    { storagePath: "civilcraft/gallery/old.apk" },
    { storagePath: release().apk.storagePath.replace("/00000000", "/../00000000") },
    { storagePath: release().apk.storagePath.replace("1db44dc0", "2db44dc0") },
    { uploadedAt: "invalid" },
    { uploadedAt: "2026-11-06T03:04:54.000Z" },
    { uploadedAt: "2026-11-07T00:00:00.000Z" },
  ])
    assert.equal(
      resolveGithubApk({ ...release(), apk: { ...release().apk, ...patch } }),
      undefined,
    );
});

test("GitHub probe follows only trusted redirects and reads just the four ZIP bytes", async (context) => {
  const calls: { url: string; options: RequestInit | undefined }[] = [];
  mockFetch(context, async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url) === binding().url)
      return new Response(null, { status: 302, headers: { location: asset } });
    assert.equal(String(url), asset);
    return range();
  });
  await githubApkStorage.verifyDownload(binding());
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.options?.method, "GET");
    assert.equal(call.options?.redirect, "manual");
    assert.equal(call.options?.cache, "no-store");
    assert.equal(call.options?.credentials, "omit");
    const headers = new Headers(call.options?.headers);
    assert.equal(headers.get("range"), "bytes=0-3");
    assert.equal(headers.get("authorization"), null);
    assert.ok(call.options?.signal instanceof AbortSignal);
  }
});

test("concurrent and recent successful probes share one bounded readiness entry", async (context) => {
  let calls = 0;
  let finish: ((value: Response) => void) | undefined;
  mockFetch(context, async () => {
    calls++;
    if (calls === 1) return new Promise<Response>((resolve) => (finish = resolve));
    return range();
  });
  const first = githubApkStorage.verifyDownload(binding());
  const second = githubApkStorage.verifyDownload(binding());
  assert.equal(calls, 1);
  assert.ok(finish);
  finish(range());
  await Promise.all([first, second]);
  await githubApkStorage.verifyDownload(binding());
  assert.equal(calls, 1);
  instant += 60_001;
  await githubApkStorage.verifyDownload(binding());
  assert.equal(calls, 2, "Readiness is never reused beyond sixty seconds");
});

test("unreviewed URLs and modified bindings are rejected before any network call", async (context) => {
  mockFetch(context, async () => {
    assert.fail("An unreviewed binding must not issue a request");
  });
  for (const patch of [
    {
      url: "http://github.com/Astra1127/CivilCraft/releases/download/android-2026-10-29/CivilCraft_10-29-26.apk",
    },
    { url: binding().url + "?redirect=https://evil.test" },
    { url: binding().url.replace("Astra1127", "another-owner") },
    { url: binding().url.replace("github.com", "github.com.evil.test") },
    { releaseId: "another-release" },
    { fileSizeBytes: 4 },
    { sha256: "0".repeat(64) },
  ])
    await assert.rejects(
      githubApkStorage.verifyDownload({ ...binding(), ...patch }),
      (error: unknown) => error instanceof AdminApiError && error.status === 503,
    );
});

test("redirect validation blocks foreign hosts, unsafe paths, credentials and excess hops", async (context) => {
  for (const location of [
    "https://evil.test/CivilCraft_10-29-26.apk",
    "https://release-assets.githubusercontent.com.evil.test/github-production-release-asset/1/id",
    "https://user:password@release-assets.githubusercontent.com/github-production-release-asset/1/id",
    "http://release-assets.githubusercontent.com/github-production-release-asset/1/id",
    "https://release-assets.githubusercontent.com:444/github-production-release-asset/1/id",
    "https://release-assets.githubusercontent.com/arbitrary/path",
    "https://github.com/another-owner/CivilCraft/releases/download/tag/file.apk",
  ]) {
    let calls = 0;
    mockFetch(context, async () => {
      calls++;
      return new Response(null, { status: 302, headers: { location } });
    });
    await assert.rejects(githubApkStorage.verifyDownload(binding()), /temporarily unavailable/);
    assert.equal(calls, 1, "Reject the redirect before sending a request to its target");
  }
  let calls = 0;
  mockFetch(context, async () => {
    calls++;
    return new Response(null, { status: 302, headers: { location: asset } });
  });
  await assert.rejects(githubApkStorage.verifyDownload(binding()), /temporarily unavailable/);
  assert.equal(calls, 3, "At most two redirects may follow the initial request");
});

test("invalid status, type, range and length cancel without reading the response body", async (context) => {
  for (const [status, headers] of [
    [503, { "content-type": "application/json" }],
    [200, {}],
    [206, { "content-range": "bytes 0-3/128537912" }],
    [206, { "content-type": "application/json" }],
    [206, { "content-length": "128537911" }],
    [206, { "content-encoding": "gzip" }],
  ] as const) {
    const { body, metrics } = observeStream([new Uint8Array(1024)]);
    mockFetch(
      context,
      async () =>
        new Response(body, {
          status,
          headers: Object.assign(
            {
              "content-type": "application/octet-stream",
              "content-range": "bytes 0-3/128537911",
              "content-length": "4",
            },
            headers,
          ),
        }),
    );
    await assert.rejects(githubApkStorage.verifyDownload(binding()), /temporarily unavailable/);
    assert.equal(metrics.pulls, 0);
    assert.equal(metrics.cancels, 1);
  }
});

test("malformed, incomplete and oversized bytes fail safely and failures are retryable", async (context) => {
  let calls = 0;
  const samples = [
    new Uint8Array([0x50, 0x4b, 0x03]),
    new Uint8Array([0x50, 0x4b, 0x03, 0x05]),
    new Uint8Array(1024),
  ];
  mockFetch(context, async () => {
    calls++;
    const sample = samples.shift();
    return sample ? range(sample) : range();
  });
  for (let attempt = 0; attempt < 3; attempt++)
    await assert.rejects(githubApkStorage.verifyDownload(binding()), /temporarily unavailable/);
  await githubApkStorage.verifyDownload(binding());
  assert.equal(calls, 4, "A failed readiness check cannot poison a retry");
});

test("a chunked response is bounded and trailing extra bytes cannot pass as an APK", async (context) => {
  const oversized = observeStream([
    new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
    new Uint8Array([0x00]),
  ]);
  mockFetch(context, async () => range(oversized.body));
  await assert.rejects(githubApkStorage.verifyDownload(binding()), /temporarily unavailable/);
  assert.equal(oversized.metrics.pulls, 2);
  assert.equal(oversized.metrics.cancels, 1);
});

test("a stalled provider is aborted at the overall deadline and can be retried", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let signal: AbortSignal | null | undefined;
  mockFetch(context, async (_url, options) => {
    signal = options?.signal;
    return new Promise<Response>(() => undefined);
  });
  const pending = githubApkStorage.verifyDownload(binding());
  context.mock.timers.tick(8_000);
  await assert.rejects(pending, /temporarily unavailable/);
  assert.equal(signal?.aborted, true);
  mockFetch(context, async () => range());
  await githubApkStorage.verifyDownload(binding());
});
