/**
 * PlayFab leaderboards. The website never keeps its own ranking data — every
 * row comes from a PlayFab player statistic.
 */
import { callPlayerApi } from "./client";
import type { LeaderboardEntry, LeaderboardWindow } from "./types";

/** Primary Civil Craft ranking statistic reported by the Unity game. */
export const LEADERBOARD_STATISTIC = "TotalScore";

interface LeaderboardResult {
  Leaderboard?: {
    PlayFabId: string;
    DisplayName?: string;
    StatValue: number;
    Position: number;
    Profile?: { DisplayName?: string };
  }[];
}

function toEntries(result: LeaderboardResult): LeaderboardEntry[] {
  return (result.Leaderboard ?? []).map((row) => ({
    rank: row.Position + 1,
    playFabId: row.PlayFabId,
    displayName: row.DisplayName ?? row.Profile?.DisplayName ?? row.PlayFabId,
    level: 0,
    score: row.StatValue,
  }));
}

export async function getLeaderboard(
  _window: LeaderboardWindow = "global",
  maxResults = 25,
): Promise<LeaderboardEntry[]> {
  const result = await callPlayerApi<LeaderboardResult>("/Client/GetLeaderboard", {
    StatisticName: LEADERBOARD_STATISTIC,
    StartPosition: 0,
    MaxResultsCount: maxResults,
    ProfileConstraints: { ShowDisplayName: true },
  });
  return toEntries(result);
}

export async function getPlayerRank(playFabId: string): Promise<LeaderboardEntry | null> {
  const result = await callPlayerApi<LeaderboardResult>("/Client/GetLeaderboardAroundPlayer", {
    StatisticName: LEADERBOARD_STATISTIC,
    MaxResultsCount: 1,
    ProfileConstraints: { ShowDisplayName: true },
  });
  const entries = toEntries(result);
  return entries.find((e) => e.playFabId === playFabId) ?? entries[0] ?? null;
}
