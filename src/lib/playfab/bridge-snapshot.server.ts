import { AdminApiError, adminGameConfig, object, playFabAdmin } from "./admin-client.server.ts";

import { parseAlmanacProgress } from "./almanac.ts";
import { verifiedLevelCompletion } from "./level-records.ts";
import { albumImage, cachedBridgeAlbum, MAX_ALBUM_BYTES } from "./bridge-photo-album.server.ts";

const MAX_BYTES = 8 * 1024 * 1024;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** Only the authenticated player's committed bridge-snapshot is downloaded. */
export async function handleBridgeSnapshot(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/player/bridge-snapshot") return null;
  const headers = {
    "Cache-Control": "private, no-store",
    Vary: "Authorization",
    "X-Content-Type-Options": "nosniff",
  };
  const empty = (status: number) => new Response(null, { status, headers });
  if (request.method !== "GET") return empty(405);
  const ticket = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (!ticket || ticket.length > 4096) return empty(401);
  // Only stable record IDs are accepted. Identity and filenames come from PlayFab.
  const contractId = url.searchParams.get("contractId");
  const regionId = url.searchParams.get("regionId");
  if (
    !contractId ||
    !regionId ||
    contractId.length > 200 ||
    regionId.length > 200 ||
    [...url.searchParams.keys()].some((key) => key !== "contractId" && key !== "regionId") ||
    url.searchParams.getAll("contractId").length !== 1 ||
    url.searchParams.getAll("regionId").length !== 1
  )
    return empty(400);
  try {
    const authenticated = await playFabAdmin("Server/AuthenticateSessionTicket", {
      SessionTicket: ticket,
    });
    const playerId = object(authenticated["UserInfo"])["PlayFabId"];
    if (typeof playerId !== "string" || !playerId) return empty(401);
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
      if (!response.ok || payload["code"] !== 200) throw new Error("Snapshot API unavailable");
      return object(payload["data"]);
    };
    const userData = await api(
      "Client/GetUserData",
      { Keys: ["AlmanacProgress"] },
      { "X-Authorization": ticket },
    );
    const raw = object(object(userData["Data"])["AlmanacProgress"])["Value"];
    const journey = parseAlmanacProgress(typeof raw === "string" ? raw : undefined);
    const matches = journey.regions
      .flatMap((r) => r.levels)
      .filter((l) => l.levelId === contractId && l.regionId === regionId);
    const match = matches[0];
    if (matches.length !== 1 || !match || !verifiedLevelCompletion(match, playerId))
      return empty(404);
    const fileName = match.completion?.snapshotFileName;
    if (!fileName) return empty(404);
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
      throw new Error("Snapshot entity unavailable");
    const result = await api(
      "File/GetFiles",
      { Entity: { Id: entity["Id"], Type: "title_player_account" } },
      { "X-EntityToken": token["EntityToken"] },
    );
    const file = object(object(result["Metadata"])[fileName]);
    if (!Object.keys(file).length) return empty(404);
    if (typeof file["DownloadUrl"] !== "string") throw new Error("Snapshot URL unavailable");
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
      throw new Error("Snapshot URL unavailable");
    const downloadBytes = async () => {
      const response = await fetch(download, {
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok || !response.body) throw new Error("Snapshot download unavailable");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > (match.completion?.snapshotAlbum ? MAX_ALBUM_BYTES : MAX_BYTES))
            throw new Error("Snapshot too large");
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
      return bytes;
    };
    let bytes: Uint8Array;
    if (match.completion?.snapshotAlbum) {
      const album = await cachedBridgeAlbum(
        JSON.stringify([titleId, playerId, entity["Id"]]),
        file["Checksum"],
        downloadBytes,
      );
      const image = albumImage(album, match.completion.snapshotAlbum);
      if (!image) return empty(404);
      bytes = image;
    } else bytes = await downloadBytes();
    if (!PNG_SIGNATURE.every((value, index) => bytes[index] === value))
      throw new Error("Snapshot format unavailable");
    return new Response(Uint8Array.from(bytes), {
      headers: { ...headers, "Content-Type": "image/png" },
    });
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 401) return empty(401);
    console.warn("[bridge-snapshot] Snapshot service temporarily unavailable.");
    return empty(503);
  }
}
