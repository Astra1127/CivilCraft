# Website leaderboards

The player dashboard has a **Leaderboards** sidebar item at
`/dashboard/leaderboards`. It now renders inside the authenticated player
dashboard instead of redirecting to the public site. `/leaderboard` continues
to be the public page. Both pages share the same two tabs.

## Single-player

The existing nine contract selectors and Most efficient / Strongest rankings
are preserved. Each mode uses its existing allowlisted `CC_E_` or `CC_S_`
statistic and packed bridge-score decoder. Pagination, version pinning and
refresh remain separate from multiplayer. Switching tabs resets bridge
pagination instead of carrying a previous page into another game mode.

## Multiplayer

The multiplayer tab matches the game's top-15 leaderboard:

- Ranking: `CC_MP_Wins`, highest total wins first, preserving PlayFab positions.
- Additional record fields: `CC_MP_Losses` and `CC_MP_Draws`.
- Win rate: `wins / (wins + losses) * 100`; draws are excluded. A player with
  no decided matches displays an em dash, not an invented percentage.
- Counts are nonnegative 32-bit integers, not encoded construction/stress scores.
- Valid missing loss/draw statistics are zero, matching the game's read handler.
  Service failures or malformed data are errors, not empty results.

The server-only reader gets `CC_MP_Wins` with `MaxResultsCount: 15`, then requests
only the two record statistics for those returned players. Follow-up reads are
bounded to five at a time. The public GET endpoint is
`/api/leaderboard/public/multiplayer`; it accepts no query parameters, arbitrary
statistic names, or caller-supplied player IDs. Its response contains only rank,
display name, wins, losses and draws. Account IDs, email, credentials and other
profile/statistic fields are not returned. Existing authenticated endpoints and
the player-only dashboard gate are unchanged.

No website score writes, match submissions, Unity changes or PlayFab definition
changes are needed for this display integration. Actual completed game matches
must publish the statistics before players can appear. This is the game's
development leaderboard; client-reported match results are not anti-cheat-certified.

## Deployment and checks

On the fork's Vercel project, use the same `VITE_PLAYFAB_TITLE_ID=17FA03` at build
and runtime. Set `PLAYFAB_SECRET_KEY` only in server environment settings (or the
ignored `.env.local` for local development), never with a `VITE_` prefix or in
GitHub source. A title ID alone cannot authorize the server leaderboard reads.
Redeploy after changing environment settings. Do not paste a secret into chat.

1. Open `/dashboard` while signed in and verify Leaderboards is visible in both
   the desktop sidebar and mobile menu, staying inside the dashboard when opened.
2. On Single-player, select a populated contract and compare both ranking modes
   with PlayFab's matching statistics. Check paging and Refresh.
3. Switch to Multiplayer and compare ranks/wins with `CC_MP_Wins`, and loss/draw
   totals with the player's Statistics. Confirm names retain supported hex colors.
4. A player with 5 wins, 3 losses and 2 draws has a 62.5% win rate. With no wins
   or losses, win rate is an em dash. Empty boards and service errors have
   different messages. The UI does not fabricate scores to test them.
5. Return to Single-player and verify paging starts from the first page. Verify
   `/leaderboard` has the same tabs, and guest/admin-only sessions cannot access
   the player dashboard.
6. Verify the fork deployment before opening a PR to the original repository.
   Publishing to the fork does not promote the original Vercel production site.

## Automated validation

The production build, TypeScript check, changed-source lint, and client-bundle
credential scan passed. The 32 focused multiplayer/navigation UI and server
tests passed, alongside existing bridge/authentication/name-color regressions.
The full suite recorded 271 passes and four pre-existing unrelated failures:
almanac progression normalization, two contact UI mock imports, and an email
directory fixture. Those unrelated source/test files were not changed here.
