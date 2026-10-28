import { engineeringConcepts } from "./content.ts";
import {
  conceptIllustrations,
  lessons,
  lessonGroups,
  lessonPreview,
  type LessonDefinition,
} from "./lesson-catalog.ts";
import { canonicalStageOrder } from "../playfab/level-records.ts";
import type { AlmanacLevel } from "../playfab/types.ts";

/** Public catalog destination. A website key is never a fabricated PlayFab ID. */
export function engineeringLesson(identifier?: string) {
  if (!identifier) return undefined;
  return lessons.find(
    (lesson) =>
      lesson.category === "engineering" &&
      !!lesson.description &&
      (lesson.id === identifier || lesson.key === identifier),
  );
}
export const lessonIdentifier = (lesson: LessonDefinition) => lesson.id ?? lesson.key;
export const lessonAnchorId = (identifier: string) =>
  `engineering-lesson-${encodeURIComponent(identifier)}`;

export interface LessonRow {
  key: string;
  title: string;
  summary: string;
  lessonId?: string;
}
export function levelLessonRows(level: AlmanacLevel): LessonRow[] {
  const number = canonicalStageOrder(level.levelId);
  const group = lessonGroups.find((group) =>
    group.contractIds.some(
      (id) => id === level.levelId || (number !== undefined && canonicalStageOrder(id) === number),
    ),
  );
  // Tutorial 1's Load/Support presentation is explicitly confirmed by the owner.
  // Do not derive a Bending introduction from its generic synchronized concepts.
  const initial = level.levelId === "TUT_CONTRACT1";
  const mapped = initial ? conceptIllustrations("load") : (group?.lessons ?? []);
  const rows: LessonRow[] = mapped.map((lesson) => ({
    key: lesson.key,
    title: lesson.title,
    summary: lessonPreview(lesson),
    ...(engineeringLesson(lessonIdentifier(lesson)) ? { lessonId: lessonIdentifier(lesson) } : {}),
  }));
  if (initial && level.engineeringConceptIds.includes("support")) {
    const support = engineeringConcepts.find((c) => c.id === "support")!;
    rows.push({ key: support.id, title: support.name, summary: support.summary });
  }
  // Unverified stages retain honest, non-clickable recorded entries rather than
  // assigning a known lesson to an unverified contract introduction.
  if (!initial && !group)
    for (const id of new Set(level.engineeringConceptIds)) {
      const concept = engineeringConcepts.find((c) => c.id === id);
      if (concept) rows.push({ key: id, title: concept.name, summary: concept.summary });
    }
  return rows;
}
