import { randomUUID } from "node:crypto";
import { put, del } from "@vercel/blob";
import { AdminApiError } from "../playfab/admin-client.server.ts";

const pathname = "civilcraft/release-control/write-lock.json";
export const releaseLockStorage = { put, del };
/** Cross-instance mutex, deliberately without timeout takeover. A crashed worker
 * leaves a hold for operator review; never race a live writer by expiring its lock. */
export const releaseWriteLock = {
  async run<T>(task: () => Promise<T>): Promise<T> {
    let etag: string;
    try {
      const lock = await releaseLockStorage.put(
        pathname,
        JSON.stringify({
          owner: randomUUID(),
          createdAt: new Date().toISOString(),
        }),
        {
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: false,
          contentType: "application/json",
          abortSignal: AbortSignal.timeout(12000),
        },
      );
      etag = lock.etag;
      if (!etag) throw new Error("Missing lock identity");
    } catch {
      throw new AdminApiError(
        503,
        "Release editing is busy or locked. Retry shortly; if it remains locked, ask an administrator to review the release write lock. The active APK has not been replaced by this request.",
      );
    }
    try {
      return await task();
    } finally {
      // A release failure must not misrepresent a successfully published APK.
      // Failed unlock remains fail-closed; never remove a different owner's lock.
      await releaseLockStorage
        .del(pathname, { ifMatch: etag, abortSignal: AbortSignal.timeout(12000) })
        .catch(() => undefined);
    }
  },
};
