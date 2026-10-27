# Unity programmer handoff — Almanac records

Website reader support is implemented; **the new fields below are proposed
publication requirements, not a claim that the game already sends them**.
No Unity, CloudScript, PlayFab setting or player record was modified. Coordinate
publisher/backend changes separately; do not deploy the sample as player data.

## Existing transport and identity

The website reads the signed-in player's **AlmanacProgress** UserData using
Client/GetUserData without a caller-selected PlayFabId. Keep the existing
dashboard sync path and preserve all existing fields. Publish optional additive
`quizAttempts`, `lessonRecords`, and nested completion `snapshot` fields there.
The existing deployed sync handler must be reviewed by its owner for preserving
these fields before rollout; website support does not add writer functionality.
Do not introduce alternate public keys or overwrite the entire player projection
from a stale partial payload. Keep the data private to its owning account.

Publish only under authenticated currentPlayerId/title_player_account. No title
secret belongs in Unity or the browser. Bind asynchronous uploads to the account
and selected completion generation; discard callbacks after account changes.
Do not decrypt or modify playerSaveData.json for website integration.

## Quiz attempts

Missing: verified quiz stable IDs/definitions, persistent result history, actual
score records and optional submitted-answer review. No quiz source was found in
the inspected checkout. Confirm which game build owns the shown quiz before
agreeing identifiers. The title below is illustrative, not a seeded catalog.

**Example only — additive fragment of AlmanacProgress:**

```json
{
  "quizAttempts": [
    {
      "quizId": "programmer-approved-stable-quiz-id",
      "attemptId": "immutable-result-id",
      "title": "Beam Bridge Quiz",
      "topic": "BEAM BRIDGE",
      "status": "completed",
      "score": 1,
      "totalQuestions": 1,
      "completedAt": "2026-10-27T01:00:00.000Z",
      "answers": [
        {
          "questionId": "stable-question-id",
          "question": "Actual question text from this quiz version",
          "choices": ["Actual choice A", "Actual choice B"],
          "selectedIndex": 0,
          "correctIndex": 0
        }
      ]
    }
  ]
}
```

Trigger after a real quiz submission is finalized and saved. Score is the actual
number correct, not percentage; integer 0 ≤ score ≤ totalQuestions, total 1–500.
Preserve the title/question/choice version for each retained attempt; never
reconstruct old answers from a newer question bank. Indexes are zero based.
Omit completedAt if no actual completion timestamp was retained. Omit answers
when only aggregate performance exists. Do not fabricate historical attempts.

Website behavior: every valid retained attempt displays as a separate completed
record, grouped by its quiz title/topic and identified by attemptId. Percentage
is calculated from the actual score. At most 1,000 retained entries are read;
coordinate pagination/storage before exceeding UserData quotas. If the game
retains only latest results, publish only those and do not claim a full history.
Duplicate (quizId, attemptId) entries are ambiguous and all copies are ignored.
Review appears only when every question has a unique ID, valid choices/indexes
and the review's count of correct answers matches the aggregate score. Invalid
review does not remove an otherwise valid aggregate result. Unknown dates show
Completion date unavailable; missing quiz data shows an explicit empty state.

## Lesson archive

Missing: synchronization of `PlayerData.unlockedLessonIds`, which LessonSaveManager
already reads locally. Contract engineeringConceptIds are inferred bridge concepts
and must not be used as lesson unlock/completion evidence.

**Example only:**

```json
{
  "lessonRecords": [{ "lessonId": "LESSON002", "state": "discovered" }]
}
```

Stable LessonData IDs currently exported: `LESSON002` (BEAM BRIDGE), `LESSON001`
(Live Load), `LESSON004` (What is Truss), `deadload`, `What is Compression`,
`What is Tension`, `What is Equilibrium`. Match the runtime trimmed LessonData.Id,
not filename/title guessing. Trigger after real UnlockLesson persistence; publish
`discovered` for that event. Publish `completed` only if there is a distinct,
verified game completion event. Merely opening the website/lesson never writes
state. Duplicate lesson IDs are ignored as ambiguous. Missing entries remain
unlock-state-not-synchronized, not completed or definitively locked.

Catalog update: website `scripts/extract-almanac-catalog.mjs` exports authored
text, per-member values and referenced single-sprite illustrations. Run from
website root after programmer-approved asset changes and review the diff. Do not
silently change stable IDs after release. NEWLESSON placeholder is excluded.

## Material discoveries

Existing mapping in DashboardSyncService.MapMaterial:

| Unity material ID   | Website discovery ID                                 |
| ------------------- | ---------------------------------------------------- |
| Beam                | wood_beam                                            |
| Pier                | wood_support                                         |
| RopeMaterial / Rope | rope                                                 |
| Wood Road           | wood_road                                            |
| Concrete Road       | concrete_road                                        |
| ConcreteBeam        | concrete_member — proposed missing publisher mapping |

