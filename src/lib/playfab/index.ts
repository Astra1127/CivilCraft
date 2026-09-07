/**
 * PlayFab service layer — Civil Craft title 17FA03.
 *
 * ALL player/game data access in the app goes through these services. They
 * talk to the PlayFab Client API directly from the browser (Title ID only,
 * never the secret key). Administrator features that require the Developer
 * Secret Key run through server endpoints in `admin.functions.ts`.
 *
 * Demo/placeholder data is only used when VITE_PLAYFAB_DEMO=true, and is
 * always labelled in the UI.
 */
import { getJourney as fetchJourney, EMPTY_JOURNEY } from "./almanac";
import {
  loginPlayer,
  registerPlayer,
  requestPasswordReset as sendRecoveryEmail,
  getStoredPlayer,
  signOutPlayer,
} from "./auth";
import {
  PlayFabError,
  clearSession,
  currentSessionTicket,
  readSession,
  writeSession,
  type AuthScope,
  type PlayFabSession,
} from "./client";
import { demoMode, playFabConfig } from "./config";
import { getInventory as fetchInventory, getVirtualCurrency } from "./inventory";
import { getLeaderboard as fetchLeaderboard, getPlayerRank as fetchPlayerRank } from "./leaderboard";
import {
  mockAchievements,
  mockCharacter,
  mockCosmetics,
  mockJourney,
  mockLeaderboard,
  mockProfile,
  mockProgress,
  mockStatistics,
  mockTransactions,
} from "./mock-data";
import {
  getEquippedCosmetics as fetchEquipped,
  getPlayerCharacter,
  getPlayerData,
  getPlayerProfile as fetchProfile,
  getPlayerProgress,
  jsonFrom,
} from "./player";
import { getPlayerStatistics as fetchStatistics } from "./statistics";
import { getTransactions as fetchTransactions } from "./transactions";
import type {
  AccountStatus,
  Achievement,
  ActivityStatus,
  EquippedCosmetics,
  AlmanacJourney,
  LeaderboardEntry,
  LeaderboardWindow,
  PlayFabStatus,
  PlayerCharacter,
  PlayerIdentity,
  PlayerInventory,
  PlayerNotification,
  PlayerProfile,
  PlayerRole,
  PlayerProgress,
  PlayerStatistic,
  RegisterInput,
  RegisterResult,
  Transaction,
} from "./types";

export * from "./types";
export { PlayFabError, playFabConfig, demoMode, getVirtualCurrency };
export type { AuthScope, PlayFabSession };

const TITLE_ID = playFabConfig.titleId;

/** The title is always configured — the Civil Craft Title ID ships with the app. */
export const playFabConfigured = TITLE_ID.length > 0;
/** True only in explicit development/demo mode. */
export const usingMockData = demoMode;

export function getPlayFabStatus(): PlayFabStatus {
  return {
    configured: playFabConfigured,
    titleIdMasked: TITLE_ID,
    mode: demoMode ? "mock" : "live",
    lastCheckedAt: new Date().toISOString(),
  };
}

const latency = (ms = 220) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ auth */

export interface LoginInput {
  /** PlayFab accepts either the player's email address or their username. */
  email: string;
  password: string;
  /** Which portal the credentials were submitted through. */
  scope?: AuthScope;
}

/** Password policy mirrored from the game's PlayFab configuration. */
export const passwordRules = [
  { id: "length", label: "At least 8 characters", test: (v: string) => v.length >= 8 },
  { id: "upper", label: "One uppercase letter", test: (v: string) => /[A-Z]/.test(v) },
  { id: "lower", label: "One lowercase letter", test: (v: string) => /[a-z]/.test(v) },
  { id: "number", label: "One number", test: (v: string) => /[0-9]/.test(v) },
];

export function passwordIsValid(value: string) {
  return passwordRules.every((r) => r.test(value));
}

