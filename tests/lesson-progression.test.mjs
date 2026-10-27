import assert from "node:assert/strict";
import { test } from "node:test";
import catalog from "../src/lib/almanac/game-catalog.json" with { type: "json" };
import {
  completedTutorial,
  lessonGroups,
  lessonProgress,
  tutorialConceptIds,
  conceptIllustrations,
  bridgeLesson,
} from "../src/lib/almanac/lesson-catalog.ts";

const level = (levelId, overrides = {}) => ({
  levelId,
  regionId: "canyon",
  stableId: true,
  order: 99,
  status: "completed",
  engineeringConceptIds: ["load", "bending", "support"],
  completion: {
    playerId: "p1",
    levelId,
    regionId: "canyon",
    status: "success",
    score: 3,
    bridgeTypeId: "beam",
    completedAt: "",
  },
  ...overrides,
});
const journey = (levels = [], lessonRecords = []) => ({
  regions: [{ regionId: "canyon", levels }],
  lessonRecords,
});
const tutorial = () => journey([level("TUT_CONTRACT1"), level("TUT_CONTRACT2")]);

test("only owner-confirmed Dead/Live Load introductions appear in tutorial; all seven authored entries are preserved", () => {
  assert.deepEqual(
    lessonGroups[0].lessons.map((l) => l.id),
    ["deadload", "LESSON001"],
  );
  const lessons = lessonGroups.flatMap((g) => g.lessons);
  assert.equal(lessons.length, 7);
  for (const original of catalog.lessons)
    assert.equal(
      lessons.find((l) => l.id === original.id),
      original,
    );
  assert.equal(
    lessonGroups[1].lessons.length,
    5,
    "No unverified Level 01–05 introduction is fabricated",
  );
});

test("tutorial chapter completion provides encounter evidence only for the two verified introductions", () => {
  const j = tutorial();
  const before = JSON.stringify(j);
  assert.equal(completedTutorial(j, "p1"), true);
  for (const id of ["deadload", "LESSON001"]) {
    assert.equal(lessonProgress(id, j, "p1").state, "encountered");
    assert.equal(lessonProgress(id, j, "p1").canRead, true);
    assert.match(lessonProgress(id, j, "p1").label, /Unlock sync pending/);
  }
  for (const lesson of lessonGroups[1].lessons)
    assert.equal(lessonProgress(lesson.id, j, "p1").state, "pending");
  assert.deepEqual(tutorialConceptIds(j, "p1"), ["load", "bending", "support"]);
  assert.equal(JSON.stringify(j), before, "Reading never writes lesson state or timestamps");
});

test("missing, partial, duplicate, foreign, unstable and mismatched completion evidence stays pending", () => {
  const invalid = [
    journey(),
    journey([level("TUT_CONTRACT1")]),
    journey([level("TUT_CONTRACT1"), level("TUT_CONTRACT2", { status: "locked" })]),
    journey([level("TUT_CONTRACT1"), level("TUT_CONTRACT2"), level("TUT_CONTRACT2")]),
    journey([level("TUT_CONTRACT1", { stableId: false }), level("TUT_CONTRACT2")]),
    journey([
      level("TUT_CONTRACT1", {
        completion: { ...level("TUT_CONTRACT1").completion, playerId: "p2" },
      }),
      level("TUT_CONTRACT2"),
    ]),
    journey([level("TUT_CONTRACT1"), level("TUT_CONTRACT2", { regionId: "elsewhere" })]),
    journey([
      level("TUT_CONTRACT1", {
        completion: { ...level("TUT_CONTRACT1").completion, levelId: "wrong" },
      }),
      level("TUT_CONTRACT2"),
    ]),
  ];
  for (const j of invalid) assert.equal(lessonProgress("deadload", j, "p1").state, "pending");
  assert.equal(completedTutorial(tutorial()), false);
  assert.equal(completedTutorial(tutorial(), "p2"), false);
});

test("real per-player lesson states take precedence and unrelated contract concepts never grant lessons", () => {
  const j = tutorial();
  j.lessonRecords = [
    { lessonId: "deadload", state: "completed" },
    { lessonId: "LESSON004", state: "discovered" },
  ];
  assert.equal(lessonProgress("deadload", j, "p1").state, "completed");
  assert.equal(lessonProgress("LESSON004", j, "p1").state, "unlocked");
  const story = journey(
    ["ShopKeeper", "ReedsContract", "VancesContract", "SilasMainContract", "MainContractSilas"].map(
      (id) => level(id),
    ),
  );
  for (const lesson of catalog.lessons)
    assert.equal(lessonProgress(lesson.id, story, "p1").state, "pending");
  assert.deepEqual(tutorialConceptIds(story, "p1"), []);
});

test("popup concept illustrations reference the same authored catalog assets without creating introduction mappings", () => {
  assert.deepEqual(
    conceptIllustrations("load").map((l) => l.id),
    ["deadload", "LESSON001"],
  );
  for (const lesson of conceptIllustrations("load"))
    assert.equal(
      lesson,
      catalog.lessons.find((l) => l.id === lesson.id),
    );
  assert.equal(bridgeLesson(level("TUT_CONTRACT1")).id, "LESSON002");
  assert.equal(
    lessonGroups[0].lessons.some((l) => l.id === "LESSON002"),
    false,
  );
});
