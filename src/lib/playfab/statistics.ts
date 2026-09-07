/**
 * PlayFab player statistics. Only statistics the game actually reports are
 * returned — nothing is fabricated to fill a UI.
 */
import { callPlayerApi } from "./client";
import type { PlayerStatistic } from "./types";

interface StatisticsResult {
  Statistics?: { StatisticName: string; Value: number; Version?: number }[];
}

export async function getPlayerStatistics(): Promise<PlayerStatistic[]> {
  const result = await callPlayerApi<StatisticsResult>("/Client/GetPlayerStatistics", {});
  return (result.Statistics ?? []).map((s) => ({
    name: s.StatisticName,
    value: s.Value,
    ...(s.Version !== undefined ? { version: s.Version } : {}),
  }));
}

export async function getPlayerStatisticMap(): Promise<Record<string, number>> {
  const stats = await getPlayerStatistics();
  const map: Record<string, number> = {};
  for (const stat of stats) map[stat.name] = stat.value;
  return map;
}