export const authService = {
  /**
   * Player sign-in against the real Civil Craft PlayFab title. Administrator
   * sign-in is a SEPARATE flow handled server-side (`adminLogin`).
   */
  async login({ email, password, scope = "player" }: LoginInput): Promise<PlayerIdentity> {
    if (scope === "admin") {
      throw new Error("Administrators sign in through the administrator portal.");
    }
    if (demoMode) {
      await latency();
      const identity: PlayerIdentity = {
        playFabId: mockProfile.playFabId,
        displayName: mockProfile.displayName,
        email: email.trim(),
        createdAt: mockProfile.createdAt,
        role: "player",
        isAdmin: false,
      };
      writeSession("player", { identity, sessionTicket: "demo" });
      return identity;
    }
    return loginPlayer(email, password);
  },

  /** PlayFab RegisterPlayFabUser. The backend owns email verification. */
  async register({ username, email, password }: RegisterInput): Promise<RegisterResult> {
    if (!passwordIsValid(password)) {
      throw new Error("Password does not meet the requirements.");
    }
    if (username.trim().length < 3) {
      throw new Error("Username must be at least 3 characters.");
    }
    if (demoMode) {
      await latency(400);
      return { email: email.trim(), verificationRequired: true };
    }
    return registerPlayer({ username, email, password });
  },

  /** PlayFab SendAccountRecoveryEmail. Players only. */
  async requestPasswordReset(email: string): Promise<void> {
    if (!email.trim()) throw new Error("Enter the email address on your account.");
    if (demoMode) {
      await latency(400);
      return;
    }
    await sendRecoveryEmail(email);
  },

  setSession(identity: PlayerIdentity, scope: AuthScope): void {
    const existing = readSession(scope);
    writeSession(scope, { ...(existing ?? { sessionTicket: "" }), identity });
  },

  /** Restores the persisted session for one portal. */
  getCurrentUser(scope: AuthScope = "player"): PlayerIdentity | null {
    if (scope === "admin") {
      const session = readSession("admin");
      if (!session?.adminToken) return null;
      return session.identity;
    }
    return getStoredPlayer();
  },

  /** Server-issued administrator token; required by every admin endpoint. */
  getAdminToken(): string | null {
    return readSession("admin")?.adminToken ?? null;
  },

  storeAdminSession(identity: PlayerIdentity, token: string): void {
    writeSession("admin", { identity, sessionTicket: "", adminToken: token });
  },

  getRole(identity: PlayerIdentity | null): PlayerRole | null {
    if (!identity) return null;
    return identity.role ?? (identity.isAdmin ? "admin" : "player");
  },

  isAuthenticated(scope: AuthScope = "player"): boolean {
    return !!authService.getCurrentUser(scope);
  },

  async logout(scope: AuthScope = "player"): Promise<void> {
    if (scope === "admin") clearSession("admin");
    else signOutPlayer();
  },
};

/** True when a PlayFab session ticket is available for authenticated reads. */
export function hasPlayerSession(): boolean {
  return !!currentSessionTicket();
}

/* --------------------------------------------------------------- profile */

export const profileService = {
  async getProfile(playFabId: string): Promise<PlayerProfile> {
    if (demoMode) {
      await latency();
      return { ...mockProfile, playFabId };
    }
    return fetchProfile(playFabId);
  },
  async getEquippedCosmetics(): Promise<EquippedCosmetics> {
    if (demoMode) {
      await latency();
      return mockCosmetics;
    }
    return fetchEquipped();
  },
  async getCharacter(): Promise<PlayerCharacter> {
    if (demoMode) {
      await latency();
      return mockCharacter;
    }
    return getPlayerCharacter();
  },
};

/* ------------------------------------------------------------ statistics */

export const statisticsService = {
  async getStatistics(): Promise<PlayerStatistic[]> {
    if (demoMode) {
      await latency();
      return mockStatistics;
    }
    return fetchStatistics();
  },
};

/* -------------------------------------------------------------- progress */

export const progressService = {
  async getProgress(): Promise<PlayerProgress> {
    if (demoMode) {
      await latency();
      return mockProgress;
    }
    return getPlayerProgress();
  },
};

/* ---------------------------------------------------------- achievements */

export const achievementsService = {
  /**
   * Achievement progress written by the game under the `AchievementProgress`
   * player data key. Absent key = no achievements to show yet.
   */
  async getAchievements(): Promise<Achievement[]> {
    if (demoMode) {
      await latency();
      return mockAchievements;
    }
    const data = await getPlayerData(["AchievementProgress"]);
    return jsonFrom<Achievement[]>(data, "AchievementProgress") ?? [];
  },
};

/* ---------------------------------------------------------- leaderboards */

export const leaderboardService = {
  async getLeaderboard(window: LeaderboardWindow): Promise<LeaderboardEntry[]> {
    if (demoMode) {
      await latency(360);
      const seed = window === "global" ? 0 : window === "weekly" ? 3 : 6;
      return mockLeaderboard(seed);
    }
    return fetchLeaderboard(window);
  },
  async getPlayerRank(
    playFabId: string,
    window: LeaderboardWindow,
  ): Promise<LeaderboardEntry | null> {
    if (demoMode) {
      const board = await this.getLeaderboard(window);
      return board.find((e) => e.playFabId === playFabId) ?? null;
    }
    return fetchPlayerRank(playFabId);
  },
};

/* ------------------------------------------------------------- almanac  */

export const almanacService = {
  /**
   * The player's engineering journey: regions, levels and the FINAL
   * successful completion for each cleared level. Written by the game,
   * read-only here.
   */
  async getJourney(): Promise<AlmanacJourney> {
    if (demoMode) {
      await latency();
      return mockJourney;
    }
    if (!hasPlayerSession()) return EMPTY_JOURNEY;
    return fetchJourney();
  },
};

/* ----------------------------------------------------------- admin views */

/** Inactivity threshold in days. Configurable in one place. */
export const INACTIVITY_THRESHOLD_DAYS = 30;

