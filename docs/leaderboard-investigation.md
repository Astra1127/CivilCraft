# Civil Craft bridge leaderboard integration

## Implemented

The old website queried TotalScore, while deployed CloudScript Revision 4 publishes two independent encoded best-run statistics for each of nine contracts. The server now resolves contractId and mode through the explicit allowlist in src/lib/playfab/leaderboard-config.server.ts. Neither arbitrary statistic names nor unknown contracts/modes can be selected by API callers.

The existing authenticated endpoints, player-session validation, staff cookies and server-only secret transport remain intact. Both the top page and current-player AroundUser lookup use the selected statistic, including the membership verification query. Backend order and Position + 1 ranks are preserved. No score writes or CloudScript changes were added.

The UI offers the nine exact contract IDs and Efficient/Strongest selectors. All-Time remains the default; Weekly remains disabled. Changing selection remounts the selected view, resetting pagination, filters and pinned version. Query cache keys include both selections. Refresh fetches the current version. Each mode displays its own run's construction cost and peak stress; the modes are never merged.

For packed = 2147483647 - score:
- Efficient: cost = floor(packed / 1001); peak stress = (packed % 1001) / 10.
- Strongest: cost = packed % 1000001; peak stress = floor(packed / 1000001) / 10.
- Integer scores and decoded cost 0..1000000 / stress 0..100 are validated. Invalid stored values fail closed.

The nearby Unity checkout confirms display units in Assets/Script/Level/LevelCompleteManager.cs: line 866 displays the peso sign for rounded total cost; line 883 displays peak bridge stress as a percentage. Line 760 converts the game's normalized peak to a percentage. The website follows these units and retains one decimal for stress. LeaderboardScoreCodec.cs and LeaderboardSubmissionService.cs are still absent; decoding follows the supplied Live Revision 4 source and explicit user-provided formulas.

TotalScore remains only as a legacy profile/directory field, not as a bridge leaderboard statistic. The admin overview now labels its default ShopKeeper/Efficient leaderboard and shows decoded values.

## Live read-only verification

The local website configuration and available Unity Main Menu scene both select title 17FA03. Production deployment configuration and the running Unity binary still need confirmation.

A successful Admin/GetPlayerStatisticDefinitions read of title 17FA03 verified all 18 allowlisted statistics exist, with AggregationMethod Max, VersionChangeInterval Never, CurrentVersion 0, and no deletion in progress. No configuration changes were made. Max retains the largest encoded value; Never matches the All-Time UI. API reference: https://learn.microsoft.com/en-us/rest/api/playfab/admin/player-data-management/get-player-statistic-definitions

The updated server functions read the first row of all 18 live leaderboards. For every populated board, Server/GetPlayerStatistics matched its raw score and leaderboardRank matched its score/rank in the same version:

| Contract | Mode | Construction cost (peso) | Peak stress (%) | Rank |
| --- | --- | ---: | ---: | ---: |
| VancesContract | Efficient | 92329 | 90.1 | 1 |
| VancesContract | Strongest | 104651 | 68.9 | 1 |
| SilasMainContract | Efficient | 127285 | 33.9 | 1 |
| SilasMainContract | Strongest | 127285 | 33.9 | 1 |
| MainContractSilas | Efficient | 134265 | 71.4 | 1 |
| MainContractSilas | Strongest | 134265 | 71.4 | 1 |

The other twelve boards returned no entries. Empty ShopKeeper results are therefore expected until that contract has a published run. Select VancesContract to inspect existing data. No player identifiers or credentials are recorded here.

These checks validate existing records through the actual server reader. They do not prove a newly completed Unity run reached the deployed website, nor replace an authenticated browser check. Those checks remain pending.

## Completed-run verification procedure

1. Deploy the website build with the same VITE_PLAYFAB_TITLE_ID at build and server runtime, and PLAYFAB_SECRET_KEY only on the server. Confirm Unity uses that title and Live CloudScript Revision 4.
2. Record the existing Efficient and Strongest statistics for a test player's chosen contract. Complete a bridge in Unity and capture contractId, integer cost and integer stressTenths from the submission.
3. Check the ExecuteCloudScript result for an execution Error and the function result. accepted: true with updated: 0 means neither mode improved; do not expect the displayed best runs to change. Do not run CloudScript manually to fabricate a score.
4. Compute both encoded values using Revision 4. In PlayFab Game Manager, open the player and Statistics and compare the exact allowlisted CC_E_ and CC_S_ values. With Max aggregation, each should independently retain its previous value or the new value, whichever is greater.
5. Sign into /dashboard/leaderboards with the same player account. Select the submitted contract and Efficient, click Refresh, clear page filters, and inspect /api/leaderboard?contractId=...&mode=efficient plus /api/leaderboard/me with the same contract/mode/version. Compare construction cost, peak stress and backend Position + 1 rank.
6. Switch to Strongest and repeat against its stored value. It may show a different run. Switch to another contract and verify separation. Verify pagination and switching back do not carry a different statistic's pinned version or rank.
7. Confirm unauthenticated endpoints deny access and no client bundle contains server credentials. The website must never call UpdatePlayerStatistics or submitBridgeRunV1 to create runs.

## Changed files

Validation: 36 server/codec tests and the React selector integration test passed;
TypeScript checking, the production build, and the production client-bundle secret
scan passed. Existing live records were read without submitting or altering scores.

- src/lib/playfab/leaderboard-config.server.ts: Revision 4 allowlist and validated decoder.
- src/lib/playfab/leaderboard.server.ts: selected-statistic top/current-player reads and request validation.
- src/lib/playfab/leaderboard-shared.ts: public contract IDs, mode types and defaults.
- src/lib/playfab/leaderboard.ts: sends contract/mode on both authenticated requests.
- src/lib/playfab/types.ts: decoded measurement fields.
- src/components/site/LeaderboardView.tsx: selectors, cache/version isolation and decoded display.
- src/routes/admin.index.tsx: decoded default-board preview and label.
- tests/admin-playfab.test.ts: all 18 mappings and endpoint rejection coverage; valid encoded fixtures.
- tests/bridge-score.test.ts: codec boundaries, malformed values and ordering.
- tests/leaderboard-ui.test.mjs: selector changes, page/version reset and decoded display.
- docs/leaderboard-investigation.md: findings and verification procedure.
