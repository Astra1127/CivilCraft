import { bridgeStatistic, decodeBridgeScore } from "./leaderboard-config.server.ts";
import { multiplayerLeaderboardPage } from "./multiplayer-leaderboard.server.ts";
import {
  getLeaderboardVisibility,
  requireVisibleLeaderboardContract,
} from "./leaderboard-visibility.server.ts";
import { getAdminAuthConfig } from "../admin-auth/config.server.ts";
import { isAuthorizedStaff, readAdminSession } from "../admin-auth/session.server.ts";
import {
  AdminApiError,
  adminGameConfig,
  object,
  playFabAdmin,
  textValue,
} from "./admin-client.server.ts";
import { isAccountDeleted } from "./account-deletion-storage.server.ts";
import {
  LEADERBOARD_PAGE_SIZE,
  DEFAULT_CONTRACT,
  DEFAULT_MODE,
  LEGACY_LEADERBOARD_CONTRACTS,
  LEADERBOARD_STATISTIC,
} from "./leaderboard-shared.ts";
import type {
  LeaderboardPage,
  LeaderboardPeriod,
  LeaderboardContract,
  LeaderboardMode,
  OverallLeaderboardEntry,
  OverallLeaderboardPage,
} from "./leaderboard-shared.ts";
import type { LeaderboardEntry } from "./types.ts";

export function mapLeaderboard(
  raw: unknown,
  mode: LeaderboardMode = DEFAULT_MODE,
): LeaderboardEntry[] {
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
      ...decodeBridgeScore(score, mode),
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
export async function leaderboardPage(
  start = 0,
  version?: number,
  period: LeaderboardPeriod = "all-time",
  pageSize = LEADERBOARD_PAGE_SIZE,
  contract: LeaderboardContract = DEFAULT_CONTRACT,
  mode: LeaderboardMode = DEFAULT_MODE,
): Promise<LeaderboardPage> {
  const statistic = bridgeStatistic(contract, mode);
  // No weekly statistic is implemented by the game integration. Never reuse lifetime scores.
  if (period === "weekly") return { entries: [], version: null, nextStart: null };
  const result = await playFabAdmin("Server/GetLeaderboard", {
    StatisticName: statistic,
    StartPosition: start,
    MaxResultsCount: pageSize,
    ProfileConstraints: { ShowDisplayName: true },
    ...versionBody(version),
  });
  const entries = mapLeaderboard(result["Leaderboard"], mode);
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
    nextStart: entries.length === pageSize ? start + pageSize : null,
  };
}
export async function leaderboardRank(
  id: string,
  version?: number,
  period: LeaderboardPeriod = "all-time",
  contract: LeaderboardContract = DEFAULT_CONTRACT,
  mode: LeaderboardMode = DEFAULT_MODE,
): Promise<LeaderboardEntry | null> {
  const statistic = bridgeStatistic(contract, mode);
  if (period === "weekly") return null;
  const result = await playFabAdmin("Server/GetLeaderboardAroundUser", {
    StatisticName: statistic,
    PlayFabId: id,
    MaxResultsCount: 1,
    ProfileConstraints: { ShowDisplayName: true },
    ...versionBody(version),
  });
  // AroundUser can synthesize a zero score for an unranked player. Verify membership before decoding.
  const raw = result["Leaderboard"];
  if (!Array.isArray(raw)) throw new AdminApiError(502, "Unable to load the leaderboard.");
  const candidate = raw.map(object).find((row) => row["PlayFabId"] === id);
  if (
    candidate &&
    (!Number.isSafeInteger(candidate["Position"]) || Number(candidate["Position"]) < 0)
  )
    throw new AdminApiError(502, "Unable to load the leaderboard.");
  if (!candidate) return null;
  // AroundUser can return position 0 for an account with NO statistic. Confirm
  // membership against the all-time leaderboard at that position, in the same version.
  const actualVersion = result["Version"];
  if (
    typeof actualVersion !== "number" ||
    !Number.isSafeInteger(actualVersion) ||
    actualVersion < 0 ||
    (version !== undefined && version !== actualVersion)
  )
    throw new AdminApiError(502, "Unable to load the leaderboard.");
  const check = await playFabAdmin("Server/GetLeaderboard", {
    StatisticName: statistic,
    StartPosition: candidate["Position"],
    MaxResultsCount: 1,
    ProfileConstraints: { ShowDisplayName: true },
    ...versionBody(actualVersion),
  });
  if (check["Version"] !== actualVersion)
    throw new AdminApiError(502, "Unable to load the leaderboard.");
  return mapLeaderboard(check["Leaderboard"], mode).find((row) => row.playFabId === id) ?? null;
}

