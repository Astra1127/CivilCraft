import type { LeaderboardEntry } from "./types";

/** Existing game statistic; never calculate a parallel website score. */
export const LEADERBOARD_STATISTIC = "TotalScore";
export const LEADERBOARD_PAGE_SIZE = 10;
export interface LeaderboardPage {
  entries: LeaderboardEntry[];
  version: number;
  nextStart: number | null;
}
