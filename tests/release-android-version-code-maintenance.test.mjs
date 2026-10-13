import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import {
  assertReleaseMaintenanceConfiguration,
  hashReleaseApkProof,
  parseReleaseCodeArguments,
  runReleaseCodeMaintenance,
  setReleaseAndroidVersionCode,
} from "../scripts/set-release-android-version-code.mjs";
import { APK_CONTENT_TYPE } from "../src/lib/cms/apk.ts";
import { releaseWriteLock, releaseLockStorage } from "../src/lib/cms/release-write-lock.server.ts";

// All provider calls below are isolated fixtures, never default PlayFab/Blob adapters.
const ID = "31f525b9-92ae-4709-9eeb-c2b686173911";
const KEY = `civilcraft.website.v1.releases.${ID}`;
const CONFIG = "civilcraft.website.v1.release-config";
const bytes = Buffer.from("fixture-verified-apk-bytes");
const digest = createHash("sha256").update(bytes).digest("hex");
const args = ["--release-id", ID, "--android-version-code", "1", "--apk-sha256", digest];
const options = (apply = false) => ({ releaseId: ID, versionCode: 1, sha256: digest, apply });
const current = () => ({
  id: ID,
  title: "Private draft title",
  version: "BETA0.0.0.4",
  build: "4",
  notes: "Private draft notes",
  releaseDate: "2026-10-14",
  published: false,
  status: "current",
  platform: "Android",
  minAndroid: "8.0",
  fileName: "Civil-Craft.apk",
  fileSizeBytes: bytes.length,
  fileUrl: `/api/releases/${ID}/download`,
  minRequirements: [],
  recommendedRequirements: [],
  downloads: 17,
  apk: {
    storagePath: `civilcraft/releases/${ID}/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/Civil-Craft.apk`,
    fileName: "Civil-Craft.apk",
    fileSizeBytes: bytes.length,
    etag: "private-fixture-etag",
    uploadedAt: "2026-10-14T00:00:00.000Z",
    futureApkField: { preserved: true },
  },
  unknownFutureField: { flags: [true, null, "unchanged"], nested: { value: 5 } },
});

function fixture() {
  const original = current();
  const state = {
    records: {
      [CONFIG]: JSON.stringify({ currentId: ID, unknownConfig: { preserved: true } }),
      [KEY]: JSON.stringify(original),
      "other-internal-record": "must remain untouched",
    },
    writes: [],
    reads: 0,
    locks: 0,
    held: false,
    gets: 0,
    heads: 0,
    duringGet: null,
    afterWrite: null,
    writeFailure: null,
    getOverride: null,
    headOverride: null,
  };
  const blob = {
    pathname: original.apk.storagePath,
    size: bytes.length,
    contentType: APK_CONTENT_TYPE,
    etag: original.apk.etag,
  };
  const dependencies = {
    configure() {},
    read: async () => {
      state.reads++;
      return { ...state.records };
    },
    write: async (key, value) => {
      assert.equal(state.held, true);
      assert.equal(key, KEY);
      state.writes.push({ key, value: JSON.parse(JSON.stringify(value)) });
      if (state.writeFailure === "before") throw new Error("private-token-before");
      state.records[key] = JSON.stringify(value);
      state.afterWrite?.();
      if (state.writeFailure === "after") throw new Error("private-token-after");
    },
    lock: async (task) => {
      assert.equal(state.held, false);
      state.locks++;
      state.held = true;
      try {
        return await task();
      } finally {
        state.held = false;
      }
    },
    head: async (pathname) => {
      assert.equal(pathname, original.apk.storagePath);
      state.heads++;
      return { ...blob, ...state.headOverride };
    },
    get: async (pathname, settings) => {
      assert.equal(pathname, original.apk.storagePath);
      assert.equal(settings.access, "private");
      assert.equal(settings.useCache, false);
      assert.ok(settings.abortSignal instanceof AbortSignal);
      if (state.locks) assert.equal(state.held, true, "apply hashes under the shared lock");
      state.gets++;
      state.duringGet?.();
      return (
        state.getOverride ?? {
          statusCode: 200,
          blob: { ...blob },
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue(bytes.subarray(0, 7));
              controller.enqueue(bytes.subarray(7));
              controller.close();
            },
          }),
        }
      );
    },
    hashProof: async () => digest,
  };
  return { original, state, dependencies, blob };
}

