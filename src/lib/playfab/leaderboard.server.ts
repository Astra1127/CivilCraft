import { getAdminAuthConfig } from "../admin-auth/config.server.ts";
import { isAuthorizedStaff, readAdminSession } from "../admin-auth/session.server.ts";
import {
  AdminApiError,
  adminGameConfig,
  object,
  playFabAdmin,
  textValue,
} from "./admin-client.server.ts";
import { LEADERBOARD_PAGE_SIZE, LEADERBOARD_STATISTIC } from "./leaderboard-shared.ts";
import type { LeaderboardPage } from "./leaderboard-shared.ts";
import type { LeaderboardEntry } from "./types.ts";

export function mapLeaderboard(raw: unknown): LeaderboardEntry[] {
  if (!Array.isArray(raw)) throw new AdminApiError(502, "Unable to load the leaderboard.");
  return raw.map((value) => {
    const row = object(value);
    const id = row["PlayFabId"],
      position = row["Position"],
      score = row["StatValue"];
    if (
      typeof id !== "string" ||
      !/^[a-f0-9]{1,32}$/i.test(id) ||
      typeof position !== "number" ||
      !Number.isSafeInteger(position) ||
      position < 0 ||
      typeof score !== "number" ||
      !Number.isFinite(score)
    )
      throw new AdminApiError(502, "Unable to load the leaderboard.");
    return {
      playFabId: id,
      rank: position + 1,
      score,
      level: null,
      displayName:
        textValue(row["DisplayName"]) ??
        textValue(object(row["Profile"])["DisplayName"]) ??
        "Engineer",
    };
  });
}
const versionBody = (version?: number) =>
  version === undefined ? {} : { UseSpecificVersion: true, Version: version };
export async function leaderboardPage(start = 0, version?: number): Promise<LeaderboardPage> {
  const result = await playFabAdmin("Server/GetLeaderboard", {
    StatisticName: LEADERBOARD_STATISTIC,
    StartPosition: start,
    MaxResultsCount: LEADERBOARD_PAGE_SIZE,
    ProfileConstraints: { ShowDisplayName: true },
    ...versionBody(version),
  });
  const entries = mapLeaderboard(result["Leaderboard"]);
  const returnedVersion = result["Version"];
  if (
    typeof returnedVersion !== "number" ||
    !Number.isSafeInteger(returnedVersion) ||
    returnedVersion < 0 ||
    (version !== undefined && version !== returnedVersion)
  )
    throw new AdminApiError(502, "Unable to load the leaderboard.");
  return {
    entries,
    version: returnedVersion,
    nextStart: entries.length === LEADERBOARD_PAGE_SIZE ? start + LEADERBOARD_PAGE_SIZE : null,
  };
}
export async function leaderboardRank(
  id: string,
  version?: number,
): Promise<LeaderboardEntry | null> {
  const result = await playFabAdmin("Server/GetLeaderboardAroundUser", {
    StatisticName: LEADERBOARD_STATISTIC,
    PlayFabId: id,
    MaxResultsCount: 1,
    ProfileConstraints: { ShowDisplayName: true },
    ...versionBody(version),
  });
  const candidate = mapLeaderboard(result["Leaderboard"]).find((row) => row.playFabId === id);
  if (!candidate) return null;
  // AroundUser can return position 0 for an account with NO statistic. Confirm
  // membership against the global leaderboard at that position, in the same version.
  const actualVersion = result["Version"];
  if (
    typeof actualVersion !== "number" ||
    !Number.isSafeInteger(actualVersion) ||
    actualVersion < 0 ||
    (version !== undefined && version !== actualVersion)
  )
    throw new AdminApiError(502, "Unable to load the leaderboard.");
  const check = await playFabAdmin("Server/GetLeaderboard", {
    StatisticName: LEADERBOARD_STATISTIC,
    StartPosition: candidate.rank - 1,
    MaxResultsCount: 1,
    ProfileConstraints: { ShowDisplayName: true },
    ...versionBody(actualVersion),
  });
  if (check["Version"] !== actualVersion)
    throw new AdminApiError(502, "Unable to load the leaderboard.");
  return mapLeaderboard(check["Leaderboard"]).find((row) => row.playFabId === id) ?? null;
}
export async function handleLeaderboardRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (!/^\/api\/leaderboard(?:\/|$)/.test(url.pathname)) return null;
  const json = (data: unknown, status = 200) =>
    Response.json(data, {
      status,
      headers: {
        "Cache-Control": "no-store, private",
        Vary: "Cookie, Authorization",
        "X-Content-Type-Options": "nosniff",
      },
    });
  let configured = true;
  try {
    configured = !!adminGameConfig().secret;
    if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);
    let playerId: string | null = null;
    const ticket = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
    if (ticket && ticket.length <= 4096) {
      const auth = await playFabAdmin("Server/AuthenticateSessionTicket", {
        SessionTicket: ticket,
      });
      const id = object(auth["UserInfo"])["PlayFabId"];
      if (!auth["IsSessionTicketExpired"] && typeof id === "string" && /^[a-f0-9]{1,32}$/i.test(id))
        playerId = id;
      if (!playerId) return json({ error: "Player sign-in is required." }, 401);
    } else {
      const config = getAdminAuthConfig(),
        session = await readAdminSession(request);
      if (
        !config ||
        !session.authenticated ||
        !session.user ||
        !isAuthorizedStaff(config, session.user)
      )
        return json({ error: "Sign-in is required." }, 401);
    }
    if (!adminGameConfig().secret)
      throw new AdminApiError(503, "PlayFab administrative access is not configured.");
    const integer = (key: string, fallback?: number) => {
      const raw = url.searchParams.get(key);
      if (raw === null) return fallback;
      if (!/^\d{1,9}$/.test(raw)) throw new AdminApiError(400, "Invalid leaderboard page.");
      return Number(raw);
    };
    const version = integer("version");
    if (url.pathname === "/api/leaderboard/me") {
      if (!playerId) return json({ error: "Player sign-in is required." }, 401);
      return json(await leaderboardRank(playerId, version));
    }
    if (url.pathname !== "/api/leaderboard") return json({ error: "Not found." }, 404);
    return json(await leaderboardPage(integer("start", 0), version));
  } catch (e) {
    return json(
      {
        error:
          e instanceof AdminApiError && e.status === 400
            ? e.message
            : !configured
              ? "PlayFab administrative access is not configured."
              : "Unable to load the leaderboard.",
      },
      e instanceof AdminApiError ? e.status : 503,
    );
  }
}