/**
 * Activity is ALWAYS derived from `lastActive` and is never a moderation
 * state — an inactive player is not suspended or banned.
 */
export function getActivityStatus(
  lastActive: string | undefined,
  now: Date = new Date(),
): ActivityStatus | null {
  if (!lastActive) return null;
  const then = new Date(lastActive).getTime();
  if (Number.isNaN(then)) return null;
  const days = (now.getTime() - then) / 86_400_000;
  return days <= INACTIVITY_THRESHOLD_DAYS ? "recently_active" : "inactive";
}

export const adminPlayerService = {
  /** Player directory — always fetched through the secure server endpoint. */
  async searchPlayers(query: string): Promise<PlayerProfile[]> {
    if (demoMode) {
      await latency(360);
      return mockLeaderboard(0).map((e) => ({
        ...mockProfile,
        playFabId: e.playFabId,
        displayName: e.displayName,
        level: e.level,
        totalScore: e.score,
        rank: e.rank,
        lastActive: e.updatedAt,
        accountStatus: "active" as AccountStatus,
      }));
    }
    const token = authService.getAdminToken();
    if (!token) throw new Error("Administrator authorisation required.");
    const { adminSearchPlayers } = await import("./admin.functions");
    return adminSearchPlayers({ data: { token, query } });
  },

  /**
   * Moderation. Progression data (level, XP, score, rank, achievements,
   * cosmetics) is game-owned and can never be edited from the website.
   */
  async setAccountStatus(
    playFabId: string,
    status: AccountStatus,
    reason?: string,
  ): Promise<AccountStatus> {
    if (status === "banned" && !reason?.trim()) {
      throw new Error("A reason is required to ban a player.");
    }
    if (demoMode) {
      await latency(280);
      return status;
    }
    const token = authService.getAdminToken();
    if (!token) throw new Error("Administrator authorisation required.");
    const { adminSetBanned } = await import("./admin.functions");
    await adminSetBanned({
      data: {
        token,
        playFabId,
        banned: status !== "active",
        ...(reason ? { reason } : {}),
      },
    });
    return status;
  },
};

/* --------------------------------------------------------- transactions */

export const transactionService = {
  /** Purchases and granted rewards from the player's PlayFab inventory. */
  async getTransactions(): Promise<Transaction[]> {
    if (demoMode) {
      await latency();
      return mockTransactions;
    }
    const playerId = getStoredPlayer()?.playFabId;
    if (!playerId) return [];
    return fetchTransactions(playerId);
  },
};

/* -------------------------------------------------------- notifications */

const NOTIFICATION_READ_KEY = "civilcraft.notifications.read.v1";

function readIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(window.localStorage.getItem(NOTIFICATION_READ_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

function writeIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NOTIFICATION_READ_KEY, JSON.stringify([...ids]));
  } catch {
    /* quota / private mode */
  }
}

/**
 * Player notifications, derived from REAL backend events only: unlocked
 * achievements and successful level completions. An account without events
 * legitimately shows an empty inbox.
 */
export const notificationService = {
  async getNotifications(): Promise<PlayerNotification[]> {
    const read = readIds();
    const achievements = demoMode ? mockAchievements : await achievementsService.getAchievements();
    const journey = demoMode ? mockJourney : await almanacService.getJourney();

    const fromAchievements: PlayerNotification[] = achievements
      .filter((a) => a.unlocked && a.unlockedAt)
      .map((a) => ({
        id: `ach-${a.id}`,
        kind: "achievement" as const,
        title: "Achievement unlocked",
        description: a.name,
        createdAt: a.unlockedAt!,
        read: false,
      }));
    const fromLevels: PlayerNotification[] = journey.regions
      .flatMap((r) => r.levels)
      .filter((l) => l.completion)
      .map((l) => ({
        id: `lvl-${l.levelId}`,
        kind: "level" as const,
        title: "Level completed",
        description: l.levelName ?? "A Civil Craft level",
        createdAt: l.completion!.completedAt,
        read: false,
      }));
    return [...fromAchievements, ...fromLevels]
      .map((n) => ({ ...n, read: read.has(n.id) }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },
  async markRead(ids: string[]): Promise<void> {
    const set = readIds();
    for (const id of ids) set.add(id);
    writeIds(set);
  },
};

/* ------------------------------------------------------------- inventory */

/**
 * Cosmetic inventory. Ownership and equipped state are separate concepts.
 * The website is read-only here — equipping happens in the Unity game.
 */
export const inventoryService = {
  async getInventory(): Promise<PlayerInventory> {
    if (demoMode) {
      await latency();
      const equippedItemIds: PlayerInventory["equippedItemIds"] = {};
      for (const item of mockCharacter.equipped) equippedItemIds[item.slot] = item.itemId;
      return {
        ownedItemIds: mockCharacter.equipped.map((i) => i.itemId),
        equippedItemIds,
        ...(mockCharacter.syncedAt ? { syncedAt: mockCharacter.syncedAt } : {}),
      };
    }
    return fetchInventory();
  },
};
