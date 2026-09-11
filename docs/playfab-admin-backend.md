# Phase 3: PlayFab administrative backend

The existing TanStack Start server entry handles administrative requests before SSR. Nitro builds the application for Node or Vercel; no additional backend server, database framework, or offline authentication mode was added. Player authentication and the Client API services remain separate.

## Manual configuration

Set `VITE_PLAYFAB_TITLE_ID=17FA03` at build time and runtime. The existing public Title ID override and built-in fallback remain. Set `PLAYFAB_SECRET_KEY` only in `.env.local` for local development or in Vercel's server environment settings. `.env.local` remains ignored. The example environment file contains a blank credential entry only. Never prefix this credential with `VITE_`.

Keep the Phase 2 settings described in [admin-authentication.md](admin-authentication.md):

- `ADMIN_USERS_JSON` contains the configured staff identities and strong password hashes.
- `ADMIN_AUTH_ORIGIN` optionally sets the exact website origin; production defaults to `https://civil-craft.vercel.app`.
- `ADMIN_SESSION_SECRET`.

No external session or cursor store is required. Configure separate production/preview credentials and the matching authentication origin, then redeploy after changing Vercel settings. Local Vite loads only an explicit list of server environment names into the development process; none are added to browser defines. Public Vite variables remain public.

Ensure the PlayFab title's API access policy permits the operations below and its **All Players** segment is available. The integration probe tests `GetAllSegments`; success does not guarantee every individual operation is permitted. Failed detail sections are reported separately, and failed ban-status reads disable moderation.

At implementation validation, only the public Title ID was present locally. The PlayFab administrative credential and required Phase 2 identity/session settings were missing. No live player response or Unity-written data was inspected, and no real player was banned. Configure these settings and complete a real Civil Craft staff login before live acceptance testing.

## Endpoints and authorization

