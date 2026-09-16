# Civil Craft password reset

## Flow

`/forgot-password` remains unchanged and requests the recovery email. The new public `/reset-password?token=...` page receives the PlayFab callback token, validates the new password and matching confirmation, then posts `{ token, password }` to `/api/auth/reset-password`.

The endpoint uses the existing privileged `playFabAdmin` helper to call `Admin/ResetPassword` with `{ Token, Password }`. The existing `PLAYFAB_SECRET_KEY` stays server-side. No new credentials or SMTP configuration were added. The API contract was checked against [Microsoft's PlayFab ResetPassword reference](https://learn.microsoft.com/en-us/rest/api/playfab/admin/account-management/reset-password?view=playfab-rest).

Password rules are shared with registration: 8–128 characters, uppercase, lowercase and a number. Confirmation is checked in the UI; password and token validation are repeated server-side. Missing or malformed links show “Password reset link is invalid or incomplete.” with a link to request another email. Invalid/expired/reused tokens, provider password rejection, transport failures and missing server configuration receive a generic failure, never raw provider text.

Success shows “Password updated” and “Your Civil Craft password has been reset successfully.” Password fields and the used URL token are cleared; no automatic login or session cookie is created. Both fields have independent show/hide controls. Responses use no-store and no-referrer headers; the page is marked noindex. Tokens/passwords are not written to application logs or browser storage.

## PlayFab callback and production handoff

Set the Account Recovery template callback to exactly:

`https://civil-craft.vercel.app/reset-password`

Deploy this code and retain the configured server-side recovery template ID and PlayFab secret. This task did not change the remote template, deploy the site, send a real email or change a real account password.

The full production test remains pending: request recovery for a controlled player account, receive the custom email, follow its confirmation link to the callback with `?token=...`, enter and confirm a new password, verify success, then sign in manually with the new password. The account holder must complete the password entry/change. Interactive browser validation was unavailable in this session.

## Validation

- `npm run build`: passed (authorized outside-sandbox run because Nitro has a known Windows readlink restriction).
- `npx tsc --noEmit`: passed.
- `node --test tests/*.test.ts`: 78 passed, zero failures.
- Mocked reset tests verify the exact PlayFab URL, privileged header and Token/Password body, no automatic session, invalid passwords/tokens, confirmation mismatch, expired/reused tokens, provider/network errors and rejection of cross-site/non-POST requests.
- Built-server local smoke checks: `/reset-password` renders the missing-token state; `/reset-password?token=SIMULATED_TEST_TOKEN` renders the form. Both return 200 with privacy headers. A weak-password POST returns 400 without contacting PlayFab.
- Scanned 125 built client JavaScript assets: no privileged environment names or configured secret values found.

## Files changed

- `src/routes/reset-password.tsx` — new public page
- `src/lib/playfab/reset-password.server.ts` — new public reset handler
- `src/lib/playfab/reset-password.ts` — shared reset validation and safe messages
- `src/lib/playfab/password-rules.ts` — registration's existing rules extracted for reuse
- `src/lib/playfab/index.ts` — preserves existing rule exports
- `src/lib/playfab/admin-client.server.ts` — permits the ResetPassword operation
- `src/server.ts` — registers the endpoint and page privacy headers
- `src/routeTree.gen.ts` — generated route registration
- `tests/reset-password.test.ts` — new mocked reset coverage
- `RESET_PASSWORD_VALIDATION.md` — this report
