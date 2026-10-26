import type { Achievement, AlmanacJourney, PlayerNotification } from "./types.ts";
import { verifiedLevelCompletion } from "./level-records.ts";

export function notificationDestination(n: PlayerNotification) {
  if (n.kind === "achievement" && n.target && "achievementId" in n.target)
    return {
      to: "/dashboard/achievements" as const,
      search: { achievementId: n.target.achievementId },
    };
  if (n.kind === "level" && n.target && "levelId" in n.target)
    return { to: "/dashboard/almanac" as const, search: { tab: "journey", ...n.target } };
  return null;
}

export function findNotificationAchievement(items: Achievement[], id?: string) {
  const matches = items.filter((a) => a.id === id && a.stableId !== false && a.unlocked);
  return matches.length === 1 ? matches[0] : undefined;
}

export function findNotificationLevel(
  journey: AlmanacJourney,
  playerId: string,
  levelId?: string,
  regionId?: string,
) {
  const matches = journey.regions
    .flatMap((r) => r.levels)
    .filter(
      (l) =>
        l.levelId === levelId && l.regionId === regionId && verifiedLevelCompletion(l, playerId),
    );
  return matches.length === 1 ? matches[0] : undefined;
}

export function targetSearch(search: Record<string, unknown>, key: string): string | undefined {
  const value = search[key];
  return typeof value === "string" && value.length > 0 && value.length <= 256 ? value : undefined;
}