test("maintenance CLI defaults to dry-run and validates explicit code/identity/proof arguments", () => {
  assert.deepEqual(parseReleaseCodeArguments(args), { ...options(), proofPath: undefined });
  assert.equal(parseReleaseCodeArguments([...args, "--apply"]).apply, true);
  const proof = path.join(tmpdir(), "verified.apk");
  assert.equal(
    parseReleaseCodeArguments([...args.slice(0, 4), "--apk-proof", proof]).proofPath,
    proof,
  );
  for (const invalid of [
    [],
    args.slice(0, 4),
    [...args, "--unknown"],
    [...args, "--apply", "--apply"],
    [...args, "--release-id", ID],
    [...args, "--apk-proof", proof],
    ["--release-id", "../invalid", ...args.slice(2)],
    ["--release-id", ID, "--android-version-code", "0", ...args.slice(4)],
    ["--release-id", ID, "--android-version-code", "1.5", ...args.slice(4)],
    ["--release-id", ID, "--android-version-code", "2100000001", ...args.slice(4)],
    [...args.slice(0, 4), "--apk-sha256", "not-a-hash"],
    [...args.slice(0, 4), "--apk-proof", "relative.apk"],
  ])
    assert.throws(() => parseReleaseCodeArguments(invalid));
});

test("dry-run verifies private APK head/body/hash and fresh release without writes or lock mutations", async () => {
  const { state, dependencies } = fixture();
  const before = { ...state.records };
  assert.deepEqual(await setReleaseAndroidVersionCode(options(), dependencies), {
    status: "dry-run",
    releaseId: ID,
    versionCode: 1,
  });
  assert.equal(state.gets, 1);
  assert.equal(state.heads, 2);
  assert.equal(state.reads, 2);
  assert.equal(state.locks, 0);
  assert.deepEqual(state.writes, []);
  assert.deepEqual(state.records, before);
});

test("apply changes only code while preserving private draft notes, labels, APK, unknown metadata and config", async () => {
  const { original, state, dependencies } = fixture();
  const before = { ...state.records };
  assert.equal((await setReleaseAndroidVersionCode(options(true), dependencies)).status, "updated");
  assert.equal(state.locks, 1);
  assert.equal(state.held, false);
  assert.equal(state.writes.length, 1);
  assert.deepEqual(JSON.parse(state.records[KEY]), { ...original, androidVersionCode: 1 });
  assert.equal(state.records[CONFIG], before[CONFIG]);
  assert.equal(state.records["other-internal-record"], before["other-internal-record"]);
});

test("same verified code is idempotent; a conflicting code is refused without a write", async () => {
  for (const existing of [null, undefined, 1, 2]) {
    const { state, dependencies } = fixture();
    state.records[KEY] = JSON.stringify({ ...current(), androidVersionCode: existing });
    if (existing === 2) {
      await assert.rejects(setReleaseAndroidVersionCode(options(true), dependencies));
      assert.equal(state.writes.length, 0);
      assert.equal(state.gets, 0);
    } else {
      const result = await setReleaseAndroidVersionCode(options(true), dependencies);
      assert.equal(result.status, existing === 1 ? "already-set" : "updated");
      assert.equal(state.writes.length, existing === 1 ? 0 : 1);
    }
  }
});

test("fresh reread retains an out-of-band notes edit during hashing instead of replacing it", async () => {
  const { state, dependencies } = fixture();
  state.duringGet = () => {
    state.records[KEY] = JSON.stringify({
      ...current(),
      notes: "Newer private notes",
      extra: [1, 2],
    });
  };
  await setReleaseAndroidVersionCode(options(true), dependencies);
  assert.equal(JSON.parse(state.records[KEY]).notes, "Newer private notes");
  assert.deepEqual(JSON.parse(state.records[KEY]).extra, [1, 2]);
});

