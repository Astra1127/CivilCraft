import { leaderboardRank } from "./leaderboard.server.ts";
import { LEADERBOARD_STATISTIC } from "./leaderboard-shared.ts";
import {
  AdminApiError,
  dateValue,
  numberValue,
  object,
  playFabAdmin,
  textValue,
} from "./admin-client.server.ts";
import type { AdminPlayer, AdminPlayerDetail, PlayerSearchKind } from "./admin-types.ts";

const GAME_KEYS = [
  "CurrentLevel",
  "XP",
  "XPToNextLevel",
  "BridgesCompleted",
  "ChallengesCompleted",
  "AchievementsUnlocked",
  "AchievementsTotal",
  "CurrentRegion",
  "AchievementProgress",
];
export function mapIdentity(raw: unknown): AdminPlayer {
  const info = object(raw),
    title = object(info["TitleInfo"]);
  const id = textValue(info["PlayFabId"]);
  if (!id || !/^[a-f0-9]{1,32}$/i.test(id))
    throw new AdminApiError(502, "Player data is unavailable.");
  return {
    playFabId: id,
    displayName: textValue(title["DisplayName"]),
    username: textValue(info["Username"]),
    createdAt: dateValue(title["Created"]) ?? dateValue(info["Created"]),
    lastActive: dateValue(title["LastLogin"]),
    accountStatus: null,
    level: null,
    xp: null,
    xpToNextLevel: null,
    totalScore: null,
    bridgesCompleted: null,
    challengesCompleted: null,
    achievementsUnlocked: null,
    achievementsTotal: null,
    currentRegion: null,
  };
}
export function mapBans(raw: unknown): NonNullable<AdminPlayerDetail["bans"]> {
  if (!Array.isArray(raw)) throw new AdminApiError(502, "Ban status is unavailable.");
  return raw.map((entry) => {
    const b = object(entry),
      expiresAt = dateValue(b["Expires"]);
    if (typeof b["Active"] !== "boolean" || (b["Expires"] != null && !expiresAt))
      throw new AdminApiError(502, "Ban status is unavailable.");
    return {
      reason: textValue(b["Reason"]),
      createdAt: dateValue(b["Created"]),
      expiresAt,
      active: b["Active"] === true && (!expiresAt || Date.parse(expiresAt) > Date.now()),
    };
  });
}
export function mapAchievements(raw: unknown): AdminPlayerDetail["achievements"] {
  if (typeof raw !== "string") return null;
  try {
    const items: unknown = JSON.parse(raw);
    if (!Array.isArray(items)) return null;
    return items.slice(0, 500).flatMap((entry) => {
      const a = object(entry),
        id = textValue(a["id"]);
      return id
        ? [
            {
              id,
              name: textValue(a["name"]),
              progress: numberValue(a["progress"]),
              unlocked: typeof a["unlocked"] === "boolean" ? a["unlocked"] : null,
            },
          ]
        : [];
    });
  } catch {
    return null;
  }
}
export async function lookupPlayer(query: string, kind: PlayerSearchKind): Promise<AdminPlayer> {
  const result = await playFabAdmin("Admin/GetUserAccountInfo", { [kind]: query });
  const info = object(result["UserInfo"]);
  // A master account without title membership is not a Civil Craft player.
  if (!Object.keys(object(info["TitleInfo"])).length)
    throw new AdminApiError(404, "Player could not be found.");
  return mapIdentity(info);
}
export async function getAdminPlayer(id: string): Promise<AdminPlayerDetail> {
  const player = await lookupPlayer(id, "PlayFabId");
  const results = await Promise.allSettled([
    playFabAdmin("Server/GetUserData", { PlayFabId: id, Keys: GAME_KEYS }),
    playFabAdmin("Server/GetPlayerStatistics", { PlayFabId: id }),
    playFabAdmin("Server/GetUserInventory", { PlayFabId: id }),
    playFabAdmin("Admin/GetUserBans", { PlayFabId: id }),
    leaderboardRank(id),
  ] as const);
  const unavailable: string[] = [];
  const read = (index: 0 | 1 | 2 | 3, name: string) => {
    const r = results[index]!;
    if (r.status === "fulfilled") return r.value;
    unavailable.push(name);
    return null;
  };
  const game = read(0, "Progression"),
    stats = read(1, "Statistics"),
    economy = read(2, "Inventory and currencies"),
    banResult = read(3, "Ban status");
  const data = object(game?.["Data"]);
  const value = (key: string) => object(data[key])["Value"];
  const statistics =
    stats && Array.isArray(stats["Statistics"])
      ? stats["Statistics"].slice(0, 500).flatMap((entry) => {
          const s = object(entry),
            name = textValue(s["StatisticName"]),
            v = numberValue(s["Value"]);
          return name && v !== null ? [{ name, value: v }] : [];
        })
      : null;
  const stat = (key: string) => statistics?.find((s) => s.name === key)?.value ?? null;
  let bans: AdminPlayerDetail["bans"] = null;
  if (banResult) {
    try {
      bans = mapBans(banResult["BanData"] ?? []);
    } catch {
      unavailable.push("Ban status");
    }
  }
  const ranking = results[4]!;
  if (ranking.status === "rejected") unavailable.push("Leaderboard rank");
  return {
    ...player,
    rank: ranking.status === "fulfilled" ? (ranking.value?.rank ?? null) : null,
    level: numberValue(value("CurrentLevel")),
    xp: numberValue(value("XP")),
    xpToNextLevel: numberValue(value("XPToNextLevel")),
    totalScore: stat(LEADERBOARD_STATISTIC),
    bridgesCompleted: stat("BridgesCompleted") ?? numberValue(value("BridgesCompleted")),
    challengesCompleted: stat("ChallengesCompleted") ?? numberValue(value("ChallengesCompleted")),
    achievementsUnlocked: numberValue(value("AchievementsUnlocked")),
    achievementsTotal: numberValue(value("AchievementsTotal")),
    currentRegion: textValue(value("CurrentRegion")),
    achievements: mapAchievements(value("AchievementProgress")),
    statistics,
    accountStatus: bans ? (bans.some((b) => b.active) ? "banned" : "active") : null,
    bans,
    unavailable,
    currencies: economy
      ? Object.entries(object(economy["VirtualCurrency"])).flatMap(([code, v]) =>
          typeof v === "number" && Number.isFinite(v)
            ? [{ code: code.slice(0, 16), balance: v }]
            : [],
        )
      : null,
    inventory:
      economy && Array.isArray(economy["Inventory"])
        ? economy["Inventory"].slice(0, 500).flatMap((entry) => {
            const i = object(entry),
              itemId = textValue(i["ItemId"]);
            return itemId
              ? [
                  {
                    itemId,
                    name: textValue(i["DisplayName"]),
                    purchasedAt: dateValue(i["PurchaseDate"]),
                  },
                ]
              : [];
          })
        : economy
          ? []
          : null,
  };
}
