import { AdminApiError, playFabAdmin } from "./admin-client.server.ts";
import { LEADERBOARD_CONTRACTS } from "./leaderboard-shared.ts";
import { parseLeaderboardVisibility } from "./leaderboard-visibility.ts";

export const LEADERBOARD_VISIBILITY_KEY = "civilcraft.leaderboard.visibility.v1";

export async function getLeaderboardVisibility() {
  const raw = (
    await playFabAdmin("Admin/GetTitleInternalData", { Keys: [LEADERBOARD_VISIBILITY_KEY] })
  )["Data"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new AdminApiError(502, "Leaderboard contracts could not be read. Please try again.");
  const data = raw as Record<string, unknown>;
  const stored = data[LEADERBOARD_VISIBILITY_KEY];
  if (stored == null) return { schemaVersion: 1 as const, contractIds: [...LEADERBOARD_CONTRACTS] };
  try {
    return parseLeaderboardVisibility(JSON.parse(String(stored)));
  } catch {
    throw new AdminApiError(502, "Leaderboard contracts could not be read. Please try again.");
  }
}

/** The caller must pass through the shared staff authorization and origin gate. */
export async function saveLeaderboardVisibility(value: unknown) {
  let selection;
  try {
    selection = parseLeaderboardVisibility(value);
  } catch {
    throw new AdminApiError(400, "Choose each supported contract only once.");
  }
  await playFabAdmin("Admin/SetTitleInternalData", {
    Key: LEADERBOARD_VISIBILITY_KEY,
    Value: JSON.stringify(selection),
  });
  return selection;
}

export async function requireVisibleLeaderboardContract(contract: string) {
  const selection = await getLeaderboardVisibility();
  if (!selection.contractIds.some((id) => id === contract))
    throw new AdminApiError(400, "This contract is not currently displayed on leaderboards.");
}
