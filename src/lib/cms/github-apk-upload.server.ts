import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { z } from "zod";
import { getAdminAuthConfig } from "../admin-auth/config.server.ts";
import { AdminApiError } from "../playfab/admin-client.server.ts";
import { APK_CONTENT_TYPE, MAX_APK_BYTES, validateApkSelection } from "./apk.ts";
import { validateApkArchive } from "./apk-validation.server.ts";
import { githubApi, githubConfig, GithubApiError } from "./github-releases-api.server.ts";
import { githubReleaseWriteLock } from "./github-release-write-lock.server.ts";
import { githubApkAttachmentSchema, type GithubApkAttachment } from "./github-apk-attachment.ts";

export const GITHUB_APK_CHUNK_BYTES = 3 * 1024 * 1024;
const lifetime = 2 * 60 * 60 * 1000;
const root = "/repos/Astra1127/CivilCraft";
const uploadRoot = "https://uploads.github.com/repos/Astra1127/CivilCraft/releases";
const id = z.string().regex(/^[a-zA-Z0-9-]{1,64}$/);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const ticketSchema = z
  .object({
    schema: z.literal(1),
    uploadId: z.string().uuid(),
    releaseId: id,
    staffId: z.string().regex(/^[a-f0-9]{64}$/),
    fileName: z.string().regex(/^[a-zA-Z0-9._-]{1,114}\.apk$/),
    fileSizeBytes: z.number().int().min(1).max(MAX_APK_BYTES),
    previousAttachment: z.string().max(1000).nullable(),
    tag: z.string().regex(/^cc-apk-[a-zA-Z0-9-]{1,64}-[a-f0-9-]{36}$/),
    githubReleaseId: z.number().int().positive(),
    expiresAt: z.number().int().positive(),
  })
  .strict();
export type GithubApkUploadTicket = z.infer<typeof ticketSchema>;
const assetSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().min(1).max(255),
    size: z.number().int().nonnegative(),
    state: z.enum(["uploaded", "starter"]),
    digest: digest.nullable().optional(),
  })
  .passthrough();
type Asset = z.infer<typeof assetSchema>;
const stageSchema = z
  .object({
    id: z.number().int().positive(),
    tag_name: z.string(),
    draft: z.boolean(),
    body: z.string().max(20000).nullable(),
  })
  .passthrough();
