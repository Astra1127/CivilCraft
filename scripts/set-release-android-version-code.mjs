// Operator-only maintenance. Never imported by website or game runtime.
// It uses title credentials, not a fabricated staff identity or browser session.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { Readable } from "node:stream";
import { get } from "@vercel/blob";
import { adminGameConfig, object, playFabAdmin } from "../src/lib/playfab/admin-client.server.ts";
import { releaseWriteLock } from "../src/lib/cms/release-write-lock.server.ts";
import { validateReleaseMetadataSnapshot } from "../src/lib/cms/releases.server.ts";
import { apkStorage } from "../src/lib/cms/apk-storage.server.ts";
import { apkPathSchema } from "../src/lib/cms/apk-ticket.server.ts";
import { APK_CONTENT_TYPE, MAX_APK_BYTES } from "../src/lib/cms/apk.ts";
import { parseAndroidVersionCode } from "../src/lib/cms/android-version.ts";

const ORIGIN = "https://civil-craft.vercel.app";
const TITLE_ID = "17FA03";
const CONFIG_KEY = "civilcraft.website.v1.release-config";
const RELEASE_PREFIX = "civilcraft.website.v1.releases.";
const DELETED_PREFIX = "civilcraft.website.v1.release-deleted.";
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[a-zA-Z0-9-]{1,64}$/;
const FAILURE =
  "Android release metadata could not be safely verified or updated. Do not repeat --apply blindly; review the current release first. No private provider details were printed.";
const fail = () => {
  throw new Error(FAILURE);
};
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export function parseReleaseCodeArguments(args) {
  const values = {};
  let apply = false;
  for (let i = 0; i < args.length; i++) {
    const name = args[i];
    if (name === "--apply") {
      if (apply) fail();
      apply = true;
      continue;
    }
    if (
      !["--release-id", "--android-version-code", "--apk-sha256", "--apk-proof"].includes(name) ||
      Object.hasOwn(values, name) ||
      !args[i + 1] ||
      args[i + 1].startsWith("--")
    )
      fail();
    values[name] = args[++i];
  }
  const releaseId = values["--release-id"];
  const versionCode = parseAndroidVersionCode(values["--android-version-code"]);
  const sha256 = values["--apk-sha256"]?.toLowerCase();
  const proofPath = values["--apk-proof"];
  if (!ID.test(releaseId ?? "") || !versionCode || Boolean(sha256) === Boolean(proofPath)) fail();
  if (sha256 && !HASH.test(sha256)) fail();
  if (proofPath && (!path.isAbsolute(proofPath) || !/\.apk$/i.test(proofPath))) fail();
  return { releaseId, versionCode, sha256, proofPath, apply };
}

export function assertReleaseMaintenanceConfiguration() {
  const configuredTitle = process.env.VITE_PLAYFAB_TITLE_ID?.trim();
  const config = adminGameConfig();
  const origin = (process.env.PUBLIC_APP_URL || process.env.ADMIN_AUTH_ORIGIN || "").trim();
  // Require explicit production bindings; never rely on transport's fallback title.
  if (
    !configuredTitle ||
    configuredTitle.toUpperCase() !== TITLE_ID ||
    config.titleId.toUpperCase() !== configuredTitle.toUpperCase() ||
    !config.secret ||
    ![ORIGIN, `${ORIGIN}/`].includes(origin) ||
    !process.env.BLOB_STORE_ID?.trim() ||
    !process.env.VERCEL_OIDC_TOKEN?.trim()
  )
    fail();
}

export async function hashReleaseApkProof(proofPath) {
  if (typeof proofPath !== "string" || !path.isAbsolute(proofPath) || !/\.apk$/i.test(proofPath))
    fail();
  const resolved = await realpath(proofPath);
  const info = await stat(resolved);
  if (!info.isFile() || info.size < 1 || info.size > MAX_APK_BYTES) fail();
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(resolved)) {
    bytes += chunk.length;
    if (bytes > MAX_APK_BYTES) fail();
    hash.update(chunk);
  }
  if (bytes !== info.size) fail();
  return hash.digest("hex");
}

function snapshot(records, releaseId, versionCode) {
  if (!isRecord(records) || records[DELETED_PREFIX + releaseId] != null) fail();
  const rawConfig = records[CONFIG_KEY];
  const rawRelease = records[RELEASE_PREFIX + releaseId];
  if (typeof rawConfig !== "string" || typeof rawRelease !== "string") fail();
  const config = JSON.parse(rawConfig);
  const release = JSON.parse(rawRelease);
  if (!isRecord(config) || !isRecord(release)) fail();
  validateReleaseMetadataSnapshot(config, release);
  if (config.currentId !== releaseId || release.id !== releaseId || !isRecord(release.apk)) fail();
  const apk = release.apk;
  if (
    !apkPathSchema.safeParse(apk.storagePath).success ||
    !apk.storagePath.startsWith(`civilcraft/releases/${releaseId}/`) ||
    !apk.storagePath.endsWith(`/${apk.fileName}`) ||
    !Number.isSafeInteger(apk.fileSizeBytes) ||
    apk.fileSizeBytes < 1 ||
    apk.fileSizeBytes > MAX_APK_BYTES ||
    release.fileName !== apk.fileName ||
    release.fileSizeBytes !== apk.fileSizeBytes ||
    release.fileUrl !== `/api/releases/${releaseId}/download` ||
    (release.androidVersionCode != null && release.androidVersionCode !== versionCode)
  )
    fail();
  return { release, config, rawConfig, apk };
}

