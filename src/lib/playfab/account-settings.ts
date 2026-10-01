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
