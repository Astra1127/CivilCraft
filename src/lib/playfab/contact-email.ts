import { z } from "zod";

type ClientCall = <T>(
  path: string,
  body: Record<string, unknown>,
  options: { sessionTicket: string },
) => Promise<T>;
const emailSchema = z.string().trim().email().max(255);
export interface ContactProfile {
  PlayerId?: string;
  ContactEmailAddresses?: { EmailAddress?: string }[];
}

/** Called only after successful authentication, never during session restoration/render. */
export async function syncContactEmail(
  call: ClientCall,
  input: {
    playFabId: string;
    sessionTicket: string;
    accountEmail?: string | undefined;
    newAccount?: boolean;
    profile?: ContactProfile | undefined;
  },
): Promise<void> {
  if (!input.sessionTicket || !input.playFabId) return;
  const email = emailSchema.safeParse(input.accountEmail);
  if (!email.success) return;
  const options = { sessionTicket: input.sessionTicket };
  try {
    // A just-created account has no pre-existing contact to overwrite.
    if (!input.newAccount) {
      let profile = input.profile;
      // The normal login profile only requests DisplayName; absence there proves nothing.
      if (!profile || !Object.hasOwn(profile, "ContactEmailAddresses")) {
        const result = await call<{ PlayerProfile?: ContactProfile }>(
          "/Client/GetPlayerProfile",
          {
            PlayFabId: input.playFabId,
            ProfileConstraints: { ShowContactEmailAddresses: true },
          },
          options,
        );
        profile = result?.PlayerProfile;
      }
      if (!profile || profile.PlayerId !== input.playFabId) return;
      const contacts = profile.ContactEmailAddresses;
      // Missing list on a successful, explicitly requested own profile represents no contacts.
      // Malformed lists/entries are unknown, not permission to replace an existing address.
      if (
        contacts !== undefined &&
        (!Array.isArray(contacts) ||
          contacts.some(
            (entry) =>
              !entry ||
              typeof entry.EmailAddress !== "string" ||
              entry.EmailAddress.trim().length > 0,
          ))
      )
        return;
    }
    await call("/Client/AddOrUpdateContactEmail", { EmailAddress: email.data }, options);
  } catch {
    // Best effort: no raw provider error/email/session is logged; login remains successful.
    // A future explicit login rechecks the backend before retrying. Never blindly resend.
  }
}
