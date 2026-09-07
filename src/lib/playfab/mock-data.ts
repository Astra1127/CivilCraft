import type {
  Achievement,
  EquippedCosmetics,
  AlmanacJourney,
  AlmanacLevel,
  LeaderboardEntry,
  PlayerCharacter,
  PlayerProfile,
  PlayerProgress,
  PlayerStatistic,
  Transaction,
} from "./types";

/**
 * DEMO DATA ONLY.
 *
 * Every value here is placeholder content used while PlayFab credentials are
 * not configured. It is served exclusively through the service layer in
 * `src/lib/playfab/index.ts`, so switching to live PlayFab requires no UI
 * changes. UI surfaces that render this data show a "Demo data" badge.
 */

export const mockProfile: PlayerProfile = {
  playFabId: "PF-DEMO-8F31A0C4",
  displayName: "Demo Engineer",
  email: "demo.engineer@example.com",
  createdAt: "2026-01-14T09:12:00.000Z",
  level: 12,
  xp: 4820,
  xpToNextLevel: 6000,
  totalScore: 18240,
  rank: 7,
  bridgesCompleted: 24,
  challengesCompleted: 31,
  achievementsUnlocked: 9,
  achievementsTotal: 18,
  lastActive: "2026-08-21T15:40:00.000Z",
};

export const mockCosmetics: EquippedCosmetics = {
  helmet: "Placeholder Hard Hat",
  hair: "Placeholder Hair",
  top: "Placeholder Field Shirt",
  vest: "Placeholder Safety Vest",
  pants: "Placeholder Work Pants",
  gloves: "Placeholder Work Gloves",
  shoes: "Placeholder Boots",
  accessory: "Placeholder Tool Belt",
};

/**
 * Placeholder character. The GAME is the source of truth: `portraitUrl` will
 * be a snapshot rendered by Civil Craft, and each item resolves from the
 * catalog by `itemId`. No portrait/art exists yet, so the UI falls back to the
 * generic engineer silhouette and slot icons.
 */
export const mockCharacter: PlayerCharacter = {
  equipped: [
    { itemId: "cos_helmet_placeholder", name: "Placeholder Hard Hat", slot: "helmet" },
    { itemId: "cos_hair_placeholder", name: "Placeholder Hair", slot: "hair" },
    { itemId: "cos_top_placeholder", name: "Placeholder Field Shirt", slot: "top" },
    { itemId: "cos_vest_placeholder", name: "Placeholder Safety Vest", slot: "vest" },
    { itemId: "cos_pants_placeholder", name: "Placeholder Work Pants", slot: "pants" },
    { itemId: "cos_gloves_placeholder", name: "Placeholder Work Gloves", slot: "gloves" },
    { itemId: "cos_shoes_placeholder", name: "Placeholder Boots", slot: "shoes" },
    { itemId: "cos_accessory_placeholder", name: "Placeholder Tool Belt", slot: "accessory" },
  ],
};

/**
 * No demo purchases: fabricating store products would misrepresent the game's
 * catalog. Real transactions arrive from the backend once it is connected.
 */
export const mockTransactions: Transaction[] = [];


export const mockStatistics: PlayerStatistic[] = [
  { name: "TotalScore", value: 18240 },
  { name: "BridgesCompleted", value: 24 },
  { name: "ChallengesCompleted", value: 31 },
  { name: "BestSingleBuildScore", value: 1980 },
  { name: "StructuralFailures", value: 11 },
];

export const mockProgress: PlayerProgress = {
  overallPercent: 46,
  storyPercent: 52,
  currentRegion: "Region 2 (placeholder)",
  regions: [
    {
      id: "region-1",
      name: "Region 1 (placeholder)",
      completed: true,
      missionsCompleted: 8,
      missionsTotal: 8,
      bestScore: 1980,
      stars: 3,
    },
    {
      id: "region-2",
      name: "Region 2 (placeholder)",
      completed: false,
      missionsCompleted: 5,
      missionsTotal: 10,
      bestScore: 1420,
      stars: 2,
    },
    {
      id: "region-3",
      name: "Region 3 (placeholder)",
      completed: false,
      missionsCompleted: 0,
      missionsTotal: 10,
      stars: 0,
    },
  ],
};

export const mockAchievements: Achievement[] = [
  {
    id: "first-bridge",
    name: "First Span",
    description: "Complete your first bridge build.",
    icon: "Hammer",
    unlocked: true,
    unlockedAt: "2026-01-15T10:04:00.000Z",
  },
  {
    id: "budget-keeper",
    name: "Budget Keeper",
    description: "Finish a contract under budget.",
    icon: "Wallet",
    unlocked: true,
    unlockedAt: "2026-02-02T18:22:00.000Z",
  },
  {
    id: "load-tested",
    name: "Load Tested",
    description: "Pass a load test without structural failure.",
    icon: "Weight",
    unlocked: true,
    unlockedAt: "2026-02-11T12:00:00.000Z",
  },
  {
    id: "region-one-clear",
    name: "Region Cleared",
    description: "Complete every mission in a region.",
    icon: "Map",
    unlocked: true,
    unlockedAt: "2026-03-01T08:30:00.000Z",
  },
  {
    id: "truss-master",
    name: "Truss Specialist",
    description: "Complete 10 truss bridge builds.",
    icon: "Triangle",
    unlocked: false,
    progress: 6,
    progressTarget: 10,
  },
  {
    id: "no-failure-streak",
    name: "Flawless Streak",
    description: "Complete 5 builds in a row without a failure.",
    icon: "Flame",
    unlocked: false,
    progress: 2,
    progressTarget: 5,
  },
  {
    id: "almanac-reader",
    name: "Field Researcher",
    description: "Read 10 Almanac entries.",
    icon: "BookOpen",
    unlocked: false,
    progress: 4,
    progressTarget: 10,
  },
  {
    id: "top-100",
    name: "Ranked Engineer",
    description: "Reach the global top 100.",
    icon: "Trophy",
    unlocked: true,
    unlockedAt: "2026-04-18T20:11:00.000Z",
  },
];

