# Bridge Almanac audit — 2026-10-27

## Scope and evidence

Read-only Unity checkout: `../CivilCraft_Apk/Civil-Craft`. Website changes only.
No Unity files, encrypted saves, live CloudScript, PlayFab settings or player data
were changed. No commits, pushes or deployment were performed. No authenticated
live Entity Files inventory was obtained in this audit; absence of a local
publisher is not proof that no historical file exists in PlayFab.

| Feature                    | Already available                                                                                                              | Website work needed / implemented                                                                            | Unity programmer work needed                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Story level ordering       | Authored transcript, ContractSO IDs/dialogue, NPC phases; leaderboard selectable IDs                                           | Shared labels/order corrected for verified main chain; tutorials Level 00; side jobs separate                | Confirm future stages through explicit authored stage metadata; fix alphabetical source order/current-status heuristics upstream |
| Quiz scores                | No quiz implementation or records found in inspected Assets scripts/assets; screenshots described in request were not attached | Optional validated attempt reader and Quiz Records tab                                                       | Identify quiz implementation/build, persist actual results and publish agreed projection                                         |
| Quiz answer review         | No published question/answer DTO found                                                                                         | Complete, consistent question review only; aggregate score remains visible without review                    | Publish actual questions, choices, selected/correct indexes and immutable attempt IDs if retained                                |
| Engineering lessons        | Seven authored LessonData assets and sprite references; local unlockedLessonIds                                                | Exported authored titles/text/images; explicit per-player lesson records; no inferred unlocks from contracts | Publish actual lesson discoveries; completion only if a separate completion event exists                                         |
| Material properties        | Six BridgeMaterialSO assets, PHP/m, kg/m, m, axial N                                                                           | Versioned-in-repository reusable catalog, real illustrations, all verified properties                        | Keep balance catalog updated when assets change                                                                                  |
| Material discoveries       | DashboardSyncService maps five real discoveries to existing website IDs                                                        | Exact-ID discovery gating retained; catalog lists undiscovered entries without revealing properties          | Add ConcreteBeam → concrete_member only after real discovery; retain prior discoveries                                           |
| Completed bridge snapshots | Local PNG capture/cache keyed to contract; existing private portrait pipeline                                                  | Private Entity File reader bound to exact completion IDs, shared card/dialog renderer, image-error fallback  | Upload completed bridge PNGs, finalize files, then publish bound completion snapshot reference                                   |

## Verified story sequence

`src/lib/playfab/leaderboard-shared.ts` lists selectable contracts. Its tutorials
and side jobs are interleaved, so list position is not an authoritative stage.
The configurable visibility list also controls selection, not narrative order.
Leaderboard scoring, ranking and visibility configuration remain unchanged.

| Stable contract ID | Display               | Authored evidence                                                                                                                                                                                      |
| ------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TUT_CONTRACT1      | Tutorial 1 (Level 00) | Bhan Tutorial 1.asset; opening transcript Bhan phase 3                                                                                                                                                 |
| TUT_CONTRACT2      | Tutorial 2 (Level 00) | Bhan Tutorial 2.asset; opening transcript Bhan phase 6                                                                                                                                                 |
| ShopKeeper         | Level 01              | ShopKeeperContract.asset; opening transcript Bhan phase 9, then Reed handoff                                                                                                                           |
| ReedsContract      | Level 02              | Reed's Contract.asset; Reed.prefab phases MeetingReed → ExplainSituation → Reed Contract Give → ReedFareWell; user-confirmed Level 02                                                                  |
| VancesContract     | Level 03              | Vance's Contract.asset; CanyonCrossing.unity Vance phases “The Supply Route Part Two” → cargo introduction → Project Briefing; finished dialogue sends player to Silas                                 |
| SilasMainContract  | Level 04              | SilasContract.asset: Vance shipment halfway, finish community connection; finished dialogue asks player to stay for eastern passage                                                                    |
| MainContractSilas  | Level 05              | CanyonCrossing.unity Silas Project Briefing references SilasMainContract; later ProjectBriefing2 references MainContractSilas; final dialogue opens eastern passage and sends player toward Town River |

Contract assets live under `Assets/BridgeBuilder/Data/Contract/CanyonCrossing/`.
Opening transcript: `Docs/StoryDialogue_Bhan_to_Shopkeeper.md`.
Reed prefab: `Assets/Elements/Characters/Prefabs/Reed.prefab`.
The Silas scene component is fileID `318150247`; Vance is `1601157397`.
Their asset reference GUIDs resolve to the IDs above, rather than asset names.

`ReedSideInspection` and `VanceSideRealignment` explicitly have
`isStoryModeContract: 0`: they are **Side contract**, never numbered main stages.
`MarshID` is a TownRiver asset without a verified released stage number here;
`123` is a NewContract asset. Neither receives an invented canonical number.
Unknown contracts retain valid explicit `stageOrder`, otherwise show Contract.
Display aliases never replace original saved IDs, notification IDs or URLs.

## Actual publishing boundaries

