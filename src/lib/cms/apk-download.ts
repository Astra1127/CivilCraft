const unavailable = "The APK download is temporarily unavailable. Please try again.";

/** Hosted APK downloads need an explicit preparation step before browser navigation. */
export function apkDownloadEndpoint(url: string): string | undefined {
  const match = url.match(/^\/api\/(?:admin\/)?releases\/[a-zA-Z0-9-]{1,64}\/download$/);
  return match ? `${url}-link` : undefined;
}

function safeFileName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 5 &&
    value.length <= 255 &&
    value === value.trim() &&
    !/[\\/<>]/.test(value) &&
    !Array.from(value).some((character) => character.charCodeAt(0) < 32) &&
    /\.apk$/i.test(value)
  );
}

function safeMessage(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 300 ||
    /[<>]/.test(value) ||
    Array.from(value).some((character) => character.charCodeAt(0) < 32)
  )
    return unavailable;
  return value;
}

/** This requests only a small JSON link; the APK is delivered directly by storage. */
export async function prepareApkDownload(
  endpoint: string,
  expectedFileName?: string | null,
  signal?: AbortSignal,
): Promise<string> {
  if (!/^\/api\/(?:admin\/)?releases\/[a-zA-Z0-9-]{1,64}\/download-link$/.test(endpoint))
    throw new Error(unavailable);
  const response = await fetch(endpoint, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    headers: { Accept: "application/json" },
    ...(signal ? { signal } : {}),
  });
  let value: Record<string, unknown> = {};
  if (/^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? "")) {
    try {
      const body: unknown = await response.json();
      if (body && typeof body === "object" && !Array.isArray(body))
        value = body as Record<string, unknown>;
    } catch {
      // HTML or a partial upstream response must never become a downloaded file.
    }
  }
  if (!response.ok) throw new Error(safeMessage(value["error"]));
  const fileName = value["fileName"];
  const fileSizeBytes = value["fileSizeBytes"];
  if (
    !safeFileName(fileName) ||
    (expectedFileName && fileName !== expectedFileName) ||
    typeof fileSizeBytes !== "number" ||
    !Number.isSafeInteger(fileSizeBytes) ||
    fileSizeBytes < 1 ||
    typeof value["url"] !== "string"
  )
    throw new Error(unavailable);
  try {
    const url = new URL(value["url"]);
    const github =
      url.hostname === "github.com" &&
      /^\/Astra1127\/CivilCraft\/releases\/download\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+\.apk$/.test(
        url.pathname,
      ) &&
      !url.search;
    const blob =
      url.hostname.endsWith(".private.blob.vercel-storage.com") &&
      Boolean(url.searchParams.get("vercel-blob-signature")) &&
      Boolean(url.searchParams.get("vercel-blob-delegation"));
    if (
      url.protocol !== "https:" ||
      (!github && !blob) ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443") ||
      url.hash ||
      decodeURIComponent(url.pathname).split("/").at(-1) !== fileName
    )
      throw new Error();
    return url.href;
  } catch {
    throw new Error(unavailable);
  }
}
