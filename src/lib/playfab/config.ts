/**
 * CENTRAL PLAYFAB CONFIGURATION
 * =============================
 *
 * The Civil Craft website always talks to the SAME PlayFab title as the Unity
 * game. The Title ID is public information and is therefore safe in client
 * code; the Developer Secret Key is NOT and must never appear here.
 *
 * Works identically in Lovable preview, a published build, an exported
 * project, VS Code, localhost and any other host — no Lovable-specific
 * service is involved. `VITE_PLAYFAB_TITLE_ID` is honoured when present, but
 * the title falls back to the real Civil Craft title so a missing .env file
 * can never break connectivity.
 */

export const CIVIL_CRAFT_TITLE_ID = "17FA03";

const envTitleId = (import.meta.env["VITE_PLAYFAB_TITLE_ID"] as string | undefined)?.trim();

export const playFabConfig = {
  titleId: envTitleId && envTitleId.length > 0 ? envTitleId : CIVIL_CRAFT_TITLE_ID,
  get apiBase() {
    return `https://${this.titleId}.playfabapi.com`;
  },
  /** Public game name, used in UI copy. */
  titleName: "Civil Craft",
} as const;

/** Absolute URL for a PlayFab API path such as `/Client/LoginWithEmailAddress`. */
export function playFabUrl(path: string): string {
  return `${playFabConfig.apiBase}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Development/demo mode. Real PlayFab data is the default; placeholder data is
 * only ever shown when this flag is explicitly switched on, and it is always
 * labelled in the UI.
 */
export const demoMode =
  (import.meta.env["VITE_PLAYFAB_DEMO"] as string | undefined)?.toLowerCase() === "true";
