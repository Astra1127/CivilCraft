import { AdminApiError, object, playFabAdmin } from "./admin-client.server.ts";
import { parseEducation } from "./almanac-education.ts";
import catalog from "./quiz-review-catalog.server.json" with { type: "json" };

type ReviewReference = {
  quizId: string;
  attemptId: string;
  contentFingerprint: string;
  selectedIndices: number[];
};

const identifier = (value: unknown): value is string =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= 200 &&
  value === value.trim() &&
  ![...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
const text = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 4000;

/** An untrusted compact projection cannot select a different owner or answer bank. */
function reviewReferences(raw: unknown): ReviewReference[] | null {
  if (typeof raw !== "string" || raw.length > 10000) return null;
  let root: Record<string, unknown>;
  try {
    root = object(JSON.parse(raw));
  } catch {
    return null;
  }
  const reviews = root["reviews"];
  if (root["schemaVersion"] !== 1 || !Array.isArray(reviews) || reviews.length > 1000) return null;
  const result: ReviewReference[] = [];
  const identities = new Set<string>();
  for (const item of reviews) {
    const review = object(item);
    const quizId = review["quizId"];
    const attemptId = review["attemptId"];
    const fingerprint = review["contentFingerprint"];
    const indices = review["selectedIndices"];
    if (
      !identifier(quizId) ||
      !identifier(attemptId) ||
      typeof fingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(fingerprint) ||
      !Array.isArray(indices) ||
      indices.length < 1 ||
      indices.length > 500 ||
      indices.some((value) => !Number.isSafeInteger(value) || value < 0 || value > 19)
    )
      return null;
    const identity = JSON.stringify([quizId, attemptId]);
    if (identities.has(identity)) return null;
    identities.add(identity);
    result.push({ quizId, attemptId, contentFingerprint: fingerprint, selectedIndices: indices });
  }
  return result;
}

/** Releases one completed review to the authenticated owner; never writes progression. */
export async function handleQuizReview(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/player/quiz-review") return null;
  const headers = {
    "Cache-Control": "private, no-store",
    Vary: "Authorization",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
  };
  const empty = (status: number) => new Response(null, { status, headers });
  if (request.method !== "GET") return empty(405);
  const ticket = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (!ticket || ticket.length > 4096) return empty(401);
  const quizId = url.searchParams.get("quizId");
  const attemptId = url.searchParams.get("attemptId");
  if (
    !identifier(quizId) ||
    !identifier(attemptId) ||
    [...url.searchParams.keys()].some((key) => key !== "quizId" && key !== "attemptId") ||
    url.searchParams.getAll("quizId").length !== 1 ||
    url.searchParams.getAll("attemptId").length !== 1
  )
    return empty(400);
  try {
    const authenticated = await playFabAdmin("Server/AuthenticateSessionTicket", {
      SessionTicket: ticket,
    });
    const playerId = object(authenticated["UserInfo"])["PlayFabId"];
    if (typeof playerId !== "string" || !playerId) return empty(401);
    const data = await playFabAdmin("Server/GetUserData", {
      PlayFabId: playerId,
      Keys: ["AlmanacProgress", "QuizReviewProgress"],
    });
    const records = object(data["Data"]);
    const almanac = object(records["AlmanacProgress"])["Value"];
    const rawReviews = object(records["QuizReviewProgress"])["Value"];
    if (typeof almanac !== "string" || almanac.length > 10000) return empty(404);
    let parsed: unknown;
    try {
      parsed = JSON.parse(almanac);
    } catch {
      return empty(404);
    }
    const matches = parseEducation(parsed).quizAttempts.filter(
      (attempt) => attempt.quizId === quizId && attempt.attemptId === attemptId,
    );
    const attempt = matches[0];
    const references = reviewReferences(rawReviews);
    const review = references?.find(
      (reference) => reference.quizId === quizId && reference.attemptId === attemptId,
    );
    if (matches.length !== 1 || !attempt || !review) return empty(404);
    const versions = catalog.versions.filter(
      (version) =>
        version.quizId === quizId && version.contentFingerprint === review.contentFingerprint,
    );
    const version = versions[0];
    if (
      catalog.schemaVersion !== 1 ||
      versions.length !== 1 ||
      !version ||
      version.title.trim() !== attempt.title ||
      version.questions.length !== attempt.totalQuestions ||
      review.selectedIndices.length !== attempt.totalQuestions
    )
      return empty(404);
    const answers = [];
    const questionIds = new Set<string>();
    for (const [index, question] of version.questions.entries()) {
      const selectedIndex = review.selectedIndices[index];
      if (
        !identifier(question.questionId) ||
        questionIds.has(question.questionId) ||
        !text(question.question) ||
        !Array.isArray(question.choices) ||
        question.choices.length < 2 ||
        question.choices.length > 20 ||
        !question.choices.every(text) ||
        selectedIndex === undefined ||
        selectedIndex >= question.choices.length ||
        !Number.isSafeInteger(question.correctIndex) ||
        question.correctIndex < 0 ||
        question.correctIndex >= question.choices.length
      )
        return empty(404);
      questionIds.add(question.questionId);
      const explanation = "explanation" in question ? question.explanation : undefined;
      answers.push({
        questionId: question.questionId,
        question: question.question,
        choices: question.choices,
        selectedIndex,
        correctIndex: question.correctIndex,
        ...(text(explanation) ? { explanation } : {}),
      });
    }
    if (
      answers.filter((answer) => answer.selectedIndex === answer.correctIndex).length !==
      attempt.score
    )
      return empty(404);
    return Response.json(
      {
        quizId,
        attemptId,
        title: attempt.title,
        score: attempt.score,
        totalQuestions: attempt.totalQuestions,
        ...(attempt.completedAt ? { completedAt: attempt.completedAt } : {}),
        contentFingerprint: review.contentFingerprint,
        answers,
      },
      { headers },
    );
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 401) return empty(401);
    console.warn("[quiz-review] Quiz review service temporarily unavailable.");
    return empty(503);
  }
}
