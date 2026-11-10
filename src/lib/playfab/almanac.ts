/**
 * Bridge Almanac progression. The GAME writes the completion records to
 * PlayFab via Cloud Script function `syncDashboardV1`.
 * The website only reads them safely and never modifies progression.
 *
 * Expected player data key: `AlmanacProgress` — a JSON `AlmanacJourney`
 * (regions → levels → successful completion with score, bridge type,
 * completion date and screenshot URL). Absent key = empty journey.
 */
import { getPlayerData } from "./player.ts";
import { parseEducation } from "./almanac-education.ts";
import {
  canonicalStageOrder,
  completionDate,
  sortStoryLevels,
  tutorialNumber,
} from "./level-records.ts";
import type {
  AlmanacJourney,
  AlmanacLevel,
  AlmanacRegion,
  PlayerLevelCompletion,
} from "./types.ts";

export const EMPTY_JOURNEY: AlmanacJourney = {
  regions: [],
  levelsCompleted: 0,
  levelsTotal: 0,
  journeyPercent: 0,
  discoveredBridgeTypeIds: [],
  discoveredMaterials: [],
};

function decodeAlbumBinding(value: unknown): { resultId: string; sha256: string } | undefined {
  // 16 result ID bytes plus 32 digest bytes, in hexadecimal byte order.
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]{64}$/.test(value)) return undefined;
  const bytes = atob(value);
  const hex = Array.from(bytes, (byte) => byte.charCodeAt(0).toString(16).padStart(2, "0")).join(
    "",
  );
  return { resultId: hex.slice(0, 32), sha256: hex.slice(32) };
}

