import { LEADERBOARD_STATISTIC } from "./leaderboard-shared";
/**
 * Player profile & game data read from PlayFab (Client API, read-only).
 *
 * The Unity game owns every value. Keys that the game has not written yet are
 * simply absent — the website reports them as unavailable instead of
 * inventing numbers.
 */
import { callPlayerApi } from "./client";
import { getPlayerStatisticMap } from "./statistics";
import type { EquippedCosmetics, PlayerCharacter, PlayerProfile, PlayerProgress } from "./types";

interface UserDataResult {
  Data?: Record<string, { Value?: string; LastUpdated?: string }>;
}

/** Raw title data written by the game for the signed-in player. */
export async function getPlayerData(keys?: string[]): Promise<Record<string, string>> {
  const result = await callPlayerApi<UserDataResult>("/Client/GetUserData", {
    ...(keys?.length ? { Keys: keys } : {}),
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
    getPlayerData().catch(() => ({}) as Record<string, string>),
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
    totalScore: stats[LEADERBOARD_STATISTIC] ?? null,
    bridgesCompleted: stats["BridgesCompleted"] ?? numberFrom(data, "BridgesCompleted") ?? null,
    challengesCompleted:
      stats["ChallengesCompleted"] ?? numberFrom(data, "ChallengesCompleted") ?? null,
    achievementsUnlocked: numberFrom(data, "AchievementsUnlocked") ?? null,
    achievementsTotal: numberFrom(data, "AchievementsTotal") ?? null,
    ...(currentRegion ? { currentRegion } : {}),
  };
}

/** Progress summary written by the game (`MapProgress`). Empty when absent. */
export async function getPlayerProgress(): Promise<PlayerProgress> {
  const data = await getPlayerData();
  const map = jsonFrom<PlayerProgress>(data, "MapProgress");
  if (map && Array.isArray(map.regions)) return map;
  return {
    overallPercent: 0,
    storyPercent: 0,
    currentRegion: data["CurrentRegion"] ?? null,
    regions: [],
  };
}

export async function getEquippedCosmetics(): Promise<EquippedCosmetics> {
  const data = await getPlayerData(["EquippedCosmetics"]);
  return jsonFrom<EquippedCosmetics>(data, "EquippedCosmetics") ?? {};
}

/** The in-game character as last synced by the game. */
export async function getPlayerCharacter(): Promise<PlayerCharacter> {
  const data = await getPlayerData([
    "EquippedCosmetics",
    "CharacterPortraitUrl",
    "CharacterSyncedAt",
  ]);
  const equippedMap = jsonFrom<Record<string, { itemId: string; name?: string }>>(
    data,
    "EquippedCosmetics",
  );
  const portraitUrl = data["CharacterPortraitUrl"];
  const syncedAt = data["CharacterSyncedAt"];
  return {
    ...(portraitUrl ? { portraitUrl } : {}),
    ...(syncedAt ? { syncedAt } : {}),
    equipped: Object.entries(equippedMap ?? {}).map(([slot, item]) => ({
      itemId: item.itemId,
      name: item.name ?? item.itemId,
      slot: slot as PlayerCharacter["equipped"][number]["slot"],
    })),
  };
}