async function playerCareerStats(playFabId: string) {
  try {
    const res = await playFabAdmin("Server/GetPlayerStatistics", {
      PlayFabId: playFabId,
      StatisticNames: ["BridgesCompleted", "ChallengesCompleted"],
    });
    const stats = Array.isArray(res["Statistics"]) ? res["Statistics"] : [];
    let bridges = 0;
    let challenges = 0;
    for (const item of stats) {
      const s = object(item);
      const name = String(s["StatisticName"]);
      const val = Number(s["Value"]);
      if (Number.isFinite(val) && val >= 0) {
        if (name === "BridgesCompleted") bridges = val;
        if (name === "ChallengesCompleted") challenges = val;
      }
    }
    return { bridgesCompleted: bridges, challengesCompleted: challenges };
  } catch {
    return { bridgesCompleted: 0, challengesCompleted: 0 };
  }
}

export async function overallLeaderboardPage(
  start = 0,
  pageSize = LEADERBOARD_PAGE_SIZE,
  version?: number,
): Promise<OverallLeaderboardPage> {
  const result = await playFabAdmin("Server/GetLeaderboard", {
    StatisticName: LEADERBOARD_STATISTIC,
    StartPosition: start,
    MaxResultsCount: pageSize,
    ProfileConstraints: { ShowDisplayName: true },
    ...versionBody(version),
  });
  const returnedVersion = result["Version"];
  if (
    typeof returnedVersion !== "number" ||
    !Number.isSafeInteger(returnedVersion) ||
    returnedVersion < 0 ||
    (version !== undefined && version !== returnedVersion)
  )
    throw new AdminApiError(502, "Unable to load the leaderboard.");

  const raw = result["Leaderboard"];
  if (!Array.isArray(raw)) throw new AdminApiError(502, "Unable to load the leaderboard.");

  const seenIds = new Set<string>();
  const seenPositions = new Set<number>();
  const rows = raw
    .map((value) => {
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
        position,
        rank: position + 1,
        totalScore: score,
        displayName:
          textValue(row["DisplayName"]) ??
          textValue(object(row["Profile"])["DisplayName"]) ??
          "Engineer",
      };
    })
    .filter((row) => {
      if (seenIds.has(row.playFabId.toUpperCase()) || seenPositions.has(row.position)) return false;
      seenIds.add(row.playFabId.toUpperCase());
      seenPositions.add(row.position);
      return true;
    });

  const entries: OverallLeaderboardEntry[] = [];
  for (let i = 0; i < rows.length; i += 5) {
    const batch = rows.slice(i, i + 5);
    entries.push(
      ...(await Promise.all(
        batch.map(async ({ playFabId, rank, displayName, totalScore }) => {
          const stats = await playerCareerStats(playFabId);
          return {
            rank,
            displayName,
            totalScore,
            bridgesCompleted: stats.bridgesCompleted,
            challengesCompleted: stats.challengesCompleted,
          };
        }),
      )),
    );
  }

  return {
    entries,
    version: returnedVersion,
    nextStart: entries.length === pageSize ? start + pageSize : null,
  };
}

