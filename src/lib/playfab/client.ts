/**
 * PlayFab Client API transport + browser session store.
 *
 * Every PlayFab request in the browser goes through `callPlayFab` so no
 * component ever builds a PlayFab URL itself. Only the Client API is reachable
 * from here. Privileged administrator APIs are not configured.
 */
import { playFabConfig, playFabUrl } from "./config";
import type { PlayerIdentity } from "./types";

export type PlayFabErrorKind =
  "network" | "credentials" | "session_expired" | "not_found" | "service" | "unknown";

export class PlayFabError extends Error {
  kind: PlayFabErrorKind;
  httpStatus?: number;
  constructor(message: string, kind: PlayFabErrorKind = "unknown", httpStatus?: number) {
    super(message);
    this.name = "PlayFabError";
    this.kind = kind;
    if (httpStatus !== undefined) this.httpStatus = httpStatus;
  }
}

interface PlayFabEnvelope<T> {
  code: number;
  status: string;
  data?: T;
  error?: string;
  errorCode?: number;
  errorMessage?: string;
}

function classify(errorCode: number | undefined, status: number): PlayFabErrorKind {
  // 1001-1003: account not found / invalid username-password combinations.
  if (errorCode === 1001 || errorCode === 1002 || errorCode === 1003) return "credentials";
  if (status === 401 || errorCode === 1000) return "session_expired";
  if (status === 404) return "not_found";
  if (status >= 500) return "service";
  return "unknown";
}

/** Raw PlayFab call. `sessionTicket` adds the authenticated header. */
export async function callPlayFab<T>(
  path: string,
  body: Record<string, unknown>,
  options: { sessionTicket?: string | undefined } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.sessionTicket) headers["X-Authorization"] = options.sessionTicket;

  let response: Response;
  try {
    response = await fetch(playFabUrl(path), {
      method: "POST",
      headers,
      body: JSON.stringify({ TitleId: playFabConfig.titleId, ...body }),
    });
  } catch {
    throw new PlayFabError("Unable to connect to Civil Craft services.", "network");
  }

  let payload: PlayFabEnvelope<T> | null = null;
  try {
    payload = (await response.json()) as PlayFabEnvelope<T>;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload || payload.code >= 400) {
    const kind = classify(payload?.errorCode, response.status);
    const message =
      kind === "credentials"
        ? "Invalid username or password."
        : kind === "session_expired"
          ? "Your session has expired. Please sign in again."
          : (payload?.errorMessage ?? payload?.error ?? "Civil Craft services are unavailable.");
    throw new PlayFabError(message, kind, response.status);
  }

  return payload.data as T;
}

/* ------------------------------------------------------------- session */

export type AuthScope = "player" | "admin";

export interface PlayFabSession {
  identity: PlayerIdentity;
  sessionTicket: string;
  entityToken?: string;
  entityId?: string;
  entityType?: string;
}

const SESSION_KEYS: Record<AuthScope, string> = {
  player: "civilcraft.session.player.v1",
  admin: "civilcraft.session.admin.v1",
};
/** Pre-split session key; always cleared so old sessions cannot linger. */
const LEGACY_SESSION_KEY = "civilcraft.session.v1";

export function readSession(scope: AuthScope): PlayFabSession | null {
  if (typeof window === "undefined" || scope !== "player") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEYS[scope]);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PlayFabSession;
    if (!parsed?.identity?.playFabId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSession(scope: AuthScope, session: PlayFabSession): void {
  if (typeof window === "undefined" || scope !== "player") return;
  window.localStorage.setItem(SESSION_KEYS[scope], JSON.stringify(session));
}

export function clearSession(scope: AuthScope): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEYS[scope]);
  window.localStorage.removeItem(LEGACY_SESSION_KEY);
}

/** Session ticket for authenticated Client API calls, or null when signed out. */
export function currentSessionTicket(): string | null {
  return readSession("player")?.sessionTicket ?? null;
}

export function requireSessionTicket(): string {
  const ticket = currentSessionTicket();
  if (!ticket) throw new PlayFabError("Please sign in to view this.", "session_expired");
  return ticket;
}

/** Authenticated Client API call using the stored player session ticket. */
export async function callPlayerApi<T>(
  path: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  return callPlayFab<T>(path, body, { sessionTicket: requireSessionTicket() });
}
