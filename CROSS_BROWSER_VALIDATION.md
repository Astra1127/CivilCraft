# Cross-browser consistency audit and validation

## Findings and changes

1. Bug submissions and admin CRUD used `civilcraft.cms.v3` in localStorage (`cms/store.ts`, `ReportBugDialog.tsx`, `admin.bugs.tsx`, and the unused `bugReportService`). Same-browser access shared that store; another browser had its own records and seed sample. Those paths are removed. Legacy browser reports are ignored, not imported as trusted player submissions. The production sample is removed.
2. Reports now use PlayFab **title internal data**, through `Admin/GetTitleInternalData` and `Admin/SetTitleInternalData`, with a UUID key per report under `civilcraft.bug.v1.`. This is the server-only equivalent chosen for the small thesis queue. Independent report keys avoid a shared list read/modify/write race. Status keys are separate, and deletion writes a tombstone then removes the report body so stale status writes cannot resurrect deleted reports. Competing status updates use last-write-wins semantics.
3. `POST /api/player/bug-reports` verifies the supplied session ticket using `Server/AuthenticateSessionTicket`. Identity comes from its UserInfo; ID, timestamp and initial New status are server-generated. Category and description are validated; version/platform are optional untrusted descriptive metadata. `GET/POST /api/admin/bug-reports` reuse the existing admin authentication and same-origin mutation checks. Provider failures never become successful local writes.
4. **The demo switch was reversed:** `VITE_PLAYFAB_DEMO=false` enabled mock services. This could return a mock profile with the caller's real PlayFab ID substituted, mixing identities. It now requires explicit `true` AND a development build. The exact reported jeyben/jemjem incident was not reproduced with live sessions, so its precise historical cause is not proven.
5. The directory already used privileged PlayFab APIs, not local player sessions. It still obtains All Players using `Admin/GetAllSegments`, `Admin/ExportPlayersInSegment`, and `Admin/GetSegmentExport`, then reads bounded TSV fragments. The server caches export identifiers, not the latest browser player or a partial replacement list. Encrypted continuations preserve export, fragment, byte offset and header; they are bound to title and admin, and expire with the 15-minute snapshot. A Directory-button stale-search refetch was fixed. Current details use `Admin/GetUserAccountInfo`, server user data/statistics/inventory, and `Admin/GetUserBans`.
6. Last login is PlayFab `TitleInfo.LastLogin` (or the export LastLogin column), not browser activity or current time. Inferred active/inactive badges and their unused helper are removed. Account status comes from ban data for detailed records; unavailable list status remains unavailable.
7. Player profiles now require a successful PlayFab account response and matching ID. Cached display name, email, creation date and avatar are no longer profile fallbacks. Missing progression is null and shown as an em dash. Admin and player use CurrentLevel, XP, XPToNextLevel, TotalScore, BridgesCompleted and ChallengesCompleted with compatible statistics/user-data precedence.

## Remaining local state (not all website CMS content was migrated)

| Data | Authority / limitation |
| --- | --- |
| Bug reports, status, deletion | PlayFab title internal data; no browser authority |
| Admin directory, details and moderation | Server-side PlayFab APIs; no player Client Session Ticket |
| Player identity/profile and progression | PlayFab; browser retains session ticket and identity for sign-in/navigation, but does not supply admin directory or trusted report identity |
| Admin authentication | Existing signed HttpOnly server-validated session, unchanged |
| Contact messages | Existing browser CMS remains authoritative, including its existing sample inquiry; cross-browser contact-message support is not implemented by this bug-report fix |
| CMS activity | Browser-local log of website actions, now labeled “Actions in this browser”; not player presence or a central audit log |
| News, gallery, FAQ, releases, settings, About content | Existing seeded browser CMS remains authoritative |
| Notifications | Backend-derived notifications; read markers remain local preferences |
| Transactions | Player view derives records from PlayFab inventory; admin global ledger is not implemented and returns the existing empty/unavailable state, not demo transactions |
| React Query | In-memory response cache, not persistent authority; report inbox re-fetches every 15 seconds and supports manual refresh |

No sessionStorage or IndexedDB data store was found. No database or local JSON persistence was added.

## PlayFab storage limits

