import { AdminApiError, adminGameConfig, object, playFabAdmin } from "./admin-client.server.ts";

const MAX_BYTES = 8 * 1024 * 1024;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** Only the authenticated player's committed portrait is downloaded. */
export async function handleCharacterPortrait(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/player/character-portrait") return null;
  const headers = {
    "Cache-Control": "private, no-store",
    Vary: "Authorization",
    "X-Content-Type-Options": "nosniff",
  };
  const empty = (status: number) => new Response(null, { status, headers });
  if (request.method !== "GET") return empty(405);
  const ticket = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (!ticket || ticket.length > 4096) return empty(401);
  // No caller-supplied identity or filename is supported.
  if (url.search) return empty(400);
  try {
    await playFabAdmin("Server/AuthenticateSessionTicket", { SessionTicket: ticket });
    const { titleId } = adminGameConfig();
    const api = async (path: string, body: unknown, auth: Record<string, string>) => {
      const response = await fetch(`https://${titleId}.playfabapi.com/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify(body),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(12_000),
      });
      const payload = object(await response.json());
      if (!response.ok || payload["code"] !== 200) throw new Error("Portrait API unavailable");
      return object(payload["data"]);
    };
    // Exchanging the validated ticket resolves its own title player entity;
    // never trust entity IDs or tokens supplied by the browser.
    const token = await api("Authentication/GetEntityToken", {}, { "X-Authorization": ticket });
    const entity = object(token["Entity"]);
    if (
      entity["Type"] !== "title_player_account" ||
      typeof entity["Id"] !== "string" ||
      !entity["Id"] ||
      typeof token["EntityToken"] !== "string" ||
      !token["EntityToken"]
    )
      throw new Error("Portrait entity unavailable");
    const result = await api(
      "File/GetFiles",
      { Entity: { Id: entity["Id"], Type: "title_player_account" } },
      { "X-EntityToken": token["EntityToken"] },
    );
    const file = object(object(result["Metadata"])["characterPortrait.png"]);
    if (!Object.keys(file).length) return empty(404);
    if (typeof file["DownloadUrl"] !== "string") throw new Error("Portrait URL unavailable");
    const download = new URL(file["DownloadUrl"]);
    // PlayFab Entity Files are hosted in Azure Blob Storage. Restrict the
    // server fetch destination and disallow redirects/credential forwarding.
    if (
      download.protocol !== "https:" ||
      !download.hostname.endsWith(".blob.core.windows.net") ||
      download.username ||
      download.password ||
      (download.port && download.port !== "443")
    )
      throw new Error("Portrait URL unavailable");
    const response = await fetch(download, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok || !response.body) throw new Error("Portrait download unavailable");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) throw new Error("Portrait too large");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    if (!PNG_SIGNATURE.every((value, index) => bytes[index] === value))
      throw new Error("Portrait format unavailable");
    return new Response(bytes, { headers: { ...headers, "Content-Type": "image/png" } });
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 401) return empty(401);
    console.warn("[character-portrait] Portrait service temporarily unavailable.");
    return empty(503);
  }
}
