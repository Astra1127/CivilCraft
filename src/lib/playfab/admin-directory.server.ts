import { LEADERBOARD_STATISTIC } from "./leaderboard-shared.ts";
import { createHmac } from "node:crypto";
import { EncryptJWT, jwtDecrypt } from "jose";
import type { AdminAuthConfig } from "../admin-auth/config.server.ts";
import {
  AdminApiError,
  adminGameConfig,
  numberValue,
  object,
  playFabAdmin,
} from "./admin-client.server.ts";
import { mapIdentity } from "./admin-players.server.ts";
import type { AdminPlayer, AdminPlayerPage } from "./admin-types.ts";

import {
  filterSortPlayers,
  defaultDirectoryOptions,
  type DirectoryOptions,
} from "./directory-filters.ts";

const PAGE_SIZE = 20;
const RANGE_BYTES = 1024 * 1024;
const TTL = 15 * 60;
interface Cursor {
  owner: string;
  title: string;
  exportId: string;
  snapshotAt: string;
  fragment: number;
  offset: number;
  columns: string[] | null;
}
// Optimization only: encrypted cursors remain valid on another instance or after a restart.
const latestExports = new Map<string, { expires: number; value: Promise<Cursor> }>();
function expired(): never {
  throw new AdminApiError(410, "The directory snapshot expired. Refresh the directory.");
}
export function exportUrl(raw: string): URL {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    !/^[a-z0-9]+\.blob\.core\.windows\.net$/i.test(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new AdminApiError(502, "The player export location is unsupported.");
  return url;
}
async function download(
  raw: string,
  offset?: number,
): Promise<{ bytes: Buffer; complete: boolean }> {
  const headers: Record<string, string> = {};
  if (offset !== undefined) headers["Range"] = `bytes=${offset}-${offset + RANGE_BYTES - 1}`;
  const response = await fetch(exportUrl(raw), {
    headers,
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok || !response.body || (offset && response.status !== 206))
    throw new AdminApiError(503, "The player export is unavailable. Refresh the directory.");
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > RANGE_BYTES)
        throw new AdminApiError(502, "The player export exceeded its safe read limit.");
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel();
  }
  const range = response.headers.get("content-range")?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
  if (response.status === 206 && (!range || Number(range[1]) !== offset))
    throw new AdminApiError(502, "The player export range is invalid.");
  return {
    bytes: Buffer.concat(chunks),
    complete: !range || Number(range[2]) + 1 >= Number(range[3]),
  };
}
/** Parse the documented TSV header. Only player IDs survive this boundary. */
export function readExportPage(
  bytes: Buffer,
  complete: boolean,
  header: string[] | null,
  limit = PAGE_SIZE,
) {
  let used = 0,
    columns = header;
  const players: AdminPlayer[] = [];
  while (used < bytes.length && players.length < limit) {
    let end = bytes.indexOf(10, used);
    if (end < 0) {
      if (!complete) break;
      end = bytes.length;
    }
    const cells = bytes
      .subarray(used, end)
      .toString("utf8")
      .replace(/\r$/, "")
      .replace(/^\uFEFF/, "")
      .split("\t");
    used = Math.min(end + 1, bytes.length);
    if (columns === null) {
      columns = cells;
      if (!columns.includes("PlayerId"))
        throw new AdminApiError(502, "The player export format is unsupported.");
    } else if (cells.length > 1) {
      const value = (key: string) => cells[columns!.indexOf(key)];
      const id = value("PlayerId");
      if (!id || !/^[a-f0-9]{1,32}$/i.test(id))
        throw new AdminApiError(502, "The player export contains an invalid identifier.");
      // Export timestamps are UTC. Older exports omit the timezone suffix.
      const timestamp = (key: string) => {
        const s = value(key);
        return s && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:/.test(s) ? s.replace(" ", "T") + "Z" : s;
      };
      const player = mapIdentity({
        PlayFabId: id,
        TitleInfo: {
          DisplayName: value("DisplayName"),
          Created: timestamp("Created"),
          LastLogin: timestamp("LastLogin"),
        },
      });
      const banned = value("isBanned") ?? value("IsBanned");
      if (banned === "true" || banned === "True") player.accountStatus = "banned";
      if (banned === "false" || banned === "False") player.accountStatus = "active";
      if (banned === undefined && columns.includes("BannedUntil")) {
        const until = timestamp("BannedUntil");
        player.accountStatus = !until
          ? "active"
          : Number.isFinite(Date.parse(until))
            ? Date.parse(until) > Date.now()
              ? "banned"
              : "active"
            : null;
      }
      try {
        const stats: unknown = JSON.parse(value("PlayerStatistics") ?? "null");
        if (Array.isArray(stats)) {
          const stat = (name: string) =>
            numberValue(object(stats.find((s) => object(s)["Name"] === name))["StatisticValue"]);
          player.level = stat("CurrentLevel");
          player.totalScore = stat(LEADERBOARD_STATISTIC);
          player.bridgesCompleted = stat("BridgesCompleted");
          player.challengesCompleted = stat("ChallengesCompleted");
        }
      } catch {
        /* Absent/malformed optional statistics remain null. */
      }
      players.push(player);
    }
  }
  if (!used && bytes.length)
    throw new AdminApiError(502, "A player export row exceeds the safe read limit.");
  return { players, used, columns };
}
export async function directoryPage(
  config: AdminAuthConfig,
  owner: string,
  token: string | null,
  bypassCache = false,
  pageSize = 20,
  requestedPage?: number,
  includeAll = false,
  options: DirectoryOptions = defaultDirectoryOptions,
): Promise<AdminPlayerPage> {
  const title = adminGameConfig().titleId;
  const cacheKey = createHmac("sha256", config.sessionSecret)
    .update(config.origin + ":" + title + ":" + owner)
    .digest("hex");
  const key = createHmac("sha256", config.sessionSecret).update("civilcraft:directory:v2").digest();
  let state: Cursor;
  if (token) {
    if (token.length > 6000) expired();
    try {
      const { payload } = await jwtDecrypt(token, key, {
        issuer: "civilcraft:directory:v2",
        audience: config.origin,
        keyManagementAlgorithms: ["dir"],
        contentEncryptionAlgorithms: ["A256GCM"],
        requiredClaims: ["iat", "exp"],
      });
      const raw = payload["cursor"] as Cursor | undefined;
      if (
        !raw ||
        typeof raw.owner !== "string" ||
        typeof raw.title !== "string" ||
        typeof raw.exportId !== "string" ||
        !raw.exportId ||
        raw.exportId.length > 256 ||
        typeof raw.snapshotAt !== "string" ||
        !Number.isFinite(Date.parse(raw.snapshotAt)) ||
        !Number.isSafeInteger(raw.fragment) ||
        raw.fragment < 0 ||
        raw.fragment > 5000 ||
        !Number.isSafeInteger(raw.offset) ||
        raw.offset < 0 ||
        !(
          raw.columns === null ||
          (Array.isArray(raw.columns) &&
            raw.columns.length <= 128 &&
            raw.columns.every((v) => typeof v === "string" && v.length <= 128))
        )
      )
        expired();
      state = raw;
    } catch {
      expired();
    }
  } else {
    for (const [id, value] of latestExports)
      if (value.expires <= Date.now()) latestExports.delete(id);
    if (bypassCache) latestExports.delete(cacheKey);
    let cached = latestExports.get(cacheKey);
    if (!cached) {
      if (latestExports.size >= 20)
        throw new AdminApiError(429, "The player directory is busy. Please try again shortly.");
      const value = (async (): Promise<Cursor> => {
        const result = await playFabAdmin("Admin/GetAllSegments");
        const segments = Array.isArray(result["Segments"]) ? result["Segments"] : [];
        const all = segments.map(object).find((s) => s["Name"] === "All Players");
        if (typeof all?.["Id"] !== "string")
          throw new AdminApiError(503, "The All Players segment is unavailable in this title.");
        const started = await playFabAdmin("Admin/ExportPlayersInSegment", {
          SegmentId: all["Id"],
        });
        if (typeof started["ExportId"] !== "string")
          throw new AdminApiError(502, "The player directory could not be prepared.");
        return {
          owner,
          title,
          exportId: started["ExportId"],
          snapshotAt: new Date().toISOString(),
          fragment: 0,
          offset: 0,
          columns: null,
        };
      })();
      cached = { expires: Date.now() + TTL * 1000, value };
      latestExports.set(cacheKey, cached);
      value.catch(() => {
        if (latestExports.get(cacheKey)?.value === value) latestExports.delete(cacheKey);
      });
    }
    state = await cached.value;
  }
  if (state.owner !== owner || state.title !== title)
    throw new AdminApiError(403, "This directory snapshot is not available to this administrator.");
  const snapshotTime = Date.parse(state.snapshotAt);
  if (snapshotTime > Date.now() || Date.now() - snapshotTime >= TTL * 1000) expired();
  const save = async (next: Cursor) => {
    const token = await new EncryptJWT({ cursor: next })
      .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
      .setIssuer("civilcraft:directory:v2")
      .setAudience(config.origin)
      .setIssuedAt()
      .setExpirationTime(Math.floor(snapshotTime / 1000) + TTL)
      .encrypt(key);
    if (token.length > 6000)
      throw new AdminApiError(502, "The player directory cursor exceeds the supported size.");
    return token;
  };
  const exported = await playFabAdmin("Admin/GetSegmentExport", { ExportId: state.exportId });
  if (exported["State"] !== "Complete") {
    if (["Failed", "Cancelled", "Error"].includes(String(exported["State"]))) {
      latestExports.delete(cacheKey);
      throw new AdminApiError(
        503,
        "The player directory export failed. Refresh the directory to try again.",
      );
    }
    return {
      players: [],
      pending: true,
      nextCursor: token ?? (await save(state)),
      snapshotAt: state.snapshotAt,
    };
  }
  if (typeof exported["IndexUrl"] !== "string")
    throw new AdminApiError(502, "The player directory index is unavailable.");
  const rawPlayers = await readSnapshot(
    state.exportId,
    title,
    String(exported["IndexUrl"]),
    snapshotTime,
  );
  if (options.status !== "all") {
    const complete = await enrichStatuses(rawPlayers);
    if (!complete)
      return {
        players: [],
        pending: true,
        nextCursor: await save(state),
        snapshotAt: state.snapshotAt,
      };
  }
  const all = includeAll ? rawPlayers : filterSortPlayers(rawPlayers, options, snapshotTime);
  const start = requestedPage === undefined ? state.offset : (requestedPage - 1) * pageSize;
  const end = Math.min(start + pageSize, all.length);
  return {
    players: includeAll ? all : all.slice(start, end),
    pending: false,
    nextCursor: end < all.length ? await save({ ...state, offset: end }) : null,
    snapshotCursor: await save({ ...state, offset: 0 }),
    totalPlayers: all.length,
    snapshotAt: state.snapshotAt,
  };
}

