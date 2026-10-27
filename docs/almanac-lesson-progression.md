# Engineering Almanac: partial story catalog and real lesson progress

This replaces the previous tutorial-completion encounter policy. **No contract
completion, tutorial completion, bridge type, concept list, score or date grants
a lesson state.** Lessons can be introduced/discovered before contract completion.
Only the existing validated per-player `lessonRecords` entries confirm discovery
or completion. Reading or browsing previews never writes a record.

## Sources and verified mappings

The project owner's latest partial-story specification supplies the stage/topic
associations below. Existing website contract mappings supply known IDs and level
labels. `game-catalog.json` preserves the seven extracted authored assets, their
original LessonData IDs, descriptions, images and provenance. Existing concept
explanations come from `content.ts`. No Unity files outside this website workspace
were accessed or modified. This is **not** the final story, map or lesson count.

| Documented introduction           | Topics               | Verified contract/level binding                                    | Game lesson IDs available            |
| --------------------------------- | -------------------- | ------------------------------------------------------------------ | ------------------------------------ |
| Professor Bhan — Initial Tutorial | Dead Load; Live Load | Tutorial chapter / Level 00; exact phase/subcontract still unbound | deadload; LESSON001                  |
| Professor Bhan — Truss Tutorial   | Equilibrium          | Tutorial chapter / Level 00; exact phase/subcontract still unbound | What is Equilibrium                  |
| Reed — Supply Route               | Bending              | ReedsContract / existing Level 02                                  | Missing                              |
| Vance — Direct Route              | Tension; Compression | VancesContract / existing Level 03                                 | What is Tension; What is Compression |
| Silas — Community Connection      | Load Distribution    | SilasMainContract / existing Level 04                              | Missing                              |
| Silas — Later Main Quest          | Load Transfer        | MainContractSilas / existing Level 05                              | Missing                              |
| Brooks — Market Connection        | Moving Load          | Contract ID, map and numbered level unverified                     | Missing                              |
| Mills — Heavy Equipment Route     | Structural Failure   | Contract ID, map and numbered level unverified                     | Missing                              |

No lesson introduction is assigned to ShopKeeper/Level 01 by inference. Its
existing numbering is unchanged, as are tutorial, side-contract and deep-link IDs.
Brooks/Mills are names provided by the project owner; no game NPC identifier or
contract ID was invented. Their groups have internal **website stage keys**, not
game identifiers. Map `canyon_crossing` is retained only for existing verified
Canyon/tutorial bindings; future maps remain unspecified until confirmed.

## Central authored catalog

- `src/lib/almanac/lesson-metadata.json` declares stage order, NPC display names,
  verified map/contract bindings, categories, stable website keys, existing game
  lesson references, concept references and optional illustration/diagram IDs.
- `src/lib/almanac/lesson-catalog.ts` resolves that metadata against the existing
  authored asset/concept catalogs. It exposes generic grouping, synchronization
  requirements, real progress interpretation, previews and popup references.
- Source LessonData IDs remain unchanged. **Website keys are never silently
  accepted as PlayFab lesson IDs.** `concept:bending`, `concept:load-distribution`,
  `concept:structural-failure`, `reference:load-transfer` and
  `reference:moving-load` are presentation keys only. Their `sync.lessonId` is
  absent, so they cannot accidentally match a discovery record.
- Five of the existing extracted LessonData records are engineering topics.
  BEAM BRIDGE (`LESSON002`) and What is Truss (`LESSON004`) remain preserved as
  `bridge-type` references, separate from Engineering. Existing Bridge Types and
  Materials tabs are unchanged. Existing records for those IDs remain readable.
- Bending, Load Distribution and Structural Failure reuse existing concept text
  and diagrams. Load Transfer and Moving Load have verified names/introductions
  only: their cards explicitly say educational notes await verified game content.
  No explanation, illustration, Game Lesson ID or discovery event is fabricated.

Grouping is driven by stage order and lesson order, not alphabetic catalog order,
player completion, map count or a fixed list of UI branches. Unknown introduction
bindings fall into a labeled unmapped group rather than receiving an invented
level. New verified contract IDs without a known numbered level receive a
documented-stage label, not a guessed Level 06 or later.

## Authored introduction versus player synchronization

