/**
 * PlayFab Client authentication (players).
 *
 * The website authenticates against the SAME Civil Craft PlayFab title the
 * Unity game uses, so a player registered in the game signs in here with the
 * same account. Passwords are never stored — only the PlayFab id, session
 * ticket, entity token and profile information are kept for the session.
 */
import { callPlayFab, clearSession, readSession, writeSession, PlayFabError } from "./client";
import type { PlayerIdentity, RegisterInput, RegisterResult } from "./types";

interface EntityTokenResponse {
  EntityToken?: string;
  Entity?: { Id?: string; Type?: string };
}

interface LoginResult {
  PlayFabId: string;
  SessionTicket: string;
  EntityToken?: EntityTokenResponse;
  InfoResultPayload?: {
    AccountInfo?: {
      Created?: string;
      Username?: string;
      TitleInfo?: {
        DisplayName?: string;
        Created?: string;
        LastLogin?: string;
        AvatarUrl?: string;
      };
      PrivateInfo?: { Email?: string };
    };
    PlayerProfile?: {
      DisplayName?: string;
      AvatarUrl?: string;
      Created?: string;
      LastLogin?: string;
    };
  };
}

// Only DisplayName is requested: title profile view constraints decide what
// else may be returned, and asking for a disallowed field fails the login.
const INFO_REQUEST = {
  GetUserAccountInfo: true,
  GetPlayerProfile: true,
  ProfileConstraints: { ShowDisplayName: true },
};

function toIdentity(result: LoginResult, fallbackEmail?: string): PlayerIdentity {
  const account = result.InfoResultPayload?.AccountInfo;
  const profile = result.InfoResultPayload?.PlayerProfile;
  const displayName =
    account?.TitleInfo?.DisplayName ?? profile?.DisplayName ?? account?.Username ?? "Engineer";
  const email = account?.PrivateInfo?.Email ?? fallbackEmail;
  const avatarUrl = account?.TitleInfo?.AvatarUrl ?? profile?.AvatarUrl;
  const createdAt = account?.TitleInfo?.Created ?? account?.Created ?? profile?.Created;
  return {
    playFabId: result.PlayFabId,
    displayName,
    ...(email ? { email } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
    ...(createdAt ? { createdAt } : {}),
    role: "player",
    isAdmin: false,
  };
}

function persist(result: LoginResult, identity: PlayerIdentity) {
  writeSession("player", {
    identity,
    sessionTicket: result.SessionTicket,
    ...(result.EntityToken?.EntityToken ? { entityToken: result.EntityToken.EntityToken } : {}),
    ...(result.EntityToken?.Entity?.Id ? { entityId: result.EntityToken.Entity.Id } : {}),
    ...(result.EntityToken?.Entity?.Type ? { entityType: result.EntityToken.Entity.Type } : {}),
  });
}

/** Client/LoginWithEmailAddress */
export async function loginWithEmail(email: string, password: string): Promise<PlayerIdentity> {
  const result = await callPlayFab<LoginResult>("/Client/LoginWithEmailAddress", {
    Email: email.trim(),
    Password: password,
    InfoRequestParameters: INFO_REQUEST,
  });
  const identity = toIdentity(result, email.trim());
  persist(result, identity);
  return identity;
}

/** Client/LoginWithPlayFab (username + password) */
export async function loginWithUsername(
  username: string,
  password: string,
): Promise<PlayerIdentity> {
  const result = await callPlayFab<LoginResult>("/Client/LoginWithPlayFab", {
    Username: username.trim(),
    Password: password,
    InfoRequestParameters: INFO_REQUEST,
  });
  const identity = toIdentity(result);
  persist(result, identity);
  return identity;
}

/** Chooses the correct PlayFab endpoint from what the player typed. */
export async function loginPlayer(identifier: string, password: string): Promise<PlayerIdentity> {
  const value = identifier.trim();
  if (!value || !password) throw new PlayFabError("Invalid username or password.", "credentials");
  return value.includes("@") ? loginWithEmail(value, password) : loginWithUsername(value, password);
}

/** Client/RegisterPlayFabUser — creates the account in the Civil Craft title. */
export async function registerPlayer({
  username,
  email,
  password,
}: RegisterInput): Promise<RegisterResult> {
  const result = await callPlayFab<LoginResult>("/Client/RegisterPlayFabUser", {
    Username: username.trim(),
    Email: email.trim(),
    Password: password,
    DisplayName: username.trim(),
    RequireBothUsernameAndEmail: true,
  });
  // Registration must not grant a session: the account is verified by PlayFab.
  if (result?.SessionTicket) {
    try {
      await callPlayFab(
        "/Client/UpdateUserTitleDisplayName",
        {
          DisplayName: username.trim(),
        },
        { sessionTicket: result.SessionTicket },
      );
    } catch {
      /* display name already taken or restricted — the account still exists */
    }
  }
  clearSession("player");
  return { email: email.trim(), verificationRequired: true };
}

/** Client/SendAccountRecoveryEmail */
export async function requestPasswordReset(email: string): Promise<void> {
  const response = await fetch("/api/email/recovery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim() }),
  });
  if (!response.ok) throw new Error("Unable to process the request. Please try again later.");
}

export function getStoredPlayer(): PlayerIdentity | null {
  return readSession("player")?.identity ?? null;
}

export function signOutPlayer(): void {
  clearSession("player");
}