type Stage = z.infer<typeof stageSchema>;
const receiptSchema = z
  .object({
    schema: z.literal(1),
    uploadId: z.string().uuid(),
    releaseId: id,
    tag: z.string(),
    githubReleaseId: z.number().int().positive(),
    assetId: z.number().int().positive(),
    fileName: z.string(),
    fileSizeBytes: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
type Receipt = z.infer<typeof receiptSchema>;
const stagingMarker = "civilcraft-apk-staging-v1";
const receiptMarker = "civilcraft-apk-complete-v1";
const unavailable = () =>
  new AdminApiError(
    503,
    "The APK upload could not finish. Retry to check its saved progress; the current download is unchanged.",
  );
const uncertain = () =>
  new AdminApiError(
    409,
    "GitHub has not confirmed this upload yet. Retry shortly. If it remains pending, ask an administrator to review the private upload; do not repeatedly upload the same part.",
  );

function signingKey(staffId: string, purpose = "ticket:"): Buffer {
  const config = getAdminAuthConfig();
  if (purpose === "receipt:" && config)
    return createHmac("sha256", config.sessionSecret)
      .update("civilcraft-github-apk-receipt:v1")
      .digest();
  const account = config?.users.find((user) => user.id === staffId);
  if (!config || !account) throw new AdminApiError(401, "Administrator sign-in is required.");
  return createHmac("sha256", config.sessionSecret)
    .update("civilcraft-github-apk:v1:")
    .update(staffId)
    .update(account.passwordHash)
    .digest();
}
function sign(value: unknown, staffId: string, purpose: string): string {
  const encoded = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encoded}.${createHmac("sha256", signingKey(staffId, purpose)).update(purpose).update(encoded).digest("hex")}`;
}
function decode(value: unknown, staffId: string, purpose: string): unknown {
  if (typeof value !== "string" || value.length > 8192)
    throw new Error("Invalid upload authorization");
  const parts = value.split(".");
  if (
    parts.length !== 2 ||
    !/^[a-zA-Z0-9_-]+$/.test(parts[0]!) ||
    !/^[a-f0-9]{64}$/.test(parts[1]!)
  )
    throw new Error("Invalid upload authorization");
  const expected = createHmac("sha256", signingKey(staffId, purpose))
    .update(purpose)
    .update(parts[0]!)
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(parts[1]!, "hex")))
    throw new Error("Invalid upload authorization");
  return JSON.parse(Buffer.from(parts[0]!, "base64url").toString("utf8"));
}
export function readGithubApkUploadTicket(value: unknown, staffId: string): GithubApkUploadTicket {
  try {
    const claim = ticketSchema.parse(decode(value, staffId, "ticket:"));
    if (
      claim.staffId !== staffId ||
      claim.expiresAt <= Date.now() ||
      claim.expiresAt > Date.now() + lifetime + 5000 ||
      claim.tag !== `cc-apk-${claim.releaseId}-${claim.uploadId}`
    )
      throw new Error();
    return claim;
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 401) throw error;
    throw new AdminApiError(
      400,
      "Upload authorization expired or is invalid. Select the APK again.",
    );
  }
}
function marker(name: string, value: string): string {
  return `<!-- ${name}:${value} -->`;
}
function partName(index: number): string {
  return `cc-part-${String(index).padStart(5, "0")}`;
}
function chunkCount(claim: GithubApkUploadTicket): number {
  return Math.ceil(claim.fileSizeBytes / GITHUB_APK_CHUNK_BYTES);
}
function chunkLength(claim: GithubApkUploadTicket, index: number): number {
  if (!Number.isSafeInteger(index) || index < 0 || index >= chunkCount(claim))
    throw new AdminApiError(400, "Choose a valid APK upload part.");
  return Math.min(GITHUB_APK_CHUNK_BYTES, claim.fileSizeBytes - index * GITHUB_APK_CHUNK_BYTES);
}
async function readBounded(response: Response, expected: number): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) throw unavailable();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > expected) throw unavailable();
      chunks.push(item.value);
    }
    if (size !== expected) throw unavailable();
    return Buffer.concat(chunks, size);
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
async function chunkBody(request: Request, expected: number): Promise<Buffer> {
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/octet-stream")
    throw new AdminApiError(415, "An APK upload part is required.");
  const length = request.headers.get("content-length");
  if (length !== null && Number(length) !== expected)
    throw new AdminApiError(400, "The APK upload part has the wrong size.");
  try {
    return await readBounded(new Response(request.body), expected);
  } catch {
    throw new AdminApiError(400, "The APK upload part is incomplete or too large.");
  }
}
async function listAssets(claim: GithubApkUploadTicket): Promise<Asset[]> {
  const assets: Asset[] = [];
  for (let page = 1; page <= 3; page++) {
    const batch = z
      .array(assetSchema)
      .max(100)
      .parse(
        await githubApi(
          `${root}/releases/${claim.githubReleaseId}/assets?per_page=100&page=${page}`,
        ),
      );
    assets.push(...batch);
    if (batch.length < 100) break;
    if (page === 3)
      throw new AdminApiError(
        409,
        "The private upload contains unexpected files. Ask an administrator to review it.",
      );
  }
  if (
    assets.length > chunkCount(claim) + 1 ||
    new Set(assets.map((asset) => asset.name)).size !== assets.length ||
    assets.some((asset) => asset.name !== claim.fileName && !/^cc-part-\d{5}$/.test(asset.name))
  )
    throw new AdminApiError(
      409,
      "The private upload contains unexpected files. Ask an administrator to review it.",
    );
  return assets;
}
function readReceipt(stage: Stage, claim: GithubApkUploadTicket): Receipt | undefined {
  const match = stage.body?.match(
    /<!-- civilcraft-apk-complete-v1:([a-zA-Z0-9_-]+\.[a-f0-9]{64}) -->/,
  );
  if (!match) return undefined;
  try {
    const receipt = receiptSchema.parse(decode(match[1], claim.staffId, "receipt:"));
    for (const key of [
      "uploadId",
      "releaseId",
      "tag",
      "githubReleaseId",
      "fileName",
      "fileSizeBytes",
    ] as const)
      if (receipt[key] !== claim[key]) throw new Error();
    return receipt;
  } catch {
    throw new AdminApiError(
      409,
      "The upload verification record has changed. Ask an administrator to review it.",
    );
  }
}
async function readStage(
  claim: GithubApkUploadTicket,
  ticket: string,
): Promise<{ stage: Stage; receipt?: Receipt }> {
  let stage = stageSchema.parse(await githubApi(`${root}/releases/${claim.githubReleaseId}`));
  if (stage.id !== claim.githubReleaseId)
    throw new AdminApiError(409, "The private upload no longer matches this build.");
  const receipt = readReceipt(stage, claim);
  if (stage.tag_name !== claim.tag) {
    // GitHub can replace an uncreated draft tag with its own placeholder when
    // an older body-only PATCH omitted tag_name. Recover only this signed upload.
    if (
      !stage.draft ||
      !/^untagged-[a-f0-9]{20}$/.test(stage.tag_name) ||
      (!receipt && stage.body !== marker(stagingMarker, ticket))
    )
      throw new AdminApiError(409, "The private upload no longer matches this build.");
    const expectedBody = stage.body;
    stage = stageSchema.parse(
      await githubApi(`${root}/releases/${claim.githubReleaseId}`, {
        method: "PATCH",
        body: {
          tag_name: claim.tag,
          target_commitish: "main",
          draft: true,
          prerelease: true,
          body: expectedBody,
        },
      }),
    );
    if (
      stage.id !== claim.githubReleaseId ||
      stage.tag_name !== claim.tag ||
      !stage.draft ||
      stage.body !== expectedBody
    )
      throw new AdminApiError(409, "The private upload no longer matches this build.");
  }
  if (!receipt && (!stage.draft || stage.body !== marker(stagingMarker, ticket)))
    throw new AdminApiError(
      409,
      "The private upload has changed. Ask an administrator to review it.",
    );
  return { stage, ...(receipt ? { receipt } : {}) };
}
function trustedCdn(url: URL): boolean {
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !url.port &&
    !url.hash &&
    (url.hostname === "release-assets.githubusercontent.com" ||
      url.hostname === "objects.githubusercontent.com") &&
    /^\/github-production-release-asset(?:-[a-f0-9]+)?\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(
      url.pathname,
    )
  );
}
/** The bearer credential is used on api.github.com only, never on its signed CDN redirect. */
async function downloadAsset(asset: Asset, signal: AbortSignal): Promise<Buffer> {
  if (asset.size > GITHUB_APK_CHUNK_BYTES || asset.size < 1 || asset.state !== "uploaded")
    throw unavailable();
  const config = githubConfig();
  let target = new URL(`https://api.github.com${root}/releases/assets/${asset.id}`);
  for (let redirects = 0; redirects <= 2; redirects++) {
    const api =
      target.origin === "https://api.github.com" &&
      target.pathname === `${root}/releases/assets/${asset.id}`;
    if (!api && !trustedCdn(target)) throw unavailable();
    const response = await fetch(target, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      credentials: "omit",
      signal,
      headers: {
        Accept: "application/octet-stream",
        "User-Agent": "CivilCraft-APK-Admin",
        ...(api
          ? { Authorization: `Bearer ${config.token}`, "X-GitHub-Api-Version": "2026-03-10" }
          : {}),
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel().catch(() => undefined);
      const location = response.headers.get("location");
      if (!location || redirects === 2) throw unavailable();
      target = new URL(location, target);
      continue;
    }
    const length = response.headers.get("content-length");
    if (
      response.status !== 200 ||
      (length !== null && Number(length) !== asset.size) ||
      !/^(application\/octet-stream|application\/vnd.android.package-archive)(?:;|$)/i.test(
        response.headers.get("content-type") ?? "",
      ) ||
      (response.headers.get("content-encoding") &&
        response.headers.get("content-encoding") !== "identity")
    ) {
      await response.body?.cancel().catch(() => undefined);
      throw unavailable();
    }
    const bytes = await readBounded(response, asset.size);
    if (asset.digest !== `sha256:${createHash("sha256").update(bytes).digest("hex")}`)
      throw new AdminApiError(409, "An APK upload part changed. Select the APK again.");
    return bytes;
  }
  throw unavailable();
}
async function uploadAsset(
  claim: GithubApkUploadTicket,
  name: string,
  size: number,
  body: BodyInit,
  signal: AbortSignal,
): Promise<Asset> {
  const config = githubConfig();
  const options: RequestInit & { duplex: "half" } = {
    method: "POST",
    body,
    duplex: "half",
    redirect: "error",
    cache: "no-store",
    credentials: "omit",
    signal,
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "CivilCraft-APK-Admin",
      "Content-Type": name === claim.fileName ? APK_CONTENT_TYPE : "application/octet-stream",
      "Content-Length": String(size),
    },
  };
  const response = await fetch(
    `${uploadRoot}/${claim.githubReleaseId}/assets?name=${encodeURIComponent(name)}`,
    options,
  );
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new GithubApiError(response.status);
  }
  if (!/^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? "")) {
    await response.body?.cancel().catch(() => undefined);
    throw unavailable();
  }
  // Asset metadata is small. A broken provider cannot cause a whole APK JSON buffer.
  const reader = response.body?.getReader();
  if (!reader) throw unavailable();
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.byteLength;
      if (length > 32768) throw unavailable();
      parts.push(item.value);
    }
    return assetSchema.parse(JSON.parse(Buffer.concat(parts, length).toString("utf8")));
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
function matchesAsset(asset: Asset, name: string, size: number, sha256: string): boolean {
  return (
    asset.name === name &&
    asset.size === size &&
    asset.state === "uploaded" &&
    asset.digest === `sha256:${sha256}`
  );
}
async function hashAndValidate(
  claim: GithubApkUploadTicket,
  parts: Asset[],
  signal: AbortSignal,
): Promise<string> {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(await downloadAsset(part, signal));
  const sha256 = hash.digest("hex");
  // Only one part is retained for bounded random reads. Validation itself caps each read at8MiB.
  let cached: { index: number; bytes: Buffer } | undefined;
  await validateApkArchive(claim.fileSizeBytes, async (start, end) => {
    const result: Buffer[] = [];
    for (let position = start; position <= end;) {
      const index = Math.floor(position / GITHUB_APK_CHUNK_BYTES);
      if (cached?.index !== index)
        cached = { index, bytes: await downloadAsset(parts[index]!, signal) };
      const offset = position % GITHUB_APK_CHUNK_BYTES;
      const count = Math.min(end - position + 1, cached.bytes.length - offset);
      if (count < 1) throw unavailable();
      result.push(cached.bytes.subarray(offset, offset + count));
      position += count;
    }
    return Buffer.concat(result);
  });
  return sha256;
}
async function mergeParts(
  claim: GithubApkUploadTicket,
  parts: Asset[],
  sha256: string,
  signal: AbortSignal,
): Promise<Asset> {
  let index = 0;
  let streamed = 0;
  const hash = createHash("sha256");
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (index === parts.length) {
          controller.close();
          return;
        }
        const bytes = await downloadAsset(parts[index++]!, signal);
        streamed += bytes.length;
        hash.update(bytes);
        controller.enqueue(bytes);
      } catch (error) {
        controller.error(error);
      }
    },
  });
  let result: Asset | undefined;
  try {
    result = await uploadAsset(claim, claim.fileName, claim.fileSizeBytes, stream, signal);
  } catch {
    /* A committed upstream upload may have lost its HTTP response. Reconcile; never blindly POST it again. */
  }
  if (!result) result = (await listAssets(claim)).find((asset) => asset.name === claim.fileName);
  // Digest is checked against the fully validated input, including reconciliation after disconnect.
  if (!result || !matchesAsset(result, claim.fileName, claim.fileSizeBytes, sha256))
    throw uncertain();
  if (streamed === claim.fileSizeBytes && hash.digest("hex") !== sha256) throw unavailable();
  return result;
}
function attachment(
  claim: GithubApkUploadTicket,
  receipt: Receipt,
  published: boolean,
): GithubApkAttachment {
  return {
    tag: claim.tag,
    githubReleaseId: claim.githubReleaseId,
    assetId: receipt.assetId,
    fileName: claim.fileName,
    fileSizeBytes: claim.fileSizeBytes,
    sha256: receipt.sha256,
    uploadedAt: new Date().toISOString(),
    published,
    url: `https://github.com/Astra1127/CivilCraft/releases/download/${claim.tag}/${claim.fileName}`,
  };
}

