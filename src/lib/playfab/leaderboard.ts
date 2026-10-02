import { playerFetch } from "./client";
import { DEFAULT_CONTRACT, DEFAULT_MODE } from "./leaderboard-shared";
import { requireSessionTicket } from "./client";
import type { LeaderboardEntry } from "./types";
import type {
  LeaderboardPage,
  LeaderboardPeriod,
  LeaderboardContract,
  LeaderboardMode,
} from "./leaderboard-shared";
export { LEADERBOARD_STATISTIC } from "./leaderboard-shared";
export interface PlayerStanding {
  rank: number;
  cost: number;
  peakStress: number;
}
export function getOwnStanding(
  contractId: LeaderboardContract = DEFAULT_CONTRACT,
  mode: LeaderboardMode = DEFAULT_MODE,
): Promise<PlayerStanding | null> {
  // Identity comes exclusively from the verified ticket, never a client-supplied ID.
  return request("/api/leaderboard/standing?" + new URLSearchParams({ contractId, mode }));
}
async function request<T>(path: string, admin = false): Promise<T> {
  const response = await playerFetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    headers: admin ? {} : { Authorization: "Bearer " + requireSessionTicket() },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || "Unable to load the leaderboard.");
  return data as T;
}
export function getLeaderboard(
  start = 0,
  version?: number,
  admin = false,
  period: LeaderboardPeriod = "all-time",
  pageSize = 20,
  contractId: LeaderboardContract = DEFAULT_CONTRACT,
  mode: LeaderboardMode = DEFAULT_MODE,
): Promise<LeaderboardPage> {
  const params = new URLSearchParams({
    start: String(start),
    period,
    pageSize: String(pageSize),
    contractId,
    mode,
  });
  if (version !== undefined) params.set("version", String(version));
  return request("/api/leaderboard?" + params, admin);
}
export async function getPlayerRank(
  playFabId: string,
  version?: number,
  period: LeaderboardPeriod = "all-time",
  contractId: LeaderboardContract = DEFAULT_CONTRACT,
  mode: LeaderboardMode = DEFAULT_MODE,
): Promise<LeaderboardEntry | null> {
  const row = await request<LeaderboardEntry | null>(
    "/api/leaderboard/me?" +
      new URLSearchParams({ period, contractId, mode }) +
      (version === undefined ? "" : "&version=" + version),
  );
  return row?.playFabId === playFabId ? row : null;
}
