import type { LeaderboardEntry } from "./types";

/** Existing game statistic; never calculate a parallel website score. */
export const LEADERBOARD_STATISTIC = "TotalScore";
export const LEADERBOARD_PAGE_SIZE = 20;
export type LeaderboardPeriod = "weekly" | "all-time";
export const LEADERBOARD_VIEWS = [
  { id: "weekly", label: "Weekly" },
  { id: "all-time", label: "All-Time" },
] as const;
export interface LeaderboardPage {
  entries: LeaderboardEntry[];
  version: number | null;
  nextStart: number | null;
}
