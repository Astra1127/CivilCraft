import { BRIDGE_STATISTICS, decodeBridgeScore } from "../playfab/leaderboard-config.server.ts";
import { AdminApiError, object, playFabAdmin } from "../playfab/admin-client.server.ts";
import type { LeaderboardMode } from "../playfab/leaderboard-shared.ts";

export const progressUnavailable =
  "We couldn't verify your game progress right now. Please try again later.";
export const feedbackLocked =
  "Play CivilCraft and complete a bridge-building challenge to unlock game feedback.";

/** Accepted client-reported statistic, NOT independently verified completion.
 * Call only with a session-derived identity. GetPlayerStatistics reads stored
 * records, unlike AroundUser's synthetic unranked entries.
 */
export async function hasAcceptedCivilCraftRun(playFabId: string): Promise<boolean> {
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
    const result = await playFabAdmin("Server/GetPlayerStatistics", {
      PlayFabId: playFabId,
      StatisticNames: [...modes.keys()],
    });
    if (!Array.isArray(result["Statistics"])) throw new Error("Invalid statistics response");
    return result["Statistics"].some((raw) => {
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
