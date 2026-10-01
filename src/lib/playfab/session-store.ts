import type { PlayerIdentity } from "./types";

export type AuthScope = "player" | "admin";
export interface PlayFabSession {
  identity: PlayerIdentity;
  sessionTicket: string;
  entityToken?: string;
  entityId?: string;
  entityType?: string;
}
export const PLAYER_SESSION_KEY = "civilcraft.session.player.v1";
const END_REASON_KEY = "civilcraft.session.player.ended";
const CHANGE_EVENT = "civilcraft-player-session-change";

export function readSession(scope: AuthScope): PlayFabSession | null {
  if (typeof window === "undefined" || scope !== "player") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PLAYER_SESSION_KEY) ?? "null");
    if (
      typeof parsed?.sessionTicket !== "string" ||
      !parsed.sessionTicket ||
      typeof parsed?.identity?.playFabId !== "string" ||
      !parsed.identity.playFabId
    )
      return null;
    return parsed;
  } catch {
    return null;
  }
}
export function sessionEnded(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(END_REASON_KEY) === "expired";
  } catch {
    return false;
  }
}
function notify() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
export function writeSession(scope: AuthScope, session: PlayFabSession): void {
  if (typeof window === "undefined" || scope !== "player") return;
  window.localStorage.removeItem(END_REASON_KEY);
  window.localStorage.setItem(PLAYER_SESSION_KEY, JSON.stringify(session));
  notify();
}
export function clearSession(scope: AuthScope): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(
    scope === "player" ? PLAYER_SESSION_KEY : "civilcraft.session.admin.v1",
  );
  window.localStorage.removeItem("civilcraft.session.v1");
  if (scope === "player") {
    window.localStorage.removeItem(END_REASON_KEY);
    notify();
  }
}
export function currentSessionTicket(): string | null {
  return readSession("player")?.sessionTicket ?? null;
}
export function expirePlayerSession(ticket: string): void {
  // An old request must never sign out a newer login (including a login in another tab).
  if (typeof window === "undefined" || currentSessionTicket() !== ticket) return;
  window.localStorage.setItem(END_REASON_KEY, "expired");
  window.localStorage.removeItem(PLAYER_SESSION_KEY);
  window.localStorage.removeItem("civilcraft.session.v1");
  notify();
}
export function subscribePlayerSession(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === PLAYER_SESSION_KEY || event.key === null) listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}
