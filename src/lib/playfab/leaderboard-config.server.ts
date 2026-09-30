import { AdminApiError } from "./admin-client.server.ts";
import type { LeaderboardContract, LeaderboardMode } from "./leaderboard-shared.ts";
// Exact allowlist from deployed CloudScript Revision 4.
export const BRIDGE_STATISTICS = {
  ShopKeeper: {
    efficient: "CC_E_24A0506A7A79A0DB",
    strongest: "CC_S_24A0506A7A79A0DB",
  },
  TUT_CONTRACT1: {
    efficient: "CC_E_6C19CA5B77A6FF90",
    strongest: "CC_S_6C19CA5B77A6FF90",
  },
  ReedsContract: {
    efficient: "CC_E_7AD47CC6EE895E44",
    strongest: "CC_S_7AD47CC6EE895E44",
  },
  VancesContract: {
    efficient: "CC_E_C29D1DB10DD4940D",
    strongest: "CC_S_C29D1DB10DD4940D",
  },
  TUT_CONTRACT2: {
    efficient: "CC_E_6C19CD5B77A704A9",
    strongest: "CC_S_6C19CD5B77A704A9",
  },
  ReedSideInspection: {
    efficient: "CC_E_6CC5505F08AAC340",
    strongest: "CC_S_6CC5505F08AAC340",
  },
  VanceSideRealignment: {
    efficient: "CC_E_0FCFDEF8DF951749",
    strongest: "CC_S_0FCFDEF8DF951749",
  },
  SilasMainContract: {
    efficient: "CC_E_B57A013AC08B9A90",
    strongest: "CC_S_B57A013AC08B9A90",
  },
  MainContractSilas: {
    efficient: "CC_E_DD46490E01484D5A",
    strongest: "CC_S_DD46490E01484D5A",
  },
} as const satisfies Record<LeaderboardContract, Record<LeaderboardMode, string>>;
export function bridgeStatistic(contract: string, mode: string): string {
  if (!Object.hasOwn(BRIDGE_STATISTICS, contract) || (mode !== "efficient" && mode !== "strongest"))
    throw new AdminApiError(400, "Choose a valid contract and ranking mode.");
  return BRIDGE_STATISTICS[contract as LeaderboardContract][mode];
}
export function decodeBridgeScore(score: number, mode: LeaderboardMode) {
  const packed = 2147483647 - score;
  if (!Number.isSafeInteger(score) || packed < 0 || packed > 1001001000)
    throw new AdminApiError(502, "Invalid bridge leaderboard score.");
  const cost = mode === "efficient" ? Math.floor(packed / 1001) : packed % 1000001;
  const stressTenths = mode === "efficient" ? packed % 1001 : Math.floor(packed / 1000001);
  if (cost > 1000000 || stressTenths > 1000)
    throw new AdminApiError(502, "Invalid bridge leaderboard score.");
  return { cost, peakStress: stressTenths / 10 };
}
