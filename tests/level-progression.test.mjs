import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAlmanacProgress } from "../src/lib/playfab/almanac.ts";
import {
  verifiedLevelCompletion,
  levelStageLabel,
  completionDate,
} from "../src/lib/playfab/level-records.ts";
import { findNotificationLevel } from "../src/lib/playfab/notification-navigation.ts";
const rawLevel = (overrides = {}) => ({
  levelId: "ShopKeeper",
  levelName: "ShopKeeperContract",
  order: 4,
  status: "completed",
  completion: { score: 3, bridgeTypeId: "beam", completedAt: "" },
  ...overrides,
});
const journey = (levels) =>
  parseAlmanacProgress(
    JSON.stringify({ regions: [{ regionId: "canyon_crossing", status: "current", levels }] }),
  );
const first = (level) => journey([level]).regions[0].levels[0];
test("incomplete definitions and empty/failed/mismatched completion payloads do not become completions", () => {
  for (const status of ["locked", "current", "unknown"]) {
    const level = first(rawLevel({ status }));
    assert.equal(level.completion, undefined);
    assert.equal(verifiedLevelCompletion(level, "p1"), false);
  }
  for (const completion of [
    {},
    { score: 0, bridgeTypeId: "" },
    [],
    { status: "failed", score: 3, bridgeTypeId: "beam" },
    { status: "success", levelId: "another-level" },
    { status: "success", regionId: "another-region" },
  ]) {
    const level = first(rawLevel({ completion }));
    assert.equal(level.completion, undefined);
    assert.equal(verifiedLevelCompletion(level, "p1"), false);
  }
});
test("verified undated completions retain stable targets without creating a date", () => {
  const j = journey([rawLevel()]);
  const level = j.regions[0].levels[0];
  assert.equal(verifiedLevelCompletion(level, "p1"), true);
  assert.equal(level.completion.completedAt, "");
  assert.equal(findNotificationLevel(j, "p1", "ShopKeeper", "canyon_crossing"), level);
  assert.equal(levelStageLabel(level), "Level 01");
  for (const date of ["not-a-date", "0", "", null])
    assert.equal(
      first(rawLevel({ completion: { score: 3, bridgeTypeId: "beam", completedAt: date } }))
        .completion.completedAt,
      "",
    );
  assert.equal(completionDate("2026-10-01T12:00:00Z"), "2026-10-01T12:00:00Z");
});
test("only numbered story metadata determines stage order; raw IDs, catalog order and statuses stay intact", () => {
  const levels = [
    rawLevel({ levelId: "MainContractSilas", order: 1, status: "current" }),
    rawLevel(),
    rawLevel({ levelId: "TUT_CONTRACT2", order: 6, status: "locked" }),
    rawLevel({ levelId: "TUT_CONTRACT1", order: 5, status: "locked" }),
    rawLevel({ levelId: "MarshID", order: 2, status: "locked" }),
  ];
  const j = journey(levels);
  const result = j.regions[0].levels;
  assert.deepEqual(
    result.map((l) => l.levelId),
    ["TUT_CONTRACT1", "TUT_CONTRACT2", "ShopKeeper", "MainContractSilas", "MarshID"],
  );
  assert.deepEqual(result.slice(0, 3).map(levelStageLabel), [
    "Tutorial 1 (Level 00)",
    "Tutorial 2 (Level 00)",
    "Level 01",
  ]);
  assert.equal(result[2].order, 4);
  assert.equal(result[3].order, 1);
  assert.equal(result[3].status, "current");
  assert.equal(levelStageLabel(result[3]), "Level 05");
  assert.equal(findNotificationLevel(j, "p1", "ShopKeeper", "canyon_crossing"), result[2]);
  assert.equal(first(rawLevel({ levelId: "ShopKeeperContract" })).stageOrder, 1);
  assert.equal(first(rawLevel({ levelId: "custom", order: 99 })).stageOrder, undefined);
  assert.equal(first(rawLevel({ levelId: "custom", stageOrder: 7, order: 99 })).stageOrder, 7);
});
test("fallback IDs and foreign-player or duplicate completions cannot resolve as player targets", () => {
  const missing = first(rawLevel({ levelId: undefined }));
  assert.equal(verifiedLevelCompletion(missing, "p1"), false);
  const j = journey([rawLevel({ completion: { status: "success", playerId: "p2" } })]);
  assert.equal(findNotificationLevel(j, "p1", "ShopKeeper", "canyon_crossing"), undefined);
  assert.ok(findNotificationLevel(j, "p2", "ShopKeeper", "canyon_crossing"));
  assert.equal(
    findNotificationLevel(journey([rawLevel(), rawLevel()]), "p1", "ShopKeeper", "canyon_crossing"),
    undefined,
  );
});

test("tutorials remain completed and navigable without consuming Story Mode stages", () => {
  const j = journey([
    rawLevel({ levelId: "TUT_CONTRACT2", stageOrder: 2 }),
    rawLevel({ levelId: "ShopKeeperContract", stageOrder: 3 }),
    rawLevel({ levelId: "TUT_CONTRACT1", stageOrder: 1 }),
    rawLevel({ levelId: "verified-next-story", stageOrder: 2, status: "current" }),
  ]);
  const levels = j.regions[0].levels;
  assert.deepEqual(levels.map(levelStageLabel), [
    "Tutorial 1 (Level 00)",
    "Tutorial 2 (Level 00)",
    "Level 01",
    "Level 02",
  ]);
  assert.equal(levels[0].stageOrder, undefined);
  assert.equal(levels[1].stageOrder, undefined);
  assert.equal(levels[2].stageOrder, 1);
  assert.equal(levels[3].status, "current");
  for (const tutorial of levels.slice(0, 2)) {
    assert.ok(tutorial.completion);
    assert.equal(tutorial.status, "completed");
    assert.equal(findNotificationLevel(j, "p1", tutorial.levelId, "canyon_crossing"), tutorial);
  }
  assert.equal(levelStageLabel({ ...levels[0], stageOrder: 1 }), "Tutorial 1 (Level 00)");
  assert.equal(levelStageLabel({ ...levels[2], stageOrder: 3 }), "Level 01");
  assert.equal(
    levelStageLabel(first(rawLevel({ levelId: "unknown-story", order: 2 }))),
    "Contract",
  );
});
