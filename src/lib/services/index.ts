/**
 * CIVIL CRAFT — SERVICE LAYER INDEX
 * =================================
 *
 * Data flow (source of truth first):
 *
 *   UNITY GAME → PLAYFAB → SECURE BACKEND (where required) → WEBSITE
 *
 * The game is authoritative for every gameplay value: progression,
 * statistics, inventory, transactions and Almanac completion records. The
 * website only READS them. Website-authored content (gallery, FAQ, releases,
 * messages, bug reports, site settings) is owned by the CMS layer instead.
 *
 * Components must call these services (or hooks built on them) rather than
 * embedding backend logic. Swapping the mock implementations for live PlayFab
 * calls therefore requires no component changes.
 *
 * SECURITY: only the PlayFab Title ID may reach the browser. The Developer
 * Secret Key, server credentials and admin credentials must never appear in
 * React code, VITE_* variables, localStorage or the repository — every
 * privileged operation belongs in a secure server environment.
 *
 * SCREENSHOT FLOW (Almanac):
 *   player completes level → Unity captures the final bridge → upload to file
 *   /object storage → the file URL is saved on the completion record → the
 *   website reads the record → the Almanac renders the player's bridge.
 *   Image binaries are never stored in player data; a clearly marked Civil
 *   Craft fallback cover is shown while storage is unavailable.
 */

export {
  achievementsService,
  adminPlayerService,
  almanacService,
  authService,
  inventoryService,
  leaderboardService,
  notificationService,
  profileService,
  progressService,
  statisticsService,
  transactionService,
  playFabConfigured,
  usingMockData,
} from "@/lib/playfab";

/** Conventional aliases used across the dashboard and admin screens. */
export {
  profileService as playerService,
  achievementsService as achievementService,
  leaderboardService as leaderboardsService,
} from "@/lib/playfab";

import { getCmsState, setCmsState, logActivity } from "@/lib/cms/store";
import type { BugReport, ContactMessage, GalleryItem, Release } from "@/lib/cms/types";

/* ------------------------------------------------------------------ CMS */
/*
 * Website-owned content. These read/write the CMS store today and are the
 * single seam to point at a real database later — the shapes stay identical.
 */

export const galleryService = {
  list(): GalleryItem[] {
    return getCmsState().gallery;
  },
  listByCategory(category: string): GalleryItem[] {
    return getCmsState().gallery.filter((g) => g.category === category);
  },
};

export const downloadService = {
  /** Published game builds shown on the Download page. */
  listReleases(): Release[] {
    return getCmsState().releases;
  },
  latestRelease(): Release | undefined {
    return getCmsState().releases[0];
  },
};

export const bugReportService = {
  list(): BugReport[] {
    return getCmsState().bugs;
  },
  submit(report: BugReport) {
    setCmsState((prev) => ({ ...prev, bugs: [report, ...prev.bugs] }));
    logActivity({ action: "Bug report submitted", target: report.category, area: "System" });
  },

};

export const messageService = {
  list(): ContactMessage[] {
    return getCmsState().messages;
  },
};

export const adminService = {
  settings() {
    return getCmsState().settings;
  },
  /** Real record of administrative actions — never fabricated activity. */
  activity() {
    return getCmsState().activity;
  },
};
