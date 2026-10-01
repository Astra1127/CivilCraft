import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DASHBOARD_USER_DATA_KEYS,
  parseAchievementProgress,
  parseEquippedCosmetics,
  parseMapProgress,
} from "../src/lib/playfab/player.ts";
import { parseAlmanacProgress, EMPTY_JOURNEY } from "../src/lib/playfab/almanac.ts";
import { CIVIL_CRAFT_TITLE_ID } from "../src/lib/playfab/config.ts";
import { TRACKED_STATISTIC_KEYS } from "../src/lib/playfab/types.ts";

// -------------------------------------------------------------
// Test 1: User Data Keys Specification
// -------------------------------------------------------------
test("1. DASHBOARD_USER_DATA_KEYS contains all 11 required Cloud Script syncDashboardV1 keys", () => {
  const expectedKeys = [
    "CurrentLevel",
    "XP",
    "XPToNextLevel",
    "CurrentRegion",
    "AchievementsUnlocked",
    "AchievementsTotal",
    "MapProgress",
    "AchievementProgress",
    "EquippedCosmetics",
    "AlmanacProgress",
    "CharacterSyncedAt",
  ];

  for (const key of expectedKeys) {
    assert.ok(
      DASHBOARD_USER_DATA_KEYS.includes(key as any),
      `Expected DASHBOARD_USER_DATA_KEYS to include '${key}'`,
    );
  }

  // Ensure full player-save file keys are NOT in the dashboard query keys
  assert.equal(DASHBOARD_USER_DATA_KEYS.includes("SaveData" as any), false);
  assert.equal(DASHBOARD_USER_DATA_KEYS.includes("GameSave" as any), false);
  assert.equal(DASHBOARD_USER_DATA_KEYS.includes("EncryptedSave" as any), false);
});

// -------------------------------------------------------------
// Test 2: Statistics Keys Specification
// -------------------------------------------------------------
test("2. TRACKED_STATISTIC_KEYS includes TotalScore, BridgesCompleted, ChallengesCompleted, and BestSingleBuildScore", () => {
  assert.ok(TRACKED_STATISTIC_KEYS.includes("TotalScore" as any));
  assert.ok(TRACKED_STATISTIC_KEYS.includes("BridgesCompleted" as any));
  assert.ok(TRACKED_STATISTIC_KEYS.includes("ChallengesCompleted" as any));
  assert.ok(TRACKED_STATISTIC_KEYS.includes("BestSingleBuildScore" as any));
});

// -------------------------------------------------------------
// Test 3: Safe Parsing of MapProgress
// -------------------------------------------------------------
test("3. parseMapProgress safely parses object, array, empty, and malformed inputs", () => {
  // A. Full object format
  const validJson = JSON.stringify({
    overallPercent: 65,
    storyPercent: 50,
    currentRegion: "River Bend",
    regions: [
      {
        id: "pine_valley",
        name: "Pine Valley",
        completed: true,
        missionsCompleted: 5,
        missionsTotal: 5,
        bestScore: 24000,
        stars: 15,
      },
      {
        id: "river_bend",
        name: "River Bend",
        completed: false,
        missionsCompleted: 2,
        missionsTotal: 6,
        bestScore: 11000,
        stars: 4,
      },
    ],
  });

  const parsedA = parseMapProgress(validJson);
  assert.equal(parsedA.overallPercent, 65);
  assert.equal(parsedA.storyPercent, 50);
  assert.equal(parsedA.currentRegion, "River Bend");
  assert.equal(parsedA.regions.length, 2);
  assert.equal(parsedA.regions[0]!.completed, true);
  assert.equal(parsedA.regions[0]!.bestScore, 24000);

  // B. Array-only format
  const arrayJson = JSON.stringify([
    { id: "reg_1", name: "Tutorial", completed: true, missionsCompleted: 3, missionsTotal: 3 },
  ]);
  const parsedB = parseMapProgress(arrayJson, "Tutorial");
  assert.equal(parsedB.overallPercent, 100);
  assert.equal(parsedB.currentRegion, "Tutorial");
  assert.equal(parsedB.regions.length, 1);

  // C. Empty or undefined
  const parsedC = parseMapProgress(undefined, "Default Region");
  assert.equal(parsedC.overallPercent, 0);
  assert.equal(parsedC.currentRegion, "Default Region");
  assert.deepEqual(parsedC.regions, []);

  // D. Malformed JSON
  const parsedD = parseMapProgress("{{invalid json;;;", "Fallback Region");
  assert.equal(parsedD.overallPercent, 0);
  assert.equal(parsedD.currentRegion, "Fallback Region");
  assert.deepEqual(parsedD.regions, []);
});

