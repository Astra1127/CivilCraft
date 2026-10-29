import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import catalog from "../src/lib/playfab/quiz-review-catalog.server.json" with { type: "json" };
import { handleQuizReview } from "../src/lib/playfab/quiz-review.server.ts";
import {
  exportQuizReviewCatalog,
  quizContentFingerprint,
  reviewCatalogVersion,
} from "../scripts/extract-quiz-review-catalog.mjs";

const bank = catalog.versions.find(
  (version) => version.quizId === "civil-craft-beam-bridge-quiz-v1",
);
const ATTEMPT = "a".repeat(32);
const AUTH_A = "owner-A-ticket";
const AUTH_B = "owner-B-ticket";
const envelope = (data) => Response.json({ code: 200, data });
const allCorrect = () => bank.questions.map((question) => question.correctIndex);
const attempt = (change = {}) => ({
  quizId: bank.quizId,
  attemptId: ATTEMPT,
  title: bank.title.trim(),
  status: "completed",
  score: bank.questions.length,
  totalQuestions: bank.questions.length,
  completedAt: "2026-10-29T10:00:00Z",
  ...change,
});
const reference = (change = {}) => ({
  quizId: bank.quizId,
  attemptId: ATTEMPT,
  contentFingerprint: bank.contentFingerprint,
  selectedIndices: allCorrect(),
  ...change,
});
const record = (attempts = [attempt()], reviews = [reference()]) => ({
  AlmanacProgress: { Value: JSON.stringify({ quizAttempts: attempts }) },
  QuizReviewProgress: { Value: JSON.stringify({ schemaVersion: 1, reviews }) },
});
async function flow(options = {}) {
  const originalFetch = globalThis.fetch;
  const originalSecret = process.env.PLAYFAB_SECRET_KEY;
  process.env.PLAYFAB_SECRET_KEY = "test-server-secret";
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), init, body });
    if (String(url).endsWith("/Server/AuthenticateSessionTicket")) {
      if (options.expired)
        return Response.json({ code: 400, error: "InvalidSessionTicket" }, { status: 400 });
      if (options.failure === "auth") throw new Error("test-server-secret owner-A-ticket");
      return envelope({ UserInfo: { PlayFabId: body.SessionTicket === AUTH_B ? "FB" : "FA" } });
    }
    if (String(url).endsWith("/Server/GetUserData")) {
      if (options.failure) throw new Error("test-server-secret owner-A-ticket");
      return envelope({
        Data:
          body.PlayFabId === "FB"
            ? (options.accountB ?? {})
            : (options.records ?? record(options.attempts, options.reviews)),
      });
    }
    throw new Error("Unexpected API operation");
  };
  try {
    const params =
      options.query ?? new URLSearchParams({ quizId: bank.quizId, attemptId: ATTEMPT });
    const response = await handleQuizReview(
      new Request(`https://civil-craft.example/api/player/quiz-review?${params}`, {
        method: options.method ?? "GET",
        headers: options.noAuth
          ? { Cookie: "civilcraft-admin=unrelated" }
          : { Authorization: `Bearer ${options.ticket ?? AUTH_A}` },
      }),
    );
    return { response, calls };
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSecret === undefined) delete process.env.PLAYFAB_SECRET_KEY;
    else process.env.PLAYFAB_SECRET_KEY = originalSecret;
  }
}

test("review reads the authenticated owner's two private projections and returns only the requested version", async () => {
  const { response, calls } = await flow();
  assert.equal(response.status, 200);
  const review = await response.json();
  assert.equal(review.quizId, bank.quizId);
  assert.equal(review.attemptId, ATTEMPT);
  assert.equal(review.contentFingerprint, bank.contentFingerprint);
  assert.equal(review.completedAt, "2026-10-29T10:00:00Z");
  assert.equal(review.answers.length, bank.questions.length);
  assert.deepEqual(
    review.answers.map((answer) => answer.selectedIndex),
    allCorrect(),
  );
  assert.equal(review.answers[0].question, bank.questions[0].question);
  assert.equal(review.answers[0].correctIndex, bank.questions[0].correctIndex);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].body, {
    PlayFabId: "FA",
    Keys: ["AlmanacProgress", "QuizReviewProgress"],
  });
  assert.ok(calls.every((call) => call.init.method === "POST"));
  assert.ok(calls.every((call) => call.init.cache === "no-store"));
  assert.ok(!JSON.stringify(review).includes("test-server-secret"));
  assert.ok(!JSON.stringify(review).includes(AUTH_A));
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("vary"), "Authorization");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(review.answers[0].explanation, undefined, "No explanation is invented");
  assert.equal(review.versions, undefined);
});

