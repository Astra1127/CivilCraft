import gameCatalog from "./game-catalog.json" with { type: "json" };
import metadata from "./lesson-metadata.json" with { type: "json" };
import { engineeringConcepts } from "./content.ts";
import { canonicalStageOrder } from "../playfab/level-records.ts";
import type { AlmanacJourney, AlmanacLevel } from "../playfab/types.ts";

export interface LessonDefinition {
  /** Website key; never implicitly treated as a Unity/PlayFab identifier. */
  key: string;
  id?: string;
  title: string;
  description?: string;
  image?: string;
  diagramId?: string;
  topic: string;
  category: string;
  stageId?: string;
  bridgeTypeId?: string;
  order: number;
  conceptIds: string[];
  source: string;
  sync: {
    lessonId?: string;
    status: "reader-supported" | "awaiting-game-id";
    unlockRequirement: "explicit-lesson-record";
  };
}
export const lessons: LessonDefinition[] = metadata.lessons.map((entry) => {
  const game =
    "gameLessonId" in entry
      ? gameCatalog.lessons.find((l) => l.id === entry.gameLessonId)
      : undefined;
  const concept =
    "conceptId" in entry ? engineeringConcepts.find((c) => c.id === entry.conceptId) : undefined;
  return {
    key: entry.key,
    ...(game
      ? {
          id: game.id,
          description: game.description,
          ...("image" in game ? { image: game.image } : {}),
        }
      : concept
        ? { description: concept.summary }
        : {}),
    title: game?.title ?? concept?.name ?? ("title" in entry ? entry.title : entry.key),
    topic: game?.topic ?? "Engineering concepts",
    category: entry.category,
    ...("stageId" in entry ? { stageId: entry.stageId } : {}),
    ...("bridgeTypeId" in entry ? { bridgeTypeId: entry.bridgeTypeId } : {}),
    ...("diagramId" in entry ? { diagramId: entry.diagramId } : {}),
    order: entry.order,
    conceptIds: entry.conceptIds,
    source:
      game?.source ??
      (concept
        ? "src/lib/almanac/content.ts"
        : "Documented stage/topic; educational content pending"),
    sync: {
      ...(game ? { lessonId: game.id } : {}),
      status: game ? "reader-supported" : "awaiting-game-id",
      unlockRequirement: "explicit-lesson-record",
    },
  };
});
export function getLesson(identifier: string) {
  return lessons.find((lesson) => lesson.key === identifier || lesson.id === identifier);
}
export interface LessonStage {
  id: string;
  title: string;
  order: number;
  kind: string;
  contractIds: string[];
  npc?: string;
  mapId?: string;
}
export function groupLessons(
  catalog: readonly LessonDefinition[] = lessons,
  stages: readonly LessonStage[] = metadata.stages,
) {
  const engineering = catalog.filter((lesson) => lesson.category === "engineering");
  const groups = [...stages]
    .sort((a, b) => a.order - b.order)
    .map((stage) => ({
      ...stage,
      introductionLabel:
        stage.kind === "tutorial"
          ? "Introduced in Tutorial (Level 00)"
          : (() => {
              const number = stage.contractIds
                .map(canonicalStageOrder)
                .find((value) => value !== undefined);
              return number
                ? `Introduced in Level ${String(number).padStart(2, "0")}`
                : stage.contractIds.length
                  ? "Introduced at documented contract stage"
                  : "Documented introduction · Contract ID pending";
            })(),
      lessons: engineering
        .filter((lesson) => lesson.stageId === stage.id)
        .sort((a, b) => a.order - b.order),
    }))
    .filter((group) => group.lessons.length);
  const unmapped = engineering.filter(
    (lesson) => !stages.some((stage) => stage.id === lesson.stageId),
  );
  if (unmapped.length)
    groups.push({
      id: "unmapped",
      title: "Introduction stage awaiting verification",
      order: Infinity,
      kind: "unmapped",
      contractIds: [],
      introductionLabel: "Introduction not yet mapped",
      lessons: unmapped,
    });
  return groups;
}
export const lessonGroups = groupLessons();
/** Discovery may precede completion. Contract status is never an unlock signal. */
export function lessonProgress(identifier: string, journey: AlmanacJourney) {
  const lesson = getLesson(identifier);
  if (!lesson?.sync.lessonId)
    return {
      state: "pending",
      label: "Lesson synchronization unavailable · Game lesson ID pending",
      canRead: false,
    };
  const records = (journey.lessonRecords ?? []).filter(
    (record) => record.lessonId === lesson.sync.lessonId,
  );
  const synced = records.length === 1 ? records[0] : undefined;
  if (synced?.state === "completed")
    return {
      state: "completed",
      label: "Completed · Synced from game",
      canRead: !!lesson.description,
    };
  if (synced?.state === "discovered")
    return {
      state: "unlocked",
      label: "Unlocked · Synced from game",
      canRead: !!lesson.description,
    };
  return { state: "pending", label: "Lesson state not yet synchronized", canRead: false };
}
export function unmappedLessonIds(journey: AlmanacJourney): string[] {
  return [
    ...new Set(
      (journey.lessonRecords ?? [])
        .filter((record) => !lessons.some((lesson) => lesson.sync.lessonId === record.lessonId))
        .map((record) => record.lessonId),
    ),
  ];
}
export function lessonPreview(lesson: LessonDefinition) {
  return (
    lesson.description?.split(/\n|(?<=[.!?])\s+/)[0] ??
    "Educational notes awaiting verified game content."
  );
}
export function conceptIllustrations(id: string) {
  return lessons.filter(
    (lesson) => lesson.category === "engineering" && lesson.conceptIds.includes(id),
  );
}
export function popupConcepts(ids: string[]) {
  return [...new Set(ids)].flatMap((id) => {
    const matched = conceptIllustrations(id);
    const existing = engineeringConcepts.find((c) => c.id === id);
    return matched.length === 1
      ? [{ id, name: matched[0]!.title, summary: lessonPreview(matched[0]!) }]
      : existing
        ? [existing]
        : [];
  });
}
export function bridgeLesson(level: AlmanacLevel) {
  return lessons.find(
    (lesson) =>
      lesson.category === "bridge-type" && lesson.bridgeTypeId === level.completion?.bridgeTypeId,
  );
}