export async function overallLeaderboardRank(
  id: string,
  version?: number,
): Promise<{
  rank: number;
  displayName: string;
  totalScore: number;
  bridgesCompleted: number;
  challengesCompleted: number;
} | null> {
  const result = await playFabAdmin("Server/GetLeaderboardAroundUser", {
    StatisticName: LEADERBOARD_STATISTIC,
    PlayFabId: id,
    MaxResultsCount: 1,
    ProfileConstraints: { ShowDisplayName: true },
    ...versionBody(version),
  });
  const raw = result["Leaderboard"];
  if (!Array.isArray(raw)) throw new AdminApiError(502, "Unable to load the leaderboard.");
  const candidate = raw.map(object).find((row) => row["PlayFabId"] === id);
  if (
    candidate &&
    (!Number.isSafeInteger(candidate["Position"]) || Number(candidate["Position"]) < 0)
  )
    throw new AdminApiError(502, "Unable to load the leaderboard.");
  if (!candidate) return null;

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
    StartPosition: candidate["Position"],
    MaxResultsCount: 1,
    ProfileConstraints: { ShowDisplayName: true },
    ...versionBody(actualVersion),
  });
  if (check["Version"] !== actualVersion)
    throw new AdminApiError(502, "Unable to load the leaderboard.");

  const verified = Array.isArray(check["Leaderboard"])
    ? check["Leaderboard"].map(object).find((row) => row["PlayFabId"] === id)
    : null;
  if (!verified) return null;

  const stats = await playerCareerStats(id);
  return {
    rank: Number(candidate["Position"]) + 1,
    displayName:
      textValue(verified["DisplayName"]) ??
      textValue(object(verified["Profile"])["DisplayName"]) ??
      "Engineer",
    totalScore: Number(verified["StatValue"]),
    bridgesCompleted: stats.bridgesCompleted,
    challengesCompleted: stats.challengesCompleted,
  };
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
    if (url.pathname === "/api/leaderboard/contracts") {
      const regionalCatalog =
        url.searchParams.size === 1 && url.searchParams.get("catalogVersion") === "2";
      if (url.searchParams.size && !regionalCatalog)
        throw new AdminApiError(400, "Choose a supported leaderboard catalog version.");
      const selection = await getLeaderboardVisibility();
      // Older APKs reject the whole response if even one unfamiliar ID appears.
      // Retain their existing boards while newer clients opt into all regions.
      return json(
        regionalCatalog
          ? selection
          : {
              ...selection,
              contractIds: selection.contractIds.filter((id) =>
                LEGACY_LEADERBOARD_CONTRACTS.some((legacy) => legacy === id),
              ),
            },
      );
    }
    // Anonymous access is limited to the explicit, field-whitelisted endpoints.
    // Existing player/admin endpoints below retain their authentication checks.
    if (url.pathname === "/api/leaderboard/public/multiplayer") {
      if (url.searchParams.size)
        throw new AdminApiError(
          400,
          "The multiplayer leaderboard does not accept query parameters.",
        );
      return json(await multiplayerLeaderboardPage());
    }
    if (url.pathname === "/api/leaderboard/public/overall") {
      for (const key of url.searchParams.keys()) {
        if (!["start", "pageSize", "version"].includes(key))
          throw new AdminApiError(400, "Choose supported overall leaderboard parameters.");
      }
      const integer = (key: string, fallback?: number) => {
        const value = url.searchParams.get(key);
        if (value === null) return fallback;
        if (!/^\d{1,9}$/.test(value)) throw new AdminApiError(400, "Invalid leaderboard page.");
        return Number(value);
      };
      const pageSize = integer("pageSize", LEADERBOARD_PAGE_SIZE)!;
      if (![10, 20, 50].includes(pageSize))
        throw new AdminApiError(400, "Choose 10, 20 or 50 entries per page.");
      const start = integer("start", 0)!;
      const version = integer("version");
      return json(await overallLeaderboardPage(start, pageSize, version));
    }
    if (url.pathname === "/api/leaderboard/public") {
      const integer = (key: string, fallback?: number) => {
        const value = url.searchParams.get(key);
        if (value === null) return fallback;
        if (!/^\d{1,9}$/.test(value)) throw new AdminApiError(400, "Invalid leaderboard page.");
        return Number(value);
      };
      const contract = url.searchParams.get("contractId") ?? DEFAULT_CONTRACT;
      const mode = url.searchParams.get("mode") ?? DEFAULT_MODE;
      bridgeStatistic(contract, mode);
      await requireVisibleLeaderboardContract(contract);
      const pageSize = integer("pageSize", LEADERBOARD_PAGE_SIZE)!;
      if (![10, 20, 50].includes(pageSize))
        throw new AdminApiError(400, "Choose 10, 20 or 50 entries per page.");
      const page = await leaderboardPage(
        integer("start", 0),
        integer("version"),
        "all-time",
        pageSize,
        contract as LeaderboardContract,
        mode as LeaderboardMode,
      );
      return json({
        entries: page.entries.map(({ rank, displayName, cost, peakStress }) => ({
          rank,
          displayName,
          cost,
          peakStress,
        })),
        version: page.version,
        nextStart: page.nextStart,
      });
    }
    let playerId: string | null = null;
    const ticket = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
    if (ticket && ticket.length <= 4096) {
      const auth = await playFabAdmin("Server/AuthenticateSessionTicket", {
        SessionTicket: ticket,
      });
      const id = object(auth["UserInfo"])["PlayFabId"];
      if (
        !auth["IsSessionTicketExpired"] &&
        typeof id === "string" &&
        /^[a-f0-9]{1,32}$/i.test(id)
      ) {
        if (await isAccountDeleted(id)) {
          return json({ error: "Player account is undergoing deletion." }, 401);
        }
        playerId = id;
      }
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
    const isOverall = url.searchParams.get("type") === "overall";
    if (isOverall) {
      const version = integer("version");
      const pageSize = integer("pageSize", LEADERBOARD_PAGE_SIZE)!;
      if (![10, 20, 50].includes(pageSize))
        throw new AdminApiError(400, "Choose 10, 20 or 50 entries per page.");
      if (url.pathname === "/api/leaderboard/me" || url.pathname === "/api/leaderboard/standing") {
        if (!playerId) return json({ error: "Player sign-in is required." }, 401);
        const row = await overallLeaderboardRank(playerId, version);
        if (url.pathname === "/api/leaderboard/standing")
          return json(
            row
              ? {
                  rank: row.rank,
                  totalScore: row.totalScore,
                  bridgesCompleted: row.bridgesCompleted,
                }
              : null,
          );
        return json(row);
      }
      if (url.pathname !== "/api/leaderboard") return json({ error: "Not found." }, 404);
      return json(await overallLeaderboardPage(integer("start", 0), pageSize, version));
    }
    const contract = url.searchParams.get("contractId") ?? DEFAULT_CONTRACT;
    const mode = url.searchParams.get("mode") ?? DEFAULT_MODE;
    bridgeStatistic(contract, mode);
    await requireVisibleLeaderboardContract(contract);
    const version = integer("version");
    const period = url.searchParams.get("period") ?? "all-time";
    if (period !== "weekly" && period !== "all-time")
      throw new AdminApiError(400, "Choose Weekly or All-Time.");
    const pageSize = integer("pageSize", LEADERBOARD_PAGE_SIZE)!;
    if (![10, 20, 50].includes(pageSize))
      throw new AdminApiError(400, "Choose 10, 20 or 50 entries per page.");
    if (url.pathname === "/api/leaderboard/me" || url.pathname === "/api/leaderboard/standing") {
      if (!playerId) return json({ error: "Player sign-in is required." }, 401);
      const row = await leaderboardRank(
        playerId,
        version,
        period,
        contract as LeaderboardContract,
        mode as LeaderboardMode,
      );
      if (url.pathname === "/api/leaderboard/standing")
        return json(row ? { rank: row.rank, cost: row.cost, peakStress: row.peakStress } : null);
      return json(row);
    }
    if (url.pathname !== "/api/leaderboard") return json({ error: "Not found." }, 404);
    return json(
      await leaderboardPage(
        integer("start", 0),
        version,
        period,
        pageSize,
        contract as LeaderboardContract,
        mode as LeaderboardMode,
      ),
    );
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
