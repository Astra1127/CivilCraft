import gameCatalog from "./game-catalog.json" with { type: "json" };
import { tutorialNumber, verifiedLevelCompletion } from "../playfab/level-records.ts";
import type { AlmanacJourney, AlmanacLevel } from "../playfab/types.ts";

// Game owner confirmed the tutorial chapter introduces both load lessons.
// Exact tutorial sub-stage and Levels 01–05 introductions are not yet verified.
export const TUTORIAL_LESSON_IDS = ["deadload", "LESSON001"] as const;
export const lessonGroups = [
  {
    id: "tutorial",
    title: "Tutorial (Level 00)",
    lessons: TUTORIAL_LESSON_IDS.map((id) =>
      gameCatalog.lessons.find((lesson) => lesson.id === id)!,
    ),
  },
  {
    id: "unmapped",
    title: "Introduction level awaiting verification",
    lessons: gameCatalog.lessons.filter(
      (lesson) => !TUTORIAL_LESSON_IDS.some((id) => id === lesson.id),
    ),
  },
];
export function getLesson(id: string) {
  return gameCatalog.lessons.find((lesson) => lesson.id === id);
}

/** Same-region, unique stable completions; no inference from names, scores or totals. */
export function completedTutorial(journey: AlmanacJourney, playerId?: string): boolean {
  if (!playerId) return false;
  const levels = (journey.regions ?? []).flatMap((region) => region.levels);
  const first = levels.filter((level) => level.levelId === "TUT_CONTRACT1");
  const second = levels.filter((level) => level.levelId === "TUT_CONTRACT2");
  return (
    first.length === 1 &&
    second.length === 1 &&
    first[0]!.regionId === second[0]!.regionId &&
    verifiedLevelCompletion(first[0]!, playerId) &&
    verifiedLevelCompletion(second[0]!, playerId)
  );
}

export function lessonProgress(id: string, journey: AlmanacJourney, playerId?: string) {
  const records = (journey.lessonRecords ?? []).filter((record) => record.lessonId === id);
  const synced = records.length === 1 ? records[0] : undefined;
  if (synced?.state === "completed")
    return { state: "completed", label: "Completed · Synced from game", canRead: true };
  if (synced?.state === "discovered")
    return { state: "unlocked", label: "Unlocked · Synced from game", canRead: true };
  if (
    TUTORIAL_LESSON_IDS.some((lessonId) => lessonId === id) &&
    completedTutorial(journey, playerId)
  )
    return {
      state: "encountered",
      label: "Encountered in completed tutorial · Unlock sync pending",
      canRead: true,
    };
  return { state: "pending", label: "Lesson state not yet synchronized", canRead: false };
}

export function tutorialConceptIds(journey: AlmanacJourney, playerId?: string): string[] {
  if (!playerId) return [];
  return [
    ...new Set(
      (journey.regions ?? [])
        .flatMap((region) => region.levels)
        .filter(
          (level) => tutorialNumber(level.levelId) && verifiedLevelCompletion(level, playerId),
        )
        .flatMap((level) => level.engineeringConceptIds),
    ),
  ];
}

/** Concept-to-illustration references, not lesson unlock or level introduction mappings. */
const conceptLessons: Record<string, string[]> = {
  load: ["deadload", "LESSON001"],
  tension: ["What is Tension"],
  compression: ["What is Compression"],
  stability: ["What is Equilibrium"],
};
export function conceptIllustrations(id: string) {
  return (Object.hasOwn(conceptLessons, id) ? conceptLessons[id]! : [])
    .map((lessonId) => getLesson(lessonId)!)
    .filter(Boolean);
}

export function bridgeLesson(level: AlmanacLevel) {
  const id = level.completion?.bridgeTypeId;
  return id === "beam"
    ? getLesson("LESSON002")
    : id === "truss"
      ? getLesson("LESSON004")
      : undefined;
}