/** Safely parse AlmanacProgress JSON written by Unity */
export function parseAlmanacProgress(raw: string | undefined): AlmanacJourney {
  if (!raw || !raw.trim()) return EMPTY_JOURNEY;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== "object") return EMPTY_JOURNEY;
    const compactContracts = parsed["publisherVersion"] === 2 && parsed["contractEncoding"] === 1;

    let rawRegions: unknown[] = [];
    let explicitCompleted: number | undefined;
    let explicitTotal: number | undefined;
    let explicitPercent: number | undefined;
    let explicitBridgeTypes: string[] | undefined;
    let explicitMaterials: string[] | undefined;

    if (Array.isArray(parsed)) {
      rawRegions = parsed;
    } else {
      const obj = parsed as Record<string, unknown>;
      rawRegions = Array.isArray(obj["regions"])
        ? (obj["regions"] as unknown[])
        : Array.isArray(obj["Regions"])
          ? (obj["Regions"] as unknown[])
          : [];
      const rawCompleted = obj["levelsCompleted"] ?? obj["LevelsCompleted"];
      if (typeof rawCompleted === "number") {
        explicitCompleted = rawCompleted;
      }
      const rawTotal = obj["levelsTotal"] ?? obj["LevelsTotal"];
      if (typeof rawTotal === "number") {
        explicitTotal = rawTotal;
      }
      const rawPercent = obj["journeyPercent"] ?? obj["JourneyPercent"];
      if (typeof rawPercent === "number") {
        explicitPercent = rawPercent;
      }
      const rawBridgeTypes = obj["discoveredBridgeTypeIds"] ?? obj["DiscoveredBridgeTypeIds"];
      if (Array.isArray(rawBridgeTypes)) {
        explicitBridgeTypes = rawBridgeTypes as string[];
      }
      const rawMaterials = obj["discoveredMaterials"] ?? obj["DiscoveredMaterials"];
      if (Array.isArray(rawMaterials)) {
        explicitMaterials = rawMaterials as string[];
      }
    }

    const regions: AlmanacRegion[] = rawRegions.map((r, rIdx) => {
      const robj = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
      const regionId = String(
        robj["regionId"] ?? robj["RegionId"] ?? robj["id"] ?? `region_${rIdx}`,
      );
      const name = String(robj["name"] ?? robj["Name"] ?? regionId);
      const rawStatus = String(robj["status"] ?? robj["Status"] ?? "unknown").toLowerCase();
      const status = (
        ["completed", "current", "locked"].includes(rawStatus) ? rawStatus : "unknown"
      ) as AlmanacRegion["status"];
      const rawLevels = Array.isArray(robj["levels"] ?? robj["Levels"])
        ? ((robj["levels"] ?? robj["Levels"]) as unknown[])
        : [];

      const levels: AlmanacLevel[] = rawLevels.map((l, lIdx) => {
        const lobj = (l && typeof l === "object" ? l : {}) as Record<string, unknown>;
        const details =
          compactContracts && Array.isArray(lobj["details"]) ? lobj["details"] : undefined;
        const levelId = String(lobj["levelId"] ?? lobj["LevelId"] ?? lobj["id"] ?? `level_${lIdx}`);
        const rawLevelName = details
          ? details[0]
          : (lobj["levelName"] ?? lobj["LevelName"] ?? lobj["name"]);
        const levelName = typeof rawLevelName === "string" ? rawLevelName : undefined;
        const rawOrder = lobj["order"] ?? lobj["Order"];
        const order = typeof rawOrder === "number" ? rawOrder : lIdx + 1;
        const rawStage = lobj["stageOrder"] ?? lobj["StageOrder"];
        const stageOrder = tutorialNumber(levelId)
          ? undefined
          : (canonicalStageOrder(levelId) ??
            (typeof rawStage === "number" && Number.isSafeInteger(rawStage) && rawStage > 0
              ? rawStage
              : undefined));
        const rawLStatus = String(
          details ? details[1] : (lobj["status"] ?? lobj["Status"] ?? "unknown"),
        ).toLowerCase();
        const lstatus = (
          ["completed", "current", "locked"].includes(rawLStatus) ? rawLStatus : "unknown"
        ) as AlmanacLevel["status"];
        const rawConceptIds = details
          ? details[2]
          : (lobj["engineeringConceptIds"] ?? lobj["EngineeringConceptIds"]);
        const conceptIds = Array.isArray(rawConceptIds) ? (rawConceptIds as string[]) : [];

        const comp = (lobj["completion"] ?? lobj["Completion"]) as
          Record<string, unknown> | undefined;
        let completion: PlayerLevelCompletion | undefined;
        const compactCompletion =
          details &&
          Array.isArray(comp?.["details"]) &&
          comp["details"].length === 2 &&
          typeof comp["details"][0] === "string" &&
          (comp["details"][1] === null ||
            (Number.isSafeInteger(comp["details"][1]) && comp["details"][1] >= 0))
            ? comp["details"]
            : undefined;
        const completionState = compactCompletion
          ? "success"
          : comp && typeof comp === "object" && !Array.isArray(comp)
            ? (comp["status"] ?? comp["Status"])
            : undefined;
        const rawScore = compactCompletion
          ? compactCompletion[1]
          : (comp?.["score"] ?? comp?.["Score"]);
        const rawBridge = compactCompletion
          ? compactCompletion[0]
          : (comp?.["bridgeTypeId"] ?? comp?.["BridgeTypeId"]);
        const completedAt = comp?.["completedAt"] ?? comp?.["CompletedAt"];
        // Completed status plus real payload is required. A missing date does not invalidate a completion.
        const hasEvidence =
          completionState === "success" ||
          (typeof rawScore === "number" &&
            Number.isFinite(rawScore) &&
            rawScore > 0 &&
            typeof rawBridge === "string" &&
            rawBridge.trim().length > 0) ||
          (typeof completedAt === "string" && completionDate(completedAt) !== "");
        const matchingIds =
          (!comp?.["levelId"] || comp["levelId"] === levelId) &&
          (!comp?.["LevelId"] || comp["LevelId"] === levelId) &&
          (!comp?.["regionId"] || comp["regionId"] === regionId) &&
          (!comp?.["RegionId"] || comp["RegionId"] === regionId);
        if (
          comp &&
          !Array.isArray(comp) &&
          lstatus === "completed" &&
          hasEvidence &&
          matchingIds &&
          (completionState === undefined || completionState === "success")
        ) {
          const rawUrl = comp["completionScreenshotUrl"] ?? comp["CompletionScreenshotUrl"];
          const explicitResultId =
            typeof comp["resultId"] === "string" && /^[a-f0-9]{32}$/.test(comp["resultId"])
              ? comp["resultId"]
              : undefined;
          const binding =
            compactCompletion && comp["resultId"] === undefined
              ? decodeAlbumBinding(comp["snapshot"])
              : undefined;
          const resultId = explicitResultId ?? binding?.resultId;
          // Album reads still verify the full identity and checksum against the
          // manifest. Legacy album references keep their existing validation.
          const snapshot = compactCompletion
            ? binding
              ? {
                  storage: "archive-v1",
                  fileName: "bridge-photos-v1.zip",
                  contractId: levelId,
                  regionId,
                  resultId,
                  entryName: `bridge-${resultId}.png`,
                  sha256: binding.sha256,
                }
              : undefined
            : (comp["snapshot"] as Record<string, unknown> | undefined);
          const scoreKnown =
            comp["scoreKnown"] !== false &&
            typeof rawScore === "number" &&
            Number.isFinite(rawScore);
          const archiveSnapshot =
            snapshot &&
            snapshot["storage"] === "archive-v1" &&
            snapshot["fileName"] === "bridge-photos-v1.zip" &&
            snapshot["contractId"] === levelId &&
            snapshot["regionId"] === regionId &&
            resultId &&
            scoreKnown &&
            snapshot["resultId"] === resultId &&
            snapshot["entryName"] === `bridge-${resultId}.png` &&
            typeof snapshot["sha256"] === "string" &&
            /^[a-f0-9]{64}$/.test(snapshot["sha256"])
              ? {
                  storage: "archive-v1" as const,
                  fileName: "bridge-photos-v1.zip" as const,
                  contractId: levelId,
                  regionId,
                  resultId,
                  entryName: snapshot["entryName"] as string,
                  sha256: snapshot["sha256"],
                }
              : undefined;
          const snapshotFileName =
            snapshot &&
            snapshot["storage"] === undefined &&
            snapshot["contractId"] === levelId &&
            snapshot["regionId"] === regionId &&
            typeof snapshot["fileName"] === "string" &&
            /^bridge-[A-Za-z0-9_-]{1,160}\.png$/.test(snapshot["fileName"])
              ? snapshot["fileName"]
              : archiveSnapshot?.fileName;
          const rawAchId = comp["achievementId"] ?? comp["AchievementId"];
          completion = {
            playerId: String(comp["playerId"] ?? comp["PlayerId"] ?? ""),
            levelId,
            regionId,
            bridgeTypeId: typeof rawBridge === "string" ? rawBridge : "",
            score: typeof rawScore === "number" && Number.isFinite(rawScore) ? rawScore : 0,
            scoreKnown,
            ...(resultId ? { resultId } : {}),
            status: "success",
            completionScreenshotUrl:
              snapshot?.["storage"] === undefined &&
              typeof rawUrl === "string" &&
              /^https:\/\//.test(rawUrl)
                ? rawUrl
                : undefined,
            ...(snapshotFileName ? { snapshotFileName } : {}),
            ...(archiveSnapshot ? { snapshotAlbum: archiveSnapshot } : {}),
            // A read must not invent the date of a game-written completion.
            completedAt: typeof completedAt === "string" ? completionDate(completedAt) : "",
            achievementId: typeof rawAchId === "string" ? rawAchId : undefined,
          };
        }

        return {
          levelId,
          stableId:
            [lobj["levelId"], lobj["LevelId"], lobj["id"]].some(
              (v) => typeof v === "string" && v.length > 0,
            ) &&
            [robj["regionId"], robj["RegionId"], robj["id"]].some(
              (v) => typeof v === "string" && v.length > 0,
            ),
          regionId,
          ...(levelName ? { levelName } : {}),
          order,
          ...(stageOrder ? { stageOrder } : {}),
          status: lstatus,
          engineeringConceptIds: conceptIds,
          ...(completion ? { completion } : {}),
        };
      });

      return {
        regionId,
        name,
        status,
        levels: sortStoryLevels(levels),
      };
    });

    const allLevels = regions.flatMap((r) => r.levels ?? []);
    const completedCount = allLevels.filter((l) => l.completion).length;

    return {
      ...parseEducation(parsed),
      regions,
      levelsCompleted: explicitCompleted ?? completedCount,
      levelsTotal: explicitTotal ?? allLevels.length,
      journeyPercent:
        explicitPercent ??
        (allLevels.length ? Math.round((completedCount / allLevels.length) * 100) : 0),
      discoveredBridgeTypeIds: explicitBridgeTypes ?? [
        ...new Set(allLevels.map((l) => l.completion?.bridgeTypeId).filter(Boolean) as string[]),
      ],
      discoveredMaterials: explicitMaterials
        ? [...new Set(explicitMaterials.filter((id): id is string => typeof id === "string"))]
        : [],
    };
  } catch (err) {
    console.warn("[playfab/almanac] Error parsing AlmanacProgress safely:", err);
    return EMPTY_JOURNEY;
  }
}

export async function getJourney(): Promise<AlmanacJourney> {
  const data = await getPlayerData(["AlmanacProgress", "MapProgress"]);
  return parseAlmanacProgress(data["AlmanacProgress"]);
}
