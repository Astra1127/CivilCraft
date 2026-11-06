import { AdminApiError } from "../playfab/admin-client.server.ts";
import { APK_CONTENT_TYPE } from "./apk.ts";

export interface GithubApkBinding {
  readonly releaseId: string;
  readonly fileName: string;
  readonly fileSizeBytes: number;
  readonly url: string;
  readonly sha256: string;
  readonly assetId: number;
  readonly githubReleaseId: number;
}

type ReleaseIdentity = {
  id: string;
  version: string;
  build: string;
  androidVersionCode?: number | null;
  fileName: string | null;
  fileSizeBytes: number | null;
  apk?:
    | {
        storagePath: string;
        fileName: string;
        fileSizeBytes: number;
        etag: string;
        uploadedAt: string;
      }
    | undefined;
};

/** Reviewed distribution of the existing APK, not a new game version. Keeping
 * this binding in source avoids writing release metadata through a suspended
 * Blob mutex or changing the version announcement. The full asset SHA-256 is
 * checked during publication; the runtime probe reads only its ZIP header. */
const reviewed = Object.freeze({
  releaseId: "1db44dc0-eea1-43a1-8aeb-a4109fbf13e3",
  version: "BETA 0.0.0.6",
  build: "7",
  androidVersionCode: 13,
  fileName: "CivilCraft_10-29-26.apk",
  fileSizeBytes: 128537911,
  url: "https://github.com/Astra1127/CivilCraft/releases/download/android-2026-10-29/CivilCraft_10-29-26.apk",
  sha256: "86e57ece9dfcbed4763108f0d66f035c9060e31eb080e147cc186bfc9608025c",
  assetId: 715709073,
  githubReleaseId: 436053811,
  attachmentCutoff: Date.parse("2026-11-06T03:04:54Z"),
});
const binding: GithubApkBinding = Object.freeze({
  releaseId: reviewed.releaseId,
  fileName: reviewed.fileName,
  fileSizeBytes: reviewed.fileSizeBytes,
  url: reviewed.url,
  sha256: reviewed.sha256,
  assetId: reviewed.assetId,
  githubReleaseId: reviewed.githubReleaseId,
});

export function resolveGithubApk(release: ReleaseIdentity): GithubApkBinding | undefined {
  const apk = release.apk;
  const uploadedAt = apk ? Date.parse(apk.uploadedAt) : NaN;
  if (
    release.id !== reviewed.releaseId ||
    release.version !== reviewed.version ||
    release.build !== reviewed.build ||
    release.androidVersionCode !== reviewed.androidVersionCode ||
    release.fileName !== reviewed.fileName ||
    release.fileSizeBytes !== reviewed.fileSizeBytes ||
    !apk ||
    apk.fileName !== reviewed.fileName ||
    apk.fileSizeBytes !== reviewed.fileSizeBytes ||
    !apk.etag ||
    !Number.isFinite(uploadedAt) ||
    uploadedAt >= reviewed.attachmentCutoff ||
    !new RegExp(
      `^civilcraft/releases/${reviewed.releaseId}/[a-zA-Z0-9-]{1,64}/${reviewed.fileName.replaceAll(".", "\\.")}$`,
    ).test(apk.storagePath)
  )
    return undefined;
  return binding;
}

const unavailable = "The APK download is temporarily unavailable from GitHub. Please try again.";
const TTL_MS = 60_000;
const TIMEOUT_MS = 8_000;
let cache: { key: string; verifiedUntil: number; pending?: Promise<void> } | undefined;

function reviewedBinding(value: GithubApkBinding): boolean {
  return (
    value.releaseId === binding.releaseId &&
    value.fileName === binding.fileName &&
    value.fileSizeBytes === binding.fileSizeBytes &&
    value.url === binding.url &&
    value.sha256 === binding.sha256 &&
    value.assetId === binding.assetId &&
    value.githubReleaseId === binding.githubReleaseId
  );
}

function allowedTarget(target: URL): boolean {
  if (
    target.protocol !== "https:" ||
    target.username ||
    target.password ||
    target.port ||
    target.hash
  )
    return false;
  if (target.hostname === "github.com") return target.href === binding.url;
  return (
    target.hostname === "release-assets.githubusercontent.com" &&
    /^\/github-production-release-asset\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(target.pathname)
  );
}

async function probe(value: GithubApkBinding, signal: AbortSignal): Promise<void> {
  let target = new URL(value.url);
  for (let redirects = 0; redirects <= 2; redirects++) {
    signal.throwIfAborted();
    if (!allowedTarget(target)) throw new Error("Unexpected APK host or path");
    const response = await fetch(target, {
      method: "GET",
      credentials: "omit",
      headers: { Range: "bytes=0-3", Accept: "application/octet-stream" },
      cache: "no-store",
      redirect: "manual",
      signal,
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel().catch(() => undefined);
      const location = response.headers.get("location");
      if (!location || redirects === 2) throw new Error("Incomplete APK redirect");
      target = new URL(location, target);
      continue;
    }
    const type = response.headers.get("content-type")?.split(";")[0]?.trim();
    const length = response.headers.get("content-length");
    const encoding = response.headers.get("content-encoding");
    if (
      response.status !== 206 ||
      response.headers.get("content-range") !== `bytes 0-3/${value.fileSizeBytes}` ||
      (type !== APK_CONTENT_TYPE && type !== "application/octet-stream") ||
      (length !== null && length !== "4") ||
      (encoding !== null && encoding !== "identity") ||
      !response.body
    ) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("APK range unavailable");
    }
    const reader = response.body.getReader();
    const abort = () => {
      void reader.cancel().catch(() => undefined);
    };
    signal.addEventListener("abort", abort, { once: true });
    const bytes: number[] = [];
    try {
      for (let chunks = 0; ; chunks++) {
        signal.throwIfAborted();
        if (chunks >= 8) throw new Error("Too many APK chunks");
        const item = await reader.read();
        if (item.done) break;
        if (bytes.length + item.value.byteLength > 4) throw new Error("Unbounded APK response");
        bytes.push(...item.value);
      }
      if (
        bytes.length !== 4 ||
        bytes[0] !== 0x50 ||
        bytes[1] !== 0x4b ||
        bytes[2] !== 0x03 ||
        bytes[3] !== 0x04
      )
        throw new Error("APK header unavailable");
      return;
    } finally {
      signal.removeEventListener("abort", abort);
      await reader.cancel().catch(() => undefined);
    }
  }
  throw new Error("Too many APK redirects");
}

async function boundedProbe(value: GithubApkBinding): Promise<void> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("APK verification timed out"));
    }, TIMEOUT_MS);
  });
  try {
    await Promise.race([probe(value, controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

export const githubApkStorage = {
  async verifyDownload(value: GithubApkBinding): Promise<void> {
    if (!reviewedBinding(value)) throw new AdminApiError(503, unavailable);
    const key = binding.url;
    if (cache?.key === key) {
      if (cache.pending) return cache.pending;
      if (cache.verifiedUntil > Date.now()) return;
    }
    // One reviewed asset and one pending probe; failures never become cached readiness.
    const entry: NonNullable<typeof cache> = { key, verifiedUntil: 0 };
    cache = entry;
    entry.pending = boundedProbe(binding)
      .then(() => {
        entry.verifiedUntil = Date.now() + TTL_MS;
      })
      .catch(() => {
        if (cache === entry) cache = undefined;
        throw new AdminApiError(503, unavailable);
      })
      .finally(() => {
        delete entry.pending;
      });
    return entry.pending;
  },
};
