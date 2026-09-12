import type { AdminAuthConfig } from "../admin-auth/config.server.ts";
import type { AdminPlayer } from "./admin-types.ts";
import type { AdminAnalytics, AnalyticsSection, PlayerAnalytics } from "./analytics-types.ts";
import { adminGameConfig, playFabAdmin } from "./admin-client.server.ts";
import { directoryPage } from "./admin-directory.server.ts";
import { listBugReports } from "./bug-reports.server.ts";
import { leaderboardPage } from "./leaderboard.server.ts";

export function summarizePlayers(players: AdminPlayer[], snapshotAt: string): PlayerAnalytics {
  const now = Date.parse(snapshotAt),
    day = 86400000;
  const date = (raw: string | null) =>
    raw && Number.isFinite(Date.parse(raw)) && Date.parse(raw) <= now ? Date.parse(raw) : null;
  const start = new Date(snapshotAt);
  start.setUTCHours(0, 0, 0, 0);
  const registrations = Array.from({ length: 30 }, (_, i) => ({
    label: new Date(start.getTime() - (29 - i) * day).toISOString().slice(0, 10),
    count: 0,
  }));
  const activity = ["Last 7 days", "8–30 days", "Over 30 days", "Not available"].map((label) => ({
    label,
    count: 0,
  }));
  let registrationUnknown = 0;
  for (const p of players) {
    const created = date(p.createdAt),
      login = date(p.lastActive);
    if (created === null) registrationUnknown++;
    else {
      const bucket = registrations.find(
        (b) => b.label === new Date(created).toISOString().slice(0, 10),
      );
      if (bucket) bucket.count++;
    }
    const age = login === null ? null : now - login;
    activity[age === null ? 3 : age <= 7 * day ? 0 : age <= 30 * day ? 1 : 2]!.count++;
  }
  const metric = (
    label: string,
    key: "level" | "totalScore" | "bridgesCompleted" | "challengesCompleted",
    average: boolean,
  ) => {
    const values = players
      .map((p) => p[key])
      .filter((v): v is number => v !== null && Number.isFinite(v));
    return {
      label,
      available: values.length,
      value: values.length
        ? values.reduce((a, b) => a + b, 0) / (average ? values.length : 1)
        : null,
    };
  };
  return {
    total: players.length,
    recentlyActive:
      players.length && activity[3]!.count === players.length ? null : activity[0]!.count,
    snapshotAt,
    registrations,
    registrationUnknown,
    activity,
    progression: [
      metric("Average level", "level", true),
      metric("Average engineering score", "totalScore", true),
      metric("Bridges completed", "bridgesCompleted", false),
      metric("Challenges completed", "challengesCompleted", false),
    ],
  };
}
async function section<T>(work: () => Promise<T>): Promise<AnalyticsSection<T>> {
  try {
    return { status: "ready", data: await work() };
  } catch {
    return { status: "error", data: null };
  }
}
export async function getAdminAnalytics(
  config: AdminAuthConfig,
  owner: string,
): Promise<AdminAnalytics> {
  const { titleId, secret } = adminGameConfig();
  const [players, bugs, leaderboard, probe] = await Promise.all([
    (async (): Promise<AnalyticsSection<PlayerAnalytics>> => {
      try {
        const result = await directoryPage(config, owner, null, false, 50, 1, true);
        return result.pending
          ? { status: "pending", data: null }
          : { status: "ready", data: summarizePlayers(result.players, result.snapshotAt!) };
      } catch {
        return { status: "error", data: null };
      }
    })(),
    section(async () => {
      const reports = await listBugReports();
      const counts = ["New", "Investigating", "Resolved", "Closed"].map((label) => ({
        label,
        count: reports.filter((r) => r.status === label).length,
      }));
      return { counts, open: counts[0]!.count + counts[1]!.count, latest: reports.slice(0, 5) };
    }),
    section(async () => (await leaderboardPage()).entries.slice(0, 5)),
    section(() => playFabAdmin("Admin/GetAllSegments")),
  ]);
  return {
    checkedAt: new Date().toISOString(),
    titleId,
    backend: !secret ? "Not configured" : probe.status === "ready" ? "Connected" : "Unavailable",
    players,
    bugs,
    leaderboard,
  };
}
