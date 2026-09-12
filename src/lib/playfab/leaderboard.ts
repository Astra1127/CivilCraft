import { requireSessionTicket } from "./client";
import type { LeaderboardEntry } from "./types";
import type { LeaderboardPage, LeaderboardPeriod } from "./leaderboard-shared";
export { LEADERBOARD_STATISTIC } from "./leaderboard-shared";
async function request<T>(path: string, admin = false): Promise<T> {
  const response = await fetch(path, {
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
): Promise<LeaderboardPage> {
  const params = new URLSearchParams({ start: String(start), period, pageSize: String(pageSize) });
  if (version !== undefined) params.set("version", String(version));
  return request("/api/leaderboard?" + params, admin);
}
export async function getPlayerRank(
  playFabId: string,
  version?: number,
  period: LeaderboardPeriod = "all-time",
): Promise<LeaderboardEntry | null> {
  const row = await request<LeaderboardEntry | null>(
    "/api/leaderboard/me?period=" + period + (version === undefined ? "" : "&version=" + version),
  );
  return row?.playFabId === playFabId ? row : null;
}