The website catalog now contains verified definitions for these six materials.
It does not grant discovery from materials used in a bridge, account level,
leaderboards or opening the website. Preserve the cumulative discovery set and
publish only IDs actually acknowledged/unlocked for that player. Do not backfill
steel variants just because the old website notes listed them. Base values use
PHP/m, kg/m, m and N. Dual-placement cost/mass and pier buckling caveats are shown.

## Completed bridge screenshots

Existing capture is local: PlayerDataManager.TrySaveBridgePhoto,
CaptureActualBridgePhoto and ContractAlmanacTab's cached PNG loader. The cloud
save file does not automatically upload the separate PNG. Reuse the lifecycle
pattern in CharacterPortraitUploadService, with distinct bridge filenames.
Never substitute characterPortrait.png or publish the encrypted save URL.

Recommended storage: **private PlayFab Entity Files** on the authenticated
player's title_player_account. Use InitiateFileUploads → PUT PNG bytes to the
returned UploadUrl → FinalizeFileUploads, following the existing portrait code's
profile-version/error handling. Only publish the reference after finalization.
Retry safely after failures; a failed upload must not erase the completion.

Filename must match `bridge-[A-Za-z0-9_-]{1,160}.png`, for example
`bridge-<opaque-result-id>.png`. Use unique immutable result IDs rather than
reusing the same filename for multiple results. PNG limit is 8 MiB. Do not
publish filesystem paths, signed download URLs, arbitrary URLs or entity tokens.

**Example only — fragment nested in the exact existing completed level:**

```json
{
  "levelId": "ShopKeeper",
  "status": "completed",
  "completion": {
    "playerId": "authenticated-player-id",
    "levelId": "ShopKeeper",
    "regionId": "canyon_crossing",
    "status": "success",
    "bridgeTypeId": "beam",
    "score": 3,
    "completedAt": "2026-10-27T01:00:00.000Z",
    "snapshot": {
      "contractId": "ShopKeeper",
      "regionId": "canyon_crossing",
      "fileName": "bridge-opaque-result-id.png",
      "capturedAt": "2026-10-27T01:00:01.000Z",
      "attemptId": "opaque-result-id",
      "completionRecordId": "opaque-completion-id"
    }
  }
}
```

The owning region's regionId must match. Keep the original stable saved contract
ID (including a genuine legacy alias) consistently in the level and snapshot.
The reader uses contractId/regionId/fileName. capturedAt, attemptId and
completionRecordId are optional recommended association metadata for programmer
integrity checks; they are not currently displayed or inferred by the website.
Associate the upload with the exact selected completion/result before publication.
If multiple attempts exist, choose one explicitly for this completion and retain
its immutable image. Do not let a late older upload replace a newer result's
reference. The website does not infer screenshot attempt history.

New read-only endpoint: GET `/api/player/bridge-snapshot?contractId=...&regionId=...`
with the existing session bearer ticket. It authenticates the ticket, reads only
the owner's AlmanacProgress, requires exactly one verified matching completion,
checks optional playerId, validates its nested reference, exchanges that same
ticket for its own entity and resolves only the referenced PNG from GetFiles.
Caller-supplied playerId/entityId/fileName are rejected. Downloads are restricted
to HTTPS Azure Blob Storage, no redirects, no credentials forwarded, size bounded
and PNG signature checked. Response is private/no-store; signed URLs stay server
side. No new PlayFab secret is sent to the browser.

Missing/mismatched/ambiguous records and unuploaded files yield a labeled image
placeholder while retaining the completed contract and navigation. Card and
dialog use the same renderer. Account switch/unmount discards stale callbacks
and revokes local object URLs. Legacy HTTPS completionScreenshotUrl remains a
compatibility path; prefer private references for all new records.

## Story and timestamp corrections upstream

Preserve original IDs. The verified main chain is ShopKeeper 1, ReedsContract 2,
VancesContract 3, SilasMainContract 4, MainContractSilas 5. Tutorials are Level 00;
ReedSideInspection and VanceSideRealignment are side jobs. Do not use leaderboard
list position or alphabetically sorted BuildAlmanac.order as story stage.
Future stages need explicit authored stageOrder and provenance before numbering.

BuildAlmanac currently substitutes synchronizedAt for missing completedAtUtc.
Publish an empty/omitted completion date instead when the actual date is unknown;
do not rewrite old completion dates from a synchronization timestamp. Verify
completion versus saved-bridge/turn-in semantics with the programmer; the website
does not change actual game status or repair player progression.

## Acceptance checks before coordinated rollout

Use a dedicated development account: submit a real quiz, discover one lesson and
one material, complete one contract and upload its captured PNG. Verify exact
player/region/contract/result association. Switch to a second account and confirm
none of the first account's results/images appear. Exercise failed upload,
unfinalized file, missing image, expired session, repeated sync, duplicate attempt
IDs and late callbacks after account switch. Verify mobile and desktop layouts
and exact notification dialogs. Do not use examples as defaults or migration grants.