const names = [
  "BridgeBuilder01",
  "TrussTitan",
  "CantileverKid",
  "SpanSmith",
  "ArchAce",
  "LoadTester",
  "Demo Engineer",
  "BeamQueen",
  "RiverCrosser",
  "SteelScout",
  "CanyonCarver",
  "PylonPro",
  "DeckDesigner",
  "CableCraft",
  "GirderGuru",
];

export function mockLeaderboard(seed: number): LeaderboardEntry[] {
  return names.map((displayName, i) => ({
    rank: i + 1,
    playFabId: displayName === "Demo Engineer" ? mockProfile.playFabId : `PF-DEMO-${seed}${i}`,
    displayName,
    level: 20 - i + (seed % 3),
    score: 24000 - i * 1180 - seed * 37,
    updatedAt: "2026-08-21T12:00:00.000Z",
  }));
}

/* ----------------------------------------------------------- almanac ---- */

/**
 * DEMO journey. Region and level names follow the placeholder convention used
 * everywhere else in this file — real names, screenshots and scores come from
 * the game backend. Locked levels intentionally have no name (the game hides
 * them) and no completion record.
 */
function demoLevel(
  regionId: string,
  order: number,
  status: AlmanacLevel["status"],
  conceptIds: string[],
  completion?: { bridgeTypeId: string; score: number; completedAt: string; achievementId?: string },
): AlmanacLevel {
  const levelId = `${regionId}-lvl-${String(order).padStart(2, "0")}`;
  return {
    levelId,
    regionId,
    ...(status === "locked" ? {} : { levelName: `Placeholder Challenge ${String(order).padStart(2, "0")}` }),
    order,
    status,
    engineeringConceptIds: conceptIds,
    ...(completion
      ? {
          completion: {
            playerId: mockProfile.playFabId,
            levelId,
            regionId,
            status: "success" as const,
            ...completion,
          },
        }
      : {}),
  };
}

const region1: AlmanacLevel[] = [
  demoLevel("region-1", 1, "completed", ["load", "bending", "support"], {
    bridgeTypeId: "beam",
    score: 1240,
    completedAt: "2026-06-02T16:35:00.000Z",
    achievementId: "first-bridge",
  }),
  demoLevel("region-1", 2, "completed", ["load", "bending", "load-distribution"], {
    bridgeTypeId: "beam",
    score: 1310,
    completedAt: "2026-06-05T18:10:00.000Z",
  }),
  demoLevel("region-1", 3, "completed", ["tension", "compression", "stability"], {
    bridgeTypeId: "truss",
    score: 1480,
    completedAt: "2026-06-11T20:02:00.000Z",
  }),
  demoLevel("region-1", 4, "completed", ["tension", "compression", "load-distribution"], {
    bridgeTypeId: "truss",
    score: 1560,
    completedAt: "2026-06-18T09:48:00.000Z",
  }),
  demoLevel("region-1", 5, "completed", ["compression", "support"], {
    bridgeTypeId: "arch",
    score: 1620,
    completedAt: "2026-07-01T13:22:00.000Z",
    achievementId: "region-one-clear",
  }),
];

const region2: AlmanacLevel[] = [
  demoLevel("region-2", 6, "completed", ["compression", "load-distribution", "support"], {
    bridgeTypeId: "arch",
    score: 1705,
    completedAt: "2026-07-14T11:05:00.000Z",
  }),
  demoLevel("region-2", 7, "completed", ["tension", "shear", "stability"], {
    bridgeTypeId: "truss",
    score: 1750,
    completedAt: "2026-07-28T17:40:00.000Z",
  }),
  demoLevel("region-2", 8, "completed", ["tension", "compression", "load-distribution"], {
    bridgeTypeId: "truss",
    score: 1820,
    completedAt: "2026-08-21T14:20:00.000Z",
  }),
  demoLevel("region-2", 9, "current", ["load", "structural-failure", "stability"]),
  demoLevel("region-2", 10, "locked", ["load-distribution"]),
];

const region3: AlmanacLevel[] = [
  demoLevel("region-3", 11, "locked", ["compression"]),
  demoLevel("region-3", 12, "locked", ["tension"]),
  demoLevel("region-3", 13, "locked", ["load-distribution"]),
];

export const mockJourney: AlmanacJourney = (() => {
  const regions = [
    { regionId: "region-1", name: "Region 1 (placeholder)", status: "completed" as const, levels: region1 },
    { regionId: "region-2", name: "Region 2 (placeholder)", status: "current" as const, levels: region2 },
    { regionId: "region-3", name: "Region 3 (placeholder)", status: "locked" as const, levels: region3 },
  ];
  const levels = regions.flatMap((r) => r.levels);
  const completed = levels.filter((l) => l.status === "completed");
  return {
    regions,
    levelsCompleted: completed.length,
    levelsTotal: levels.length,
    journeyPercent: Math.round((completed.length / Math.max(levels.length, 1)) * 100),
    discoveredBridgeTypeIds: Array.from(
      new Set(completed.map((l) => l.completion?.bridgeTypeId).filter((b): b is string => !!b)),
    ),
  };
})();
