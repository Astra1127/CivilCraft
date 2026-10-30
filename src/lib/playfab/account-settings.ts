import { z } from "zod";
import { callPlayFab, readSession, requireSessionTicket } from "./client.ts";

export interface AccountSettings {
  playFabId: string;
  username?: string;
  loginEmail?: string;
  displayName?: string;
  contacts: { EmailAddress?: string; VerificationStatus?: string }[];
}

export async function getAccountSettings(): Promise<AccountSettings> {
  const ticket = requireSessionTicket();
  const expected = readSession("player")?.identity.playFabId;
  const { AccountInfo: info } = await callPlayFab<{
    AccountInfo?: {
      PlayFabId?: string;
      Username?: string;
      PrivateInfo?: { Email?: string };
      TitleInfo?: { DisplayName?: string };
    };
  }>("/Client/GetAccountInfo", {}, { sessionTicket: ticket });
  if (!info?.PlayFabId || info.PlayFabId !== expected)
    throw new Error("Your account changed. Reload Settings.");
  const { PlayerProfile: profile } = await callPlayFab<{
    PlayerProfile?: { PlayerId?: string; ContactEmailAddresses?: AccountSettings["contacts"] };
  }>(
    "/Client/GetPlayerProfile",
    {
      PlayFabId: info.PlayFabId,
      ProfileConstraints: { ShowContactEmailAddresses: true },
    },
    { sessionTicket: ticket },
  );
  if (profile?.PlayerId !== expected) throw new Error("Unable to verify account details.");
  return {
    playFabId: info.PlayFabId,
    ...(info.Username ? { username: info.Username } : {}),
    ...(info.PrivateInfo?.Email ? { loginEmail: info.PrivateInfo.Email } : {}),
    ...(info.TitleInfo?.DisplayName ? { displayName: info.TitleInfo.DisplayName } : {}),
    contacts: profile.ContactEmailAddresses ?? [],
  };
}

/** Reauthenticate the SAME account; never change identity or save the password. */
export async function updateContactEmail(email: string, password: string): Promise<void> {
  const address = z.string().trim().email().max(255).parse(email);
  if (!password) throw new Error("Enter your current password.");
  const original = requireSessionTicket();
  const account = await getAccountSettings();
  if (!account.username && !account.loginEmail)
    throw new Error("This account must be managed through its linked sign-in provider.");
  const authenticated = await callPlayFab<{ PlayFabId?: string; SessionTicket?: string }>(
    account.username ? "/Client/LoginWithPlayFab" : "/Client/LoginWithEmailAddress",
    {
      ...(account.username ? { Username: account.username } : { Email: account.loginEmail }),
      Password: password,
    },
  );
  if (authenticated.PlayFabId !== account.playFabId || !authenticated.SessionTicket)
    throw new Error("Account verification failed. No contact email was changed.");
  if (readSession("player")?.sessionTicket !== original)
    throw new Error("Your session changed. Reload Settings before trying again.");
  await callPlayFab(
    "/Client/AddOrUpdateContactEmail",
    { EmailAddress: address },
    {
      sessionTicket: authenticated.SessionTicket,
    },
  );
  // Login email and character identity are unchanged. The caller refetches backend contact status.
}

/** Reauthenticate the current account with password; returns verified account and temporary session ticket. */
export async function reauthenticatePlayer(
  password: string,
): Promise<{ sessionTicket: string; playFabId: string }> {
  if (!password) throw new Error("Enter your current password.");
  const original = requireSessionTicket();
  const account = await getAccountSettings();
  if (!account.username && !account.loginEmail)
    throw new Error("This account must be managed through its linked sign-in provider.");
  const authenticated = await callPlayFab<{ PlayFabId?: string; SessionTicket?: string }>(
    account.username ? "/Client/LoginWithPlayFab" : "/Client/LoginWithEmailAddress",
    {
      ...(account.username ? { Username: account.username } : { Email: account.loginEmail }),
      Password: password,
    },
  );
  if (authenticated.PlayFabId !== account.playFabId || !authenticated.SessionTicket)
    throw new Error("Account reauthentication failed. Current password is not correct.");
  if (readSession("player")?.sessionTicket !== original)
    throw new Error("Your session changed. Reload Settings before trying again.");
  return { sessionTicket: authenticated.SessionTicket, playFabId: authenticated.PlayFabId };
}

export interface DeletionAuditItem {
  category: string;
  source: string;
  dataCovered: string;
  requirement: string;
}

export const ACCOUNT_DATA_AUDIT: DeletionAuditItem[] = [
  {
    category: "Authentication & Credentials",
    source: "PlayFab Master Account",
    dataCovered:
      "Username, login email, password hash, device IDs, display name, contact addresses.",
    requirement:
      "PlayFab Client API does not support account deletion. Deletion requires privileged PlayFab Admin API (Admin/DeleteMasterPlayerAccount) with administrative approval.",
  },
  {
    category: "Game Saves & Customization",
    source: "PlayFab Title Entity Files",
    dataCovered:
      "playerSaveData.json (encrypted level/bridge save) and characterPortrait.png (rendered chibi portrait).",
    requirement:
      "Entity files are stored under Title Player Account and must be explicitly deleted before or during master account purging.",
  },
  {
    category: "Player Progression & Almanac",
    source: "PlayFab Title UserData",
    dataCovered:
      "Levels, XP, unlocked achievements, map progress, equipped cosmetics, policy agreements, and almanac progress.",
    requirement: "UserData records must be purged across all title keys to guarantee full removal.",
  },
  {
    category: "Leaderboards & Statistics",
    source: "PlayFab Statistics",
    dataCovered:
      "TotalScore, BridgesCompleted, ChallengesCompleted, BestSingleBuildScore, per-contract bridge scores.",
    requirement:
      "Leaderboard statistics remain indexed in title leaderboards until administratively cleared or reset.",
  },
  {
    category: "Virtual Currency & Purchases",
    source: "PostgreSQL Database",
    dataCovered:
      "civilcraft_currency.accounts and purchase receipts in civilcraft_currency.receipts.",
    requirement:
      "PostgreSQL database triggers (permanent_account, permanent_receipt) raise fatal SQL exceptions on DELETE to preserve immutable audit records. A privacy anonymization/pseudonymization procedure is required to redact personal data without violating accounting integrity.",
  },
  {
    category: "Local Device Storage",
    source: "Unity Mobile Client",
    dataCovered:
      "Local playerSaveData.json in persistentDataPath and cached PlayerPrefs credentials.",
    requirement:
      "A client-side wipe protocol must be added to the Unity APK. Deleting backend records alone leaves orphaned local saves on the player's device, triggering sync conflict errors on next launch.",
  },
];
