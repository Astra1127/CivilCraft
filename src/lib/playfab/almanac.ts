/**
 * Bridge Almanac progression. The GAME writes the completion records to
 * PlayFab; the website only reads them and can never modify progression.
 *
 * Expected player data key: `AlmanacProgress` — a JSON `AlmanacJourney`
 * (regions → levels → successful completion with score, bridge type,
 * completion date and screenshot URL). Absent key = empty journey.
 */
import { getPlayerData, jsonFrom } from "./player";
import type { AlmanacJourney, AlmanacRegion } from "./types";

export const EMPTY_JOURNEY: AlmanacJourney = {
  regions: [],
  levelsCompleted: 0,
  levelsTotal: 0,
  journeyPercent: 0,
  discoveredBridgeTypeIds: [],
  discoveredMaterials: [],
};

export async function getJourney(): Promise<AlmanacJourney> {
  const data = await getPlayerData(["AlmanacProgress", "MapProgress"]);
  const journey = jsonFrom<Partial<AlmanacJourney>>(data, "AlmanacProgress");
  if (!journey || typeof journey !== "object" || Array.isArray(journey)) return EMPTY_JOURNEY;

  const regions = Array.isArray(journey.regions) ? (journey.regions as AlmanacRegion[]) : [];
  const levels = regions.flatMap((r) => r.levels ?? []);
  const completed = levels.filter((l) => l.completion).length;
  return {
    regions,
    levelsCompleted: journey.levelsCompleted ?? completed,
    levelsTotal: journey.levelsTotal ?? levels.length,
    journeyPercent:
      journey.journeyPercent ?? (levels.length ? Math.round((completed / levels.length) * 100) : 0),
    discoveredBridgeTypeIds: journey.discoveredBridgeTypeIds ?? [
      ...new Set(levels.map((l) => l.completion?.bridgeTypeId).filter(Boolean) as string[]),
    ],
    discoveredMaterials: Array.isArray(journey.discoveredMaterials)
      ? [
          ...new Set(
            journey.discoveredMaterials.filter((id): id is string => typeof id === "string"),
          ),
        ]
      : [],
  };
}
