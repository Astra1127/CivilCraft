import { get, head, issueSignedToken, presignUrl, getDownloadUrl } from "@vercel/blob";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { AdminApiError } from "../playfab/admin-client.server.ts";
import { APK_CONTENT_TYPE, MAX_APK_BYTES } from "./apk.ts";
import type { ApkUploadTicket } from "./apk-ticket.server.ts";

/** APK-only adapter. Gallery/other stores keep their existing credentials and behavior. */
export const apkStorage = {
  async head(path: string) {
    const value = await head(path, { abortSignal: AbortSignal.timeout(12000) });
    return {
      pathname: value.pathname,
      size: value.size,
      contentType: value.contentType,
      etag: value.etag,
    };
  },
  async readRange(path: string, start: number, end: number): Promise<Uint8Array> {
    const result = await get(path, {
      access: "private",
      useCache: false,
      headers: { Range: `bytes=${start}-${end}` },
      abortSignal: AbortSignal.timeout(12000),
    });
    if (!result || result.statusCode !== 200)
      throw new AdminApiError(503, "The uploaded APK could not be inspected.");
    const reader = result.stream.getReader();
    try {
      // The SDK normalizes 206 to statusCode 200; validate the original response headers.
      const range = result.headers.get("content-range");
      const matched = range?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
      if (
        !matched ||
        Number(matched[1]) !== start ||
        Number(matched[2]) !== end ||
        !Number.isSafeInteger(Number(matched[3])) ||
        Number(matched[3]) <= end ||
        Number(matched[3]) > MAX_APK_BYTES
      )
        throw new AdminApiError(503, "APK storage does not support bounded verification.");
      const limit = end - start + 1;
      let length = 0;
      const chunks: Uint8Array[] = [];
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        length += item.value.length;
        if (length > limit)
          throw new AdminApiError(503, "The uploaded APK could not be inspected safely.");
        chunks.push(item.value);
      }
      if (length !== limit) throw new AdminApiError(503, "The uploaded APK read was incomplete.");
      return Buffer.concat(chunks);
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  },
  async upload(request: Request, body: HandleUploadPresignedBody, ticket: ApkUploadTicket) {
    if (!process.env["BLOB_WEBHOOK_PUBLIC_KEY"]?.trim())
      throw new AdminApiError(
        503,
        "Connect the existing private Blob store to this environment before uploading APKs.",
      );
    return handleUploadPresigned({
      request,
      body,
      // Completion is authenticated explicitly by the admin UI, not a public callback.
      getSignedToken: async (pathname) => {
        if (pathname !== ticket.storagePath)
          throw new AdminApiError(400, "Upload path does not match this build.");
        const token = await issueSignedToken({
          pathname,
          operations: ["put"],
          allowedContentTypes: [APK_CONTENT_TYPE],
          maximumSizeInBytes: ticket.fileSizeBytes,
          validUntil: ticket.expiresAt,
        });
        const urlOptions = {
          addRandomSuffix: false,
          allowOverwrite: false,
          allowedContentTypes: [APK_CONTENT_TYPE],
          maximumSizeInBytes: ticket.fileSizeBytes,
          validUntil: ticket.expiresAt,
          access: "private" as const,
        };
        return { token, urlOptions };
      },
    });
  },
  async downloadUrl(path: string) {
    const validUntil = Date.now() + 5 * 60 * 1000;
    const token = await issueSignedToken({ pathname: path, operations: ["get"], validUntil });
    // Installed SDK runtime requires access even though its GET option type omits it.
    const options = {
      operation: "get" as const,
      pathname: path,
      access: "private" as const,
      validUntil,
    };
    const { presignedUrl } = await presignUrl(token, options);
    const url = new URL(presignedUrl);
    if (
      url.protocol !== "https:" ||
      !url.hostname.endsWith(".private.blob.vercel-storage.com") ||
      url.username ||
      url.password ||
      decodeURIComponent(url.pathname) !== `/${path}`
    )
      throw new AdminApiError(503, "The APK download is temporarily unavailable.");
    return getDownloadUrl(url.href);
  },
};
