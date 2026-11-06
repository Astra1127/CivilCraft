import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const CHUNK = 3 * 1024 * 1024;
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => (resolve = yes));
  return { promise, resolve };
};

function runtime(fetchImpl) {
  const exports = {};
  const calls = [];
  let scope = "staff-a";
  runInNewContext(
    ts.transpileModule(
      readFileSync(new URL("../src/lib/cms/github-apk-upload.ts", import.meta.url), "utf8"),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      },
    ).outputText,
    {
      exports,
      Error,
      AbortController,
      AbortSignal,
      setTimeout: (callback) => setTimeout(callback, 0),
      clearTimeout,
      require: () => ({
        validateApkSelection: (file) => {
          if (!file.name.endsWith(".apk") || file.size < 1) throw new Error("Select an APK");
        },
      }),
      fetch: async (url, init) => {
        calls.push({ url, init });
        return fetchImpl(url, init, calls);
      },
    },
  );
  return {
    calls,
    setScope: (next) => (scope = next),
    uploader: exports.createGithubApkUploader(() => scope),
  };
}
const file = (size = CHUNK * 2 + 23) => ({
  name: "CivilCraft.apk",
  size,
  slice: (start, end) => ({ size: end - start, start, end }),
});
const prepared = () => Response.json({ ticket: "private-staff-upload-ticket", chunkSize: CHUNK });
const success = () => Response.json({ success: true });
const normal = (url) => (url.endsWith("/prepare") ? prepared() : success());

test("GitHub APK client sends bounded sequential parts with staff credentials and reserves completion for final verification", async () => {
  const selected = file();
  const run = runtime(normal);
  const progress = [];
  assert.equal(
    (await run.uploader.upload("build-a", selected, (value) => progress.push(value))).success,
    true,
  );
  assert.deepEqual(
    run.calls.map((call) => call.url),
    [
      "/api/admin/releases/github-apk/prepare",
      "/api/admin/releases/github-apk/chunk?index=0",
      "/api/admin/releases/github-apk/chunk?index=1",
      "/api/admin/releases/github-apk/chunk?index=2",
      "/api/admin/releases/github-apk/finalize",
    ],
  );
  assert.deepEqual(
    run.calls.slice(1, 4).map((call) => call.init.body.size),
    [CHUNK, CHUNK, 23],
  );
  assert.deepEqual(progress, [0, 0, 30, 60, 90, 100]);
  for (const { init } of run.calls) {
    assert.equal(init.credentials, "same-origin");
    assert.equal(init.cache, "no-store");
    assert.equal(init.redirect, "error");
    assert.equal(init.headers.Authorization, undefined);
    assert.equal(init.headers.authorization, undefined);
  }
  assert.equal(run.calls[1].init.headers["X-Apk-Upload-Ticket"], "private-staff-upload-ticket");
  assert.equal(run.calls[1].init.headers["Content-Type"], "application/octet-stream");
  assert.deepEqual(JSON.parse(run.calls[0].init.body), {
    releaseId: "build-a",
    fileName: selected.name,
    fileSizeBytes: selected.size,
  });
});

test("retry after an uncertain part reuses the same upload and acknowledged parts", async () => {
  let failed = false;
  const run = runtime((url) => {
    if (url.endsWith("index=1") && !failed) {
      failed = true;
      throw new Error("Connection lost after upload");
    }
    return normal(url);
  });
  const selected = file();
  await assert.rejects(run.uploader.upload("build-a", selected), /retry/);
  assert.equal((await run.uploader.upload("build-a", selected)).success, true);
  assert.equal(run.calls.filter(({ url }) => url.endsWith("/prepare")).length, 1);
  assert.equal(run.calls.filter(({ url }) => url.endsWith("index=0")).length, 1);
  assert.equal(run.calls.filter(({ url }) => url.endsWith("index=1")).length, 2);
});

test("retry after a lost final response calls finalization only and does not create or upload another APK", async () => {
  let failed = false;
  const run = runtime((url) => {
    if (url.endsWith("/finalize") && !failed) {
      failed = true;
      throw new Error("Final reply lost");
    }
    return normal(url);
  });
  const selected = file(CHUNK);
  await assert.rejects(run.uploader.upload("build-a", selected), /retry/);
  const acknowledged = run.calls.length;
  assert.equal((await run.uploader.upload("build-a", selected)).success, true);
  assert.deepEqual(
    run.calls.slice(acknowledged).map(({ url }) => url),
    ["/api/admin/releases/github-apk/finalize"],
  );
});

test("repeated clicks share one active request; another selected file cannot start competing work", async () => {
  const gate = deferred();
  const run = runtime(async (url) => {
    if (url.endsWith("/prepare")) await gate.promise;
    return normal(url);
  });
  const selected = file(10);
  const first = run.uploader.upload("build-a", selected);
  const second = run.uploader.upload("build-a", selected);
  assert.equal(first, second);
  await assert.rejects(run.uploader.upload("build-a", file(10)), /already in progress/);
  gate.resolve();
  await first;
  assert.equal(run.calls.filter(({ url }) => url.endsWith("/prepare")).length, 1);
});

test("an account change during preparation cannot upload or finalize for the old account", async () => {
  const gate = deferred();
  const run = runtime(async (url) => {
    if (url.endsWith("/prepare")) await gate.promise;
    return normal(url);
  });
  const selected = file(10);
  const attempt = run.uploader.upload("build-a", selected);
  run.setScope("staff-b");
  gate.resolve();
  await assert.rejects(attempt, /Administrator access changed/);
  assert.equal(run.calls.length, 1);
  await run.uploader.upload("build-a", selected);
  assert.equal(run.calls.filter(({ url }) => url.endsWith("/prepare")).length, 2);
});

test("unmount or sign-out aborts in-flight work and discards its ticket", async () => {
  const gate = deferred();
  const run = runtime(async (url) => {
    if (url.includes("/chunk")) await gate.promise;
    return normal(url);
  });
  const selected = file(10);
  const attempt = run.uploader.upload("build-a", selected);
  await new Promise((resolve) => setTimeout(resolve, 0));
  run.uploader.dispose();
  gate.resolve();
  await assert.rejects(attempt, /Administrator access changed/);
  assert.equal(
    run.calls.some(({ url }) => url.endsWith("/finalize")),
    false,
  );
  assert.equal(run.calls[1].init.signal.aborted, true);
  run.setScope(null);
  await assert.rejects(run.uploader.upload("build-a", selected), /Administrator access changed/);
});

test("oversized part instructions and malformed successful replies never start an APK transfer", async () => {
  for (const reply of [
    () => Response.json({ ticket: "private", chunkSize: CHUNK + 1 }),
    () => Response.json({ ticket: "", chunkSize: CHUNK }),
    () => new Response("provider html", { status: 200 }),
  ]) {
    const run = runtime(reply);
    await assert.rejects(run.uploader.upload("build-a", file(10)), /retry/);
    assert.equal(run.calls.length, 1);
  }
});

test("server errors remain truthful while unsafe bodies and failed redirects get a safe retry message", async () => {
  const run = runtime(() =>
    Response.json(
      { error: "GitHub access has expired. Ask a site maintainer to reconnect it." },
      { status: 503 },
    ),
  );
  await assert.rejects(run.uploader.upload("build-a", file(10)), /GitHub access has expired/);
  const unsafe = runtime(() =>
    Response.json({ error: "<private-provider-error>" }, { status: 503 }),
  );
  await assert.rejects(unsafe.uploader.upload("build-a", file(10)), /retry/);
});
