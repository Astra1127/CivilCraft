import assert from "node:assert/strict";
import { test } from "node:test";
import source from "../src/lib/almanac/game-catalog.json" with { type: "json" };
import {
  lessons,
  lessonGroups,
  groupLessons,
  getLesson,
  lessonProgress,
  unmappedLessonIds,
  conceptIllustrations,
  bridgeLesson,
  popupConcepts,
} from "../src/lib/almanac/lesson-catalog.ts";

const completed = {
  regions: [
    {
      levels: [
        "TUT_CONTRACT1",
        "TUT_CONTRACT2",
        "ShopKeeper",
        "ReedsContract",
        "VancesContract",
        "SilasMainContract",
        "MainContractSilas",
      ].map((levelId) => ({
        levelId,
        regionId: "canyon_crossing",
        stableId: true,
        status: "completed",
        engineeringConceptIds: ["load", "tension", "bending"],
        completion: { levelId, regionId: "canyon_crossing", playerId: "p", status: "success" },
      })),
    },
  ],
};

test("partial documented stage order is explicit; original IDs/content remain intact and categories stay separate", () => {
  assert.deepEqual(
    lessonGroups.map((g) => g.id),
    [
      "bhan-initial",
      "bhan-truss",
      "reed-supply",
      "vance-direct",
      "silas-community",
      "silas-later",
      "brooks-market",
      "mills-equipment",
      "unmapped",
    ],
  );
  assert.deepEqual(
    lessonGroups.map((g) => g.lessons.map((l) => l.title)),
    [
      ["Dead Load", "Live Load"],
      ["What is Equilibrium"],
      ["Bending"],
      ["What is Tension", "What is Compression"],
      ["Load Distribution"],
      ["Load Transfer"],
      ["Moving Load"],
      ["Structural Failure"],
      ["Shear", "Material Stress", "Tension & Compression"],
    ],
  );
  for (const original of source.lessons) {
    const kept = getLesson(original.id);
    assert.equal(kept.id, original.id);
    assert.equal(kept.description, original.description);
    assert.equal(kept.image, original.image);
  }
  assert.equal(getLesson("LESSON002").category, "bridge-type");
  assert.equal(getLesson("LESSON004").category, "bridge-type");
  assert.ok(lessonGroups.every((g) => g.lessons.every((l) => l.category === "engineering")));
  assert.equal(
    lessonGroups.find((g) => g.id === "reed-supply").introductionLabel,
    "Introduced in Level 02",
  );
  assert.deepEqual(lessonGroups.find((g) => g.id === "brooks-market").contractIds, []);
});

test("neither completed tutorials nor story contracts grant encounter, discovery or completion", () => {
  const before = JSON.stringify(completed);
  for (const lesson of lessons) {
    assert.equal(lessonProgress(lesson.key, completed).state, "pending");
    assert.equal(lessonProgress(lesson.key, completed).canRead, false);
  }
  assert.equal(JSON.stringify(completed), before);
});

test("real discovery before any completion is accepted, explicit completion is distinct, duplicates remain pending", () => {
  const j = {
    regions: [],
    lessonRecords: [
      { lessonId: "deadload", state: "discovered" },
      { lessonId: "What is Equilibrium", state: "completed" },
    ],
  };
  const before = JSON.stringify(j);
  assert.equal(lessonProgress("deadload", j).state, "unlocked");
  assert.equal(lessonProgress("deadload", j).canRead, true);
  assert.equal(lessonProgress("What is Equilibrium", j).state, "completed");
  assert.equal(lessonProgress("LESSON001", j).state, "pending");
  assert.equal(
    lessonProgress("deadload", { lessonRecords: [j.lessonRecords[0], j.lessonRecords[0]] }).state,
    "pending",
  );
  assert.equal(JSON.stringify(j), before);
});

test("website catalog keys never become guessed game lesson IDs; unknown records remain safely unmapped", () => {
  const records = [
    { lessonId: "reference:load-transfer", state: "discovered" },
    { lessonId: "future-real-id", state: "completed" },
  ];
  assert.equal(getLesson("reference:load-transfer").id, "civil-craft-load-transfer-lesson-v1");
  assert.ok(getLesson("reference:load-transfer").description);
  assert.equal(
    lessonProgress("reference:load-transfer", { lessonRecords: records }).state,
    "pending",
  );
  assert.deepEqual(
    unmappedLessonIds({ lessonRecords: records }),
    records.map((r) => r.lessonId),
  );
  assert.equal(getLesson("future-real-id"), undefined);
  assert.deepEqual(popupConcepts(["future-real-id", "__proto__"]), []);
});

test("future stages, maps and lessons group without UI changes or invented numbered levels", () => {
  const future = {
    ...getLesson("deadload"),
    key: "future-key",
    id: "verified-future-id",
    stageId: "future-stage",
    title: "Verified future lesson",
    order: 15,
  };
  const groups = groupLessons(
    [future],
    [
      {
        id: "future-stage",
        title: "Verified future stage",
        order: 999,
        kind: "contract",
        contractIds: ["verified-future-contract"],
        mapId: "verified-future-map",
      },
    ],
  );
  assert.equal(groups[0].lessons[0], future);
  assert.doesNotMatch(groups[0].introductionLabel, /Level/);
  assert.equal(groupLessons([future], [])[0].id, "unmapped");
});

test("popup illustrations and educational previews resolve from the same catalog", () => {
  assert.deepEqual(
    conceptIllustrations("load").map((l) => l.id),
    ["deadload", "LESSON001"],
  );
  assert.equal(conceptIllustrations("bending")[0], getLesson("concept:bending"));
  assert.equal(popupConcepts(["tension"])[0].name, getLesson("What is Tension").title);
  assert.equal(bridgeLesson({ completion: { bridgeTypeId: "beam" } }).id, "LESSON002");
});