test("another account cannot retrieve the first owner's attempt and each request reauthenticates", async () => {
  for (const ticket of [AUTH_A, AUTH_B, AUTH_A]) {
    const { response, calls } = await flow({ ticket });
    assert.equal(response.status, ticket === AUTH_B ? 404 : 200);
    assert.equal(calls[0].body.SessionTicket, ticket);
    assert.equal(calls[1].body.PlayFabId, ticket === AUTH_B ? "FB" : "FA");
    assert.equal(calls.length, 2, "No cross-account review cache bypasses authentication");
  }
});

test("missing, expired and admin-only authentication never reads review records", async () => {
  for (const [options, status, calls] of [
    [{ noAuth: true }, 401, 0],
    [{ expired: true }, 401, 1],
    [{ method: "POST" }, 405, 0],
    [{ ticket: "x".repeat(4097) }, 401, 0],
  ]) {
    const result = await flow(options);
    assert.equal(result.response.status, status);
    assert.equal(await result.response.text(), "");
    assert.equal(result.calls.length, calls);
  }
});

test("only unique stable quiz/attempt selectors are accepted; foreign IDs and client answers are rejected", async () => {
  const base = `quizId=${bank.quizId}&attemptId=${ATTEMPT}`;
  for (const query of [
    "",
    `quizId=${bank.quizId}`,
    `${base}&playerId=FB`,
    `${base}&PlayFabId=FB`,
    `${base}&contentFingerprint=${bank.contentFingerprint}`,
    `${base}&selectedIndices=0`,
    `${base}&quizId=${bank.quizId}`,
    `${base}&attemptId=${ATTEMPT}`,
    `quizId=${"x".repeat(201)}&attemptId=${ATTEMPT}`,
    `quizId=%20${bank.quizId}&attemptId=${ATTEMPT}`,
  ]) {
    const { response, calls } = await flow({ query });
    assert.equal(response.status, 400);
    assert.equal(calls.length, 0);
    assert.equal(await response.text(), "");
  }
});

test("review requires an exact current completed aggregate, content version, complete choices and score", async () => {
  for (const options of [
    { attempts: [] },
    { attempts: [attempt({ status: "in_progress" })] },
    { attempts: [attempt(), attempt()] },
    { attempts: [attempt({ attemptId: "other-attempt" })] },
    { attempts: [attempt({ quizId: "other-quiz" })] },
    { attempts: [attempt({ score: bank.questions.length - 1 })] },
    { attempts: [attempt({ totalQuestions: bank.questions.length + 1 })] },
    { attempts: [attempt({ title: "Different bank title" })] },
    { reviews: [] },
    { reviews: [reference(), reference()] },
    { reviews: [reference({ contentFingerprint: "0".repeat(64) })] },
    { reviews: [reference({ contentFingerprint: bank.contentFingerprint.toUpperCase() })] },
    { reviews: [reference({ attemptId: "old-attempt" })] },
    { reviews: [reference({ selectedIndices: allCorrect().slice(1) })] },
    { reviews: [reference({ selectedIndices: [...allCorrect(), 0] })] },
    ...[-1, 20, 1.2, "2", null, 4].map((value) => ({
      reviews: [reference({ selectedIndices: [value, ...allCorrect().slice(1)] })],
    })),
  ]) {
    const { response } = await flow(options);
    assert.equal(response.status, 404, JSON.stringify(options));
    assert.equal(await response.text(), "");
  }
});

test("malformed or oversized projections fail safely and legacy unknown dates remain unknown", async () => {
  const original = record();
  for (const records of [
    {},
    { ...original, AlmanacProgress: { Value: "{" } },
    { ...original, AlmanacProgress: { Value: " ".repeat(10001) } },
    { ...original, QuizReviewProgress: { Value: "{" } },
    { ...original, QuizReviewProgress: { Value: " ".repeat(10001) } },
    {
      ...original,
      QuizReviewProgress: { Value: JSON.stringify({ schemaVersion: 2, reviews: [reference()] }) },
    },
    { ...original, QuizReviewProgress: { Value: "[]" } },
  ]) {
    const { response } = await flow({ records });
    assert.equal(response.status, 404);
    assert.equal(await response.text(), "");
  }
  const { response } = await flow({ attempts: [attempt({ completedAt: "" })] });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).completedAt, undefined);
});

test("service failures remain unavailable without leaking credentials or provider errors", async () => {
  for (const failure of ["auth", "data"]) {
    const { response } = await flow({ failure });
    assert.equal(response.status, 503);
    assert.equal(await response.text(), "");
    assert.doesNotMatch(JSON.stringify([...response.headers]), /test-server-secret|ticket/);
  }
  assert.equal(await handleQuizReview(new Request("https://example.test/elsewhere")), null);
});

const miniQuiz = () => ({
  quizId: " unicode-quiz ",
  title: "Beam 🧱",
  assessmentMode: 1,
  questions: [
    {
      questionId: " q:1 ",
      prompt: "Which?",
      feedback: "Why; 🧱",
      correctChoiceIndex: 1,
      choices: [
        { text: "No", image: { fileID: 0 } },
        { text: "Yes", image: { fileID: 0 } },
      ],
    },
  ],
});

