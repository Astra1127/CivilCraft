import { AdminApiError, object, playFabAdmin, textValue } from "./admin-client.server.ts";
import type { MultiplayerLeaderboardPage } from "./leaderboard-shared.ts";

// Exact legacy statistics used by the game's multiplayerCloudScript.js.
// Match results are published by the game; this module only reads them.
const WIN_STATISTIC = "CC_MP_Wins";
const RECORD_STATISTICS = ["CC_MP_Losses", "CC_MP_Draws"];
const MAX_ENTRIES = 15;
const MAX_COUNT = 2147483647;

function invalid(): never {
  throw new AdminApiError(502, "Invalid multiplayer leaderboard data.");
}

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > MAX_COUNT)
    invalid();
  return value;
}

function mapRows(raw: unknown) {
  if (!Array.isArray(raw) || raw.length > MAX_ENTRIES) invalid();
  const ids = new Set<string>();
  const positions = new Set<number>();
  return raw.map((value) => {
    const row = object(value);
    const id = row["PlayFabId"];
    const position = count(row["Position"]);
    if (typeof id !== "string" || !/^[a-f0-9]{1,32}$/i.test(id)) invalid();
    if (ids.has(id.toUpperCase()) || positions.has(position)) invalid();
    ids.add(id.toUpperCase());
    positions.add(position);
    return {
      playFabId: id,
      rank: position + 1,
      displayName:
        textValue(row["DisplayName"]) ??
        textValue(object(row["Profile"])["DisplayName"]) ??
        "Engineer",
      wins: count(row["StatValue"]),
    };
  });
}

async function matchRecord(playFabId: string) {
  const result = await playFabAdmin("Server/GetPlayerStatistics", {
    PlayFabId: playFabId,
    StatisticNames: RECORD_STATISTICS,
  });
  const raw = result["Statistics"];
  if (!Array.isArray(raw)) invalid();
  const totals = { losses: 0, draws: 0 };
  const seen = new Set<string>();
  for (const value of raw) {
    const stat = object(value);
    const name = stat["StatisticName"];
    if (typeof name !== "string" || !name) invalid();
    const field = name === "CC_MP_Losses" ? "losses" : name === "CC_MP_Draws" ? "draws" : null;
    if (!field) continue;
    if (seen.has(field)) invalid();
    seen.add(field);
    totals[field] = count(stat["Value"]);
  }
  return totals;
}

/** Top 15 by total wins, matching the in-game multiplayer board. */
export async function multiplayerLeaderboardPage(): Promise<MultiplayerLeaderboardPage> {
  const result = await playFabAdmin("Server/GetLeaderboard", {
    StatisticName: WIN_STATISTIC,
    StartPosition: 0,
    MaxResultsCount: MAX_ENTRIES,
    ProfileConstraints: { ShowDisplayName: true },
  });
  const version = result["Version"];
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 0) invalid();
  const rows = mapRows(result["Leaderboard"]);
  const entries: MultiplayerLeaderboardPage["entries"] = [];
  // Bound follow-up reads and concurrency; never query arbitrary player IDs.
  for (let start = 0; start < rows.length; start += 5) {
    entries.push(
      ...(await Promise.all(
        rows.slice(start, start + 5).map(async ({ playFabId, ...publicRow }) => ({
          ...publicRow,
          ...(await matchRecord(playFabId)),
        })),
      )),
    );
  }
  return { entries };
}
