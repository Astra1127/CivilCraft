# Level completion and story-stage audit

## Findings

Notifications are derived on each read from the signed-in player's `AchievementProgress` and `AlmanacProgress` by `notificationService` in `src/lib/playfab/index.ts`. Local storage holds read flags only; it does not hold a persistent notification list. Static contract definitions do not directly create website notifications.

The former Almanac parser accepted any non-null `completion` object, supplied default success/score/bridge values, and the notification service selected every level with such an object. Consequently a locked/current contract with an empty or default nested object could generate “Level completed — Date unavailable.” This is a website validation defect; a missing date by itself does not prove an invalid completion.

No live player data was fetched during this task. Therefore the individual live SilasContract, Vance's Contract, Vance Side Realignment and Marsh Contract entries cannot be declared completed or incomplete from their names or missing dates. They now pass the same record-based rules: incomplete/unknown status, empty payload, explicit failure, conflicting IDs, missing stable IDs, ambiguous duplicate targets or an explicit different player are excluded. Regression fixtures cover all four reported names/IDs. A completed record with explicit success, a real timestamp, or positive score plus a bridge type supplies completion evidence; a bare completed label plus an empty object does not.

The read-only local Unity source at `../CivilCraft_Apk/Civil-Craft/Assets/Script/Player/PlayerSave/DashboardSyncService.cs`, `BuildAlmanac` (around lines 407–485), explicitly sorts contracts by `ContractID`, exports `order = index + 1`, and assigns the first eligible incomplete contract current status using objective/fallback logic. The website displayed this catalog order as a story level. This explains the observed MainContractSilas 01 / ShopKeeper 04 discrepancy. The raw catalog order is now preserved for diagnostics and is not displayed as a story stage.

The same Unity method regards a matching saved bridge as completed and substitutes synchronization time when `completedAtUtc` is empty. The website cannot distinguish that substituted timestamp from an actual completion date once exported. No game code was changed. Empty/invalid dates remain empty on the website; validated undated completions stay navigable and show **Synced completion**, sort after dated events, and are never assigned the current time.

## Confirmed opening mapping

The project owner clarified on 2026-10-26 that tutorials do NOT count as numbered Story Mode levels. The local `Docs/StoryDialogue_Bhan_to_Shopkeeper.md` documents Bhan phases 3, 6 and 9 offering `TUT_CONTRACT1`, `TUT_CONTRACT2` and `ShopKeeper` respectively. `Assets/BridgeBuilder/Data/Contract/CanyonCrossing/Bhan/ShopKeeperContract.asset` identifies its stable `contractID` as `ShopKeeper`; `ShopKeeperContract` is the asset name and a supported legacy ID alias for display mapping only. Raw saved IDs are never renamed.

| Raw ID | Before | Website stage after |
| --- | --- | --- |
| TUT_CONTRACT1 | Previously Level 01 | Tutorial 1 |
| TUT_CONTRACT2 | Previously Level 02 | Tutorial 2 |
| ShopKeeper / legacy ShopKeeperContract | Catalog Level 04, then incorrectly Level 03 | Level 01 |
| MainContractSilas | Observed Level 01 | Contract (stage unconfirmed) |
| Other contracts | Catalog/array-position level number | Contract, unless explicit positive `stageOrder` metadata exists |

Tutorials sort first within their existing region with separate Tutorial 1/2 labels and no story stageOrder. Verified Story Mode stages follow, starting at ShopKeeper Level 01. Unnumbered contracts retain their incoming relative order; no later story sequence is invented. The new `stageOrder` is separate from raw `levelId`, asset/display `levelName` and source catalog `order`. My Journey, cards, screenshot captions, dialogs and completion notifications share the same label function. Deep links still use the original level and region IDs, so saved links remain valid for eligible completions.

Saved completed/current/locked states are not reassigned by stage sorting. Missing or invalid states become **unknown**, not locked or completed. In particular, MainContractSilas may still show Current challenge if that is what PlayFab exports; correcting the alphabetic current-objective fallback at its source needs game-team confirmation. Unverified completed cards show a neutral progress-details message instead of a fabricated journal entry.

## Preservation and validation

No PlayFab records, read flags, Unity files, CloudScript, authentication, payment code or settings were written. Invalid items disappear from the freshly derived list rather than being deleted from PlayFab. Existing notification IDs and player-scoped read storage are unchanged. Mark All Read, achievement modals, account checks and stable-ID journal links have regression coverage. A session change during a notification fetch discards that result.

Checks: `node --test tests/level-progression.test.mjs tests/notification-navigation.test.mjs tests/dashboard-sync-v1.test.ts`, `npx tsc --noEmit`, scoped ESLint, and `npm run build`. Tests cover incomplete/default records, undated completions, stage order, unchanged raw IDs/statuses, duplicate targets, foreign-player data, read merging, achievement behavior and completed-level links. No live-account validation was performed.

## Questions for the Unity programmer

1. Confirm the remaining canonical sequence after ShopKeeper, including side contracts and Marsh, and the intended region/stage scope. Supply persistent IDs and explicit `stageOrder` metadata rather than alphabetical catalog positions.
2. Confirm that a saved bridge always represents successful completion for all deployed versions, or export a reliable completion flag/status. The current snapshot has no separate provenance flag for the website to inspect.
3. Supply the original completion date when known and preserve its absence otherwise. A separate sync timestamp would let the website avoid presenting synchronization time as a completion date.
4. Confirm the authoritative active objective; the website deliberately does not mark another level current merely because it sorts earlier.
5. If individual reported entries still need classification, provide a redacted `AlmanacProgress` sample containing their IDs, status and completion fields, without tickets, keys or personal data.

## Changed files

- `src/lib/playfab/level-records.ts` (new shared completion/stage helpers)
- `src/lib/playfab/almanac.ts` (parse validation and opening-stage mapping)
- `src/lib/playfab/index.ts` (notification eligibility and session guard)
- `src/lib/playfab/notification-navigation.ts` (same eligibility for journal targets)
- `src/lib/playfab/types.ts` (separate stage metadata and unknown state)
- `src/components/dashboard/NotificationBell.tsx` (neutral undated label)
- `src/components/dashboard/almanac/AlmanacJournal.tsx` (shared stage labels and neutral unverified cards)
- `src/components/dashboard/almanac/LevelEntryDialog.tsx` (shared stage labels)
- `tests/level-progression.test.mjs` (new)
- `tests/notification-navigation.test.mjs` (expanded)
- `docs/level-progression-audit.md` (this report)
