import { LEADERBOARD_CONTRACTS, type LeaderboardContract } from "./leaderboard-shared.ts";

export interface LeaderboardVisibility {
  schemaVersion: 1;
  contractIds: LeaderboardContract[];
}

/** A shared display policy; scores, rewards and contract progression are independent. */
export function parseLeaderboardVisibility(value: unknown): LeaderboardVisibility {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid contract selection.");
  const row = value as Record<string, unknown>;
  const ids = row["contractIds"];
  if (
    Object.keys(row).length !== 2 ||
    row["schemaVersion"] !== 1 ||
    !Array.isArray(ids) ||
    ids.length > LEADERBOARD_CONTRACTS.length ||
    ids.some(
      (id) => typeof id !== "string" || !LEADERBOARD_CONTRACTS.includes(id as LeaderboardContract),
    ) ||
    new Set(ids).size !== ids.length
  )
    throw new Error("Invalid contract selection.");
  return { schemaVersion: 1, contractIds: LEADERBOARD_CONTRACTS.filter((id) => ids.includes(id)) };
}
