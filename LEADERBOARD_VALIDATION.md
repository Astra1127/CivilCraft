# Canonical Global Leaderboard

## Source audit

The existing website integration explicitly identifies **TotalScore** as the primary statistic reported by Unity. Player profile, admin record, directory export and leaderboard already refer to that name. No Unity/C# source is present in this repository, and no live title statistic definitions were queried, so the actual Unity write call and live reset configuration have not been independently verified. This change preserves TotalScore; it does not create EngineeringScore or calculate a new metric.

Previously, the player view used Client/GetLeaderboard with StartPosition 0 and 25 results, then paged that limited list locally. Weekly and Monthly ignored their selected period and requested the same statistic. Development mock paths fabricated separate rankings. Missing level became 0. Client/GetLeaderboardAroundPlayer could return another player's first row as the current player's fallback rank.

## Final implementation

- Player and admin both GET the **same `/api/leaderboard` endpoint** and use the same shared React view and `TotalScore` constant. The endpoint calls **Server/GetLeaderboard** using the title's server-only secret. Player sessions are verified via Server/AuthenticateSessionTicket; admin access uses the existing server-validated admin cookie. No secret is sent to the browser, and no browser player identity participates in global ranking retrieval.
- Admin navigation includes Game → Leaderboard (`/admin/leaderboard`). It is read-only, with PlayFab IDs displayed for inspection. The endpoint accepts only GET and contains no statistic update operation.
- Pages contain at most **10 entries**. StartPosition advances by 10; subsequent requests carry the returned statistic Version with UseSpecificVersion. Displayed rank is PlayFab Position + 1, never the page array index. A full last page may be followed by an empty page; Previous remains available. Refresh restarts at the current version. This pins the reset version, not an immutable snapshot: scores can still move within a live version while the game updates them.
- Display names come from the leaderboard row or returned Profile.DisplayName, then fall back to Engineer. They never fall back to the logged-in user's name. The ranking response does not supply the game's CurrentLevel, so Level displays an em dash.
- Only Global remains. There is no evidence in this integration of separately configured weekly/monthly statistics. Their existence in the live title has not been verified; no period rankings are fabricated.
- `/api/leaderboard/me` obtains the authenticated ID from the verified ticket and calls **Server/GetLeaderboardAroundUser**. It matches that exact ID, then verifies membership with Server/GetLeaderboard at the candidate position and same version. This matters because AroundUser can return position zero for a player without the statistic. Missing or unconfirmed rank displays Not available. The user's rank is separate from the global page and is not inferred from the loaded entries.
- Admin player details use the same rank helper and the shared TotalScore constant. Player profile and admin score mapping use that constant too. The UI labels it Engineering score without renaming the underlying game statistic. Profile does not add a fabricated rank field.
- Empty data, provider errors and missing administrative access have separate states. Requests use no-store; no localStorage, sessionStorage, seed records or secondary database stores rankings. React Query retains only refetchable response data, keyed separately for global pages and personal rank. Logging in as another player cannot overwrite PlayFab rankings.
- The demo leaderboard generator and service branches were removed, including its seed names and invented scores. Existing unrelated development demo assets remain outside the canonical leaderboard path.

## Cross-system status

Players, real player profiles, Global Leaderboard and bug reports are PlayFab-backed. Player transactions still derive from PlayFab inventory; a central admin transaction ledger is not implemented and is not fabricated. Existing website contact messages and CMS content remain browser-local as documented in CROSS_BROWSER_VALIDATION.md.

## Validation

Final checks: `npm run build` PASS; `npx tsc --noEmit` PASS; `node --test tests/*.test.ts` PASS (35/35); `git diff --check` PASS. No deployment or push was performed.

Automated tests intercept PlayFab; no players or reports are created in the live title. Tests verify identical responses for Player A, Player B and an admin; replay after other sessions read; paging 1–10, 11–20 and 21–23; server-provided rank positions; exact personal identity; unranked users; version mismatch; missing configuration; authentication; and malformed responses. Existing authentication, player directory and bug-report tests remain included.

Live three-browser acceptance has **not been executed**. Use the same deployment/title in all three browsers:

1. A signs in as existing Player A, B as administrator, and C as existing Player B.
2. Open Global Leaderboard in all three. Refresh and compare ordered PlayFab IDs, ranks and scores for the same statistic version and page. Only personal highlighting/Your Rank may differ.
3. Page through results and compare corresponding pages. If the game is updating scores, repeat after updates settle; live ranking changes are not browser inconsistency.
4. Compare A and C's personal ranks with their actual global rows, including players outside page one. Unranked accounts must show Not available.
5. B opens those player records; compare identity, Engineering score and Global rank. Reload B after logging out/closing A and C; the rankings must remain.
6. Confirm there are no weekly/monthly tabs or score-edit controls. Verify Retry and the empty state against a controlled backend test environment, without creating fake production records.

## Relevant files

New: `src/lib/playfab/leaderboard-shared.ts`, `src/lib/playfab/leaderboard.server.ts`, `src/routes/admin.leaderboard.tsx`, this report.

Updated: `src/lib/playfab/leaderboard.ts`, `index.ts`, `mock-data.ts`, `types.ts`, `player.ts`, `admin-client.server.ts`, `admin-directory.server.ts`, `admin-players.server.ts`, `admin-types.ts`; `src/components/site/LeaderboardView.tsx`; `src/components/admin/PlayerRecordModal.tsx`; `src/routes/admin.tsx`, `dashboard.index.tsx`, `dashboard.profile.tsx`; `src/server.ts`; generated `src/routeTree.gen.ts`; `tests/admin-playfab.test.ts`.

## API references

- [PlayFab Server/GetLeaderboard](https://learn.microsoft.com/en-us/rest/api/playfab/server/player-data-management/get-leaderboard?view=playfab-rest): StartPosition, version selection and global Position semantics.
- [PlayFab Server/GetLeaderboardAroundUser](https://learn.microsoft.com/en-us/rest/api/playfab/server/player-data-management/get-leaderboard-around-user?view=playfab-rest): exact user lookup and the documented position-zero behavior for a missing statistic.
