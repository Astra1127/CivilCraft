import catalog from "@/lib/almanac/game-catalog.json";
import type { AlmanacJourney } from "@/lib/playfab/types";
import { EmptyState } from "@/components/common/States";
import { orderMaterials } from "@/lib/almanac/material-order";
import { LessonIllustration } from "./LessonIllustration";
import {
  lessonGroups,
  lessonProgress,
  lessonPreview,
  unmappedLessonIds,
} from "@/lib/almanac/lesson-catalog";

export function QuizRecords({ journey }: { journey: AlmanacJourney }) {
  const attempts = journey.quizAttempts ?? [];
  if (!attempts.length)
    return (
      <EmptyState
        title="No quiz records synchronized"
        description="Your in-game quiz results will appear when the game publishes them. No scores or completion dates are available yet."
      />
    );
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {attempts.map((a) => (
        <li key={JSON.stringify([a.quizId, a.attemptId])} className="panel min-w-0 break-words p-5">
          <h3 className="font-display text-xl">{a.title}</h3>
          {a.topic ? <p className="text-sm text-muted-foreground">{a.topic}</p> : null}
          <p className="mt-2 font-bold">
            Completed · {a.score}/{a.totalQuestions} ·{" "}
            {Math.round((a.score / a.totalQuestions) * 100)}%
          </p>
          <p className="text-sm text-muted-foreground">
            {a.completedAt
              ? new Date(a.completedAt).toLocaleString()
              : "Completion date unavailable"}
          </p>
          <p className="text-xs text-muted-foreground">Attempt record: {a.attemptId}</p>
          {a.answers ? (
            <details className="mt-3">
              <summary className="cursor-pointer font-bold">Review submitted answers</summary>
              <ol className="mt-3 space-y-4">
                {a.answers.map((r) => (
                  <li key={r.questionId}>
                    <p className="font-bold">{r.question}</p>
                    <ol className="list-inside list-[upper-alpha]">
                      {r.choices.map((choice, index) => (
                        <li key={index}>
                          {choice}
                          {index === r.selectedIndex ? " — Your answer" : ""}
                          {index === r.correctIndex ? " — Correct answer" : ""}
                        </li>
                      ))}
                    </ol>
                    <p>{r.selectedIndex === r.correctIndex ? "Correct" : "Incorrect"}</p>
                  </li>
                ))}
              </ol>
            </details>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Answer review unavailable.</p>
          )}
        </li>
      ))}
    </ul>
  );
}

export function GameLessons({ journey }: { journey: AlmanacJourney; playerId?: string }) {
  const unmapped = unmappedLessonIds(journey);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        This is the currently documented portion of the story. Introductions describe when topics
        are taught; only synchronized lesson records confirm your unlocks or completion.
      </p>
      {unmapped.length ? (
        <p role="status" className="text-sm text-muted-foreground">
          {unmapped.length} synchronized lesson record(s) await catalog mapping. No lesson content
          or progression has been guessed.
        </p>
      ) : null}
      {lessonGroups.map((group) => (
        <section key={group.id} aria-labelledby={`lessons-${group.id}`} className="space-y-3">
          <h3 id={`lessons-${group.id}`} className="font-display text-xl">
            {group.title}
          </h3>
          <ul className="grid gap-3 md:grid-cols-2">
            {group.lessons.map((lesson) => {
              const progress = lessonProgress(lesson.key, journey);
              return (
                <li key={lesson.key} className="panel min-w-0 overflow-hidden p-3 sm:p-4">
                  <LessonIllustration
                    id={lesson.diagramId ?? lesson.id ?? lesson.key}
                    title={lesson.title}
                    {...(lesson.image ? { image: lesson.image } : {})}
                    compact
                  />
                  <h4 className="font-display text-lg">{lesson.title}</h4>
                  <p className="text-xs text-muted-foreground">{lesson.topic}</p>
                  <p className="mt-1 text-xs font-bold text-primary">{group.introductionLabel}</p>
                  <p
                    className="mt-1 text-xs text-muted-foreground"
                    data-lesson-state={progress.state}
                  >
                    {progress.label}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {lessonPreview(lesson)}
                  </p>
                  {progress.canRead ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm font-bold text-primary">
                        Read lesson notes
                      </summary>
                      <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">
                        {lesson.description}
                      </p>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function GameMaterials({ journey }: { journey: AlmanacJourney }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Builder’s Materials · Game simulation values per single member. Discovery is recorded
        separately for each player.
      </p>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {orderMaterials(catalog.materials).map((m) => {
          const discovered = (journey.discoveredMaterials ?? []).includes(m.id);
          return (
            <li key={m.id} className="panel min-w-0 overflow-hidden p-5">
              <h3 className="font-display text-lg">{m.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {discovered ? "Discovered" : "Not recorded as discovered"}
              </p>
              {discovered ? (
                <>
                  {"image" in m ? (
                    <img
                      src={m.image}
                      alt={m.name}
                      loading="lazy"
                      className="mt-3 h-28 w-full object-contain"
                    />
                  ) : null}
                  <p className="mt-3 text-sm text-muted-foreground">{m.description}</p>
                  <dl className="mt-3 space-y-2 text-sm">
                    {[
                      ["Cost per meter", `PHP ${m.costPerMeter.toLocaleString()}/m`],
                      ["Mass per meter", `${m.massPerMeter.toLocaleString()} kg/m`],
                      [
                        "Maximum length",
                        m.maxLength === null ? "Unlimited in game" : `${m.maxLength} m`,
                      ],
                      ["Tension limit", `${m.maxTension.toLocaleString()} N`],
                      ["Compression limit", `${m.maxCompression.toLocaleString()} N`],
                    ].map(([label, value]) => (
                      <div key={label} className="flex flex-wrap justify-between gap-2">
                        <dt>{label}</dt>
                        <dd className="font-bold">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {m.dual ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Dual placement: cost and mass are doubled for a pair.
                    </p>
                  ) : null}
                  {m.pier ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Tall piers lose compression strength through the game’s buckling calculation.
                    </p>
                  ) : null}
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