| Endpoint                                      | Behavior                                                                                                                                |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/admin/playfab/status`               | Checks configuration and reaches PlayFab; returns Title ID, Live mode, connection, API availability, message, and completion timestamp. |
| `GET /api/admin/players`                      | Starts/reuses a directory snapshot; returns up to 20 players, preparation state, opaque next cursor, and snapshot time.                 |
| `GET /api/admin/players?cursor=...`           | Reads another bounded snapshot page.                                                                                                    |
| `GET /api/admin/players?q=...&kind=PlayFabId` | Exact identifier lookup. `kind` also accepts `Username` or `TitleDisplayName`.                                                          |
| `GET /api/admin/players/:id`                  | Current identity, progression, statistics, inventory, currencies, achievements, and bans.                                               |
| `POST /api/admin/players/:id/ban`             | Confirmed account ban with required reason and optional duration.                                                                       |
| `POST /api/admin/players/:id/unban`           | Confirmed revocation of all active bans for that player.                                                                                |

The entire `/api/admin/*` namespace, including unknown routes, verifies the signed eight-hour Phase 2 session before configuration probes, directory access, or PlayFab calls. Guests, player tickets, and forged/expired sessions receive 401. Removed accounts and changed credentials receive 401. Invalid authentication configuration fails closed. Every response is private/no-store. POST requests additionally require the configured origin, non-cross-site context, JSON content, and `confirm: true`.

All calls use a fixed server-selected title host and typed operation allowlist. PlayFab credentials are attached only inside `admin-client.server.ts`. Redirects are rejected; exceptions and provider errors become fixed public messages. Raw headers, token data, email/private account information, linked identities, device IDs, inventory custom data, export URLs, and provider responses are not passed through. The UI receives explicit DTOs from `admin-types.ts`.

## Directory API migration and pagination

Microsoft [retired GetPlayersInSegment and recommends export APIs](https://developer.microsoft.com/en-us/games/articles/2026/04/playfab-digest-march-feature-updates/). This implementation uses the supported [ExportPlayersInSegment and GetSegmentExport workflow](https://learn.microsoft.com/en-us/xbox/playfab/live-service-management/game-configuration/segmentation/segmentation-export-players-in-a-segment), not the retired API.

The server finds the All Players segment, starts an asynchronous export, and the browser polls preparation every five seconds. Cursors are self-contained JWE tokens encrypted and authenticated with AES-256-GCM (`jose`, direct key derived from the session secret), bound to the administrator, title, and origin. They expire 15 minutes after the original snapshot; pagination does not extend expiry. Export identifiers and continuation offsets are encrypted, and export URLs are never included. Tokens work across server instances and restarts. A bounded per-instance cache reuses initial exports and coalesces simultaneous requests locally; cold starts or different instances can start duplicate exports. Previous/Next navigates up to 20 profiles at a time. Expired snapshots require returning to the directory.

The server reads the index and TSV fragments with a 1 MiB read cap, HTTPS-only Azure Blob host validation, rejected redirects, range validation, and request timeouts. Fragment rows are consumed with byte offsets, retaining headers between pages. It does not accumulate all players in memory or send signed export links to the browser. More than 5,000 index fragments, oversized rows/responses, unsupported hosts/formats, and disabled export APIs produce safe errors. Large-scale indexing or cross-title exports are outside this phase.

The directory contains snapshot identity and statistics supplied by the export. It deliberately leaves current ban status and user-data-only level unavailable until opening a record. The detail modal and exact search read current account APIs. This avoids making dozens of per-player support requests for every directory page. Snapshot rows can include accounts changed/deleted since export; opening a deleted record reports not found.

Search uses the documented [Admin GetUserAccountInfo identifiers](https://learn.microsoft.com/en-us/rest/api/playfab/admin/account-management/get-user-account-info?view=playfab-rest). It is exact lookup, not substring or fuzzy search. Usernames must be 3–20 characters. Display-name lookup may not work when duplicate title display names are enabled; use PlayFab ID or username. Studio administrators are never queried as players.

## PlayFab operations

| API family | Operations                                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Admin      | `GetAllSegments`, `ExportPlayersInSegment`, `GetSegmentExport`, `GetUserAccountInfo`, `GetUserBans`, `BanUsers`, `RevokeAllBansForUser` |
| Server     | `GetUserData`, `GetPlayerStatistics`, `GetUserInventory`                                                                                |

Client-authorized player dashboard services retain their own player ticket and `/Client/*` calls. Administrative operations never borrow that ticket, even if player and staff sessions coexist.

## Data mapping

These are supported mappings from the existing website contract, not a claim that Unity currently supplies them. Missing, empty, malformed, or non-finite numeric values stay `null` and render as **—** or **Not available**. Actual zero remains zero. No demo fallbacks or Global Rank are introduced.

| Display field         | Current PlayFab source                                                                  |
| --------------------- | --------------------------------------------------------------------------------------- |
| PlayFab ID / username | `UserInfo.PlayFabId` / `Username`                                                       |
| Display name          | `UserInfo.TitleInfo.DisplayName`                                                        |
| Created / last login  | `TitleInfo.Created` (then master `Created`) / `TitleInfo.LastLogin`                     |
| Level                 | User Data `CurrentLevel`                                                                |
| XP / next-level XP    | User Data `XP` / `XPToNextLevel`                                                        |
| Total score           | Statistic `TotalScore`                                                                  |
| Bridges / challenges  | Statistics `BridgesCompleted` / `ChallengesCompleted`, then identically named User Data |
| Achievement counts    | User Data `AchievementsUnlocked` / `AchievementsTotal`                                  |
| Achievement records   | Validated JSON array in User Data `AchievementProgress`: id, name, progress, unlocked   |
| Current region/map    | User Data `CurrentRegion`                                                               |
| Relevant statistics   | Current statistic names and finite values, at most 500                                  |
| Currencies            | Classic inventory `VirtualCurrency`, preserving real zero balances                      |
| Inventory             | At most 500 returned items: item ID, display name, purchase date                        |
| Account status        | Current effective bans: Active flag plus expiration; no active ban means Active         |

Achievement records have a reusable server mapping function. Inventory/currency retrieval is reusable in the detail service but is not a fabricated transaction ledger. The existing global administrator transaction placeholder remains unavailable; major Economy implementation is deferred. Region completion/almanac schemas, entity Economy v2, and additional Unity schemas are not invented. Static educational content and player-specific Client API almanac services remain unchanged. Until live configuration is supplied, it is not possible to identify which individual progression keys Unity has actually written.

## Moderation and activity

The centered modal retains the existing Civil Craft styling. It offers Permanent, 24-hour, 7-day, and 30-day bans. The server accepts whole-hour temporary durations from 1 to 8,760 and requires a 1–140-character reason without control characters. The confirmation identifies the selected player. No unsupported Suspended state is offered; inactivity remains a separate last-login indicator.

Before mutation, the server verifies current title membership and reads current bans. Duplicate bans or revocations with no active ban return 409. Ban requests contain only the selected PlayFab ID, reason, and optional duration: no IP or family-wide ban fields. PlayFab remains authoritative; successful mutations trigger a fresh detail read. Failed/ambiguous mutations are never automatically retried, and the UI asks the administrator to refresh before retrying.

Successful moderation is added to the existing browser-local Recent Activity feed. Server logs separately record operation, time, immutable staff ID, player ID, and success/unconfirmed result. Reasons, provider bodies, and secrets are not logged. The browser-local feed is not a durable organization-wide audit system; use retained server logs for cross-device review.

## Validation and acceptance

Validation results (September 9, 2026):

- TypeScript: passed with no errors.
- Automated tests: 16 authentication tests and 12 administrative backend tests passed.
- Lint on Phase 3 files: zero errors; two existing React Fast Refresh export warnings in the modal module.
- Development server: started normally. `/`, `/login`, and `/admin/login` returned HTTP 200. `/admin` and `/admin/players` redirected to `/admin/login` with HTTP 303. Administrative directory/status endpoints rejected visitors and player-ticket requests with HTTP 401.
- Player login implementation and leaderboard files: unchanged. No Lovable-specific source naming or Global Rank was reintroduced.
- Production build: passed after allowing Nitro's dependency tracer to read the parent directory outside the Windows sandbox. The sandbox failure was an `EPERM` file-tracing restriction, not a TypeScript or application error.
- Generated client output: 121 text assets checked; no PlayFab credential environment name, credential header, dummy credential canary, or privileged export/moderation implementation markers were found. The development server was stopped after verification.

Run `npm run test:auth`, `npm run test:admin`, `npx tsc --noEmit`, and `npm run build`. Backend tests intercept every network request and cover session isolation, removed-account authorization, safe partial configuration, sanitization, nullable data, export paging, exact lookup, ban expiry, CSRF, confirmation, validation, and moderation. Inspect `.output/public` for server credential markers after building. The build's dummy credential canary must not occur in browser output.

After manual configuration: sign in with configured Civil Craft administrator credentials; check Integration; load the directory through preparation and multiple pages; search known IDs/usernames; compare a detail record with PlayFab Game Manager; verify missing Unity fields; and, only on a designated test account, confirm a temporary ban and revocation. Verify the separate Player Login with a real game account. No browser automation surface was available during implementation, so interactive visual checks remain manual. No Phase 4 work was performed.

## Phase 3 file inventory

Created: `src/lib/playfab/admin-types.ts`, `admin-client.server.ts`, `admin-directory.server.ts`, `admin-players.server.ts`, `admin-api.server.ts`, `admin-service.ts`; `tests/admin-playfab.test.ts`; this document.

Modified: `.env.example`, `vite.config.ts`, `package.json`, `README.md`, `src/server.ts`, `src/lib/admin-auth/session.server.ts`, `src/lib/playfab/index.ts`, `src/components/admin/PlayerRecordModal.tsx`, `src/routes/admin.players.tsx`, `src/routes/admin.integration.tsx`.

No additional files were renamed or removed in Phase 3. Earlier cleanup deletions remain intact.