function assertApkIdentity(metadata, apk) {
  if (
    !metadata ||
    metadata.pathname !== apk.storagePath ||
    metadata.etag !== apk.etag ||
    metadata.size !== apk.fileSizeBytes ||
    metadata.contentType !== APK_CONTENT_TYPE
  )
    fail();
}

/** Origin reads are streamed and bounded; no local APK copies or private URLs are printed. */
async function verifyPrivateApk(apk, expectedHash, dependencies) {
  assertApkIdentity(await dependencies.head(apk.storagePath), apk);
  const signal = AbortSignal.timeout(45_000);
  const result = await dependencies.get(apk.storagePath, {
    access: "private",
    useCache: false,
    abortSignal: signal,
  });
  if (!result || result.statusCode !== 200 || !result.stream) fail();
  try {
    assertApkIdentity(result.blob, apk);
  } catch (error) {
    await result.stream.cancel().catch(() => undefined);
    throw error;
  }
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of Readable.fromWeb(result.stream, { signal })) {
    bytes += chunk.length;
    if (bytes > apk.fileSizeBytes || bytes > MAX_APK_BYTES) fail();
    hash.update(chunk);
  }
  if (bytes !== apk.fileSizeBytes || hash.digest("hex") !== expectedHash) fail();
  assertApkIdentity(await dependencies.head(apk.storagePath), apk);
}

const defaultDependencies = {
  configure: assertReleaseMaintenanceConfiguration,
  read: async () => object((await playFabAdmin("Admin/GetTitleInternalData"))["Data"]),
  write: async (key, value) => {
    const serialized = JSON.stringify(value);
    if (Buffer.byteLength(serialized) > 9500) fail();
    await playFabAdmin("Admin/SetTitleInternalData", { Key: key, Value: serialized });
  },
  lock: (task) => releaseWriteLock.run(task),
  head: (pathname) => apkStorage.head(pathname),
  get,
  hashProof: hashReleaseApkProof,
};

export async function setReleaseAndroidVersionCode(options, dependencies = defaultDependencies) {
  if (
    !ID.test(options?.releaseId ?? "") ||
    parseAndroidVersionCode(options?.versionCode) !== options.versionCode ||
    !options.versionCode ||
    typeof options.apply !== "boolean" ||
    Boolean(options.sha256) === Boolean(options.proofPath)
  )
    fail();
  dependencies.configure();
  const expectedHash = options.sha256 ?? (await dependencies.hashProof(options.proofPath));
  if (!HASH.test(expectedHash)) fail();
  const inspect = async () => {
    const first = snapshot(await dependencies.read(), options.releaseId, options.versionCode);
    await verifyPrivateApk(first.apk, expectedHash, dependencies);
    // Merge only from a fresh reread. All normal admin writers hold the same lock;
    // an out-of-band operator edit during the hash is retained, never overwritten.
    const latest = snapshot(await dependencies.read(), options.releaseId, options.versionCode);
    if (!isDeepStrictEqual(first.apk, latest.apk)) fail();
    if (!options.apply)
      return { status: "dry-run", releaseId: options.releaseId, versionCode: options.versionCode };
    if (latest.release.androidVersionCode === options.versionCode)
      return {
        status: "already-set",
        releaseId: options.releaseId,
        versionCode: options.versionCode,
      };
    const updated = { ...latest.release, androidVersionCode: options.versionCode };
    let uncertainWrite = false;
    try {
      await dependencies.write(RELEASE_PREFIX + options.releaseId, updated);
    } catch {
      // A timeout can occur after a successful write. Reread under the held lock;
      // never retry an ambiguous write or tell the operator nothing changed.
      uncertainWrite = true;
    }
    const after = snapshot(await dependencies.read(), options.releaseId, options.versionCode);
    if (!isDeepStrictEqual(after.release, updated) || after.rawConfig !== latest.rawConfig) fail();
    return {
      status: uncertainWrite ? "verified-after-write-error" : "updated",
      releaseId: options.releaseId,
      versionCode: options.versionCode,
    };
  };
  return options.apply ? dependencies.lock(inspect) : inspect();
}

export async function runReleaseCodeMaintenance({
  args,
  dependencies = defaultDependencies,
  writeLine = console.log,
  writeError = console.error,
}) {
  try {
    const result = await setReleaseAndroidVersionCode(
      parseReleaseCodeArguments(args),
      dependencies,
    );
    writeLine(JSON.stringify(result));
    return 0;
  } catch {
    writeError(FAILURE);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log(
      "Usage: node --env-file=<private-production-env> scripts/set-release-android-version-code.mjs --release-id <current ID> --android-version-code <verified integer> (--apk-sha256 <verified SHA256> | --apk-proof <absolute verified APK path>) [--apply]\nDry-run by default. Requires canonical main-site origin, explicit PlayFab title/server credentials, and the production private Blob store with fresh Vercel OIDC. Verify the supplied APK's actual Android version code first. --apply hashes the current private APK under the existing release lock and changes only androidVersionCode. No active-pointer, notes, labels, emails, retention, accounts or player data are changed.",
    );
  } else process.exitCode = await runReleaseCodeMaintenance({ args });
}
