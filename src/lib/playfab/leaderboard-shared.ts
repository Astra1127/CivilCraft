import type { LeaderboardEntry } from "./types";

/** Legacy profile total only; never used to query bridge leaderboards. */
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

export const LEADERBOARD_CONTRACTS = [
  "ShopKeeper",
  "TUT_CONTRACT1",
  "ReedsContract",
  "VancesContract",
  "TUT_CONTRACT2",
  "ReedSideInspection",
  "VanceSideRealignment",
  "SilasMainContract",
  "MainContractSilas",
] as const;
export type LeaderboardContract = (typeof LEADERBOARD_CONTRACTS)[number];
export type LeaderboardMode = "efficient" | "strongest";
export const DEFAULT_CONTRACT: LeaderboardContract = "ShopKeeper";
export const DEFAULT_MODE: LeaderboardMode = "efficient";