/** Staff/origin authentication must run before these operations. No browser receives GitHub credentials. */
export const githubApkUploads = {
  async prepare(input: {
    staffId: string;
    releaseId: string;
    fileName: string;
    fileSizeBytes: number;
    previousAttachment: string | null;
  }) {
    githubConfig();
    signingKey(input.staffId);
    let fileName: string;
    try {
      fileName = validateApkSelection({ name: input.fileName, size: input.fileSizeBytes });
    } catch {
      throw new AdminApiError(400, "Choose one APK between 1 byte and 512 MB.");
    }
    id.parse(input.releaseId);
    if (input.previousAttachment !== null && input.previousAttachment.length > 1000)
      throw new AdminApiError(400, "The selected build could not be verified.");
    const uploadId = randomUUID();
    const tag = `cc-apk-${input.releaseId}-${uploadId}`;
    const stage = stageSchema.parse(
      await githubApi(`${root}/releases`, {
        method: "POST",
        body: {
          tag_name: tag,
          name: "Civil Craft private APK upload",
          body: "Private APK staging; not ready for download.",
          draft: true,
          prerelease: true,
          target_commitish: "main",
        },
      }),
    );
    if (!stage.draft || stage.tag_name !== tag) throw unavailable();
    const claim = ticketSchema.parse({
      ...input,
      fileName,
      uploadId,
      tag,
      schema: 1,
      githubReleaseId: stage.id,
      expiresAt: Date.now() + lifetime,
    });
    const ticket = sign(claim, input.staffId, "ticket:");
    const expectedBody = marker(stagingMarker, ticket);
    const updated = stageSchema.parse(
      await githubApi(`${root}/releases/${stage.id}`, {
        method: "PATCH",
        body: {
          tag_name: tag,
          target_commitish: "main",
          draft: true,
          prerelease: true,
          body: expectedBody,
        },
      }),
    );
    if (
      updated.id !== stage.id ||
      updated.tag_name !== tag ||
      !updated.draft ||
      updated.body !== expectedBody
    )
      throw unavailable();
    return {
      ticket,
      chunkSize: GITHUB_APK_CHUNK_BYTES,
      chunkCount: chunkCount(claim),
      fileName,
      fileSizeBytes: claim.fileSizeBytes,
      expiresAt: claim.expiresAt,
    };
  },
  async uploadChunk(value: unknown, staffId: string, index: number, request: Request) {
    const claim = readGithubApkUploadTicket(value, staffId);
    const bytes = await chunkBody(request, chunkLength(claim, index));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    return githubReleaseWriteLock.runNamed(claim.uploadId, async () => {
      const { stage, receipt } = await readStage(claim, String(value));
      if (!stage.draft || receipt)
        throw new AdminApiError(
          409,
          "This APK has already finished uploading. Continue verification.",
        );
      const name = partName(index);
      let existing = (await listAssets(claim)).find((asset) => asset.name === name);
      if (!existing) {
        try {
          existing = await uploadAsset(
            claim,
            name,
            bytes.length,
            new Uint8Array(bytes),
            AbortSignal.timeout(45000),
          );
        } catch {
          existing = (await listAssets(claim)).find((asset) => asset.name === name);
        }
      }
      if (!existing) throw uncertain();
      if (!matchesAsset(existing, name, bytes.length, sha256))
        throw new AdminApiError(
          409,
          "This upload part is pending or contains different bytes. Retry shortly, or select the APK again.",
        );
      return { success: true, index, uploadedBytes: bytes.length };
    });
  },
  async finalize(value: unknown, staffId: string): Promise<GithubApkAttachment> {
    const claim = readGithubApkUploadTicket(value, staffId);
    return githubReleaseWriteLock.runNamed(claim.uploadId, async () => {
      const { stage, receipt: savedReceipt } = await readStage(claim, String(value));
      const signal = AbortSignal.timeout(240000);
      let assets = await listAssets(claim);
      let receipt = savedReceipt;
      let final = assets.find((asset) => asset.name === claim.fileName);
      if (!receipt) {
        const parts = Array.from({ length: chunkCount(claim) }, (_, index) =>
          assets.find((asset) => asset.name === partName(index)),
        );
        if (
          parts.some(
            (part, index) =>
              !part ||
              part.state !== "uploaded" ||
              part.size !== chunkLength(claim, index) ||
              !part.digest,
          )
        )
          throw new AdminApiError(
            409,
            "Some APK upload parts are missing or pending. Retry the upload before verifying.",
          );
        const completeParts = parts as Asset[];
        const sha256 = await hashAndValidate(claim, completeParts, signal);
        if (!final) final = await mergeParts(claim, completeParts, sha256, signal);
        if (!matchesAsset(final, claim.fileName, claim.fileSizeBytes, sha256)) throw uncertain();
        receipt = {
          schema: 1,
          uploadId: claim.uploadId,
          releaseId: claim.releaseId,
          tag: claim.tag,
          githubReleaseId: claim.githubReleaseId,
          assetId: final.id,
          fileName: claim.fileName,
          fileSizeBytes: claim.fileSizeBytes,
          sha256,
        };
        // This non-secret signed audit record commits verification before irreversible staging cleanup.
        const receiptBody = marker(receiptMarker, sign(receipt, staffId, "receipt:"));
        const verified = stageSchema.parse(
          await githubApi(`${root}/releases/${claim.githubReleaseId}`, {
            method: "PATCH",
            body: {
              tag_name: claim.tag,
              target_commitish: "main",
              draft: true,
              prerelease: true,
              body: receiptBody,
            },
          }),
        );
        if (
          verified.id !== claim.githubReleaseId ||
          verified.tag_name !== claim.tag ||
          !verified.draft ||
          verified.body !== receiptBody
        )
          throw unavailable();
      }
      if (
        !final ||
        final.id !== receipt.assetId ||
        !matchesAsset(final, claim.fileName, claim.fileSizeBytes, receipt.sha256)
      )
        throw new AdminApiError(
          409,
          "The verified APK changed. Ask an administrator to review it.",
        );
      if (stage.draft) {
        const parts = assets.filter((asset) => asset.name !== claim.fileName);
        for (const [index, part] of parts.entries()) {
          signal.throwIfAborted();
          if (parts.length > 10 && index > 0) await pause(1000, undefined, { signal });
          if (!/^cc-part-\d{5}$/.test(part.name)) throw unavailable();
          await githubApi(`${root}/releases/assets/${part.id}`, { method: "DELETE" });
        }
        assets = await listAssets(claim);
        if (assets.length !== 1 || assets[0]?.id !== final.id) throw unavailable();
      } else if (assets.length !== 1)
        throw new AdminApiError(
          409,
          "The published APK release contains unexpected files. Ask an administrator to review it.",
        );
      return attachment(claim, receipt, !stage.draft);
    });
  },
  async publish(value: GithubApkAttachment): Promise<GithubApkAttachment> {
    const apk = githubApkAttachmentSchema.parse(value);
    const stage = stageSchema.parse(await githubApi(`${root}/releases/${apk.githubReleaseId}`));
    const receiptMatch = stage.body?.match(
      /<!-- civilcraft-apk-complete-v1:([a-zA-Z0-9_-]+\.[a-f0-9]{64}) -->/,
    );
    let receipt: Receipt;
    try {
      receipt = receiptSchema.parse(decode(receiptMatch?.[1], "", "receipt:"));
    } catch {
      throw new AdminApiError(
        409,
        "The APK verification record is unavailable. Verify the upload again before publishing.",
      );
    }
    if (
      stage.id !== apk.githubReleaseId ||
      stage.tag_name !== apk.tag ||
      receipt.tag !== apk.tag ||
      receipt.githubReleaseId !== apk.githubReleaseId ||
      receipt.assetId !== apk.assetId ||
      receipt.fileName !== apk.fileName ||
      receipt.fileSizeBytes !== apk.fileSizeBytes ||
      receipt.sha256 !== apk.sha256
    )
      throw new AdminApiError(409, "The verified APK changed. The current download was preserved.");
    const assets = z
      .array(assetSchema)
      .max(2)
      .parse(await githubApi(`${root}/releases/${apk.githubReleaseId}/assets?per_page=2&page=1`));
    const asset = assets[0];
    if (
      assets.length !== 1 ||
      !asset ||
      asset.id !== apk.assetId ||
      !matchesAsset(asset, apk.fileName, apk.fileSizeBytes, apk.sha256)
    )
      throw new AdminApiError(
        409,
        "The verified APK is unavailable or changed. The current download was preserved.",
      );
    if (stage.draft) {
      const safeBody = `Civil Craft Android APK.\n\nFile: ${apk.fileName}\n\nSHA-256: ${apk.sha256}\n\n${marker(receiptMarker, sign(receipt, "", "receipt:"))}`;
      const published = stageSchema.parse(
        await githubApi(`${root}/releases/${apk.githubReleaseId}`, {
          method: "PATCH",
          body: {
            tag_name: apk.tag,
            target_commitish: "main",
            name: `Civil Craft Android — ${apk.fileName}`,
            body: safeBody,
            draft: false,
            prerelease: true,
          },
        }),
      );
      if (published.draft || published.tag_name !== apk.tag) throw unavailable();
    }
    return { ...apk, published: true };
  },
};
