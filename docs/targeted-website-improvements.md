# Targeted website improvements

## Root causes and changes

- **Home:** the What's New heading, copy and release-notes CTA were a standalone
  section in `src/routes/index.tsx`, followed by its own draft divider. Removed
  that section and divider. The surrounding world artwork, team teaser, download
  CTA and navigation remain. `src/routes/download.tsx` is unchanged.
- **Admin Players:** export rows only read `PlayerStatistics.CurrentLevel`, while
  the player dashboard reads `UserData.CurrentLevel`. A player could therefore
  have a valid dashboard level with no exported level statistic. The directory
  now reads `Server/GetUserData` with only `Keys: ["CurrentLevel"]` for each
  displayed player, after filtering/sorting/pagination. Four reads run at a time,
  with a bounded enrichment window; failures do not hide players or block ban
  status checks. UserData takes precedence over the existing actual CurrentLevel
  export-statistic fallback. Neither score nor rank is a level source.
  `parsePlayerLevel` is shared by dashboard profile, admin detail and directory;
  it preserves zero and accepts only nonnegative safe integers. Missing/invalid
  records remain null (displayed as an em dash). No records are written.
- **Materials:** cards inherited the extractor's asset filename order. Added an
  explicit presentation sequence: `wood_beam`, `wood_support`, `wood_road`,
  `concrete_road`, `concrete_member`, `rope`. The first three are the user-confirmed
  game sequence. The remaining three retain their **existing relative order** in
  the in-repo game catalog. That export has no authored display-order field, so
  their later gameplay sequence is not independently verified. No Unity files
  outside this workspace were read; programmer confirmation is still needed if
  a different later order is intended. Catalog objects, IDs, text, numbers,
  images and discovery matching are unchanged.
- **Engineering:** lesson bodies and four existing images previously rendered
  only after explicit discovery; three lessons had no image. All seven now have
  an always-visible preview using the first sentence of the verified description.
  Existing images are reused. Tension, Compression and Equilibrium use accessible
  inline diagrams illustrating only the pulling/pushing/balanced-force concepts
  already described by those lessons. Images/diagrams have consistent responsive
  heights and beige/brown styling. Missing/broken assets show a labeled fallback.
  Full notes remain available only with existing discovered/completed records.
  Previews do not grant or change any state.

## Files

- `src/routes/index.tsx`
- `src/lib/playfab/player-level.ts` (new shared account-level parser)
- `src/lib/playfab/player.ts`
- `src/lib/playfab/admin-directory.server.ts`
- `src/lib/playfab/admin-players.server.ts`
- `src/lib/almanac/material-order.ts` (new presentation ordering)
- `src/components/dashboard/almanac/GameEducation.tsx`
- `src/components/dashboard/almanac/LessonIllustration.tsx` (new)
- `tests/admin-playfab.test.ts`
- `tests/player-level.test.ts` (new)
- `tests/material-order.test.mjs` (new)
- `tests/almanac-discovery.test.mjs`
- This note.

## Validation

TypeScript (`npx tsc --noEmit`), scoped ESLint for the changed source/tests,
production build (`npm run build`) and all **103 tests** in these mocked regression
suites passed:

```text
tests/admin-playfab.test.ts
tests/email-directory.test.ts
tests/player-level.test.ts
tests/material-order.test.mjs
tests/almanac-discovery.test.mjs
tests/almanac-integration.test.mjs
tests/level-progression.test.mjs
tests/notification-navigation.test.mjs
tests/dashboard-account-features.test.mjs
tests/release-posts-ui.test.mjs
```

The suites cover per-player level isolation, UserData precedence, safe failures,
zero/missing/malformed levels, cached snapshot preservation, pagination, search,
filtering, moderation, canonical material order, seven previews and illustrations,
image failures, quiz display, story labels and notification navigation. All
network calls in the tests are mocked; no live PlayFab or email data was changed.

No connected browser was available (`cua.listBrowsers()` returned an empty list),
so rendered desktop/mobile visual checks remain pending. Responsive classes and
component rendering are covered by source review and component tests.

No new game publishing is needed for the admin fix when CurrentLevel is already
published. Existing missing lesson/discovery synchronization remains a game-side
dependency and is not filled by previews. Confirm the later materials' authored
order before claiming a fully verified game sequence. Unity, CloudScript,
PlayFab settings, player data, story numbering, quiz logic, bridge snapshots,
notifications, achievements, payments and unrelated admin functionality were not
modified. No commit, push or deployment was performed.
