# Email notifications and player directory

## Architecture

Email delivery uses **PlayFab's SMTP add-on and reusable PlayFab email templates**. The website does not implement a second SMTP client. The team mailbox's credentials belong in PlayFab Game Manager, never React, `VITE_` settings or source control.

Player recovery posts to `/api/email/recovery`. The server relays `Email`, the configured title ID and required `PLAYFAB_RECOVERY_EMAIL_TEMPLATE_ID` to **Client/SendAccountRecoveryEmail**, which requires no privileged authentication header. No custom password/reset tokens are created. All syntactically valid requests get the same acknowledgement, including nonexistent accounts and upstream failures. Invalid/missing email syntax receives a validation error without an account lookup. The existing client cooldown remains; PlayFab also owns provider throttling. This acknowledgement confirms submission, not inbox delivery. [PlayFab recovery API](https://learn.microsoft.com/en-us/rest/api/playfab/client/account-management/send-account-recovery-email?view=playfab-rest).

`GET/POST /api/player/email-preference` authenticates the player's session ticket and stores `emailUpdates` plus subscription time in PlayFab Title Internal Data at `civilcraft.email.preference.<PlayFabID>`. Missing/unreadable preferences default to false. A caller-supplied player ID cannot change another account's preference. The Email Updates control now reads and writes this source. Recovery does not consult this optional-email preference. Other existing Settings controls were not redesigned in this task.

## Optional release notifications

`POST /api/email/dispatch`, authenticated with `Authorization: Bearer <CRON_SECRET>`, is the backend worker. A trusted scheduler must call it; there is no browser fan-out or admin-save sending loop. It considers newly published centralized Updates, including Game Updates/Announcements used to announce a new game version. The existing browser-local Game & Download editor was preserved and is deliberately not treated as an email campaign authority. Publish a release announcement in Updates to notify subscribers.

The first draft-to-published/new-published transition records a server publication timestamp. Later edits retain it; editing a legacy published article does not announce the archive. Future publication dates are respected. The worker excludes drafts, unpublished/deleted articles, pre-subscription announcements, opt-outs and accounts without a confirmed valid contact email. It rechecks consent/publication before attempting delivery.

Delivery uses **Server/SendEmailFromTemplate** with the configured release template. Use a reusable generic “A new Civil Craft update is available” template linking to the actual site's `/updates` page and `/dashboard/settings` for opt-out. Template selection is server-side. PlayFab's template API sends to the player's contact email; the account login email alone does not guarantee a contact email exists. [Template delivery API](https://learn.microsoft.com/en-us/rest/api/playfab/server/account-management/send-email-from-template?view=playfab-rest).

Duplicate protection uses create-only, private Vercel Blob records, keyed by a hash of update ID and player ID. The existing Blob integration is reused for this durable delivery ledger; it is not a second email provider. A claim is created **before** sending. Concurrent workers/retries cannot create the same claim twice. Ambiguous send failures retain the claim: this provides at-most-once attempts, favoring no duplicates over guaranteed delivery. Audit PlayFab/provider logs before any manual recovery; never routinely delete claims. [Vercel Blob overwrite behavior](https://vercel.com/docs/vercel-blob).

Each worker invocation considers at most 25 recipients and stops starting new work after 20 seconds. Provider operations have their own timeouts. A central cursor lets later invocations continue; duplicate claims protect revisited work. Responses report sent/skipped/uncertain counts without addresses or credentials. Configure the scheduler/runtime timeout to accommodate bounded provider calls and monitor non-2xx responses and uncertain results. The small-project implementation caps the workload at 100,000 candidate pairs and is subject to PlayFab Title Data/API quotas.

## Manual PlayFab and scheduler setup still required

1. In the Civil Craft title's Game Manager, enable/configure the **SMTP add-on** using the team's existing sender account. Obtain host, port, login, provider-approved password/app credential and TLS settings from the mailbox provider. Verify the allowed From address/domain.
2. Create an **Account Recovery** template, retaining PlayFab's recovery link mechanism and correct callback settings. Save its ID in `PLAYFAB_RECOVERY_EMAIL_TEMPLATE_ID`. If missing or blank, the server logs a safe configuration error and returns the generic confirmation without calling PlayFab; there is no default-template fallback.
3. Create an **Email Verification** template. Set up the documented `player_updated_contact_email` rule to send it when the game/account flow calls `AddOrUpdateContactEmail`. Use PlayFab's confirmation link and callback; do not create a website token system. This is manual PlayFab configuration, not a new contact-editing screen in this task. [Verification setup](https://learn.microsoft.com/en-us/xbox/playfab/live-service-management/game-configuration/title-communications/emails/using-a-rule-to-verify-a-contact-email-address).
4. Create a **Game Update / New Release** template with real branding, sender, site links and a preference-management link. Save its ID in `PLAYFAB_RELEASE_EMAIL_TEMPLATE_ID`.
5. Important account notices/future acknowledgements should use additional reusable PlayFab templates from trusted server-side triggers. The `emailDelivery.send` service can be reused independently of the optional-news preference; no invented account events were added here.
6. Configure the private Blob store and worker secret, then schedule authenticated POST requests to `/api/email/dispatch` at an interval appropriate for the hosting plan. Set this up only after testing templates with controlled opted-in test accounts. No scheduler was activated or real email sent during implementation.

### Environment names

| Name | Purpose |
| --- | --- |
| `VITE_PLAYFAB_TITLE_ID` | Existing public title identifier, not a secret |
| `PLAYFAB_SECRET_KEY` | Existing server-only PlayFab administrative calls |
| `PLAYFAB_RECOVERY_EMAIL_TEMPLATE_ID` | Required custom Account Recovery template ID, read server-side |
| `PLAYFAB_RELEASE_EMAIL_TEMPLATE_ID` | Release/update template ID, read server-side |
| `BLOB_READ_WRITE_TOKEN` | Existing private Blob store, also used for delivery claims |
| `CRON_SECRET` | Server-only worker authentication |
| `ADMIN_SESSION_SECRET`, `ADMIN_USERS_JSON`, `ADMIN_AUTH_ORIGIN` | Existing admin configuration; authentication behavior unchanged |

`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM` describe the corresponding SMTP add-on settings, **not additional application variables** in this architecture. In particular, do not duplicate the SMTP password into website configuration. No credential values were generated or printed.

## Player directory behavior

- Default **Recently Active** sorts by real LastLogin descending. Other options: Newest Accounts, Oldest Accounts, Name A–Z, Name Z–A. Valid dates/names precede missing values.
- Activity: All; Recently Active means a login within seven days; Inactive means over 30 days ago or no valid login date. Neither means online. Players between these windows remain available under All.
- Account status: Active means PlayFab reports not banned; Banned means a real ban flag/expiry indicates a current ban. It is independent of login activity. Unknown status is never fabricated as Active.
- Export `isBanned`/`IsBanned` or `BannedUntil` values are reused. If a requested status filter needs unavailable ban fields, server-side enrichment reads real account `TitleInfo.isBanned`, up to 20 missing accounts per request with concurrency four and cached promises. Pending responses are polled until the snapshot can be filtered completely. No per-row lookup occurs when export ban information is present. The default All-status view does not trigger this enrichment.
- The complete snapshot is filtered, sorted, then paginated. Page sizes stay 10/20/50, default 20. Filter/sort changes reset page one. Search retains exact PlayFab ID/display-name/username lookup and respects filters where meaningful.
- The existing 15-minute snapshot lifetime remains. Activity cutoffs use snapshot time so moving between pages does not shift membership. Status enrichment uses a five-minute lookup cache and is retained in the current snapshot. Refresh/expiry obtains the next snapshot; this is not live presence tracking.
- Created remains in the detail modal as **Account created**; **First login** is shown only when provided. Last login, account status and real progression remain visible. No presence badges were introduced.

## Validation and files

Automated tests cover sorting and filtering over 53 records, pagination after filtering, export ban fields without per-row calls, date/name ordering, missing dates, recovery privacy, preference persistence/identity, opt-out and contact eligibility, concurrent duplicate claims, ambiguous delivery, and publication transitions. External services are mocked; no inbox, PlayFab SMTP add-on or production scheduler was exercised.

- `node --test tests/*.test.ts`: 72 passed, zero failures.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- Scanned 126 built client JavaScript assets: no configured secret values found.
- Built-server smoke checks: `/forgot-password`, `/updates`, and `/download` returned 200; unauthenticated email-preference and dispatch requests returned 401. The temporary server was stopped afterward.

Changed in this task:

- `src/lib/email/api.server.ts`, `src/lib/email/delivery.server.ts` (new)
- `src/lib/playfab/directory-filters.ts` (new)
- `src/lib/playfab/admin-directory.server.ts`, `admin-api.server.ts`, `admin-service.ts`, `admin-types.ts`, `admin-players.server.ts`, `admin-client.server.ts`
- `src/lib/playfab/auth.ts`, `src/lib/playfab/index.ts`
- `src/routes/admin.players.tsx`, `dashboard.settings.tsx`, `forgot-password.tsx`
- `src/components/admin/PlayerRecordModal.tsx`
- `src/lib/cms/content.server.ts` (publication marker only, preserving existing Updates work)
- `src/server.ts`, `.env.example`
- `tests/email-directory.test.ts` (new), `tests/admin-playfab.test.ts`
- `EMAIL_AND_DIRECTORY_VALIDATION.md`

Pre-existing uncommitted Updates UI changes and reports were preserved. Updates was not removed, Download was not restructured, and admin authentication code was not changed.
