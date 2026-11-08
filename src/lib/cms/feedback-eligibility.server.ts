import { BRIDGE_STATISTICS, decodeBridgeScore } from "../playfab/leaderboard-config.server.ts";
import { AdminApiError, object, playFabAdmin } from "../playfab/admin-client.server.ts";
import type { LeaderboardMode } from "../playfab/leaderboard-shared.ts";

export const progressUnavailable =
  "We couldn't verify your game progress right now. Please try again later.";
export const feedbackLocked =
  "Play CivilCraft and complete a bridge-building challenge to unlock game feedback.";

/** Accepted client-reported statistic or game progress, NOT independently verified completion.
 * Call only with a session-derived identity.
 */
export async function hasAcceptedCivilCraftRun(
  playFabId: string,
  sessionTicket?: string | null,
): Promise<boolean> {
  try {
    const modes = new Map<string, LeaderboardMode>(
      Object.values(BRIDGE_STATISTICS).flatMap(
        (pair) =>
          [
            [pair.efficient, "efficient"],
            [pair.strongest, "strongest"],
          ] as [string, LeaderboardMode][],
      ),
    );
    // 1. Check bridge contract statistics first
    const result = await playFabAdmin("Server/GetPlayerStatistics", {
      PlayFabId: playFabId,
      StatisticNames: [...modes.keys()],
    });
    if (!Array.isArray(result["Statistics"])) throw new Error("Invalid statistics response");
    const hasContractRun = result["Statistics"].some((raw) => {
      const stat = object(raw),
        mode = modes.get(String(stat["StatisticName"]));
      if (!mode || typeof stat["Value"] !== "number") return false;
      try {
        decodeBridgeScore(stat["Value"], mode);
        return true;
      } catch {
        return false;
      }
    });
    if (hasContractRun) return true;

    // 2. Check general bridge & challenge completion statistics
    try {
      const generalStats = await playFabAdmin("Server/GetPlayerStatistics", {
        PlayFabId: playFabId,
        StatisticNames: ["BridgesCompleted", "ChallengesCompleted"],
      });
      if (Array.isArray(generalStats["Statistics"])) {
        const hasGeneralStat = generalStats["Statistics"].some((raw) => {
          const stat = object(raw);
          const name = String(stat["StatisticName"]);
          const val = Number(stat["Value"]);
          return (
            Number.isFinite(val) &&
            (name === "BridgesCompleted" || name === "ChallengesCompleted") &&
            val >= 1
          );
        });
        if (hasGeneralStat) return true;
      }
    } catch {
      // Ignore if unsupported or missing in current test environment
    }

    // 3. Check UserData for bridge completion recorded by Unity
    try {
      const userData = await playFabAdmin("Server/GetUserData", {
        PlayFabId: playFabId,
        Keys: ["BridgesCompleted", "ChallengesCompleted", "MapProgress"],
      });
      const data = object(userData["Data"]);
      const num = (k: string) => {
        const v = object(data[k])["Value"];
        if (typeof v === "number") return v;
        if (typeof v === "string") {
          const p = Number.parseInt(v, 10);
          return Number.isFinite(p) ? p : null;
        }
        return null;
      };
      const bridges = num("BridgesCompleted");
      if (bridges !== null && bridges >= 1) return true;
      const challenges = num("ChallengesCompleted");
      if (challenges !== null && challenges >= 1) return true;

      const mapProgressRaw = object(data["MapProgress"])["Value"];
      if (typeof mapProgressRaw === "string" && mapProgressRaw.trim()) {
        try {
          const map = JSON.parse(mapProgressRaw);
          if (typeof map === "object" && map !== null) {
            if (
              Number(map.missionsCompleted) > 0 ||
              Number(map.overallPercent) > 0 ||
              map.completed === true
            ) {
              return true;
            }
            if (Array.isArray(map.regions)) {
              const hasCompletedRegion = map.regions.some((item: unknown) => {
                const r = object(item);
                return (
                  Boolean(r["completed"] ?? r["Completed"]) ||
                  Number(r["missionsCompleted"] ?? r["MissionsCompleted"]) > 0
                );
              });
              if (hasCompletedRegion) return true;
            }
          }
        } catch {
          // ignore invalid json
        }
      }
    } catch {
      // Ignore if UserData endpoint unavailable
    }

    return false;
  } catch {
    throw new AdminApiError(503, progressUnavailable);
  }
}

// Best-effort warm-process rate limit; bounded memory, no tickets or IP keys.
const attempts = new Map<string, { count: number; until: number }>();
export function limitFeedback(playerId: string, now = Date.now()) {
  for (const [id, bucket] of attempts) if (bucket.until <= now) attempts.delete(id);
  const bucket = attempts.get(playerId);
  if (bucket && bucket.count >= 5)
    throw new AdminApiError(429, "Too many feedback attempts. Please try again in 15 minutes.");
  if (!bucket && attempts.size >= 10000)
    throw new AdminApiError(503, "Feedback is temporarily busy. Please try again later.");
  attempts.set(playerId, {
    count: (bucket?.count ?? 0) + 1,
    until: bucket?.until ?? now + 15 * 60_000,
  });
}
