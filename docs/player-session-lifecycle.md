# Player session expiration

## Confirmed cause

AuthProvider restored the identity from `civilcraft.session.player.v1` and immediately
set `ready`, without validating the saved session ticket. PlayFab errors were thrown
to individual pages but never cleared the saved session or React authentication state.
First-party API clients similarly handled errors independently. No player storage-event
subscription existed, and Login always navigated to `/dashboard`, losing the original
destination. The old direct-client classifier also treated generic HTTP 401 and error
1000 as expiration, rather than checking explicit PlayFab ticket errors.

## Current behavior

- Storage is a candidate session, not proof of authentication. `Client/GetAccountInfo`
  validates the saved ticket and checks that its player ID matches before restored
  authenticated UI is enabled. Requests time out after 12 seconds.
- Validation repeats on focus, connectivity restoration and every 60 seconds. It does
  not renew or extend the ticket. Only one validation per ticket runs at a time.
- A restoration network/service failure retains storage, withholds authenticated UI,
  and offers Retry on protected pages. A temporary failure after validation keeps the
  verified player signed in; permission failures and generic upstream errors do not log out.
- Explicit PlayFab ticket errors clear only the ticket used by that request. The server
  maps these errors, or `IsSessionTicketExpired: true`, to 401. Invalid server credentials,
  permission failures and malformed upstream responses remain service errors.
- All first-party player bearer requests share `playerFetch`: leaderboard, checkout,
  payment history, player messages/contact, bug reports and email preferences. A player
  authentication 401 expires the matching saved ticket before the caller handles the error.
  Admin and public calls cannot expire a player through this transport.
- Same-tab events and cross-tab storage events update AuthProvider and clear stale player
  query data. Stale responses cannot sign out a newer login. Admin cookie authentication
  and admin state are independent.
- Focus and periodic validation also reconcile storage changes and clear stale player
  queries when a suspended tab missed a storage event.
- Dashboard and shop guards redirect to Login with an internal return destination and
  `reason=expired`. Login displays “Your session expired. Please log in again.” and returns
  the player to the validated internal path, including query/hash, after successful login.
- No public Shop link was reintroduced. Dashboard Coin Shop and admin Coin Products remain.

## Renewal decision

This website uses `Client/LoginWithEmailAddress` or `Client/LoginWithPlayFab` and their
legacy SessionTicket for authenticated Client APIs. It has no refresh credential.
`Authentication/GetEntityToken` refreshes an entity token, not this SessionTicket, and
requires a still-valid credential. Therefore ticket expiration requires login again;
passwords are not stored and browser timestamps cannot extend validity.

References:
- https://learn.microsoft.com/en-us/rest/api/playfab/server/authentication/authenticate-session-ticket
- https://learn.microsoft.com/en-us/rest/api/playfab/authentication/authentication/get-entity-token

## Changed files

- `src/lib/playfab/session-store.ts`: shared session storage, expiration events, cross-tab
  subscriptions, and protection against stale-ticket responses.
- `src/lib/playfab/session-errors.ts`: explicit ticket errors, common message and safe return paths.
- `src/lib/playfab/client.ts`: validation, central direct-PlayFab expiration and first-party transport.
- `src/lib/playfab/admin-client.server.ts`: correct server authentication error classification.
- `src/lib/auth.tsx`: validated restoration, revalidation, UI synchronization and query cleanup.
- `src/lib/playfab/leaderboard.ts`, `src/lib/playfab/transactions.ts`, `src/lib/cms/content.ts`,
  `src/components/dashboard/ReportBugDialog.tsx`, `src/routes/dashboard.settings.tsx`, and
  `src/routes/shop.tsx`: use the shared player response handling.
- `src/routes/dashboard.tsx`, `src/routes/shop.tsx`, `src/routes/login.tsx`: protected redirect,
  retry state, expiration message and return destination.
- `tests/player-session.test.mjs`: session transport, provider, server classification, redirects
  and login tests.

## Manual verification

1. Log in and reload a protected page. While validation is pending, no stored player
   identity should be shown as authenticated. After success, the page should load normally.
2. Open a second tab. Log out in one tab; both navbars and protected views should update.
3. Using a test account/session, replace its saved ticket with an invalid test value and
   reload. Verify storage is cleared and Login displays the expiration message. Repeat
   while a page is open by triggering a protected API request with the invalid ticket.
4. Log in from the redirected Login page and verify the original dashboard subpage/shop
   destination is restored. An external `redirect` URL must fall back to `/dashboard`.
5. With a valid saved session, go offline before reload: storage must remain and the
   protected page must offer Retry. Restore connectivity; validation should recover.
   Going offline while already authenticated must not sign out the player.
6. Confirm a valid admin session survives player expiration, and admin API 401 responses
   do not expire a player session. No live payments or coin grants are needed for these checks.

Automated tests simulate the backend and browser events. A real ticket aging to natural
expiration has not been observed in an interactive browser during this change.

Validation completed: 14 session lifecycle tests; 112 existing admin, PlayFab, payment,
contact and email tests; and three navigation/access tests passed. The final targeted
session/navigation/admin/payment run passed all 78 tests. TypeScript, the production
build and the client-bundle secret scan passed. Targeted ESLint reported no errors and
the existing AuthProvider Fast Refresh export warning.
