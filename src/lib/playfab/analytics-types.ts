import type { BugReport } from "../cms/types";
import type { LeaderboardEntry } from "./types";
export interface AnalyticsSection<T> {
  status: "ready" | "pending" | "error";
  data: T | null;
}
export interface PlayerAnalytics {
  total: number;
  recentlyActive: number | null;
  snapshotAt: string;
  registrations: { label: string; count: number }[];
  registrationUnknown: number;
  activity: { label: string; count: number }[];
  progression: { label: string; value: number | null; available: number }[];
}
export interface AdminAnalytics {
  checkedAt: string;
  titleId: string;
  backend: "Connected" | "Unavailable" | "Not configured";
  players: AnalyticsSection<PlayerAnalytics>;
  bugs: AnalyticsSection<{
    counts: { label: string; count: number }[];
    open: number;
    latest: BugReport[];
  }>;
  leaderboard: AnalyticsSection<LeaderboardEntry[]>;
}
