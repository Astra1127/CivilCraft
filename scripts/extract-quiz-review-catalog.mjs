// Read-only Unity asset export. Answer keys are retained in a server-only catalog.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const defaultOutput = fileURLToPath(
  new URL("../src/lib/playfab/quiz-review-catalog.server.json", import.meta.url),
);
const nonempty = (value, limit = 4000) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= limit;

/** Matches QuizData.ContentFingerprint, including .NET/JS UTF-16 string lengths. */
export function quizContentFingerprint(quiz) {
  const parts = ["npc-quiz-v1;"];
  const append = (value) => {
    value = value ?? "";
    parts.push(`${value.length}:${value};`);
  };
  append(quiz.quizId.trim());
  append(quiz.title);
  if (quiz.assessmentMode) append("assessment-v1");
  append(String(quiz.questions.length));
  for (const question of quiz.questions) {
    append(question.questionId.trim());
    append(question.prompt);
    append(question.feedback);
    append(String(question.correctChoiceIndex));
    append(String(question.choices.length));
    for (const choice of question.choices) {
      append("choice");
      append(choice.text);
      append(""); // Nonzero image references are rejected before export.
    }
  }
  return createHash("sha256").update(parts.join(""), "utf8").digest("hex");
}

export function reviewCatalogVersion(quiz) {
  if (!quiz || quiz.assessmentMode !== 1) return null;
  if (/^(?:NEWQUIZ|new-quiz|placeholder)$/i.test(quiz.quizId ?? "")) return null;
  if (
    !nonempty(quiz.quizId, 200) ||
    !nonempty(quiz.title) ||
    !Array.isArray(quiz.questions) ||
    quiz.questions.length < 1 ||
    quiz.questions.length > 500
  )
    throw new Error("Assessment quiz has invalid identity or question count.");
  const ids = new Set();
  for (const question of quiz.questions) {
    if (
      !question ||
      !nonempty(question.questionId, 200) ||
      ids.has(question.questionId.trim()) ||
      !nonempty(question.prompt) ||
      !Array.isArray(question.choices) ||
      question.choices.length < 2 ||
      question.choices.length > 20 ||
      !Number.isInteger(question.correctChoiceIndex) ||
      question.correctChoiceIndex < 0 ||
      question.correctChoiceIndex >= question.choices.length ||
      (question.feedback != null &&
        (typeof question.feedback !== "string" || question.feedback.length > 4000))
    )
      throw new Error("Assessment quiz has invalid question content.");
    ids.add(question.questionId.trim());
    for (const choice of question.choices) {
      if (!choice || !nonempty(choice.text))
        throw new Error("Assessment choice needs authored text.");
      if (choice.image && choice.image.fileID !== 0)
        throw new Error("Quiz review does not yet support image choices; export refused.");
    }
  }
  return {
    quizId: quiz.quizId.trim(),
    contentFingerprint: quizContentFingerprint(quiz),
    title: quiz.title,
    questions: quiz.questions.map((question) => ({
      questionId: question.questionId.trim(),
      question: question.prompt,
      choices: question.choices.map((choice) => choice.text),
      correctIndex: question.correctChoiceIndex,
      ...(question.feedback?.trim() ? { explanation: question.feedback } : {}),
    })),
  };
}

export function exportQuizReviewCatalog(unityAssets, output = defaultOutput) {
  if (!unityAssets || !path.isAbsolute(unityAssets))
    throw new Error("Pass --unity-assets <absolute path to the reviewed Unity Assets directory>.");
  const source = path.join(unityAssets, "BridgeBuilder", "Data", "Quized");
  if (!fs.existsSync(source)) throw new Error("Selected Unity Assets has no quiz directory.");
  const previous = fs.existsSync(output)
    ? JSON.parse(fs.readFileSync(output, "utf8"))
    : { schemaVersion: 1, versions: [] };
  if (previous.schemaVersion !== 1 || !Array.isArray(previous.versions))
    throw new Error("Retained review catalog requires inspection; refusing replacement.");
  const versions = new Map();
  for (const version of previous.versions) {
    const key = JSON.stringify([version.quizId, version.contentFingerprint]);
    if (
      !nonempty(version.quizId, 200) ||
      !/^[a-f0-9]{64}$/.test(version.contentFingerprint) ||
      !Array.isArray(version.questions) ||
      versions.has(key)
    )
      throw new Error("Retained review catalog contains invalid or duplicate versions.");
    versions.set(key, version);
  }
  const currentIds = new Set();
  let exported = 0;
  for (const name of fs
    .readdirSync(source)
    .filter((name) => name.endsWith(".asset"))
    .sort()) {
    const quiz = yaml.load(
      fs
        .readFileSync(path.join(source, name), "utf8")
        .replace(/^%.*$/gm, "")
        .replace(/^--- !u!.*$/gm, "---"),
    )?.MonoBehaviour;
    const version = reviewCatalogVersion(quiz);
    if (!version) continue;
    if (currentIds.has(version.quizId)) throw new Error("Duplicate active assessment quiz ID.");
    currentIds.add(version.quizId);
    const key = JSON.stringify([version.quizId, version.contentFingerprint]);
    const retained = versions.get(key);
    if (retained && JSON.stringify(retained) !== JSON.stringify(version))
      throw new Error("An immutable review version changed; refusing replacement.");
    versions.set(key, version);
    exported++;
  }
  if (!exported) throw new Error("No authored assessment quizzes were found.");
  const catalog = {
    schemaVersion: 1,
    versions: [...versions.values()].sort((a, b) =>
      `${a.quizId}:${a.contentFingerprint}`.localeCompare(`${b.quizId}:${b.contentFingerprint}`),
    ),
  };
  fs.writeFileSync(output, JSON.stringify(catalog, null, 2) + "\n");
  return { activeQuizzes: exported, retainedVersions: versions.size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argument = process.argv.indexOf("--unity-assets");
  if (argument < 0 || !process.argv[argument + 1])
    throw new Error("Pass --unity-assets <absolute path to the reviewed Unity Assets directory>.");
  console.log(exportQuizReviewCatalog(process.argv[argument + 1]));
}