test("fingerprint matches the exact C# length-prefixed UTF-16 contract, including emoji and authored feedback", () => {
  const expected =
    "npc-quiz-v1;12:unicode-quiz;7:Beam 🧱;13:assessment-v1;1:1;3:q:1;6:Which?;7:Why; 🧱;1:1;1:2;6:choice;2:No;0:;6:choice;3:Yes;0:;";
  assert.equal(
    quizContentFingerprint(miniQuiz()),
    createHash("sha256").update(expected).digest("hex"),
  );
  const version = reviewCatalogVersion(miniQuiz());
  assert.equal(version.quizId, "unicode-quiz");
  assert.equal(version.questions[0].explanation, "Why; 🧱");
  assert.equal(version.questions[0].questionId, "q:1");
  const changed = miniQuiz();
  changed.questions[0].choices.reverse();
  assert.notEqual(quizContentFingerprint(changed), version.contentFingerprint);
});

test("exporter retains immutable versions and refuses image choices, placeholders, bad content and duplicate active IDs", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "civilcraft-quiz-review-test-"));
  const assets = path.join(folder, "Assets");
  const quizFolder = path.join(assets, "BridgeBuilder", "Data", "Quized");
  fs.mkdirSync(quizFolder, { recursive: true });
  const output = path.join(folder, "private.server.json");
  const save = (name, quiz) =>
    fs.writeFileSync(path.join(quizFolder, name), yaml.dump({ MonoBehaviour: quiz }));
  try {
    save("one.asset", miniQuiz());
    save("practice.asset", { ...miniQuiz(), assessmentMode: 0 });
    save("placeholder.asset", { ...miniQuiz(), quizId: "NEWQUIZ" });
    assert.deepEqual(exportQuizReviewCatalog(assets, output), {
      activeQuizzes: 1,
      retainedVersions: 1,
    });
    const first = fs.readFileSync(output, "utf8");
    exportQuizReviewCatalog(assets, output);
    assert.equal(fs.readFileSync(output, "utf8"), first);
    const changed = miniQuiz();
    changed.questions[0].prompt = "New version";
    save("one.asset", changed);
    assert.deepEqual(exportQuizReviewCatalog(assets, output), {
      activeQuizzes: 1,
      retainedVersions: 2,
    });
    const retained = JSON.parse(fs.readFileSync(output, "utf8"));
    assert.ok(
      retained.versions.some(
        (version) =>
          version.contentFingerprint === reviewCatalogVersion(miniQuiz()).contentFingerprint,
      ),
    );
    save("duplicate.asset", changed);
    assert.throws(() => exportQuizReviewCatalog(assets, output), /Duplicate active/);
    fs.unlinkSync(path.join(quizFolder, "duplicate.asset"));
    const image = miniQuiz();
    image.questions[0].choices[0].image.fileID = 21300000;
    save("one.asset", image);
    assert.throws(() => exportQuizReviewCatalog(assets, output), /image choices/);
    const bad = miniQuiz();
    bad.questions[0].correctChoiceIndex = 5;
    assert.throws(() => reviewCatalogVersion(bad), /invalid question/);
    retained.versions.find(
      (version) =>
        version.contentFingerprint === reviewCatalogVersion(miniQuiz()).contentFingerprint,
    ).title = "Corrupted existing version";
    fs.writeFileSync(output, JSON.stringify(retained));
    save("one.asset", miniQuiz());
    assert.throws(
      () => exportQuizReviewCatalog(assets, output),
      /immutable review version changed/,
    );
    assert.throws(() => exportQuizReviewCatalog("relative-assets", output), /absolute path/);
  } finally {
    // Only the exact directory created above can be removed.
    const absolute = path.resolve(folder);
    const intended = path.resolve(os.tmpdir()) + path.sep;
    assert.ok(
      absolute.startsWith(intended) &&
        path.basename(absolute).startsWith("civilcraft-quiz-review-test-"),
    );
    fs.rmSync(absolute, { recursive: true });
  }
});

test("quiz answer keys are imported only by the server API and never placed under public assets", () => {
  const source = fs.readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");
  assert.match(source, /handleQuizReview/);
  const root = new URL("../src/", import.meta.url);
  const imports = fs
    .readdirSync(root, { recursive: true })
    .filter((name) => /\.(?:ts|tsx)$/.test(name))
    .filter((name) =>
      fs
        .readFileSync(new URL(name.replaceAll("\\", "/"), root), "utf8")
        .includes('"./quiz-review-catalog.server.json"'),
    );
  assert.deepEqual(
    imports.map((name) => name.replaceAll("\\", "/")),
    ["lib/playfab/quiz-review.server.ts"],
  );
  assert.equal(
    fs.existsSync(new URL("../public/quiz-review-catalog.server.json", import.meta.url)),
    false,
  );
});
