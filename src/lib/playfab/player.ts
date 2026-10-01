import { equipmentRecord, equipmentSnapshot, resolveEquipment } from "./equipment.ts";
import { LEADERBOARD_STATISTIC } from "./leaderboard-shared.ts";
/**
 * Player profile & game data read from PlayFab (Client API, read-only).
 *
 * The Unity game publishes data via Cloud Script function `syncDashboardV1`.
 * We query only the dedicated dashboard keys to ensure the encrypted full
 * player-save file is never requested or transmitted over the wire.
 */
import { callPlayerApi } from "./client.ts";
import { getPlayerStatisticMap } from "./statistics.ts";
import type {
  Achievement,
  CosmeticItem,
  CosmeticSlot,
  EquippedCosmetics,
  PlayerCharacter,
  PlayerProfile,
  PlayerProgress,
  RegionProgress,
} from "./types.ts";

interface UserDataResult {
  Data?: Record<string, { Value?: string; LastUpdated?: string }>;
}

/**
 * User Data keys published by Unity via Cloud Script `syncDashboardV1`.
 * Explicitly requested to prevent fetching large/encrypted save files.
 */
export const DASHBOARD_USER_DATA_KEYS = [
  "CurrentLevel",
  "XP",
  "XPToNextLevel",
  "CurrentRegion",
  "AchievementsUnlocked",
  "AchievementsTotal",
  "BridgesCompleted",
  "ChallengesCompleted",
  "MapProgress",
  "AchievementProgress",
  "EquippedCosmetics",
  "AlmanacProgress",
  "CharacterSyncedAt",
  "CharacterName",
  "CharacterPortraitUrl",
] as const;

/** Raw title data written by the game for the signed-in player. */
export async function getPlayerData(
  keys: readonly string[] = DASHBOARD_USER_DATA_KEYS,
): Promise<Record<string, string>> {
  const result = await callPlayerApi<UserDataResult>("/Client/GetUserData", {
    Keys: [...keys],
  });
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(result.Data ?? {})) {
    if (entry?.Value !== undefined) out[key] = entry.Value;
  }
  return out;
}

export function numberFrom(data: Record<string, string>, key: string): number | undefined {
  const raw = data[key];
  if (raw === undefined || !raw.trim()) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

export function jsonFrom<T>(data: Record<string, string>, key: string): T | undefined {
  const raw = data[key];
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/** Safely parse MapProgress from JSON or return an empty structure */
export function parseMapProgress(raw: string | undefined, fallbackRegion?: string): PlayerProgress {
  if (!raw || !raw.trim()) {
    return {
      overallPercent: 0,
      storyPercent: 0,
      currentRegion: fallbackRegion ?? null,
      regions: [],
    };
  }

  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== "object") {
      return {
        overallPercent: 0,
        storyPercent: 0,
        currentRegion: fallbackRegion ?? null,
        regions: [],
      };
    }

    const sanitizeRegion = (r: unknown, idx: number): RegionProgress => {
      const obj = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
      const id = String(obj["id"] ?? obj["Id"] ?? obj["regionId"] ?? `region_${idx}`);
      const name = String(obj["name"] ?? obj["Name"] ?? id);
      const completed = Boolean(obj["completed"] ?? obj["Completed"]);
      const rawMissionsCompleted = obj["missionsCompleted"] ?? obj["MissionsCompleted"];
      const missionsCompleted =
        typeof rawMissionsCompleted === "number"
          ? Math.max(0, rawMissionsCompleted)
          : completed
            ? 1
            : 0;
      const rawMissionsTotal = obj["missionsTotal"] ?? obj["MissionsTotal"];
      const missionsTotal =
        typeof rawMissionsTotal === "number"
          ? Math.max(missionsCompleted, rawMissionsTotal)
          : Math.max(missionsCompleted, 1);
      const rawBestScore = obj["bestScore"] ?? obj["BestScore"];
      const bestScore = typeof rawBestScore === "number" ? rawBestScore : undefined;
      const rawStars = obj["stars"] ?? obj["Stars"];
      const stars = typeof rawStars === "number" ? rawStars : undefined;

      return {
        id,
        name,
        completed,
        missionsCompleted,
        missionsTotal,
        ...(bestScore !== undefined ? { bestScore } : {}),
        ...(stars !== undefined ? { stars } : {}),
      };
    };

    if (Array.isArray(parsed)) {
      const regions = parsed.map(sanitizeRegion);
      const completed = regions.filter((r) => r.completed).length;
      const percent = regions.length ? Math.round((completed / regions.length) * 100) : 0;
      return {
        overallPercent: percent,
        storyPercent: percent,
        currentRegion: fallbackRegion ?? regions[0]?.name ?? null,
        regions,
      };
    }

    const obj = parsed as Record<string, unknown>;
    const rawRegions = Array.isArray(obj["regions"])
      ? (obj["regions"] as unknown[])
      : Array.isArray(obj["Regions"])
        ? (obj["Regions"] as unknown[])
        : [];
    const regions = rawRegions.map(sanitizeRegion);

    const rawOverall =
      obj["overallPercent"] ?? obj["OverallPercent"] ?? obj["overallPercentage"] ?? obj["percent"];
    const overallPercent =
      typeof rawOverall === "number" && Number.isFinite(rawOverall)
        ? Math.max(0, Math.min(100, Math.round(rawOverall)))
        : regions.length
          ? Math.round((regions.filter((r) => r.completed).length / regions.length) * 100)
          : 0;

    const rawStory = obj["storyPercent"] ?? obj["StoryPercent"];
    const storyPercent =
      typeof rawStory === "number" && Number.isFinite(rawStory)
        ? Math.max(0, Math.min(100, Math.round(rawStory)))
        : overallPercent;

    const rawCurrentRegion = obj["currentRegion"] ?? obj["CurrentRegion"];
    const currentRegion =
      (typeof rawCurrentRegion === "string" ? rawCurrentRegion : fallbackRegion) ?? null;

    return { overallPercent, storyPercent, currentRegion, regions };
  } catch (err) {
    console.warn("[playfab/player] Error parsing MapProgress safely:", err);
    return {
      overallPercent: 0,
      storyPercent: 0,
      currentRegion: fallbackRegion ?? null,
      regions: [],
    };
  }
}