The label **Introduced in …** describes curriculum only. Cards separately show:

- **Unlocked · Synced from game** for a unique validated `state: discovered`.
- **Completed · Synced from game** for a unique validated `state: completed`.
- **Lesson state not yet synchronized** when a supported ID has no explicit state.
- **Lesson synchronization unavailable · Game lesson ID pending** when the
  programmer has not supplied a verified LessonData identifier.

Existing `AlmanacProgress.lessonRecords` is unchanged. No new backend key, endpoint,
save rewrite or migration is introduced. Invalid/duplicate record handling remains
in the existing parser/reader. Unknown future lesson IDs remain in the parsed
records and trigger an unmapped-record notice; the website does not guess their
content or discard/overwrite historical PlayFab records. Contract
`engineeringConceptIds` never grant LessonData unlocks.

Full notes use actual discovered/completed state, independent of contract
completion. Public educational previews and illustrations carry no unlock grant.
No timestamps, scores, quiz results or historical progress are generated.

## Level-popup behavior

Popup concepts are still selected from the existing level's synchronized concept
IDs. Known catalog topics use the same title, first-sentence preview and image or
diagram as Engineering. Other existing concepts retain their current explanation
and shared diagram fallback. Unknown concepts without catalog content are omitted
safely. No authored stage association is used to append a concept to a player's
historical completion record.

Dead/Live Load share the original local images; force/concept diagrams use the
shared `LessonIllustration` renderer. Beam/Truss bridge information uses its
preserved authored reference. Compact sizing, responsive grids, image-error
fallbacks and modal accessibility remain. Tutorial 1's Bending exclusion from the
previous targeted UI change is preserved; Bending still appears where recorded
on other levels and in its documented Reed introduction group.

Completion statistics, score/date fields, bridge snapshots, achievement logic and
notification navigation are unchanged. No images were duplicated.

## Missing game publishing and future additions

The programmer must confirm/publish the real LessonData IDs for Bending, Load
Distribution, Load Transfer, Moving Load and Structural Failure; the exact Bhan
introduction phases; and Brooks/Mills stable contract/map/NPC IDs if available.
Load Transfer/Moving Load also need approved educational text and illustrations.
Publish `lessonRecords` when the actual introduction/unlock is saved, even if the
associated contract is still incomplete. Publish `completed` only for a genuine
separate lesson completion event. Retain prior records; do not seed examples or
backfill lessons from contracts. No Unity/CloudScript/configuration changes were
performed as part of this website task.

To add future content without rewriting the UI:

1. Add or update the verified asset definition in `game-catalog.json` (using the
   existing reviewed export process) or a verified concept explanation.
2. Add a stable website stage key, explicit order, verified display name and only
   confirmed map/contract bindings to `lesson-metadata.json`. Leave unknown IDs
   absent. Never rename existing game LessonData or contract IDs.
3. Add a lesson metadata row referencing `gameLessonId` or verified `conceptId`,
   its category, introduction stage, order and optional existing diagram. The
   generic reader automatically builds its card and group.
4. For a concept currently lacking a game LessonData ID, preserve its existing
   website key while adding the verified `gameLessonId` binding. Do not repurpose
   an old game ID or rewrite player records to match a website key.
5. Add publishing/fixture checks for real discovery before completion, missing
   state, unknown/duplicate IDs, image failure and historical compatibility.

## Changed files and validation

Source: `lesson-metadata.json`, `lesson-catalog.ts`, `GameEducation.tsx`,
`ConceptIllustrations.tsx`, and `LevelEntryDialog.tsx`. Tests:
`tests/lesson-progression.test.mjs`, `tests/almanac-discovery.test.mjs`. The prior
compact-card and Tutorial 1 Bending-filter edits already present in the working
tree are retained. No unrelated files or live data are modified.

The relevant regression suite covers the partial documented order, category
separation, original IDs/text/images, pre-contract discovery, no contract-based
unlock inference, unknown game IDs, future stage insertion, popup asset/content
reuse, materials, quizzes, snapshots and notification navigation. TypeScript,
scoped ESLint and production build all passed, along with **42 regression tests**.
No browser was connected, so desktop/mobile visual checks remain pending;
component tests are not a substitute for visual QA.
