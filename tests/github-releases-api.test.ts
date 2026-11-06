import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { AdminApiError } from "../src/lib/playfab/admin-client.server.ts";
import {
  githubApi,
  GithubApiError,
  githubConfig,
  githubJson,
  githubUploadReadiness,
} from "../src/lib/cms/github-releases-api.server.ts";
import { githubReleaseWriteLock } from "../src/lib/cms/github-release-write-lock.server.ts";

const envKeys = ["GITHUB_APK_TOKEN", "GITHUB_APK_CONTROL_RELEASE_ID"] as const;
const savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
const repositoryPath = "/repos/Astra1127/CivilCraft";
let control: Record<string, unknown>;
let requests: { target: URL; init: RequestInit | undefined }[];
let assets: Map<string, { id: number; name: string; state: string; size: number }>;
let nextId: number;

beforeEach(() => {
  process.env["GITHUB_APK_TOKEN"] = "github-pat-private-test-value";
  process.env["GITHUB_APK_CONTROL_RELEASE_ID"] = "123";
  control = { id: 123, draft: true, tag_name: "civilcraft-admin-control-v1" };
  requests = [];
  assets = new Map();
  nextId = 10;
  globalThis.fetch = async (value, init) => {
    const target = new URL(String(value));
    requests.push({ target, init });
    if (target.host === "api.github.com" && target.pathname === repositoryPath + "/releases/123")
      return Response.json(control);
    if (target.host === "uploads.github.com") {
      assert.equal(target.pathname, repositoryPath + "/releases/123/assets");
      const name = target.searchParams.get("name")!;
      if (assets.has(name)) return Response.json({ message: "private error" }, { status: 422 });
      const asset = {
        id: nextId++,
        name,
        state: "uploaded",
        size: Buffer.byteLength(String(init?.body)),
      };
      assets.set(name, asset);
      return Response.json(asset, { status: 201 });
    }
    if (target.host === "api.github.com" && init?.method === "DELETE") {
      const id = Number(target.pathname.split("/").at(-1));
      const found = [...assets].find(([, asset]) => asset.id === id);
      if (!found) return Response.json({}, { status: 404 });
      assets.delete(found[0]);
      return new Response(null, { status: 204 });
    }
    return Response.json({ result: "ok" });
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of envKeys) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("readiness reveals no credential and partial or malformed configuration fails closed", () => {
  assert.equal(githubUploadReadiness().configured, true);
  assert.equal(githubConfig().controlReleaseId, 123);
  assert.doesNotMatch(JSON.stringify(githubUploadReadiness()), /github-pat-private-test-value/);
  for (const invalid of ["", "0", "-1", "1.5", "1e2", "9007199254740992", "wrong"]) {
    process.env["GITHUB_APK_CONTROL_RELEASE_ID"] = invalid;
    const readiness = githubUploadReadiness();
    assert.equal(readiness.configured, false);
    assert.equal(readiness.configurationPresent, true);
    assert.throws(githubConfig, AdminApiError);
  }
  process.env["GITHUB_APK_CONTROL_RELEASE_ID"] = "123";
  process.env["GITHUB_APK_TOKEN"] = "bad\nheader";
  assert.equal(githubUploadReadiness().configured, false);
  delete process.env["GITHUB_APK_TOKEN"];
  delete process.env["GITHUB_APK_CONTROL_RELEASE_ID"];
  assert.equal(githubUploadReadiness().configurationPresent, false);
});

test("GitHub metadata stays in the fixed repository and uses a server-only credential", async () => {
  assert.deepEqual(await githubApi(repositoryPath + "/releases?per_page=100"), { result: "ok" });
  const request = requests[0]!;
  assert.equal(request.target.host, "api.github.com");
  assert.equal(request.init?.redirect, "error");
  assert.equal(request.init?.cache, "no-store");
  assert.equal(request.init?.credentials, "omit");
  assert.equal(
    new Headers(request.init?.headers).get("authorization"),
    "Bearer github-pat-private-test-value",
  );
  for (const invalid of [
    "https://evil.test/repos/Astra1127/CivilCraft/releases",
    "/repos/Someone/CivilCraft/releases",
    repositoryPath + "/../../secret",
    repositoryPath + "/releases#secret",
    "//api.github.com/repos/Astra1127/CivilCraft/releases",
  ])
    await assert.rejects(githubApi(invalid), AdminApiError);
  assert.equal(requests.length, 1);
  await assert.rejects(
    githubApi(repositoryPath + "/releases", {
      method: "POST",
      body: { notes: "x".repeat(256 * 1024) },
    }),
    AdminApiError,
  );
  assert.equal(requests.length, 1);
});

test("metadata mutations are sent once and upstream details never reach callers", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("private-token-and-provider-url");
  };
  await assert.rejects(
    githubApi(repositoryPath + "/releases", { method: "POST", body: { draft: true } }),
    (error: unknown) => {
      assert.ok(error instanceof GithubApiError);
      assert.equal(error.upstreamStatus, 0);
      assert.doesNotMatch(error.message, /private-token|provider-url/);
      return true;
    },
  );
  assert.equal(calls, 1);
  for (const status of [401, 403, 404, 422, 429, 502]) {
    globalThis.fetch = async () => Response.json({ private: "credential-details" }, { status });
    await assert.rejects(githubApi(repositoryPath + "/releases"), (error: unknown) => {
      assert.ok(error instanceof GithubApiError);
      assert.equal(error.upstreamStatus, status);
      assert.doesNotMatch(error.message, /credential-details/);
      return true;
    });
  }
});

