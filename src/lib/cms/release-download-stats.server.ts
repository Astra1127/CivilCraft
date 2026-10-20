import { BlobNotFoundError, BlobPreconditionFailedError, get, put } from "@vercel/blob";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { adminGameConfig } from "../playfab/admin-client.server.ts";

const MAX_BYTES = 256 * 1024;
const MAX_RELEASES = 1000;
const REQUEST_WINDOW = 128;
const idSchema = z.string().regex(/^[a-zA-Z0-9-]{1,64}$/);
const countSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const schema = z
  .object({
    version: z.literal(1),
    trackingSince: z.string().datetime(),
    total: countSchema,
    byRelease: z.record(idSchema, countSchema),
    recentRequests: z.array(z.string().uuid()).max(REQUEST_WINDOW),
  })
  .strict()
  .superRefine((value, context) => {
    const counts = Object.values(value.byRelease);
    const sum = counts.reduce((total, count) => total + count, 0);
    if (
      counts.length > MAX_RELEASES ||
      !Number.isSafeInteger(sum) ||
      sum !== value.total ||
      new Set(value.recentRequests).size !== value.recentRequests.length
    )
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid download totals." });
  });

export interface ReleaseDownloadCounts {
  total: number;
  byRelease: Record<string, number>;
  trackingSince: string | null;
}

/** Separate from release metadata/retention and never includes visitor identity. */
export const releaseDownloadStorage = { get, put };

function pathname(): string {
  return `civilcraft/release-analytics/${adminGameConfig().titleId.toUpperCase()}/downloads.json`;
}

async function withDeadline<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      // This SDK stops network retries on AbortError, not TimeoutError. The
      // outer race also bounds SDK retry sleeps or an unresponsive adapter.
      controller.abort();
      reject(new Error("Download statistics timed out."));
    }, 3000);
  });
  try {
    return await Promise.race([task(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

async function snapshot(path: string, signal: AbortSignal) {
  signal.throwIfAborted();
  let result: Awaited<ReturnType<typeof get>>;
  try {
    result = await releaseDownloadStorage.get(path, {
      access: "private",
      useCache: false,
      abortSignal: signal,
    });
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    throw error;
  }
  if (signal.aborted) {
    await result?.stream?.cancel().catch(() => undefined);
    signal.throwIfAborted();
  }
  if (!result) return null;
  if (
    result.statusCode !== 200 ||
    result.blob.pathname !== path ||
    !result.blob.etag ||
    !Number.isSafeInteger(result.blob.size) ||
    result.blob.size < 1 ||
    result.blob.size > MAX_BYTES
  ) {
    await result.stream?.cancel().catch(() => undefined);
    throw new Error("Download statistics are unavailable.");
  }
  const reader = result.stream.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const item = await reader.read();
      signal.throwIfAborted();
      if (item.done) break;
      bytes += item.value.byteLength;
      if (bytes > MAX_BYTES) throw new Error("Download statistics exceeded their safe size.");
      chunks.push(item.value);
    }
    if (bytes !== result.blob.size) throw new Error("Download statistics are incomplete.");
    return {
      value: schema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8"))),
      etag: result.blob.etag,
    };
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => undefined);
  }
}

export const releaseDownloadStats = {
  async read(): Promise<ReleaseDownloadCounts> {
    return withDeadline(async (signal) => {
      const saved = await snapshot(pathname(), signal);
      if (!saved) return { total: 0, byRelease: {}, trackingSince: null };
      return {
        total: saved.value.total,
        byRelease: saved.value.byRelease,
        trackingSince: saved.value.trackingSince,
      };
    });
  },

  async record(releaseId: string): Promise<void> {
    idSchema.parse(releaseId);
    return withDeadline(async (signal) => {
      const path = pathname();
      const requestId = randomUUID();
      let initialTotal: number | undefined;
      for (let attempt = 0; attempt < 5; attempt++) {
        const saved = await snapshot(path, signal);
        signal.throwIfAborted();
        const previous = saved?.value;
        if (previous?.recentRequests.includes(requestId)) return;
        initialTotal ??= previous?.total ?? 0;
        if (
          (previous?.total ?? 0) < initialTotal ||
          (previous?.total ?? 0) - initialTotal >= REQUEST_WINDOW
        )
          throw new Error("Download statistics changed beyond the safe retry window.");
        const count =
          previous && Object.hasOwn(previous.byRelease, releaseId)
            ? previous.byRelease[releaseId]!
            : 0;
        const next = schema.parse({
          version: 1,
          trackingSince: previous?.trackingSince ?? new Date().toISOString(),
          total: (previous?.total ?? 0) + 1,
          byRelease: { ...previous?.byRelease, [releaseId]: count + 1 },
          recentRequests: [
            ...(previous?.recentRequests ?? []).slice(-(REQUEST_WINDOW - 1)),
            requestId,
          ],
        });
        const content = JSON.stringify(next);
        if (Buffer.byteLength(content) > MAX_BYTES)
          throw new Error("Download statistics are full.");
        try {
          signal.throwIfAborted();
          await releaseDownloadStorage.put(path, content, {
            access: "private",
            addRandomSuffix: false,
            contentType: "application/json",
            cacheControlMaxAge: 60,
            abortSignal: signal,
            ...(saved ? { ifMatch: saved.etag } : { allowOverwrite: false }),
          });
          return;
        } catch (error) {
          // The SDK can retry a committed PUT after losing its response. Keep a
          // bounded, anonymous request window to recognize that commit before
          // incrementing again; never retry other ambiguous failures.
          if (!(error instanceof BlobPreconditionFailedError)) throw error;
        }
      }
      throw new Error("Download statistics are busy.");
    });
  },
};

export function shouldCountReleaseDownload(request: Request, admin: boolean): boolean {
  return (
    !admin &&
    request.method === "GET" &&
    !request.headers.has("range") &&
    !["purpose", "sec-purpose", "x-purpose"].some((name) =>
      /prefetch|prerender/i.test(request.headers.get(name) ?? ""),
    )
  );
}
