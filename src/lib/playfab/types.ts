/**
 * Typed data models for the PlayFab integration layer.
 *
 * PlayFab is the SOURCE OF TRUTH for all player/game data. Nothing in this
 * folder may be replaced by a website database. Website-only content (news,
 * gallery, FAQ, messages, releases) lives in `src/lib/cms`.
 */

export type PlayerRole = "player" | "admin";

/** Moderation state owned by the backend. Never derived from activity. */
export type AccountStatus = "active" | "suspended" | "banned";

/** Automatically derived from `lastActive`. Never manually editable. */
export type ActivityStatus = "recently_active" | "inactive";

export interface PlayerIdentity {
  playFabId: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  createdAt?: string | undefined;
  role?: PlayerRole;
  isAdmin?: boolean;
}

export interface PlayerProfile extends PlayerIdentity {
  level: number | null;
  xp: number | null;
  xpToNextLevel: number | null;
  totalScore: number | null;
  bridgesCompleted: number | null;
  challengesCompleted: number | null;
  achievementsUnlocked: number | null;
  achievementsTotal: number | null;
  lastActive?: string | undefined;
  /** Moderation state from the backend. Unavailable when absent. */
  accountStatus?: AccountStatus;
  /** Optional game summary fields — only rendered when the backend supplies them. */
  currentRegion?: string;
  storyPercent?: number;
  lastChallenge?: string;
  mostUsedBridgeType?: string;
}

/** Cosmetics are read-only on the website; equipping happens in the Unity game. */
export interface EquippedCosmetics {
  helmet?: string;
  hair?: string;
  top?: string;
  vest?: string;
  pants?: string;
  gloves?: string;
  shoes?: string;
  accessory?: string;
}

export interface PlayerStatistic {
  name: string;
  value: number;
  /** PlayFab statistic version, when supplied. */
  version?: number;
}

export interface RegionProgress {
  id: string;
  name: string;
  completed: boolean;
  missionsCompleted: number;
  missionsTotal: number;
  bestScore?: number;
  stars?: number;
}

export interface PlayerProgress {
  overallPercent: number;
  storyPercent: number;
  currentRegion: string | null;
  regions: RegionProgress[];
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: string;
  progress?: number;
  progressTarget?: number;
}

export type LeaderboardWindow = "weekly" | "all-time";

export interface LeaderboardEntry {
  rank: number;
  playFabId: string;
  displayName: string;
  level: number | null;
  score: number;
  updatedAt?: string;
}

export interface PlayFabStatus {
  configured: boolean;
  titleIdMasked: string | null;
  mode: "live" | "mock";
  lastCheckedAt: string | null;
}

/* ------------------------------------------------- character & cosmetics */

export type CosmeticSlot =
  "helmet" | "hair" | "top" | "vest" | "pants" | "gloves" | "shoes" | "accessory";

/** A single equipped cosmetic, resolved from the game item catalog. */
export interface CosmeticItem {
  /** Catalog item id in the game backend. */
  itemId: string;
  name: string;
  slot: CosmeticSlot;
  /** Catalog thumbnail. Absent until real catalog art is wired up. */
  imageUrl?: string;
  rarity?: string;
}

/**
 * The player's in-game character as rendered by the GAME, not the website.
 * `portraitUrl` is a snapshot/pre-render supplied by the backend; when it is
 * missing the UI falls back to a generic Civil Craft engineer silhouette.
 */
export interface PlayerCharacter {
  portraitUrl?: string;
  /** Timestamp of the last character sync from the game. */
  syncedAt?: string;
  equipped: CosmeticItem[];
}

/* --------------------------------------------------------- transactions */

export type TransactionStatus = "completed" | "pending" | "refunded";
export type TransactionType = "purchase" | "reward" | "refund";