test("deleted, inactive, malformed, mismatched or changed metadata fails closed", async () => {
  for (const change of [
    (state) => {
      state.records[`civilcraft.website.v1.release-deleted.${ID}`] = "{}";
    },
    (state) => {
      state.records[CONFIG] = JSON.stringify({ currentId: "other" });
    },
    (state) => {
      state.records[CONFIG] = "{malformed";
    },
    (state) => {
      state.records[KEY] = "{malformed";
    },
    (state) => {
      state.records[KEY] = JSON.stringify({ ...current(), id: "other" });
    },
    (state) => {
      state.records[KEY] = JSON.stringify({ ...current(), apk: undefined });
    },
    (state) => {
      state.records[KEY] = JSON.stringify({ ...current(), notes: 12 });
    },
    (state) => {
      state.records[KEY] = JSON.stringify({ ...current(), androidVersionCode: "1" });
    },
    (state) => {
      state.records[KEY] = JSON.stringify({ ...current(), fileSizeBytes: 0 });
    },
    (state) => {
      state.records[KEY] = JSON.stringify({
        ...current(),
        apk: { ...current().apk, storagePath: "other.apk" },
      });
    },
    (state) => {
      state.duringGet = () => {
        state.records[CONFIG] = JSON.stringify({ currentId: "other" });
      };
    },
    (state) => {
      state.duringGet = () => {
        state.records[KEY] = JSON.stringify({ ...current(), androidVersionCode: 2 });
      };
    },
    (state) => {
      state.duringGet = () => {
        state.records[KEY] = JSON.stringify({
          ...current(),
          apk: { ...current().apk, etag: "replacement" },
        });
      };
    },
  ]) {
    const { state, dependencies } = fixture();
    change(state);
    await assert.rejects(setReleaseAndroidVersionCode(options(true), dependencies));
    assert.equal(state.writes.length, 0);
    assert.equal(state.held, false);
  }
});

test("wrong hash, object ETag, content type, path, size, short and oversized streams cannot update metadata", async () => {
  for (const change of [
    (state) => {
      state.headOverride = { etag: "changed" };
    },
    (state) => {
      state.headOverride = { contentType: "text/plain" };
    },
    (state) => {
      state.headOverride = { pathname: "other.apk" };
    },
    (state) => {
      state.headOverride = { size: bytes.length + 1 };
    },
    (state, blob) => {
      state.getOverride = { statusCode: 304, blob, stream: null };
    },
    (state, blob) => {
      state.getOverride = {
        statusCode: 200,
        blob: { ...blob, etag: "changed" },
        stream: new ReadableStream(),
      };
    },
    (state, blob) => {
      state.getOverride = {
        statusCode: 200,
        blob,
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue(bytes.subarray(1));
            controller.close();
          },
        }),
      };
    },
    (state, blob) => {
      state.getOverride = {
        statusCode: 200,
        blob,
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue(Buffer.concat([bytes, bytes]));
            controller.close();
          },
        }),
      };
    },
  ]) {
    const { state, dependencies, blob } = fixture();
    change(state, blob);
    await assert.rejects(setReleaseAndroidVersionCode(options(true), dependencies));
    assert.equal(state.writes.length, 0);
  }
  const { state, dependencies } = fixture();
  await assert.rejects(
    setReleaseAndroidVersionCode({ ...options(true), sha256: "0".repeat(64) }, dependencies),
  );
  assert.equal(state.writes.length, 0);
});

test("timeout after a committed write is resolved by rereading under lock, never duplicated", async () => {
  const { state, dependencies } = fixture();
  state.writeFailure = "after";
  assert.equal(
    (await setReleaseAndroidVersionCode(options(true), dependencies)).status,
    "verified-after-write-error",
  );
  assert.equal(state.writes.length, 1);
  assert.equal(
    (await setReleaseAndroidVersionCode(options(true), dependencies)).status,
    "already-set",
  );
  assert.equal(state.writes.length, 1);
  const rejected = fixture();
  rejected.state.writeFailure = "before";
  await assert.rejects(setReleaseAndroidVersionCode(options(true), rejected.dependencies));
  assert.equal(JSON.parse(rejected.state.records[KEY]).androidVersionCode, undefined);
});

test("postwrite mismatches are reported, never repaired with another write", async () => {
  const { state, dependencies } = fixture();
  state.afterWrite = () => {
    state.records[CONFIG] = JSON.stringify({ currentId: "other" });
  };
  await assert.rejects(setReleaseAndroidVersionCode(options(true), dependencies));
  assert.equal(state.writes.length, 1);
});