// -------------------------------------------------------------
// Test 4: Safe Parsing of AchievementProgress
// -------------------------------------------------------------
test("4. parseAchievementProgress safely handles array, dictionary, wrapped object, and corrupt JSON", () => {
  // A. Array format
  const arrayJson = JSON.stringify([
    {
      id: "ach_first_bridge",
      name: "First Span",
      description: "Build your first bridge crossing",
      icon: "hammer",
      unlocked: true,
      unlockedAt: "2026-09-30T10:00:00Z",
    },
    {
      id: "ach_master_builder",
      name: "Master Builder",
      description: "Construct 50 bridges",
      unlocked: false,
      progress: 12,
      progressTarget: 50,
    },
  ]);
  const parsedA = parseAchievementProgress(arrayJson);
  assert.equal(parsedA.length, 2);
  assert.equal(parsedA[0]!.name, "First Span");
  assert.equal(parsedA[0]!.unlocked, true);
  assert.equal(parsedA[0]!.unlockedAt, "2026-09-30T10:00:00Z");
  assert.equal(parsedA[1]!.unlocked, false);
  assert.equal(parsedA[1]!.progress, 12);
  assert.equal(parsedA[1]!.progressTarget, 50);

  // B. Dictionary format
  const dictJson = JSON.stringify({
    ach_steel_expert: {
      name: "Steel Expert",
      description: "Use steel members in 10 bridges",
      unlocked: true,
    },
  });
  const parsedB = parseAchievementProgress(dictJson);
  assert.equal(parsedB.length, 1);
  assert.equal(parsedB[0]!.id, "ach_steel_expert");
  assert.equal(parsedB[0]!.name, "Steel Expert");
  assert.equal(parsedB[0]!.unlocked, true);

  // C. Wrapped object format
  const wrappedJson = JSON.stringify({
    achievements: [
      { id: "ach_speedy", name: "Speedy Construction", unlocked: true },
    ],
  });
  const parsedC = parseAchievementProgress(wrappedJson);
  assert.equal(parsedC.length, 1);
  assert.equal(parsedC[0]!.name, "Speedy Construction");

  // D. Empty and malformed
  assert.deepEqual(parseAchievementProgress(undefined), []);
  assert.deepEqual(parseAchievementProgress(""), []);
  assert.deepEqual(parseAchievementProgress("not-json"), []);
});

