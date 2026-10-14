import type {
  LeaderboardContract,
  LeaderboardMode,
  MultiplayerLeaderboardPage,
} from "./leaderboard-shared";
import { parseLeaderboardVisibility } from "./leaderboard-visibility";

export async function getLeaderboardContracts() {
  const response = await fetch("/api/leaderboard/contracts", {
    credentials: "omit",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Leaderboard contracts are temporarily unavailable.");
  return parseLeaderboardVisibility(await response.json());
}

export interface PublicLeaderboardPage {
  entries: { rank: number; displayName: string; cost: number; peakStress: number }[];
  version: number | null;
  nextStart: number | null;
}

export async function getPublicLeaderboard(
  contract: LeaderboardContract,
  mode: LeaderboardMode,
  start: number,
  version?: number,
): Promise<PublicLeaderboardPage> {
  const query = new URLSearchParams({ contractId: contract, mode, start: String(start) });
  if (version !== undefined) query.set("version", String(version));
  const response = await fetch(`/api/leaderboard/public?${query}`, {
    credentials: "omit",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Unable to load the leaderboard. Please try again.");
  return response.json();
}

export async function getPublicMultiplayerLeaderboard(): Promise<MultiplayerLeaderboardPage> {
  const response = await fetch("/api/leaderboard/public/multiplayer", {
    credentials: "omit",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Unable to load multiplayer rankings. Please try again.");
  return response.json();
}