`Assets/Script/Player/PlayerSave/DashboardSyncService.cs`, BuildAlmanac, sorts by
ContractID and exports `order = index + 1`. That field remains diagnostic, not a
stage number. Current/locked status is preserved, including upstream heuristics.
It derives engineeringConceptIds from bridge shape; these are **not** LessonData
discoveries. It currently substitutes synchronization time for missing bridge
completion timestamps. The website cannot recover the original missing date
from that published value; the handoff requests an upstream correction.

LessonData uses trimmed lessonId (asset name fallback). The Beam asset contains
leading whitespace, so its actual runtime ID is `LESSON002`. The exported seven
lessons are Beam, Compression, DeadLoad, Equilibruim (asset spelling preserved),
LiveLoadLesson, Tension and Truss. NEWLESSON has no stable authored lessonId and
title “Lesson Title”; it is excluded. Simulation lesson assets are separate from
the Almanac LessonData archive and are not conflated with completion records.

LessonSaveManager reads `unlockedLessonIds`; opening the website writes nothing.
The player dashboard now uses the game catalog rather than website-authored
engineering summaries/ASCII diagrams. Existing public/CMS content is untouched.
Unavailable lesson entries show their titles and unavailable unlock state;
their explanations/images appear only with explicit discovered/completed state.

BridgeMaterialSO defines per-member values. Dual placement doubles cost/mass;
tall piers use length-dependent compression reduction. The UI labels base
values and those caveats. Rope's authored Infinity length is stored as null in
the static catalog and displayed as Unlimited in game, not an unknown number.
Steel variants from the prior website catalog have no matching inspected asset
here and are not presented as verified game materials.

`scripts/extract-almanac-catalog.mjs` reads definitions and `.meta` sprite GUIDs,
strips Unity rich-text markup, copies referenced single-sprite images only and
records source paths in `src/lib/almanac/game-catalog.json`. It never accesses
playerSaveData.json. Ten source illustrations were copied to
`public/images/almanac-game/`. Refresh only against programmer-approved assets.
It uses the already installed js-yaml development dependency transitively; it
does not run at application startup or build time.

PlayerDataManager's TrySaveBridgePhoto/CaptureActualBridgePhoto write a local
PNG cache with integrity markers. ContractAlmanacTab loads the contract cache
and supports legacy contract-name photo paths. CloudSaveManager uploads the
encrypted save as playerSaveData.json, not those PNG files. DashboardCompletion
declares completionScreenshotUrl, but BuildAlmanac does not assign it. No bridge
photo Entity File uploader was found. Local cache behavior does not establish
an immutable attempt history. CharacterPortraitUploadService separately uploads
characterPortrait.png; that image is never selected as a bridge snapshot.

## Changed files

- `src/lib/playfab/level-records.ts`: shared main-stage and tutorial labels.
- `src/lib/playfab/almanac.ts`, `types.ts`, new `almanac-education.ts`: additive
  optional projection, validation and restricted snapshot references.
- `src/lib/almanac/game-catalog.json`, `scripts/extract-almanac-catalog.mjs`,
  `public/images/almanac-game/*`: authored reusable catalog and illustrations.
- `src/components/dashboard/almanac/AlmanacJournal.tsx`, `GameEducation.tsx`:
  game lesson/material readers and Quiz Records tab.
- `LevelEntryDialog.tsx`, `useBridgeSnapshot.ts` in that component directory:
  shared image rendering, authenticated reads, cleanup and graceful fallback.
- `src/lib/playfab/bridge-snapshot.server.ts`, `src/server.ts`: isolated GET
  handler using existing authenticated portrait design; no caller identity/file.
- `tests/almanac-integration.test.mjs`, `almanac-discovery.test.mjs`,
  `level-progression.test.mjs`, `notification-navigation.test.mjs`: validation,
  gameplay mapping, material disclosure and existing navigation regression.
- This audit and `docs/almanac-unity-integration-handoff.md`.

## Validation and remaining limitations

- TypeScript `npx tsc --noEmit`: passed.
- Production `npm run build`: passed (existing toolchain notices only).
- Selected dashboard sync/account, character portrait, player session, Almanac
  and notification suites: 69 tests passed. Fixtures do not alter live data.
- Changed-file ESLint: passed. UI regressions cover explicit lesson discovery,
  actual quiz score/review rendering and image-load fallback, using mocked data.
- Desktop/mobile browser visual verification: pending. No DOM browser was
  connected; native Computer Use access to the existing Almanac Chrome window
  timed out at app approval. Responsive grids, wrapping, image constraints and
  horizontally scrolling tab list are present, but code inspection is not a
  rendered visual check. No browser/account state was modified.
- No end-to-end newly published Unity result was demonstrated. Quiz records,
  lesson records, concrete-member discovery and private snapshot references need
  the programmer's publication work before real records can appear.
- Existing HTTPS completionScreenshotUrl records remain compatible and gain
  graceful load failure. Their hosting/access policy is inherited; new private
  screenshots should use the Entity File reference flow, not public URLs.