// -------------------------------------------------------------
// Test 5: Safe Parsing of EquippedCosmetics
// -------------------------------------------------------------
test("5. parseEquippedCosmetics safely parses dictionary, array, and string slot maps", () => {
  // A. Dictionary format
  const dictJson = JSON.stringify({
    helmet: "hard_hat_gold",
    vest: "high_vis_orange",
    shoes: "steel_toe_boots",
  });
  const parsedA = parseEquippedCosmetics(dictJson);
  assert.equal(parsedA.length, 3);
  const helmet = parsedA.find((c) => c.slot === "helmet");
  assert.ok(helmet);
  assert.equal(helmet.itemId, "hard_hat_gold");

  // B. Dictionary of objects
  const dictObjJson = JSON.stringify({
    top: { itemId: "flannel_shirt", name: "Red Flannel Shirt", rarity: "rare" },
  });
  const parsedB = parseEquippedCosmetics(dictObjJson);
  assert.equal(parsedB.length, 1);
  assert.equal(parsedB[0]!.slot, "top");
  assert.equal(parsedB[0]!.itemId, "flannel_shirt");
  assert.equal(parsedB[0]!.name, "Red Flannel Shirt");
  assert.equal(parsedB[0]!.rarity, "rare");

  // C. Array format
  const arrayJson = JSON.stringify([
    { slot: "accessory", itemId: "wrench_golden", name: "Golden Wrench" },
  ]);
  const parsedC = parseEquippedCosmetics(arrayJson);
  assert.equal(parsedC.length, 1);
  assert.equal(parsedC[0]!.slot, "accessory");
  assert.equal(parsedC[0]!.itemId, "wrench_golden");

  // D. Empty and corrupt
  assert.deepEqual(parseEquippedCosmetics(undefined), []);
  assert.deepEqual(parseEquippedCosmetics("{bad:json]"), []);
});

// -------------------------------------------------------------
// Test 6: Safe Parsing of AlmanacProgress
// -------------------------------------------------------------
test("6. parseAlmanacProgress safely parses complete journey, levels, materials, and handles missing data", () => {
  const journeyJson = JSON.stringify({
    regions: [
      {
        regionId: "region_1",
        name: "Valley Crossing",
        status: "completed",
        levels: [
          {
            levelId: "lvl_101",
            levelName: "First Gorge",
            order: 1,
            status: "completed",
            engineeringConceptIds: ["triangulation", "tension"],
            completion: {
              playerId: "PLAYER_1",
              levelId: "lvl_101",
              regionId: "region_1",
              bridgeTypeId: "truss",
              score: 18500,
              status: "success",
              completionScreenshotUrl: "https://blob.civilcraft.internal/shots/lvl_101.jpg",
              completedAt: "2026-09-30T14:22:00Z",
              achievementId: "ach_first_bridge",
            },
          },
        ],
      },
    ],
    discoveredBridgeTypeIds: ["truss"],
    discoveredMaterials: ["wood_beam", "steel_cable"],
  });

  const parsed = parseAlmanacProgress(journeyJson);
  assert.equal(parsed.regions.length, 1);
  assert.equal(parsed.levelsCompleted, 1);
  assert.equal(parsed.levelsTotal, 1);
  assert.equal(parsed.journeyPercent, 100);
  assert.deepEqual(parsed.discoveredBridgeTypeIds, ["truss"]);
  assert.deepEqual(parsed.discoveredMaterials, ["wood_beam", "steel_cable"]);

  const level = parsed.regions[0]!.levels[0]!;
  assert.equal(level.levelName, "First Gorge");
  assert.ok(level.completion);
  assert.equal(level.completion.score, 18500);
  assert.equal(level.completion.bridgeTypeId, "truss");
  assert.equal(level.completion.completionScreenshotUrl, "https://blob.civilcraft.internal/shots/lvl_101.jpg");

  // Empty and corrupt
  assert.deepEqual(parseAlmanacProgress(undefined), EMPTY_JOURNEY);
  assert.deepEqual(parseAlmanacProgress(""), EMPTY_JOURNEY);
  assert.deepEqual(parseAlmanacProgress("not json"), EMPTY_JOURNEY);
});

// -------------------------------------------------------------
// Test 7: Frontend Title ID is public and Secret Key is protected
// -------------------------------------------------------------
test("7. PlayFab Title ID is public and accessible in frontend config; Secret Key is not bundled", () => {
  assert.equal(CIVIL_CRAFT_TITLE_ID, "17FA03");
  // Secret key must never be exported in config or client
  assert.equal(process.env["PLAYFAB_SECRET_KEY"], undefined);
});
