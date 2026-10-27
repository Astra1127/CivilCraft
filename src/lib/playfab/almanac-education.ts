/** Optional v1 projection inside AlmanacProgress. No client-side progression writes. */
export interface QuizAnswer {
  questionId: string;
  question: string;
  choices: string[];
  selectedIndex: number;
  correctIndex: number;
}
export interface QuizAttempt {
  quizId: string;
  attemptId: string;
  title: string;
  topic?: string;
  score: number;
  totalQuestions: number;
  completedAt?: string;
  answers?: QuizAnswer[];
}
export interface LessonRecord {
  lessonId: string;
  state: "discovered" | "completed";
}
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 4000;
const integer = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export function parseEducation(value: unknown): {
  quizAttempts: QuizAttempt[];
  lessonRecords: LessonRecord[];
} {
  const root = object(value);
  const quizAttempts: QuizAttempt[] = [];
  const lessonRecords: LessonRecord[] = [];
  // Duplicate immutable IDs are ambiguous: discard all copies, rather than choose an answer.
  const attempts = Array.isArray(root["quizAttempts"]) ? root["quizAttempts"].slice(0, 1000) : [];
  const keys = attempts.map((v) => JSON.stringify([object(v)["quizId"], object(v)["attemptId"]]));
  for (const [index, value] of attempts.entries()) {
    const a = object(value);
    if (keys.indexOf(keys[index]!) !== keys.lastIndexOf(keys[index]!)) continue;
    if (
      !text(a["quizId"]) ||
      !text(a["attemptId"]) ||
      !text(a["title"]) ||
      a["status"] !== "completed" ||
      !integer(a["score"]) ||
      !integer(a["totalQuestions"]) ||
      a["totalQuestions"] < 1 ||
      a["totalQuestions"] > 500 ||
      a["score"] > a["totalQuestions"]
    )
      continue;
    const answers: QuizAnswer[] = [];
    if (Array.isArray(a["answers"]))
      for (const value of a["answers"].slice(0, 500)) {
        const r = object(value);
        if (
          text(r["questionId"]) &&
          text(r["question"]) &&
          Array.isArray(r["choices"]) &&
          r["choices"].length >= 2 &&
          r["choices"].length <= 20 &&
          r["choices"].every(text) &&
          integer(r["selectedIndex"]) &&
          integer(r["correctIndex"]) &&
          r["selectedIndex"] < r["choices"].length &&
          r["correctIndex"] < r["choices"].length
        ) {
          answers.push({
            questionId: r["questionId"],
            question: r["question"],
            choices: r["choices"],
            selectedIndex: r["selectedIndex"],
            correctIndex: r["correctIndex"],
          });
        }
      }
    const completeReview =
      Array.isArray(a["answers"]) &&
      a["answers"].length === a["totalQuestions"] &&
      answers.length === a["totalQuestions"] &&
      new Set(answers.map((r) => r["questionId"])).size === answers.length &&
      answers.filter((r) => r["selectedIndex"] === r["correctIndex"]).length === a["score"];
    quizAttempts.push({
      quizId: a["quizId"],
      attemptId: a["attemptId"],
      title: a["title"],
      score: a["score"],
      totalQuestions: a["totalQuestions"],
      ...(text(a["topic"]) ? { topic: a["topic"] } : {}),
      ...(typeof a["completedAt"] === "string" &&
      /^\d{4}-\d{2}-\d{2}T/.test(a["completedAt"]) &&
      Number.isFinite(Date.parse(a["completedAt"]))
        ? { completedAt: a["completedAt"] }
        : {}),
      ...(completeReview ? { answers } : {}),
    });
  }
  const lessons = Array.isArray(root["lessonRecords"]) ? root["lessonRecords"].slice(0, 1000) : [];
  for (const value of lessons) {
    const r = object(value);
    if (
      text(r["lessonId"]) &&
      (r["state"] === "discovered" || r["state"] === "completed") &&
      lessons.filter((v) => object(v)["lessonId"] === r["lessonId"]).length === 1
    )
      lessonRecords.push({ lessonId: r["lessonId"], state: r["state"] });
  }
  return { quizAttempts, lessonRecords };
}
