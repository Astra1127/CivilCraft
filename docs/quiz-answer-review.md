# Private quiz answer review

Quiz Records loads a review only when the signed-in player opens **Review
answers**. It displays the recorded selections, correct choices, result per
question and authored feedback when available. A missing historical review
remains unavailable; a provider failure offers Retry. Reviews never grant
completion, rewards, currency or statistics.

## Exact-version protocol

The existing Unity assessment submission saves canonical question-order choice
indices with its latest immutable aggregate in the same save transaction. These
are QuizData choice indices, not shuffled screen positions. Failed saves roll
back the answers and aggregate together. Continuing an earlier NPC context cannot
replace a later submission.

Dashboard sync includes an optional, separate JSON string `quizReviewProgress`:

```json
{
  "schemaVersion": 1,
  "reviews": [{
    "quizId": "stable-authored-quiz-id",
    "attemptId": "same-submitted-aggregate-id",
    "contentFingerprint": "64-lowercase-hex",
    "selectedIndices": [2, 1, 0, 3, 1]
  }]
}
```

CloudScript stores it in **Private** player data key `QuizReviewProgress` for
`currentPlayerId`. No Entity Object or file slot is added. Each JSON projection
remains at most 10,000 characters and the whole CloudScript argument body at most
30,000 UTF-8 bytes. The current complete asset fixture is 19,839 bytes, with 9,618
Almanac characters and 2,142 review characters.

The handler validates the matching completed aggregate before writing, preserves
unchanged review evidence when it is omitted locally, rejects conflicting reuse
of a submitted identity, and drops obsolete attempts when an updated review
projection is supplied. Older clients omitting the new outer field leave it
untouched. New clients require `quizReviewSchemaVersion: 1` in the acknowledgment
so an older backend cannot silently ignore their selections.

Older aggregates can reconstruct a review only from one exact retained context,
quiz fingerprint and matching score/total/title. Unknown versions, duplicate
contexts and missing selections stay unavailable. No date or historical attempt
is invented.

## Private answer banks and read access

`scripts/extract-quiz-review-catalog.mjs --unity-assets <absolute Assets path>`
exports authored assessment banks into `quiz-review-catalog.server.json`.
Content fingerprints reproduce the actual C# algorithm, including UTF-16 string
lengths and original text. Published versions are retained immutably when active
assets change. Image-only choices are not supported by this text review and cause
an explicit export error. Blank explanations are omitted.

Only the server entry imports this catalog. It is excluded from public browser
assets. The authenticated `GET /api/player/quiz-review?quizId=...&attemptId=...`
derives its owner from the PlayFab bearer ticket and reads that owner's two
private projections. It does not accept a player ID, selected answers, file path
or answer-bank version from the browser.

A response requires one exact completed attempt, a matching retained catalog
version, valid canonical indices and a recomputed score equal to the aggregate.
It returns only that review with private/no-store headers. Missing or inconsistent
evidence returns 404; expired player sessions return 401; service failures return
503. An admin website session does not authorize player reviews. Account/session
changes discard obsolete callbacks and clear displayed reviews.

## Verification and device check

Website review/server tests cover owner isolation, expired sessions, duplicate
IDs, altered versions/indices/scores, on-demand loading, retries, stale callbacks,
legacy embedded reviews and authored explanation handling. Real C# QuizData
fingerprints and selections match all 10 exported banks (50 questions). Production
browser assets are checked for absent answer-bank fingerprints/question text.

The updated game needs a rebuilt APK. After signing in and letting a saved quiz
sync, open Almanac → Quiz Records → Review answers and compare its choices and
score with the game's submitted review. Check one incorrect selection if present,
then switch accounts and confirm the first account's answers disappear. This
device check is separate from the earlier bridge-photo acceptance pass.
