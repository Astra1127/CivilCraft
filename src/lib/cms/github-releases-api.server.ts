import { AdminApiError } from "../playfab/admin-client.server.ts";

const owner = "Astra1127" as const;
const repo = "CivilCraft" as const;
const repository = `${owner}/${repo}` as const;
const maxJsonBytes = 2 * 1024 * 1024;

function configuredToken(): string | undefined {
  const value = process.env["GITHUB_APK_TOKEN"]?.trim();
  return value && value.length <= 1024 && /^[\x21-\x7e]+$/.test(value) ? value : undefined;
}

function configuredControlRelease(): number | undefined {
  const value = process.env["GITHUB_APK_CONTROL_RELEASE_ID"]?.trim();
  const id = value && /^\d{1,16}$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

/** Only public readiness leaves the server. Never return githubConfig() in API JSON. */
export function githubUploadReadiness() {
  const configured = Boolean(configuredToken() && configuredControlRelease());
  return {
    configured,
    configurationPresent: Boolean(
      process.env["GITHUB_APK_TOKEN"] || process.env["GITHUB_APK_CONTROL_RELEASE_ID"],
    ),
    repository,
    message: configured
      ? "GitHub APK uploads are configured."
      : "GitHub APK uploads need a server connection. Ask a site administrator to configure it.",
  };
}

export function githubConfig() {
  const token = configuredToken();
  const controlReleaseId = configuredControlRelease();
  if (!token || !controlReleaseId) throw new AdminApiError(503, githubUploadReadiness().message);
  return { token, owner, repo, repository, controlReleaseId };
}

export class GithubApiError extends AdminApiError {
  readonly upstreamStatus: number;
  constructor(
    upstreamStatus: number,
    message = "GitHub is temporarily unavailable. Please retry.",
  ) {
    super(503, message);
    this.upstreamStatus = upstreamStatus;
  }
}

export type GithubApiOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  timeoutMs?: number;
  accept?: string;
};

/** Bound GitHub JSON metadata without returning upstream error bodies to staff. */
async function readGithubJson<T>(response: Response, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new GithubApiError(
      response.status,
      response.status === 401 || response.status === 403
        ? "The GitHub connection could not authorize this operation. Ask a site administrator to check it."
        : response.status === 429
          ? "GitHub is receiving too many requests. Wait a moment before retrying."
          : undefined,
    );
  }
  if (response.status === 204) {
    await response.body?.cancel().catch(() => undefined);
    return undefined as T;
  }
  if (
    !response.body ||
    !/^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? "")
  ) {
    await response.body?.cancel().catch(() => undefined);
    throw new GithubApiError(response.status);
  }
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxJsonBytes)) {
    await response.body.cancel().catch(() => undefined);
    throw new GithubApiError(response.status);
  }
  const reader = response.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (let count = 0; ; count++) {
      signal.throwIfAborted();
      if (count >= 8192) throw new GithubApiError(response.status);
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > maxJsonBytes) throw new GithubApiError(response.status);
      chunks.push(item.value);
    }
    signal.throwIfAborted();
    return JSON.parse(Buffer.concat(chunks, size).toString("utf8")) as T;
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => undefined);
  }
}

export async function githubJson<T = unknown>(response: Response, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => {
        controller.abort();
        reject(new GithubApiError(response.status));
      },
      Math.max(1, Math.min(60000, timeoutMs)),
    );
  });
  try {
    return await Promise.race([readGithubJson<T>(response, controller.signal), deadline]);
  } catch (error) {
    if (error instanceof GithubApiError) throw error;
    throw new GithubApiError(response.status);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/** Metadata requests only. No mutation is automatically retried after an uncertain response. */
export async function githubApi<T = unknown>(
  path: string,
  options: GithubApiOptions = {},
): Promise<T> {
  const config = githubConfig();
  const target = new URL(path, "https://api.github.com");
  if (
    !path.startsWith(`/repos/${repository}/`) ||
    target.origin !== "https://api.github.com" ||
    !target.pathname.startsWith(`/repos/${repository}/`) ||
    target.username ||
    target.password ||
    target.hash
  )
    throw new AdminApiError(400, "Choose a valid GitHub release operation.");
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  if (body !== undefined && Buffer.byteLength(body) > 256 * 1024)
    throw new AdminApiError(400, "GitHub release metadata is too large.");
  const timeoutMs = Math.min(60000, Math.max(1000, options.timeoutMs ?? 15000));
  const started = Date.now();
  try {
    const response = await fetch(target, {
      method: options.method ?? "GET",
      redirect: "error",
      cache: "no-store",
      credentials: "omit",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: options.accept ?? "application/vnd.github+json",
        Authorization: `Bearer ${config.token}`,
        "X-GitHub-Api-Version": "2026-03-10",
        "User-Agent": "CivilCraft-APK-Admin",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body }),
    });
    return await githubJson<T>(response, timeoutMs - (Date.now() - started));
  } catch (error) {
    if (error instanceof GithubApiError) throw error;
    throw new GithubApiError(0);
  }
}
