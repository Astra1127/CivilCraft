# Admin directory and overview validation

This report supersedes the directory pagination description in CROSS_BROWSER_VALIDATION.md. Authentication, credentials and player dashboard behavior were not changed in this task.

## Directory pagination

The previous reader stopped at the end of **one export fragment**, even if its 20-row limit had not been reached. PlayFab's index lists fragments, not UI pages. A one-player fragment therefore became a one-player page. This defect is reproduced in the automated fixtures; live export files were not inspected during this task.

The directory now reads all fragments into a complete, server-cached snapshot and paginates that snapshot on the server. Default is **20 rows**; **10, 20 and 50** are supported. The UI sends a page number and an opaque encrypted snapshot reference. PlayFab export identifiers and download URLs are not exposed as readable browser continuations. The legacy encrypted nextCursor path remains compatible for internal callers and tests. The cursor format is versioned to prevent interpreting old byte offsets as row offsets.

The snapshot uses Admin/GetAllSegments → All Players → Admin/ExportPlayersInSegment → Admin/GetSegmentExport and bounded HTTPS TSV downloads. It preserves fragment order, deduplicates PlayFab IDs, and returns totals only after the entire snapshot is successfully read. Total players, “Showing … of …” and page count use that complete population. Search still uses Admin/GetUserAccountInfo for exact PlayFab ID, display name or username, independently of visible pages.

The 15-minute server cache contains real mapped records, never the browser's current player. Cache keys bind export/title/credentials; encrypted snapshot references bind title/admin/origin and expire. Cache entries can be rebuilt after restart using the encrypted reference. Failed reads are evicted; no partial population is presented as a complete count. Failed exports invalidate their initial lookup. Four fragment downloads run concurrently, with 1 MiB ranges, a 64 MiB total read budget, 50,000 rows, 5,000 fragments and a read deadline. Oversized/slow exports produce an error rather than partial analytics. This bounded full-snapshot strategy is intended for the thesis population, not an unbounded analytics warehouse.

Rows-per-page is stored only in sessionStorage under `civilcraft.admin.directory.rows`. This is a UI preference, not shared player data. Previous/Next use page numbers in the same snapshot. Refreshing the directory resets the page/search state; a new export is prepared when the snapshot expires. Development-only cache bypass remains disabled in production.

## Overview architecture and metric sources

GET `/api/admin/analytics` runs only after the existing administrator session and staff checks. It returns independently classified ready/pending/error modules, without raw credentials or private export URLs. Player aggregation reuses the full directory snapshot. Bugs, leaderboard and connection probe run independently; a failed bug backend does not replace player analytics with zeros or hide successful modules. No per-player profile/user-data requests are made for analytics.

| Module / metric | Source and interpretation |
| --- | --- |
| Total players | Unique PlayFab IDs in the complete All Players snapshot |
| Recently active | LastLogin within the preceding 7 days, relative to snapshot time; not online presence. Unavailable if every account lacks a usable timestamp |
| Registrations chart | Last 30 UTC calendar days from PlayFab creation timestamps; missing/invalid/future dates excluded and missing coverage stated |
| Activity chart | LastLogin buckets: last 7 days, 8–30 days, over 30 days, unavailable. Each player belongs to one bucket; no invented daily history |
| Open bug reports | New + Investigating from centralized PlayFab title internal bug storage |
| Bug status chart | Actual New, Investigating, Resolved and Closed counts |
| Latest bug reports | Five newest centralized reports, with authenticated player ID, category, status and server date |
| Top engineers | First five entries from the existing canonical Server/GetLeaderboard / TotalScore helper; backend rank and score, no new ranking |
| Average engineering score | Mean of recorded TotalScore export values; denominator is accounts with recorded values |
| Bridges / challenges completed | Sum of recorded BridgesCompleted / ChallengesCompleted export values; coverage displayed |
| Average level | Not available when CurrentLevel user data is absent from the export; no extra per-player calls or fabricated zero |
| Backend connection | Actual server Admin/GetAllSegments probe |
| Mode, title ID, last checked | Server configuration (Live) and server probe response timestamp |
| Current build primary card | Not available: no centralized release source exists in this project |
| Local release configuration | Existing browser CMS version, build, minimum Android and release date, clearly separated and labeled local/unverified |

Missing statistic values never contribute zeros. A real recorded zero does contribute. Registration and bug charts show empty states for absent history/records. All backend modules support loading/error/retry behavior. The overview uses the existing Recharts dependency, responsive containers, tooltips, keyboard accessibility support and screen-reader data tables. Cream/brown rounded panels and blueprint technical cards retain the existing Civil Craft styling; layout collapses to one column on narrow screens.

## Remaining local CMS and omitted metrics

News, gallery, FAQ, contact messages, website action history, releases, settings and About content still use the seeded browser CMS in `civilcraft.cms.v3`. They were not migrated or counted as global analytics. News/gallery/message counters and sample inquiries/action records are removed from the overview. Existing local release configuration is visibly labeled and separated at the bottom.

No fake growth percentages, traffic, daily active-user trend or economy chart were added. Economy analytics are omitted because the admin global transaction ledger is not implemented. Average level and centrally verified current build remain unavailable. Historical usage cannot be inferred from one LastLogin per player.

## Validation and limits

Final results: production build PASS; TypeScript (`npx tsc --noEmit`) PASS; tests (`node --test tests/*.test.ts`) **43/43 PASS**; `git diff --check` PASS. The build used the approved Windows filesystem access needed by Nitro. No new dependencies, deployment, commit or push were introduced.

Automated tests cover 0, 1, 5, 20, 21 and 53 players with one player in each fragment; all 10/20/50 page sizes; backend page counts; replay/Previous and separate admin sessions; invalid page sizes; existing exact backend search; cursor tampering, expiry and restart; complete snapshot analytics; zero versus missing statistics; UTC registration bins; exact 7/30-day activity boundaries; and independent module failures. These tests intercept PlayFab and create no live players, reports or analytics data.

No connected browser surface was available for visual verification. Live two-browser acceptance and desktop/mobile visual inspection were not executed. To validate the deployment, open the same title in two administrator browsers, compare directory IDs/totals across page sizes and pages, search an off-page ID, and compare overview totals against the same snapshot. Inspect charts at mobile/tablet/desktop widths and compare their accessible data tables with the displayed bars. Counts can legitimately change when a newer snapshot is created.

## Files changed in this task

- `src/lib/playfab/admin-directory.server.ts`
- `src/lib/playfab/admin-api.server.ts`
- `src/lib/playfab/admin-service.ts`
- `src/lib/playfab/admin-types.ts`
- `src/lib/playfab/analytics-types.ts` (new)
- `src/lib/playfab/analytics.server.ts` (new)
- `src/routes/admin.players.tsx`
- `src/routes/admin.index.tsx`
- `tests/admin-playfab.test.ts`
- `ADMIN_ANALYTICS_VALIDATION.md` (new)

API reference: [PlayFab's segment export tutorial](https://learn.microsoft.com/en-us/xbox/playfab/live-service-management/game-configuration/segmentation/segmentation-export-players-in-a-segment) documents the index of TSV fragment URLs; a fragment is not a UI page.