test("JSON metadata is bounded and non-JSON or oversized bodies are cancelled", async () => {
  let cancelled = 0;
  let reads = 0;
  const response = (headers: Record<string, string>) =>
    new Response(
      new ReadableStream({
        pull(controller) {
          reads++;
          controller.enqueue(new Uint8Array(3 * 1024 * 1024));
        },
        cancel() {
          cancelled++;
        },
      }),
      { headers },
    );
  await assert.rejects(githubJson(response({ "content-type": "text/html" })), GithubApiError);
  await assert.rejects(
    githubJson(
      response({ "content-type": "application/json", "content-length": String(3 * 1024 * 1024) }),
    ),
    GithubApiError,
  );
  await assert.rejects(
    githubJson(response({ "content-type": "application/json" })),
    GithubApiError,
  );
  assert.equal(cancelled, 3);
  assert.ok(reads <= 3);
  globalThis.fetch = async () =>
    new Response("{bad-json", { headers: { "content-type": "application/json" } });
  await assert.rejects(githubApi(repositoryPath + "/releases"), GithubApiError);
});

test("the private control draft and immutable lock asset serialize metadata writers", async () => {
  let finish!: () => void;
  let entered!: () => void;
  const waiting = new Promise<void>((yes) => {
    finish = yes;
  });
  const started = new Promise<void>((yes) => {
    entered = yes;
  });
  const first = githubReleaseWriteLock.run(async () => {
    entered();
    await waiting;
    return "saved";
  });
  await started;
  assert.ok(assets.has("cc-release-write-lock-v1.json"));
  let competingTask = false;
  await assert.rejects(
    githubReleaseWriteLock.run(async () => {
      competingTask = true;
    }),
    /busy or held/,
  );
  assert.equal(competingTask, false);
  finish();
  assert.equal(await first, "saved");
  assert.equal(assets.size, 0);
  const creates = requests.filter((request) => request.target.host === "uploads.github.com");
  assert.equal(creates.length, 2);
  const owner = JSON.parse(String(creates[0]!.init?.body));
  assert.match(owner.owner, /^[a-f0-9-]{36}$/);
  assert.equal(creates[0]!.init?.redirect, "error");
});

test("a stalled GitHub JSON body is cancelled at the overall response deadline", async () => {
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }),
    { headers: { "content-type": "application/json" } },
  );
  await assert.rejects(githubJson(response, 5), GithubApiError);
  assert.equal(cancelled, true);
});

test("uncertain lock creation never runs the write or removes another lock", async () => {
  const fetch = globalThis.fetch;
  globalThis.fetch = async (value, init) => {
    const result = await fetch(value, init);
    if (new URL(String(value)).host === "uploads.github.com")
      throw new Error("lost response after commit");
    return result;
  };
  let ran = false;
  await assert.rejects(
    githubReleaseWriteLock.run(async () => {
      ran = true;
    }),
    /busy or held/,
  );
  assert.equal(ran, false);
  assert.equal(assets.size, 1);
  assert.equal(requests.filter((request) => request.init?.method === "DELETE").length, 0);
});

test("only the configured private control draft can receive lock files", async () => {
  for (const change of [{ draft: false }, { id: 999 }, { tag_name: "android-public-release" }]) {
    control = { id: 123, draft: true, tag_name: "civilcraft-admin-control-v1", ...change };
    await assert.rejects(
      githubReleaseWriteLock.run(async () => {
        throw new Error("must not run");
      }),
      /busy or held/,
    );
  }
  assert.equal(
    requests.filter((request) => request.target.host === "uploads.github.com").length,
    0,
  );
});

test("unlock uses only its immutable asset ID, even if its filename was acquired by a new owner", async () => {
  await githubReleaseWriteLock.run(async () => {
    assets.set("cc-release-write-lock-v1.json", {
      id: 999,
      name: "cc-release-write-lock-v1.json",
      state: "uploaded",
      size: 20,
    });
    return "already saved";
  });
  assert.equal(assets.get("cc-release-write-lock-v1.json")?.id, 999);
  const removed = requests.filter((request) => request.init?.method === "DELETE");
  assert.equal(removed.length, 1);
  assert.equal(removed[0]!.target.pathname, repositoryPath + "/releases/assets/10");
});

test("failed writes still release their own lock while upload locks use isolated, validated names", async () => {
  await assert.rejects(
    githubReleaseWriteLock.run(async () => {
      throw new Error("save failure");
    }),
    /save failure/,
  );
  assert.equal(assets.size, 0);
  const id = "00000000-0000-4000-8000-000000000001";
  await githubReleaseWriteLock.runNamed(id, async () => {
    assert.ok(assets.has(`cc-upload-${id}-lock.json`));
    await githubReleaseWriteLock.run(async () => {
      assert.equal(assets.size, 2);
    });
    await assert.rejects(
      githubReleaseWriteLock.runNamed(id, async () => {}),
      /busy or held/,
    );
  });
  assert.equal(assets.size, 0);
  const count = requests.length;
  for (const invalid of ["../escape", "releases", "", "not-a-uuid"])
    await assert.rejects(
      async () => githubReleaseWriteLock.runNamed(invalid, async () => {}),
      AdminApiError,
    );
  assert.equal(requests.length, count);
});