/** Safely parse AchievementProgress from JSON */
export function parseAchievementProgress(raw: string | undefined): Achievement[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed) return [];

    let list: unknown[] = [];
    if (Array.isArray(parsed)) {
      list = parsed;
    } else if (typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      if (Array.isArray(obj["achievements"])) list = obj["achievements"] as unknown[];
      else if (Array.isArray(obj["Achievements"])) list = obj["Achievements"] as unknown[];
      else if (Array.isArray(obj["items"])) list = obj["items"] as unknown[];
      else {
        list = Object.entries(obj).map(([key, val]) => {
          if (val && typeof val === "object") {
            return { id: key, ...(val as Record<string, unknown>) };
          }
          return { id: key, unlocked: Boolean(val) };
        });
      }
    }

    return list
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .map((item, idx) => {
        const id = String(item["id"] ?? item["Id"] ?? item["achievementId"] ?? `ach_${idx}`);
        const name = String(item["name"] ?? item["Name"] ?? item["title"] ?? id);
        const description = String(item["description"] ?? item["Description"] ?? "");
        const unlocked = Boolean(
          item["unlocked"] ?? item["Unlocked"] ?? item["isUnlocked"] ?? item["completed"],
        );
        const rawUnlockedAt = item["unlockedAt"] ?? item["UnlockedAt"];
        const unlockedAt = typeof rawUnlockedAt === "string" ? rawUnlockedAt : undefined;
        const rawProgress = item["progress"] ?? item["Progress"];
        const progress = typeof rawProgress === "number" ? rawProgress : undefined;
        const rawTarget = item["progressTarget"] ?? item["ProgressTarget"] ?? item["target"];
        const progressTarget = typeof rawTarget === "number" ? rawTarget : undefined;
        const icon = String(item["icon"] ?? item["Icon"] ?? "medal");

        return {
          id,
          name,
          description,
          icon,
          unlocked,
          ...(unlockedAt ? { unlockedAt } : {}),
          ...(progress !== undefined ? { progress } : {}),
          ...(progressTarget !== undefined ? { progressTarget } : {}),
        };
      });
  } catch (err) {
    console.warn("[playfab/player] Error parsing AchievementProgress safely:", err);
    return [];
  }
}

/** Safely parse EquippedCosmetics from JSON */
export function parseEquippedCosmetics(raw: string | undefined): CosmeticItem[] {
  return equipmentSnapshot(raw).items;
}

