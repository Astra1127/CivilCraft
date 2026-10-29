import { useId, useState } from "react";
import { CheckCircle2, ChevronDown, LoaderCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { QuizAnswer, QuizAttempt } from "@/lib/playfab/almanac-education";
import { useQuizAnswerReview } from "./useQuizAnswerReview";

export function QuizAnswerList({ answers }: { answers: QuizAnswer[] }) {
  return (
    <ol className="space-y-4">
      {answers.map((answer, index) => {
        const correct = answer.selectedIndex === answer.correctIndex;
        const Icon = correct ? CheckCircle2 : XCircle;
        return (
          <li
            key={answer.questionId}
            className="min-w-0 rounded-xl border border-border bg-card p-3 sm:p-4"
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
              <span className="text-muted-foreground">Question {index + 1}</span>
              <span
                className={`inline-flex items-center gap-1 ${correct ? "text-emerald-700" : "text-destructive"}`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {correct ? "Correct" : "Incorrect"}
              </span>
            </div>
            <p className="whitespace-pre-line break-words font-bold">{answer.question}</p>
            <ol className="mt-3 space-y-2 text-sm">
              {answer.choices.map((choice, choiceIndex) => {
                const selected = choiceIndex === answer.selectedIndex;
                const right = choiceIndex === answer.correctIndex;
                return (
                  <li
                    key={choiceIndex}
                    className={`min-w-0 rounded-lg border px-3 py-2 ${right ? "border-emerald-600/40 bg-emerald-50/70" : selected ? "border-destructive/40 bg-destructive/5" : "border-border bg-secondary/30"}`}
                  >
                    <p className="whitespace-pre-line break-words">
                      <span className="font-bold">{String.fromCharCode(65 + choiceIndex)}. </span>
                      {choice}
                    </p>
                    {selected || right ? (
                      <p className="mt-1 text-xs font-bold">
                        {[
                          selected ? "Your answer" : undefined,
                          right ? "Correct answer" : undefined,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            {answer.explanation ? (
              <p className="mt-3 whitespace-pre-line break-words border-t border-border pt-3 text-sm text-muted-foreground">
                <span className="font-bold text-foreground">Explanation: </span>
                {answer.explanation}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export function QuizAnswerReview({ attempt }: { attempt: QuizAttempt }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const review = useQuizAnswerReview(attempt, open);
  return (
    <div className="mt-4 min-w-0">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="max-w-full gap-2"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Hide answer review" : "Review answers"}
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </Button>
      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label={`${attempt.title} answer review`}
          className="mt-3 min-w-0"
        >
          {review.status === "loading" ? (
            <p
              role="status"
              className="flex items-center gap-2 rounded-xl border border-border bg-secondary/30 p-4 text-sm text-muted-foreground"
            >
              <LoaderCircle
                className="h-4 w-4 shrink-0 motion-safe:animate-spin"
                aria-hidden="true"
              />
              Loading your submitted answers…
            </p>
          ) : review.status === "ready" && review.answers ? (
            <div className="max-h-[65vh] min-w-0 overflow-y-auto overscroll-contain rounded-xl bg-secondary/30 p-2 [overflow-wrap:anywhere]">
              <QuizAnswerList answers={review.answers} />
            </div>
          ) : review.status === "unavailable" ? (
            <p
              role="status"
              className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground"
            >
              Answer review unavailable for this submission. Its score is still recorded.
            </p>
          ) : review.status === "signed-out" ? (
            <p role="status" className="text-sm text-muted-foreground">
              Sign in again to view your private answer review.
            </p>
          ) : review.status === "error" ? (
            <div role="status" className="space-y-2 rounded-xl border border-border p-4 text-sm">
              <p>We couldn’t load your answers. Please try again.</p>
              <Button type="button" variant="outline" size="sm" onClick={review.retry}>
                Retry answer review
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
