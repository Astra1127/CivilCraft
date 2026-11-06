import { validateApkSelection } from "./apk";

export type GithubUploadReadiness = { configured: boolean; message?: string };
const CHUNK_BYTES = 3 * 1024 * 1024;
const failed = "The APK upload could not finish. Keep this page open and retry the upload.";
const changed = "Administrator access changed. Sign in again and select the APK.";

type UploadSession = {
  scope: string;
  releaseId: string;
  file: File;
  ticket: string;
  nextChunk: number;
  finalizing: boolean;
};

function message(value: unknown) {
  return typeof value === "string" &&
    value.trim() &&
    value.length <= 400 &&
    !/[<>]/.test(value) &&
    !Array.from(value).some((character) => character.charCodeAt(0) < 32)
    ? value
    : failed;
}

/** Only private staff-bound upload tickets enter the browser. GitHub credentials
 * stay on the server; APK requests remain below the hosting ingress limit. */
export function createGithubApkUploader(getScope: () => string | null) {
  let session: UploadSession | null = null;
  let active: { releaseId: string; file: File; promise: Promise<unknown> } | null = null;
  let controller: AbortController | null = null;
  let generation = 0;

  const dispose = () => {
    generation++;
    controller?.abort();
    controller = null;
    session = null;
    active = null;
  };

  const upload = <T>(
    releaseId: string,
    file: File,
    onProgress?: (percentage: number) => void,
  ): Promise<T> => {
    if (active) {
      if (active.releaseId === releaseId && active.file === file)
        return active.promise as Promise<T>;
      return Promise.reject(new Error("Another APK upload is already in progress."));
    }
    const scope = getScope();
    if (!scope) return Promise.reject(new Error(changed));
    validateApkSelection(file);
    const selectedGeneration = generation;
    controller = new AbortController();
    const signal = controller.signal;
    const current = () => {
      if (generation !== selectedGeneration || getScope() !== scope || signal.aborted)
        throw new Error(changed);
    };
    const report = (percentage: number) => {
      current();
      onProgress?.(percentage);
    };
    const request = async <R>(
      endpoint: string,
      init: RequestInit,
      timeoutMs = 65_000,
    ): Promise<R> => {
      current();
      let response: Response;
      try {
        response = await fetch(endpoint, {
          ...init,
          credentials: "same-origin",
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
        });
      } catch {
        current();
        throw new Error(failed);
      }
      current();
      let value: Record<string, unknown> = {};
      if (/^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? "")) {
        try {
          const body: unknown = await response.json();
          if (body && typeof body === "object" && !Array.isArray(body))
            value = body as Record<string, unknown>;
        } catch {
          /* An incomplete response is retryable without creating a new upload. */
        }
      }
      current();
      if (!response.ok) throw new Error(message(value["error"]));
      if (!Object.keys(value).length) throw new Error(failed);
      return value as R;
    };
    const promise = (async () => {
      if (
        !session ||
        session.scope !== scope ||
        session.releaseId !== releaseId ||
        session.file !== file
      ) {
        session = null;
        report(0);
        const prepared = await request<{ ticket: string; chunkSize: number }>(
          "/api/admin/releases/github-apk/prepare",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ releaseId, fileName: file.name, fileSizeBytes: file.size }),
          },
        );
        if (
          typeof prepared.ticket !== "string" ||
          !prepared.ticket ||
          prepared.ticket.length > 8192 ||
          prepared.chunkSize !== CHUNK_BYTES
        )
          throw new Error(failed);
        current();
        session = {
          scope,
          releaseId,
          file,
          ticket: prepared.ticket,
          nextChunk: 0,
          finalizing: false,
        };
      }
      const selected = session;
      if (!selected.finalizing) {
        const count = Math.ceil(file.size / CHUNK_BYTES);
        report(Math.floor((selected.nextChunk / count) * 90));
        while (selected.nextChunk < count) {
          const startedAt = Date.now();
          const index = selected.nextChunk;
          const start = index * CHUNK_BYTES;
          const acknowledged = await request<{ success: boolean }>(
            `/api/admin/releases/github-apk/chunk?index=${index}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/octet-stream",
                "X-Apk-Upload-Ticket": selected.ticket,
              },
              body: file.slice(start, Math.min(file.size, start + CHUNK_BYTES)),
            },
          );
          if (acknowledged.success !== true) throw new Error(failed);
          current();
          selected.nextChunk++;
          report(Math.floor((selected.nextChunk / count) * 90));
          // GitHub counts staging and lock writes toward its content-creation limit.
          // Pace successful chunks; a cancelled account/session must not send the next part.
          const delay = 3000 - (Date.now() - startedAt);
          if (delay > 0 && selected.nextChunk < count) {
            await new Promise<void>((resolve, reject) => {
              const abort = () => {
                clearTimeout(timer);
                reject(new Error(changed));
              };
              const timer = setTimeout(() => {
                signal.removeEventListener("abort", abort);
                resolve();
              }, delay);
              signal.addEventListener("abort", abort, { once: true });
            });
            current();
          }
        }
        selected.finalizing = true;
      }
      // 100 marks bytes sent. The UI continues to say Verifying until this returns.
      report(100);
      const result = await request<T & { success: boolean }>(
        "/api/admin/releases/github-apk/finalize",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticket: selected.ticket }),
        },
        265_000,
      );
      if (result.success !== true) throw new Error(failed);
      current();
      session = null;
      return result;
    })().finally(() => {
      if (generation === selectedGeneration) {
        active = null;
        controller = null;
      }
    });
    active = { releaseId, file, promise };
    return promise;
  };
  return { upload, dispose };
}
