# Contact Email sync and verification

## Implementation

- `registerPlayer` uses the successful registration response's PlayFab ID and session ticket to set Contact Email to the submitted registration email. The existing registration behavior (no persisted signed-in browser session) remains unchanged.
- `loginWithEmail` and `loginWithUsername` sync after successful authentication. The email comes from authenticated account `PrivateInfo.Email`; successful email/password login can also use its authenticated email input. Username login never guesses an email.
- The helper reuses contact data when provided for the same player; otherwise it requests `/Client/GetPlayerProfile` with the current player's ID and `ShowContactEmailAddresses: true`. This is separate from login's restricted profile request, so a denied contact-profile lookup cannot fail authentication.
- An existing nonblank contact address, including a different or unverified address, is preserved. Empty contacts on a successfully retrieved own profile trigger `/Client/AddOrUpdateContactEmail` with `EmailAddress`. Missing account email, failed lookup, mismatched identity or malformed contact data result in no update.
- Both calls use the existing `callPlayFab` Client transport with the specific authentication response's session ticket in `X-Authorization`. No privileged key is used. No Contact Email is copied into browser storage or added to public UI.
- Sync only runs during explicit registration/login. A later login reads the current backend contact, so a successful earlier update is not repeated. Failed checks/updates are best effort and can be retried on a later explicit login after another backend check. No blind retry, page-load effect, bulk migration, manual email send or resend action was added.
- Contact-profile access must be permitted by PlayFab for this authenticated own-profile query. If PlayFab rejects it, existing-account sync safely skips rather than treating unavailable data as blank. Check this in a controlled account during deployment; do not broadly expose other players' contact details to solve an access problem.

## Required manual PlayFab rule

In Game Manager → Automation → Rules, create or confirm one enabled rule:

1. Event Type: `com.playfab.player_updated_contact_email`.
2. Action: **Send Email**.
3. Email Template: the existing **Email Verification** template.
4. Save the action/rule and ensure duplicate rules are not sending the same template.

Use the template's PlayFab confirmation link. Do not add website verification tokens or manually call `SendEmailFromTemplate` after updating Contact Email. Verification email delivery is automatic through the event/rule once configured; the website does not itself assert delivery or mark an address verified. See [PlayFab's verification rule instructions](https://learn.microsoft.com/en-us/gaming/playfab/live-service-management/game-configuration/title-communications/emails/using-a-rule-to-verify-a-contact-email-address) and [Client contact-email API](https://learn.microsoft.com/en-us/rest/api/playfab/client/account-management/add-or-update-contact-email?view=playfab-rest).

SMTP credentials, admin authentication, dashboard layouts, sorting/filtering, Gallery, Updates and Leaderboard were unchanged. `/forgot-password`, `/reset-password`, the required recovery template environment variable and custom recovery request were unchanged.

## Validation

- `npm run build`: passed (authorized outside-sandbox run for the known Windows Nitro restriction).
- `npx tsc --noEmit`: passed.
- `node --test tests/*.test.ts`: 85 passed, zero failures, including existing recovery/reset tests.
- Six new mocked tests cover new registration setup, blank-contact migration, second-login no-op, existing different contacts, unknown email/ticket, profile failures/malformed data and tolerated update failures.
- Client bundle scan: 125 JavaScript assets, no configured secret values or privileged environment names found.
- `git diff --check`: passed.
- Real Game Manager changes, rule execution, verification inbox delivery and the full recovery/reset/login sequence were not tested. No live player was created or changed and no real email was sent. Deployment validation should use controlled new and existing accounts, verify Contact Email/rule events in Game Manager, confirm second-login does not trigger another update, and then complete custom recovery and login with the account holder.

## Files changed

- `src/lib/playfab/auth.ts`
- `src/lib/playfab/contact-email.ts` (new)
- `tests/contact-email.test.ts` (new)
- `CONTACT_EMAIL_VALIDATION.md` (this report)