test("CLI output is only safe status metadata and failures redact private provider diagnostics", async () => {
  const { dependencies } = fixture();
  const lines = [],
    errors = [];
  const configuration = {
    args,
    dependencies,
    writeLine: (value) => lines.push(value),
    writeError: (value) => errors.push(value),
  };
  assert.equal(await runReleaseCodeMaintenance(configuration), 0);
  assert.deepEqual(JSON.parse(lines[0]), { status: "dry-run", releaseId: ID, versionCode: 1 });
  dependencies.read = async () => {
    throw new Error("SECRET token https://private.blob.invalid/path.apk");
  };
  assert.equal(await runReleaseCodeMaintenance(configuration), 1);
  assert.equal(errors.length, 1);
  assert.doesNotMatch(errors[0], /SECRET|private\.blob|path\.apk/);
});

test("configuration rejects missing credentials/OIDC/origin or fallback title before any provider access", () => {
  const env = {
    VITE_PLAYFAB_TITLE_ID: "17FA03",
    PLAYFAB_SECRET_KEY: "fixture-only",
    PUBLIC_APP_URL: "https://civil-craft.vercel.app",
    ADMIN_AUTH_ORIGIN: "",
    BLOB_STORE_ID: "store_fixture",
    VERCEL_OIDC_TOKEN: "fixture-only-oidc",
  };
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  try {
    Object.assign(process.env, env);
    assert.doesNotThrow(assertReleaseMaintenanceConfiguration);
    for (const key of [
      "VITE_PLAYFAB_TITLE_ID",
      "PLAYFAB_SECRET_KEY",
      "BLOB_STORE_ID",
      "VERCEL_OIDC_TOKEN",
    ]) {
      process.env[key] = "";
      assert.throws(assertReleaseMaintenanceConfiguration);
      process.env[key] = env[key];
    }
    process.env.PUBLIC_APP_URL = "https://civil-craft-website.vercel.app";
    assert.throws(assertReleaseMaintenanceConfiguration);
    process.env.PUBLIC_APP_URL = env.PUBLIC_APP_URL;
    process.env.VITE_PLAYFAB_TITLE_ID = "FFFF01";
    assert.throws(assertReleaseMaintenanceConfiguration);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("CLI --help needs no account, token or provider network and explains dry-run boundaries", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/set-release-android-version-code.mjs", "--help"],
    {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
      timeout: 15000,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Dry-run by default/);
  assert.match(result.stdout, /No active-pointer/);
});

test("local APK proof is read-only streamed to the exact hash; invalid evidence fails before provider access", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "civilcraft-release-code-proof-"));
  const proof = path.join(directory, "proof.apk");
  await writeFile(proof, bytes, { flag: "wx" });
  assert.equal(await hashReleaseApkProof(proof), digest);
  await assert.rejects(hashReleaseApkProof(path.join(directory, "missing.apk")));
  await assert.rejects(hashReleaseApkProof("relative.apk"));
  await assert.rejects(hashReleaseApkProof(directory));
  const { dependencies, state } = fixture();
  dependencies.hashProof = hashReleaseApkProof;
  const result = await setReleaseAndroidVersionCode(
    { ...options(), sha256: undefined, proofPath: proof },
    dependencies,
  );
  assert.equal(result.status, "dry-run");
  assert.equal(state.writes.length, 0);
});

test("actual shared lock implementation refuses a concurrent operator before any release write", async () => {
  const { dependencies, state } = fixture();
  const originals = { ...releaseLockStorage };
  let held = false;
  releaseLockStorage.put = async () => {
    if (held) throw new Error("fixture lock busy");
    held = true;
    return { etag: "fixture-owner" };
  };
  releaseLockStorage.del = async (_pathname, settings) => {
    assert.equal(settings.ifMatch, "fixture-owner");
    held = false;
  };
  try {
    dependencies.lock = (task) => releaseWriteLock.run(task);
    await releaseWriteLock.run(async () => {
      await assert.rejects(
        setReleaseAndroidVersionCode(options(true), dependencies),
        /busy or locked/,
      );
      assert.equal(state.writes.length, 0);
      assert.equal(state.reads, 0);
    });
    assert.equal(held, false);
  } finally {
    Object.assign(releaseLockStorage, originals);
  }
});