Title internal data is not immediately consistent: allow up to a minute for provider propagation. The UI communicates this and polls. Storage remains subject to PlayFab title key/value quotas; quota failures return an error, never a false success. This is a small thesis queue, not an unlimited report service. The title secret and admin credentials remain server-only. Unrelated internal title values are never returned by the report endpoint.

References: [GetTitleInternalData](https://learn.microsoft.com/en-us/rest/api/playfab/admin/title-wide-data-management/get-title-internal-data?view=playfab-rest), [SetTitleInternalData](https://learn.microsoft.com/en-us/rest/api/playfab/server/title-wide-data-management/set-title-internal-data?view=playfab-rest).

## Two-browser acceptance checklist (prepared; not live-executed)

Use two genuinely separate browser profiles, both pointing at the same running deployment/title. Do not fabricate records for testing; use an actual player issue and existing player accounts.

1. Browser A: sign in as Player A and record the backend profile PlayFab ID. Browser B: sign in through the existing administrator portal.
2. A: submit a real bug report. Verify POST returns 201 and an ID. B: refresh Bug Reports; allow up to a minute, then verify identical report ID, authenticated player ID, description, server timestamp and New status.
3. B: set Investigating, reload, and verify persistence after provider propagation. Test other status values as appropriate. If deleting the test report, verify it stays absent after reload.
4. Keep A signed in. B: clear search with Directory, page forward/back and inspect Player A by exact ID. Verify the directory does not become A's current profile or retain a previous exact search.
5. Sign in as existing Player B in a third isolated session. Verify both IDs by exact search and across All Players pages. Newly created accounts may require a new snapshot after the 15-minute lifetime.
6. Refresh B and close A. Verify reports and player records remain available.
7. Compare player profile and admin details for the same ID: display name, member since, last login, level, XP, score, bridges and challenges. Missing values must remain unavailable; compare detail records for current values rather than old export timestamps.
8. Development only: an authenticated GET `/api/admin/players?fresh=1` starts a fresh snapshot for comparison. Poll using its returned cursor, then follow continuation pages. Bypass is ignored unless NODE_ENV is explicitly development; production exposes no bypass. Never log secrets, session tickets, export URLs or encrypted cursors.

## Automated checks

`npx tsc --noEmit`, `npm run build`, and `node --test tests/*.test.ts` are required. Tests use an isolated fake PlayFab transport; they do not create players or reports in the live title. Coverage includes admin auth, directory pagination/cursor isolation, trusted report identity, separate sessions, concurrent submissions, status persistence, real delete calls, validation, CSRF and provider failures.

## Final results

- Production build: PASS (Nitro packaging required the approved Windows filesystem access after a sandbox EPERM).
- TypeScript: PASS (`npx tsc --noEmit`).
- Tests: PASS, 32/32 (`node --test tests/*.test.ts`).
- `git diff --check`: PASS.
- Public JavaScript scan: no PLAYFAB_SECRET_KEY, ADMIN_SESSION_SECRET or passwordHash identifiers.
- Live PlayFab writes / real two-browser acceptance: not executed; checklist prepared above.
- Administrator authentication architecture unchanged. No deployment, commit or push performed.

## Files modified or added

- `src/components/admin/PlayerRecordModal.tsx`
- `src/components/dashboard/ReportBugDialog.tsx`
- `src/lib/cms/seed.ts`
- `src/lib/cms/store.ts`
- `src/lib/cms/types.ts`
- `src/lib/playfab/admin-api.server.ts`
- `src/lib/playfab/admin-client.server.ts`
- `src/lib/playfab/admin-directory.server.ts`
- `src/lib/playfab/admin-service.ts`
- `src/lib/playfab/config.ts`
- `src/lib/playfab/index.ts`
- `src/lib/playfab/player.ts`
- `src/lib/playfab/types.ts`
- `src/lib/services/index.ts`
- `src/routes/admin.bugs.tsx`
- `src/routes/admin.index.tsx`
- `src/routes/admin.players.tsx`
- `src/routes/dashboard.index.tsx`
- `src/routes/dashboard.profile.tsx`
- `src/server.ts`
- `tests/admin-playfab.test.ts`
- `src/lib/playfab/bug-reports.server.ts`
- `src/lib/playfab/request-body.server.ts`
- `CROSS_BROWSER_VALIDATION.md`
