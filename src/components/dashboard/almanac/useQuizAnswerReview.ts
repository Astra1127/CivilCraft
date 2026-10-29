import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { playerFetch, readSession } from "@/lib/playfab/client";
import { parseEducation } from "@/lib/playfab/almanac-education";
import type { QuizAnswer, QuizAttempt } from "@/lib/playfab/almanac-education";

type ReviewState = {
  status: "idle" | "loading" | "ready" | "unavailable" | "error" | "signed-out";
  answers?: QuizAnswer[];
};

/** Read a submitted review only on demand, scoped to the current account/session. */
export function useQuizAnswerReview(attempt: QuizAttempt, open: boolean) {
  const { player } = useAuth();
  const id = player?.playFabId;
  const session = readSession("player");
  const ticket = session?.identity.playFabId === id ? session?.sessionTicket : undefined;
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([
    id,
    attempt.quizId,
    attempt.attemptId,
    attempt.title,
    attempt.score,
    attempt.totalQuestions,
    retry,
  ]);
  const [review, setReview] = useState<{ key: string; ticket: string; state: ReviewState }>();

  useEffect(() => {
    if (!open || !id || !ticket) return;
    const controller = new AbortController();
    let disposed = false;
    const current = () => !disposed && readSession("player")?.sessionTicket === ticket;
    const publish = (state: ReviewState) => {
      if (current()) setReview({ key, ticket, state });
    };
    void (async () => {
      try {
        const search = new URLSearchParams({
          quizId: attempt.quizId,
          attemptId: attempt.attemptId,
        });
        const response = await playerFetch(`/api/player/quiz-review?${search}`, {
          headers: { Authorization: `Bearer ${ticket}` },
          cache: "no-store",
          signal: controller.signal,
        });
        if (!current()) return;
        if (response.status === 404) {
          publish({ status: "unavailable" });
          return;
        }
        if (response.status === 401) {
          publish({ status: "signed-out" });
          return;
        }
        if (!response.ok) throw new Error("Review service unavailable.");
        const raw: unknown = await response.json();
        const record =
          raw && typeof raw === "object" && !Array.isArray(raw)
            ? (raw as Record<string, unknown>)
            : {};
        const result = parseEducation({
          quizAttempts: [{ ...record, status: "completed" }],
        }).quizAttempts[0];
        // Never bind a different attempt, score or content to this displayed card.
        if (
          !result?.answers ||
          result.quizId !== attempt.quizId ||
          result.attemptId !== attempt.attemptId ||
          result.title !== attempt.title ||
          result.score !== attempt.score ||
          result.totalQuestions !== attempt.totalQuestions ||
          typeof record["contentFingerprint"] !== "string" ||
          !/^[a-f0-9]{64}$/.test(record["contentFingerprint"])
        ) {
          publish({ status: "unavailable" });
          return;
        }
        publish({ status: "ready", answers: result.answers });
      } catch {
        publish({ status: "error" });
      }
    })();
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [
    open,
    id,
    ticket,
    key,
    attempt.quizId,
    attempt.attemptId,
    attempt.title,
    attempt.score,
    attempt.totalQuestions,
  ]);

  const state: ReviewState = !open
    ? { status: "idle" }
    : !id || !ticket
      ? { status: "signed-out" }
      : review?.key === key && review.ticket === ticket
        ? review.state
        : { status: "loading" };
  return { ...state, retry: () => setRetry((value) => value + 1) };
}
