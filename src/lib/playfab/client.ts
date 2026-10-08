/**
 * PlayFab Client API transport + browser session store.
 *
 * Every PlayFab request in the browser goes through `callPlayFab` so no
 * component ever builds a PlayFab URL itself. Only the Client API is reachable
 * from here. Privileged administrator APIs are not configured.
 */
import { playFabConfig, playFabUrl } from "./config.ts";
import { currentSessionTicket, expirePlayerSession, readSession } from "./session-store.ts";
import { isInvalidPlayerTicket, SESSION_EXPIRED_MESSAGE } from "./session-errors.ts";
export { readSession, writeSession, clearSession, currentSessionTicket } from "./session-store.ts";
export type { AuthScope, PlayFabSession } from "./session-store.ts";

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
      signal: AbortSignal.timeout(12_000),
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
    const invalid =
      !!options.sessionTicket &&
      response.status < 500 &&
      isInvalidPlayerTicket(payload?.error, payload?.errorCode);
    if (invalid) expirePlayerSession(options.sessionTicket!);
    const kind = invalid ? "session_expired" : classify(payload?.errorCode, response.status);
    const message =
      kind === "credentials"
        ? "Invalid username or password."
        : kind === "session_expired"
          ? SESSION_EXPIRED_MESSAGE
          : (payload?.errorMessage ?? payload?.error ?? "Civil Craft services are unavailable.");
    throw new PlayFabError(message, kind, response.status);
  }

  return payload.data as T;
}

/* ------------------------------------------------------------- session */

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

/** Only first-party player authentication 401s clear the ticket used by that request. */
export async function playerFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const ticket = new Headers(init.headers).get("Authorization")?.match(/^Bearer (\S+)$/)?.[1];
  const response = await fetch(path, init);
  const playerPath =
    /^\/api\/(?:player\/|leaderboard(?:\?|\/|$)|contact(?:\?|$)|payments\/paymongo\/(?:create-checkout|player-orders|order)(?:\?|$))/.test(
      path,
    );
  if (ticket && playerPath && response.status === 401) {
    expirePlayerSession(ticket);
    throw new PlayFabError(SESSION_EXPIRED_MESSAGE, "session_expired", 401);
  }
  return response;
}

/** Validate storage with PlayFab before trusting its identity. No browser expiry extension. */
export async function validatePlayerSession() {
  const session = readSession("player");
  if (!session) return null;
  const result = await callPlayFab<{
    AccountInfo?: { PlayFabId?: string; Username?: string; TitleInfo?: { DisplayName?: string } };
  }>("/Client/GetAccountInfo", {}, { sessionTicket: session.sessionTicket });
  const info = result.AccountInfo;
  if (!info?.PlayFabId)
    throw new PlayFabError("Unable to verify your session. Please retry.", "service");
  if (info.PlayFabId !== session.identity.playFabId) {
    expirePlayerSession(session.sessionTicket);
    throw new PlayFabError(SESSION_EXPIRED_MESSAGE, "session_expired");
  }
  return {
    ...session.identity,
    playFabId: info.PlayFabId,
    displayName: info.TitleInfo?.DisplayName ?? info.Username ?? "Engineer",
    role: "player" as const,
    isAdmin: false,
  };
}
