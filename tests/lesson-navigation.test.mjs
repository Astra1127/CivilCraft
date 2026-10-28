import assert from "node:assert/strict";
import { test } from "node:test";
import {
  engineeringLesson,
  lessonIdentifier,
  lessonAnchorId,
  levelLessonRows,
} from "../src/lib/almanac/lesson-navigation.ts";

test("Tutorial 1 lists verified load lessons and pending Support, never Bending from generic records", () => {
  const level = { levelId: "TUT_CONTRACT1", engineeringConceptIds: ["load", "bending", "support"] };
  const before = JSON.stringify(level);
  const rows = levelLessonRows(level);
  assert.deepEqual(
    rows.map((r) => r.title),
    ["Dead Load", "Live Load", "Support"],
  );
  assert.deepEqual(
    rows.map((r) => r.lessonId),
    ["deadload", "LESSON001", undefined],
  );
  assert.equal(JSON.stringify(level), before);
});
test("verified story introductions link to existing Engineering cards, not generic unrelated concepts", () => {
  const reed = levelLessonRows({
    levelId: "ReedsContract",
    engineeringConceptIds: ["load", "support", "bending"],
  });
  assert.deepEqual(
    reed.map((r) => r.lessonId),
    ["concept:bending"],
  );
  assert.deepEqual(
    levelLessonRows({ levelId: "Reed's Contract", engineeringConceptIds: [] }).map(
      (r) => r.lessonId,
    ),
    ["concept:bending"],
  );
  assert.deepEqual(
    levelLessonRows({ levelId: "VancesContract", engineeringConceptIds: [] }).map(
      (r) => r.lessonId,
    ),
    ["What is Tension", "What is Compression"],
  );
  assert.equal(
    levelLessonRows({ levelId: "MainContractSilas", engineeringConceptIds: [] })[0].lessonId,
    undefined,
  );
});
test("unknown stages and unavailable Engineering entries produce pending rows without broken links", () => {
  assert.equal(
    levelLessonRows({ levelId: "unverified", engineeringConceptIds: ["tension"] })[0].lessonId,
    undefined,
  );
  for (const id of [undefined, "", "unknown", "LESSON002", "reference:load-transfer"])
    assert.equal(engineeringLesson(id), undefined);
  const lesson = engineeringLesson("concept:bending");
  assert.equal(lessonIdentifier(lesson), "concept:bending");
  assert.equal(lessonAnchorId("What is Tension"), "engineering-lesson-What%20is%20Tension");
});