export interface Transaction {
  transactionId: string;
  playerId: string;
  itemId: string;
  itemName: string;
  itemCategory: string;
  itemSlot?: CosmeticSlot;
  itemImageUrl?: string;
  amount: number;
  currency: string;
  quantity?: number;
  type: TransactionType;
  status: TransactionStatus;
  paymentMethod?: string;
  createdAt: string;
  /** Live inventory flags — sourced from the game, never inferred here. */
  owned?: boolean;
  equipped?: boolean;
}

/* ----------------------------------------------------- almanac / journey */

export type LevelStatus = "completed" | "current" | "locked";

/**
 * A player's successful completion of a level. The GAME is the source of
 * truth: it captures the final bridge screenshot, uploads it to file storage
 * and stores the resulting URL on the backend record. Failed attempts and
 * retries are intentionally NOT modelled here — the Almanac preserves the
 * final, successful build only.
 */
export interface PlayerLevelCompletion {
  playerId: string;
  levelId: string;
  regionId: string;
  bridgeTypeId: string;
  score: number;
  status: "success";
  /** Cloud/file-storage URL of the player's completed bridge. Never a blob. */
  completionScreenshotUrl?: string;
  completedAt: string;
  /** Set only when the backend confirms an achievement unlocked here. */
  achievementId?: string;
}

/** Level content: game-owned structure, website-owned educational annotation. */
export interface AlmanacLevel {
  levelId: string;
  regionId: string;
  /** Absent while the level is still hidden by the game. */
  levelName?: string;
  order: number;
  status: LevelStatus;
  /** Engineering concepts encountered in this level (Almanac/CMS content). */
  engineeringConceptIds: string[];
  completion?: PlayerLevelCompletion;
}

export interface AlmanacRegion {
  regionId: string;
  name: string;
  status: LevelStatus;
  levels: AlmanacLevel[];
}

export interface AlmanacJourney {
  regions: AlmanacRegion[];
  levelsCompleted: number;
  levelsTotal: number;
  journeyPercent: number;
  /** Bridge type ids the player has actually used to complete a level. */
  discoveredBridgeTypeIds: string[];
  /** Stable material IDs written by the game in AlmanacProgress. Never granted by the website. */
  discoveredMaterials: string[];
}

/* --------------------------------------------------------- notifications */

export type NotificationKind = "achievement" | "level" | "cosmetic" | "release" | "announcement";

/**
 * A backend-driven player notification. The website never invents these —
 * every entry is derived from a real game/backend event (achievement unlock,
 * level completion, cosmetic grant, published build, announcement).
 */
export interface PlayerNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  description?: string;
  createdAt: string;
  read: boolean;
}

/* -------------------------------------------------------- auth (PlayFab) */

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
}

/** Result of a registration attempt; mirrors PlayFab's verification flow. */
export interface RegisterResult {
  email: string;
  /** True when the backend requires the player to confirm their email first. */
  verificationRequired: boolean;
}

/* ------------------------------------------------------------- inventory */

/**
 * Cosmetic OWNERSHIP, which is a different concept from what is EQUIPPED.
 * PlayFab inventory owns the ids; `PlayerCharacter.equipped` only describes
 * what the game is currently rendering on the character.
 */
export interface PlayerInventory {
  /** Catalog item ids the player owns (purchases, rewards, grants). */
  ownedItemIds: string[];
  /** Catalog item ids currently equipped, keyed by cosmetic slot. */
  equippedItemIds: Partial<Record<CosmeticSlot, string>>;
  /** Last time the game synced inventory to the backend. */
  syncedAt?: string;
}

/* ---------------------------------------------------- gameplay statistics */

/**
 * Statistic keys the WEBSITE is allowed to display. Each one must exist as a
 * PlayFab player statistic tracked by the Unity game — never invent a new key
 * here to fill out a UI. Add a key only after the game reports it.
 */
export const TRACKED_STATISTIC_KEYS = [
  "TotalScore",
  "BridgesCompleted",
  "ChallengesCompleted",
  "BestBuildScore",
] as const;

export type TrackedStatisticKey = (typeof TRACKED_STATISTIC_KEYS)[number];
