import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEducation } from "../src/lib/playfab/almanac-education.ts";
import { parseAlmanacProgress } from "../src/lib/playfab/almanac.ts";
import { canonicalStageOrder, levelStageLabel } from "../src/lib/playfab/level-records.ts";
import { handleBridgeSnapshot } from "../src/lib/playfab/bridge-snapshot.server.ts";

const attempt = {
  quizId: "beam",
  attemptId: "a1",
  title: "Beam Bridge Quiz",
  status: "completed",
  score: 1,
  totalQuestions: 1,
};
const answer = {
  questionId: "q1",
  question: "Question",
  choices: ["A", "B"],
  selectedIndex: 0,
  correctIndex: 0,
};
test("quiz records reject invalid scores and duplicates, preserve real separate attempts and optional review", () => {
  for (const bad of [
    null,
    [],
    "",
    { ...attempt, score: -1 },
    { ...attempt, score: 2 },
    { ...attempt, totalQuestions: 0 },
    { ...attempt, status: "started" },
    { ...attempt, score: NaN },
  ]) {
    assert.deepEqual(parseEducation({ quizAttempts: [bad] }).quizAttempts, []);
  }
  assert.deepEqual(parseEducation({ quizAttempts: [attempt, attempt] }).quizAttempts, []);
  const records = parseEducation({
    quizAttempts: [
      { ...attempt, completedAt: "invalid", answers: [answer] },
      { ...attempt, attemptId: "a2", score: 0 },
    ],
  }).quizAttempts;
  assert.equal(records.length, 2);
  assert.equal(records[0].completedAt, undefined);
  assert.deepEqual(records[0].answers, [answer]);
  assert.equal(records[1].answers, undefined);
  for (const answers of [
    [{ ...answer, selectedIndex: 8 }],
    [{ ...answer, correctIndex: 1 }],
    [],
    [answer, answer],
  ]) {
    assert.equal(
      parseEducation({ quizAttempts: [{ ...attempt, answers }] }).quizAttempts[0].answers,
      undefined,
    );
  }
});
test("lesson state needs explicit records; contract concepts do not unlock lessons", () => {
  assert.deepEqual(parseEducation({ engineeringConceptIds: ["tension"] }).lessonRecords, []);
  assert.deepEqual(
    parseEducation({
      lessonRecords: [
        { lessonId: "LESSON002", state: "discovered" },
        { lessonId: "bad", state: "viewed" },
      ],
    }).lessonRecords,
    [{ lessonId: "LESSON002", state: "discovered" }],
  );
});
test("verified story chain ignores conflicting catalog/stage metadata and keeps side contracts separate", () => {
  for (const [index, id] of [
    "ShopKeeper",
    "ReedsContract",
    "VancesContract",
    "SilasMainContract",
    "MainContractSilas",
  ].entries()) {
    assert.equal(canonicalStageOrder(id), index + 1);
    assert.equal(
      levelStageLabel({ levelId: id, order: 99, stageOrder: 99 }),
      `Level 0${index + 1}`,
    );
  }
  assert.equal(levelStageLabel({ levelId: "ReedSideInspection", stageOrder: 3 }), "Side contract");
});
const completion = {
  status: "success",
  playerId: "A",
  snapshot: { contractId: "ShopKeeper", regionId: "canyon", fileName: "bridge-result1.png" },
};
const progress = (c = completion) => ({
  regions: [
    { regionId: "canyon", levels: [{ levelId: "ShopKeeper", status: "completed", completion: c }] },
  ],
});
test("snapshot references require exact stable contract and region IDs and a restricted PNG filename", () => {
  for (const snapshot of [
    { ...completion.snapshot, contractId: "ReedsContract" },
    { ...completion.snapshot, regionId: "elsewhere" },
    { ...completion.snapshot, fileName: "characterPortrait.png" },
    { ...completion.snapshot, fileName: "../private.png" },
  ]) {
    assert.equal(
      parseAlmanacProgress(JSON.stringify(progress({ ...completion, snapshot }))).regions[0]
        .levels[0].completion.snapshotFileName,
      undefined,
    );
  }
});

async function snapshotFlow(options = {}) {
  process.env.PLAYFAB_SECRET_KEY = "test-secret";
  const original = globalThis.fetch;
  const calls = [];
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const envelope = (data) => Response.json({ code: 200, data });
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("AuthenticateSessionTicket"))
      return envelope({ UserInfo: { PlayFabId: options.playerId ?? "A" } });
    if (String(url).endsWith("GetUserData"))
      return envelope({
        Data: { AlmanacProgress: { Value: JSON.stringify(options.progress ?? progress()) } },
      });
    if (String(url).endsWith("GetEntityToken"))
      return envelope({
        Entity: { Id: "own-entity", Type: "title_player_account" },
        EntityToken: "own-token",
      });
    if (String(url).endsWith("GetFiles"))
      return envelope({
        Metadata: options.missing
          ? {}
          : {
              "bridge-result1.png": {
                DownloadUrl:
                  options.url ?? "https://files.blob.core.windows.net/private/photo?sig=private",
              },
            },
      });
    return new Response(options.invalidImage ? "invalid" : png);
  };
  try {
    const response = await handleBridgeSnapshot(
      new Request(
        "https://example.test/api/player/bridge-snapshot?" +
          (options.query ?? "contractId=ShopKeeper&regionId=canyon"),
        { headers: options.noAuth ? {} : { Authorization: "Bearer own-ticket" } },
      ),
    );
    return { response, calls };
  } finally {
    globalThis.fetch = original;
  }
}
test("private snapshot reads only the signed-in player's completion and entity; credentials never reach storage", async () => {
  const { response, calls } = await snapshotFlow();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(JSON.parse(calls[1].init.body), { Keys: ["AlmanacProgress"] });
  assert.deepEqual(JSON.parse(calls[3].init.body), {
    Entity: { Id: "own-entity", Type: "title_player_account" },
  });
  assert.equal(calls[4].init.headers, undefined);
  assert.doesNotMatch(JSON.stringify([...response.headers]), /secret|ticket|token|sig=/);
  assert.ok(!JSON.stringify(calls).includes("playerSaveData"));
});
test("private snapshots reject foreign players, ambiguous records, caller filenames and unavailable images", async () => {
  const duplicate = progress();
  duplicate.regions[0].levels.push(duplicate.regions[0].levels[0]);
  for (const [options, status] of [
    [{ playerId: "B" }, 404],
    [{ progress: duplicate }, 404],
    [{ noAuth: true }, 401],
    [{ query: "contractId=ShopKeeper&regionId=canyon&playerId=B" }, 400],
    [{ query: "contractId=ShopKeeper&regionId=canyon&fileName=characterPortrait.png" }, 400],
    [{ query: "contractId=ReedsContract&regionId=canyon" }, 404],
    [{ missing: true }, 404],
    [{ url: "https://localhost/private" }, 503],
    [{ invalidImage: true }, 503],
  ]) {
    const { response } = await snapshotFlow(options);
    assert.equal(response.status, status);
    assert.equal(await response.text(), "");
  }
});
