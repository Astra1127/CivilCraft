# Player notification navigation audit

Notifications were already derived from the current player's `AchievementProgress` and `AlmanacProgress`. The bell previously discarded record IDs and only marked rows read. Achievements had no selected-card URL state; journal dialogs only used component state. Read flags used one browser-wide local-storage key.

## Result

- Achievement notifications carry the existing achievement ID and open `/dashboard/achievements?achievementId=...`. The matching unlocked card is highlighted, scrolled into view and focused. No name matching is used.
- Level notifications carry level and region IDs and open `/dashboard/almanac?tab=journey&levelId=...&regionId=...`. The existing completed-level dialog opens. Closing removes the selection from the URL; browser Back/Forward restores URL-driven selection.
- A destination marks the corresponding notification read after resolving exactly one eligible record from the current player's queried data. Missing, ambiguous, generated-ID, locked or incomplete targets remain unread. Notifications without a target explain that the destination is unavailable. Mark All Read remains available.
- Notifications and achievements query caches include the authenticated player ID. Read flags are stored under `civilcraft.notifications.read.v1:<playerId>`. Mutations also check the expected signed-in player. The old unscoped key is left untouched and is not migrated because its owner cannot be established: previously read items may initially reappear unread. Existing notification IDs are retained.
- Dashboard authentication remains in the existing parent route. URL parameters never select a player or change API authorization. A completion that explicitly identifies a different player is rejected.
- Radix menu items provide keyboard selection; successful navigation closes the popover without restoring focus over the destination. Normal Escape/outside dismissal keeps the existing Radix behavior. Width is capped to the viewport on narrow screens; existing responsive cards and journal dialog are reused.

## Required game data

No Unity, CloudScript or PlayFab setting was changed. Precise navigation requires persistent IDs in the existing records:

- `AchievementProgress`: an achievement `id`, `Id` or `achievementId` (or the existing dictionary key), plus real unlock state/date for notification generation.
- `AlmanacProgress`: region `regionId`, `RegionId` or `id`; level `levelId`, `LevelId` or `id`; completed status and completion data. An explicit completion `playerId`, when supplied, must match the signed-in account.

The existing parsers previously synthesized positional IDs when these were absent. Such records still render, but now carry `stableId: false` and cannot become precise notification targets. Duplicate matches are also rejected. No live player data was accessed, so the actual achievement ID for **Cost Efficient** and region/level IDs for **Level 04 — ShopKeeperContract** remain unverified. Test fixture IDs are not production mappings. The wallet's ShopKeeperContract alias is deliberately not used to infer journal IDs.

## Validation

Run `node --test tests/notification-navigation.test.mjs tests/dashboard-sync-v1.test.ts`, `npx tsc --noEmit`, and `npm run build`.

Focused tests exercise ID-based destinations, unknown/ambiguous targets, generated-ID detection, foreign-player completions, read-state merging/isolation, stale-account mutations, destination acknowledgment, popover dismissal, responsive width constraints, card focus/highlight, direct URL selection, dialog close and simulated Back selection changes. Existing dashboard parser tests are included.

The UI tests use mocked router/menu boundaries; they are not end-to-end browser or touch-device tests. With a dedicated signed-in test account, manually verify Enter/Space/arrow navigation, Escape/outside dismissal, 320px/390px layouts, real browser Back/Forward, and achievement/level links against the real synced IDs. No emails, progress writes, production settings, commits, pushes or deployments are part of this task.

## Changed files

- `src/components/dashboard/NotificationBell.tsx`
- `src/components/dashboard/useNotificationRead.ts` (new)
- `src/components/dashboard/almanac/AlmanacJournal.tsx`
- `src/routes/dashboard.achievements.tsx`
- `src/routes/dashboard.almanac.tsx`
- `src/lib/playfab/types.ts`
- `src/lib/playfab/index.ts`
- `src/lib/playfab/player.ts`
- `src/lib/playfab/almanac.ts`
- `src/lib/playfab/notification-navigation.ts` (new)
- `tests/notification-navigation.test.mjs` (new)
- `docs/notification-navigation.md` (new)

Pre-existing email-template edits and the deployment-readiness document were left untouched.
