import { conceptIllustrations } from "@/lib/almanac/lesson-catalog";
import { LessonIllustration } from "./LessonIllustration";

export function ConceptIllustrations({ id, title }: { id: string; title: string }) {
  const lessons = conceptIllustrations(id);
  return lessons.length ? (
    <div className={lessons.length > 1 ? "grid min-w-0 grid-cols-2 gap-2" : "min-w-0"}>
      {lessons.map((lesson) => (
        <div key={lesson.key} className="min-w-0">
          <LessonIllustration
            id={lesson.diagramId ?? lesson.id ?? lesson.key}
            title={lesson.title}
            {...(lesson.image ? { image: lesson.image } : {})}
            compact
          />
          {lessons.length > 1 ? <p className="mb-2 text-xs font-bold">{lesson.title}</p> : null}
        </div>
      ))}
    </div>
  ) : (
    <LessonIllustration id={id} title={title} compact />
  );
}
