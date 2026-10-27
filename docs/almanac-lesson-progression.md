# Engineering lessons and level-popup illustrations

## Verified introductions versus player progress

The project owner's current specification verifies **Dead Load** (`deadload`) and
**Live Load** (`LESSON001`) as introductions in the **Tutorial (Level 00)** chapter.
It does not specify which of the two Bhan tutorial contracts introduces each one.
The UI therefore labels the chapter, not a guessed tutorial sub-stage.

| Lesson ID           | Existing authored title | Verified introduction                           |
| ------------------- | ----------------------- | ----------------------------------------------- |
| deadload            | Dead Load               | Tutorial / Level 00, confirmed by project owner |
| LESSON001           | Live Load               | Tutorial / Level 00, confirmed by project owner |
| LESSON002           | BEAM BRIDGE             | Requires programmer confirmation                |
| What is Compression | What is Compression     | Requires programmer confirmation                |
| What is Equilibrium | What is Equilibrium     | Requires programmer confirmation                |
| What is Tension     | What is Tension         | Requires programmer confirmation                |
| LESSON004           | What is Truss           | Requires programmer confirmation                |

No Level 01–05 lesson introduction is independently established by the available
in-repository metadata. ShopKeeper, ReedsContract, VancesContract,
SilasMainContract and MainContractSilas retain their existing numbered mapping;
no introduction labels are assigned to them by title, bridge shape or score.

The existing `game-catalog.json` contains all seven authored lesson IDs, titles,
descriptions and available image paths, with source asset provenance. It has no
lesson-to-contract introduction field. `AlmanacLevel.engineeringConceptIds`
identifies concepts in a synchronized level record; it does not identify a
LessonData unlock. The earlier read-only audit of DashboardSyncService recorded
that those concept IDs are derived from bridge shape. They are insufficient to
assign numbered introductions or unlock all related lessons. No Unity files
outside the website workspace were accessed for this change.

`src/lib/almanac/lesson-catalog.ts` shares the authored catalog references,
introduction grouping, progress interpretation and popup visual references.
Dead/Live Load appear first in the Tutorial group. The other five remain in an
explicit **Introduction level awaiting verification** group. Their catalog order
within that group is archival presentation, not a claimed gameplay sequence.

## Display states

1. A validated, unique `lessonRecords` entry takes precedence. `completed` shows
   **Completed · Synced from game**; `discovered` shows **Unlocked · Synced from
   game**. Existing payload IDs/fields and parser behavior are unchanged.
2. Without a lesson record, both `TUT_CONTRACT1` and `TUT_CONTRACT2` must have
   unique, stable successful completion records in the same region, verified for
   the signed-in player using the existing completion validator. Then **only the
   two verified tutorial load lessons** show **Encountered in completed tutorial ·
   Unlock sync pending**. Full notes are readable, but no lesson record is created
   and neither unlocked nor completed is claimed. Requiring both contracts is a
   conservative chapter-completion rule until the exact sub-stage is verified.
3. Missing, partial, locked, foreign-player, mismatched or ambiguous tutorial
   completions leave lessons in **Lesson state not yet synchronized**. Explicit
   lesson records can still independently unlock their own lesson.

All seven previews and illustrations remain browsable. Authored full notes are
available for synced unlock/completion or the two verified tutorial encounters.
Introduction labels describe curriculum; they do not assert player discovery.
No dates, scores, quiz records or progress values are generated or persisted.

Verified completed tutorial records may list **Recorded tutorial concepts** in the
Engineering tab. This is a record-specific association, not a global claim that
every tutorial contains every concept or that every related lesson is unlocked.

## Popup illustrations

The existing What you encountered list still comes exclusively from that level's
`engineeringConceptIds`; no concept is appended because of the level name.

- `load` reuses the Dead Load and Live Load lessons' exact local image references.
- Tension and Compression reuse their Engineering-card force diagrams.
- Stability uses the shared equilibrium diagram as a visual reference, without
  claiming the equilibrium lesson was introduced or unlocked there.
- Bending, Support, Shear, Load Distribution and Structural Failure use compact
  shared diagrams based on their existing concept explanations. These are not
  additional LessonData entries; the authored seven-lesson catalog is unchanged.
- Existing Beam Bridge / Truss Bridge information reuses the corresponding
  authored lesson image when the completion identifies that bridge type. A used
  bridge type does not establish a lesson introduction or unlock.

`ConceptIllustrations` and `LessonIllustration` are shared renderers; no bitmap
files were duplicated. Compact 112/128 px illustration heights and a two-column
concept grid from the small breakpoint limit modal scrolling. Figures and list
items constrain width; the dialog retains its existing vertical scroll, title,
description, focus/close handling and adds horizontal overflow protection.
Missing or broken images retain the labeled illustration fallback. Score,
completion date, contract links, achievement display and bridge photo handling
remain unchanged.

## Programmer confirmation still required

Confirm the precise tutorial contract/phase that introduces each load lesson,
and the earliest authored introduction for each remaining lesson across Levels
01–05 (or confirm it belongs elsewhere). Supply stable LessonData.Id and
ContractID/phase references rather than display titles or alphabetical positions.
The website must not infer these introductions from `engineeringConceptIds`.
Continue publishing actual discoveries through the existing `lessonRecords`
contract; missing data is not backfilled. No new PlayFab schema is required by
this implementation, and no Unity/CloudScript/configuration/live data was changed.

## Validation

Regression coverage includes tutorial associations, all seven original catalog
entries, same-player chapter completion, missing/partial/ambiguous records,
explicit lesson-state precedence, unrelated story completions, popup asset reuse,
compact diagrams, missing images and existing navigation/quiz/material/snapshot
behavior. All 41 selected regression tests, TypeScript (`npx tsc --noEmit`),
changed-file ESLint and the production build (`npm run build`) passed.

No connected browser was available (`cua.listBrowsers()` returned `[]`), so actual
desktop/mobile visual inspection remains pending. Responsive sizing and rendered
component structure are tested; they are not a substitute for browser visual QA.

Changed source files: `AlmanacJournal.tsx`, `GameEducation.tsx`,
`LevelEntryDialog.tsx`, `LessonIllustration.tsx`, new `ConceptIllustrations.tsx`
in `src/components/dashboard/almanac/`, and new
`src/lib/almanac/lesson-catalog.ts`. Tests: `tests/almanac-discovery.test.mjs`
and new `tests/lesson-progression.test.mjs`.
