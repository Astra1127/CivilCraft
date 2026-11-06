import type { LeaderboardEntry } from "./types";

/** Legacy profile total only; never used to query bridge leaderboards. */
export const LEADERBOARD_STATISTIC = "TotalScore";
export const LEADERBOARD_PAGE_SIZE = 20;
export type LeaderboardPeriod = "weekly" | "all-time";
export const LEADERBOARD_VIEWS = [
  { id: "weekly", label: "Weekly" },
  { id: "all-time", label: "All-Time" },
] as const;
export interface LeaderboardPage {
  entries: LeaderboardEntry[];
  version: number | null;
  nextStart: number | null;
}

export interface MultiplayerLeaderboardEntry {
  rank: number;
  displayName: string;
  wins: number;
  losses: number;
  draws: number;
}

export interface MultiplayerLeaderboardPage {
  entries: MultiplayerLeaderboardEntry[];
}

export const LEADERBOARD_CONTRACTS = [
  "ShopKeeper",
  "TUT_CONTRACT1",
  "ReedsContract",
  "VancesContract",
  "TUT_CONTRACT2",
  "ReedSideInspection",
  "VanceSideRealignment",
  "SilasMainContract",
  "MainContractSilas",
  "MarshID",
  "FordMainContract",
  "BrooksMainContract",
  "RonanMainContract",
  "ClarkMainContract",
  "ClarkOffsetRoad",
  "MillsMainContract",
  "MillsWorkersCrossing",
  "MillsReconnectingArcadia",
] as const;
export type LeaderboardContract = (typeof LEADERBOARD_CONTRACTS)[number];
/** Unversioned requests come from older APKs that reject unknown contract IDs. */
export const LEGACY_LEADERBOARD_CONTRACTS = [
  "ShopKeeper",
  "TUT_CONTRACT1",
  "ReedsContract",
  "VancesContract",
  "TUT_CONTRACT2",
  "ReedSideInspection",
  "VanceSideRealignment",
  "SilasMainContract",
  "MainContractSilas",
] as const satisfies readonly LeaderboardContract[];
/** Display labels only. Permanent contract IDs and existing statistic names never change. */
export const LEADERBOARD_CONTRACT_LABELS = {
  TUT_CONTRACT1: "Professor Bhan Tutorial 1 - Beam Bridge",
  TUT_CONTRACT2: "Professor Bhan Tutorial 2 - Truss Bridge",
  ShopKeeper: "Shopkeeper - Shop Extension",
  ReedsContract: "Reed Main Contract 1 - The Supply Route",
  VancesContract: "Vance Main Contract 1 - Ridge Community",
  SilasMainContract: "Silas Main Contract 1 - The Community Connection",
  MainContractSilas: "Silas Main Contract 2 - The Grand Gorge",
  MarshID: "Marsh Main Contract 1 - Across Rivermere",
  FordMainContract: "Ford Main Contract 1 - The Construction Route",
  BrooksMainContract: "Brooks Main Contract 1 - Market Connection",
  RonanMainContract: "Ronan Main Contract 1 - The Southern Connection",
  ClarkMainContract: "Clark Main Contract 1 - Freight Channel",
  ClarkOffsetRoad: "Clark Main Contract 2 - The Offset Road",
  MillsMainContract: "Mills Main Contract 1 - Heavy Equipment Route",
  MillsWorkersCrossing: "Mills Main Contract 2 - Workers' Crossing",
  MillsReconnectingArcadia: "Mills Main Contract 3 - Reconnecting Arcadia",
  ReedSideInspection: "Reed Side Inspection",
  VanceSideRealignment: "Vance Side Realignment",
} as const satisfies Record<LeaderboardContract, string>;
export function leaderboardContractLabel(contract: string): string {
  return Object.hasOwn(LEADERBOARD_CONTRACT_LABELS, contract)
    ? LEADERBOARD_CONTRACT_LABELS[contract as LeaderboardContract]
    : contract;
}
export type LeaderboardMode = "efficient" | "strongest";
export const DEFAULT_CONTRACT: LeaderboardContract = "ShopKeeper";
export const DEFAULT_MODE: LeaderboardMode = "efficient";