const snapshots = new Map<string, { expires: number; value: Promise<AdminPlayer[]> }>();
async function readSnapshot(
  exportId: string,
  title: string,
  indexUrl: string,
  snapshotTime: number,
) {
  const cacheKey = createHmac("sha256", adminGameConfig().secret)
    .update(title + ":" + exportId)
    .digest("hex");
  for (const [key, item] of snapshots) if (item.expires <= Date.now()) snapshots.delete(key);
  let cached = snapshots.get(cacheKey);
  if (!cached) {
    if (snapshots.size >= 20)
      throw new AdminApiError(429, "The directory is busy. Try again shortly.");
    const value = (async () => {
      const index = await download(indexUrl);
      const urls = index.bytes
        .toString("utf8")
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (urls.length > 5000)
        throw new AdminApiError(502, "The directory exceeds its safe snapshot limit.");
      const parts: AdminPlayer[][] = new Array(urls.length);
      let next = 0,
        totalBytes = 0,
        totalRows = 0;
      const started = Date.now();
      const results = await Promise.allSettled(
        Array.from({ length: Math.min(4, urls.length) }, async () => {
          while (next < urls.length) {
            const i = next++;
            let offset = 0,
              columns: string[] | null = null;
            const rows: AdminPlayer[] = [];
            while (true) {
              if (Date.now() - started > 25000)
                throw new AdminApiError(
                  503,
                  "The player snapshot exceeded its read time limit. Please retry.",
                );
              const chunk = await download(urls[i]!, offset);
              totalBytes += chunk.bytes.length;
              if (totalBytes > 64 * 1024 * 1024)
                throw new AdminApiError(502, "The directory exceeds its safe snapshot limit.");
              const parsed = readExportPage(chunk.bytes, chunk.complete, columns, 50001);
              rows.push(...parsed.players);
              totalRows += parsed.players.length;
              if (totalRows > 50000)
                throw new AdminApiError(502, "The directory exceeds its safe snapshot limit.");
              if (chunk.complete && parsed.used === chunk.bytes.length) break;
              if (!parsed.used)
                throw new AdminApiError(502, "The directory fragment could not be read.");
              offset += parsed.used;
              columns = parsed.columns;
            }
            parts[i] = rows;
          }
        }),
      );
      const failure = results.find((r) => r.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
      const unique = new Map<string, AdminPlayer>();
      for (const player of parts.flat()) unique.set(player.playFabId, player);
      return [...unique.values()];
    })();
    cached = { expires: snapshotTime + TTL * 1000, value };
    snapshots.set(cacheKey, cached);
    value.catch(() => {
      if (snapshots.get(cacheKey)?.value === value) snapshots.delete(cacheKey);
    });
  }
  return cached.value;
}

const statusCache = new Map<string, { expires: number; value: Promise<"active" | "banned"> }>();
async function enrichStatuses(players: AdminPlayer[]) {
  const now = Date.now();
  for (const [key, value] of statusCache) if (value.expires <= now) statusCache.delete(key);
  const missing = players.filter((p) => p.accountStatus === null);
  // Bounded enrichment only when the export omitted ban information and a status filter needs it.
  for (let i = 0; i < Math.min(missing.length, 20); i += 4) {
    await Promise.all(
      missing.slice(i, i + 4).map(async (p) => {
        const key = adminGameConfig().titleId + ":" + p.playFabId;
        let cached = statusCache.get(key);
        if (!cached) {
          if (statusCache.size >= 50000)
            throw new AdminApiError(503, "Account status cache is full. Retry later.");
          const value = playFabAdmin("Admin/GetUserAccountInfo", { PlayFabId: p.playFabId }).then(
            (result) => {
              const banned = object(object(result["UserInfo"])["TitleInfo"])["isBanned"];
              if (typeof banned !== "boolean")
                throw new AdminApiError(
                  503,
                  "PlayFab account status is unavailable. Use All account statuses or retry.",
                );
              return banned ? ("banned" as const) : ("active" as const);
            },
          );
          cached = { expires: now + 5 * 60_000, value };
          statusCache.set(key, cached);
          value.catch(() => statusCache.delete(key));
        }
        p.accountStatus = await cached.value;
      }),
    );
  }
  return players.every((p) => p.accountStatus !== null);
}