interface AccountInfoResult {
  AccountInfo?: {
    PlayFabId?: string;
    Created?: string;
    Username?: string;
    TitleInfo?: { DisplayName?: string; Created?: string; LastLogin?: string; AvatarUrl?: string };
    PrivateInfo?: { Email?: string };
  };
}

/** PlayFab account + game data merged into the website's profile model. */
export async function getPlayerProfile(playFabId?: string): Promise<PlayerProfile> {
  const [account, data, stats] = await Promise.all([
    callPlayerApi<AccountInfoResult>("/Client/GetAccountInfo", {}),
    getPlayerData(DASHBOARD_USER_DATA_KEYS),
    getPlayerStatisticMap().catch(() => ({}) as Record<string, number>),
  ]);

  const info = account.AccountInfo;
  if (!info?.PlayFabId || (playFabId && info.PlayFabId !== playFabId))
    throw new Error("Player session changed. Please sign in again.");
  const displayName = info?.TitleInfo?.DisplayName ?? info?.Username ?? "Not available";
  const email = info?.PrivateInfo?.Email;
  const avatarUrl = info?.TitleInfo?.AvatarUrl;
  const createdAt = info?.TitleInfo?.Created ?? info?.Created;
  const lastActive = info?.TitleInfo?.LastLogin;
  const currentRegion = data["CurrentRegion"];
  const characterSyncedAt = data["CharacterSyncedAt"];

  return {
    playFabId: info.PlayFabId,
    displayName,
    ...(email ? { email } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(lastActive ? { lastActive } : {}),
    role: "player",
    level: numberFrom(data, "CurrentLevel") ?? null,
    xp: numberFrom(data, "XP") ?? null,
    xpToNextLevel: numberFrom(data, "XPToNextLevel") ?? null,
    totalScore:
      stats["TotalScore"] ?? stats[LEADERBOARD_STATISTIC] ?? numberFrom(data, "TotalScore") ?? null,
    bridgesCompleted: stats["BridgesCompleted"] ?? numberFrom(data, "BridgesCompleted") ?? null,
    challengesCompleted:
      stats["ChallengesCompleted"] ?? numberFrom(data, "ChallengesCompleted") ?? null,
    bestSingleBuildScore:
      stats["BestSingleBuildScore"] ??
      stats["BestBuildScore"] ??
      numberFrom(data, "BestSingleBuildScore") ??
      null,
    achievementsUnlocked: numberFrom(data, "AchievementsUnlocked") ?? null,
    achievementsTotal: numberFrom(data, "AchievementsTotal") ?? null,
    ...(currentRegion ? { currentRegion } : {}),
    ...(characterSyncedAt ? { characterSyncedAt } : {}),
  };
}

/** Progress summary written by the game (`MapProgress`). Empty when absent. */
export async function getPlayerProgress(): Promise<PlayerProgress> {
  const data = await getPlayerData(["MapProgress", "CurrentRegion"]);
  return parseMapProgress(data["MapProgress"], data["CurrentRegion"]);
}

export async function getEquippedCosmetics(): Promise<EquippedCosmetics> {
  const data = await getPlayerData(["EquippedCosmetics"]);
  const items = parseEquippedCosmetics(data["EquippedCosmetics"]);
  return equipmentRecord(items);
}

/** The in-game character as last synced by the game. */
export async function getPlayerCharacter(): Promise<PlayerCharacter> {
  const data = await getPlayerData([
    "EquippedCosmetics",
    "CharacterPortraitUrl",
    "CharacterSyncedAt",
  ]);
  const snapshot = equipmentSnapshot(data["EquippedCosmetics"]);
  let equipped = snapshot.items;
  if (equipped.length) {
    try {
      const catalog = await callPlayerApi<{
        Catalog?: { ItemId: string; DisplayName?: string; ItemImageUrl?: string }[];
      }>("/Client/GetCatalogItems", {});
      equipped = resolveEquipment(equipped, catalog.Catalog ?? []);
    } catch {
      /* Preserve published IDs/names and resolve static website catalog when API catalog is unavailable. */
      equipped = resolveEquipment(equipped, []);
    }
  }
  const portraitUrl = data["CharacterPortraitUrl"];
  const syncedAt = data["CharacterSyncedAt"];
  return {
    ...(portraitUrl ? { portraitUrl } : {}),
    ...(syncedAt ? { syncedAt } : {}),
    equipped,
    syncStatus: snapshot.status,
    ...(snapshot.slots ? { equipmentSlots: snapshot.slots } : {}),
  };
}
