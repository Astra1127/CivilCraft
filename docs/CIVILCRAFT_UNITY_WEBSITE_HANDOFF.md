# CivilCraft Unity ↔ Website handoff

Repository audit refreshed: **2026-10-28**, website workspace only.

## 1. Readiness and evidence boundaries

**The website is ready for coordinated integration testing, not an unconditional
end-to-end sign-off.** Its authenticated readers, validation, UI states and
server routes exist. Lesson/quiz publication, bridge-photo uploads, some stable
IDs/content, and installed-game publishing still need programmer verification or
implementation. The documented story is partial and must remain extensible.

This audit inspected repository code, tests and existing documentation. It made
**no live PlayFab requests**, game submissions, purchases, configuration changes,
Unity edits or deployments. Existing working-tree Almanac implementation changes
were preserved; this handoff adds documentation only. No credentials or real
player identifiers are included here. Mock tests establish website behavior,
not the current state of a deployed title, account, APK or database.

Evidence labels used below:

- **Implemented:** verified current website code path; consumes real provider
  records when available, with no demonstration-data substitution outside the
  explicit demo mode. This does not mean every account has published records.
- **Partial:** website support exists, but publisher/record availability or
  semantics remain incomplete/unconfirmed.
- **Pending:** new game publishing or verified identifiers/content are required.
- **Historical:** a dated investigation/rollout record, not a fresh live check.
- **Recommended/proposed:** future programmer/operator work, not deployed behavior.

For readiness classification, **working** means an implemented website reader
with regression coverage, not a new live-game certification. **Partially
synchronized** means the reader exists but its installed-game publisher or
semantics still need acceptance. **Awaiting Unity implementation** means optional
website payload support exists but game publication has not been established.
No current live player records or published handler were inspected in this
refresh; historical evidence is explicitly dated below.

### Resolve older documentation before implementation

| Source                                                                                                                                                         | How to use it now                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Almanac lesson progression](almanac-lesson-progression.md) and `src/lib/almanac/lesson-metadata.json`                                                         | Current partial lesson catalog and introduction rules. Explicit lesson state is required; contract completion never unlocks lessons.                                                                                                                |
| [Almanac Unity integration](almanac-unity-integration-handoff.md)                                                                                              | Established **website-reader** quiz, lesson and snapshot formats. Examples are synthetic; publication is not proven.                                                                                                                                |
| [Dashboard investigation, October 3](dashboard-sync-investigation-2026-10-03.md)                                                                               | Later historical evidence: published Revision 8 and an existing DashboardSyncService caller. One inspected account had no projection at that time. This does not describe all players today.                                                        |
| [Older dashboard handoff](game-dashboard-sync-handoff.md), [example payload](sync-dashboard-v1.example.json), thesis data-flow notes                           | Reuse the 15-field schema/example, equipment details and consistency warnings. Their Revision 5 / “no caller” statements are superseded by the October 3 investigation. Do not reimplement a duplicate caller solely because of that old statement. |
| October 3 portrait-read description                                                                                                                            | Superseded by current `character-portrait.server.ts` and `useCharacterPortrait.ts`: the website **does** read the fixed private Entity File now. No live file inventory was checked in this audit.                                                  |
| [Leaderboard investigation](leaderboard-investigation.md), [multiplayer](multiplayer-leaderboard.md), [visibility](leaderboard-contract-visibility.md)         | Current website mappings; dated hosted observations remain historical. Never equate a submitted run with dashboard/lesson synchronization.                                                                                                          |
| [Game-wallet rollout](game-wallet-rollout.md), [new-account rollout](new-account-wallet-rollout.md), [currency handoff](website-currency-developer-handoff.md) | Distinguish v3 shared Coins/gold, older classic-CO orders, and separate Diamonds. Later main-site/cohort guidance supersedes older fork-domain activation examples. Do not copy historical enabled flags as new defaults.                           |

No downloaded current CloudScript implementation is checked into this repository
as a deployable source of truth. Published revisions and installed Unity behavior
must be confirmed by the programmer/operator through their approved tools.

## 2. Priority checklist

### P0 — Establish identity and a reliable existing dashboard publisher

- [ ] Use one approved development/test account in the installed APK and website.
      Privately compare title and PlayFab player ID; the public configured title
      in source is `17FA03`. Never share passwords/tickets/entity tokens.
- [ ] Verify which APK/source revision is installed and whether its existing
      DashboardSyncService runs. Check save-loaded/cloud-ready/non-guest gates,
      committed-save subscription and actual executed CloudScript revision.
- [ ] Publish a **real loaded snapshot** through the existing `syncDashboardV1`.
      Require API success, no script `Error`, and accepted/schemaVersion result.
      Independently verify private UserData and all four dashboard statistics.
- [ ] Resolve aggregation/retry ordering before replaying totals. Do not sync
      zeros/defaults during save loading or re-send uncertain additive totals.
- [ ] Correct missing actual completion dates at the publisher: omit/leave empty
      unknown dates instead of replacing them with synchronization time. Confirm
      saved-bridge versus finalized/turned-in contract completion semantics.

### P1 — Publish real educational/discovery state

- [ ] Publish existing stable `lessonRecords` at the **actual saved lesson
      introduction/unlock event**, including events before contract completion.
      Confirm a distinct completion event before using `state: completed`.
- [ ] Supply five missing game lesson IDs, exact Bhan introduction phases, and
      Brooks/Mills contract/map bindings. Do not send website catalog keys as IDs.
- [ ] Supply approved Load Transfer / Moving Load educational text and assets.
- [ ] Preserve cumulative material discovery. Confirm the existing five mappings
      and implement the missing ConcreteBeam → concrete_member publication only
      after real discovery. Do not grant the entire catalog.
- [ ] Run the two-account isolation and missing/partial/legacy-data checks below.

### P2 — Complete media and quiz publication

- [ ] Finalize private bridge PNG Entity File upload, then publish its exact
      completion-bound reference. Keep completions visible when images fail.
- [ ] Locate the actual quiz implementation/build, agree stable quiz/question/
      attempt IDs, and publish genuine results/reviews if the game retains them.
- [ ] Verify portrait upload and equipment publication independently; neither
      proves the other succeeded.

### P3 — Regression and release acceptance

- [ ] Verify single-player and multiplayer statistics independently of dashboard
      sync. Retain ranking formulas and existing shared visibility configuration.
- [ ] Reconcile game-wallet/shared-shop behavior with its separate operator-owned
      rollout. Do not enable purchases, migrate accounts or alter receipts here.
- [ ] Complete desktop/mobile visual QA and a controlled installed-game round
      trip on the intended deployment, then record sanitized acceptance evidence.

## 3. Feature status matrix

| Website feature                                                    | Current status / source                                                                                                                   | Unity action or remaining dependency                                                                                                                    |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Player login, registration, restoration                            | **Implemented:** same-title PlayFab Client authentication; restored ticket identity validated; account changes clear stale player queries | Use the same account/title. No shared browser/Unity password or copied browser session is required.                                                     |
| Profile name/avatar/account identity                               | **Implemented:** `Client/GetAccountInfo` and supported profile fields                                                                     | Update game-owned profile through existing game behavior; no new dashboard-only identity schema.                                                        |
| Account level, XP, overview counts                                 | **Partial:** UserData scalars plus actual statistics; null/missing displays remain honest                                                 | Validate real scalar meanings, caller readiness, response and successful projection/statistic publication.                                              |
| Admin Players level                                                | **Implemented:** visible-row `Server/GetUserData` CurrentLevel; validated exported CurrentLevel statistic is existing fallback            | Publish real CurrentLevel. No rank/score/contract-count derivation; no Unity-specific admin API to add.                                                 |
| Map/story progress                                                 | **Partial:** `MapProgress` reader; game owns actual region/progress records                                                               | Publish real map/mission state after committed progress. Never use leaderboard selector order as story order.                                           |
| Achievements                                                       | **Partial:** `AchievementProgress`, scalar totals; IDs/dates drive exact modal links                                                      | Publish actual unlock/progress and true unlock timestamps where retained. No unlock from opening the site.                                              |
| Equipped cosmetics                                                 | **Partial:** `EquippedCosmetics` reader accepts inspected loadout shape and legacy formats                                                | Confirm the actual game DTO/caller and preserve multiple accessory IDs, explicit empty versus missing slots.                                            |
| Owned inventory                                                    | **Implemented:** `Client/GetUserInventory`; catalog/static metadata resolution                                                            | Ownership must really be granted by the owning system. Equipped state is separate; do not infer from ownership.                                         |
| Character portrait                                                 | **Implemented reader / upload verification pending:** authenticated fixed `characterPortrait.png` Entity File, with legacy URL fallback   | Confirm game uploader finalization and ownership; equipment state alone does not create an image.                                                       |
| Almanac journey / completion popups                                | **Partial:** `AlmanacProgress`, stable region/contract IDs and verified successful completion records                                     | Validate actual finalized completion, truthful scores/date, and identity. Source alphabetic order/current-status heuristics remain an upstream concern. |
| Story display numbering                                            | **Implemented:** shared verified IDs; Tutorial Level 00 and existing Levels 01–05; side jobs separate                                     | Confirm future stage numbers before adding mappings. Do not renumber saved IDs or historical links.                                                     |
| Engineering introductions/catalog                                  | **Implemented, partial story:** authored stage metadata; known IDs/content and honest pending entries                                     | Approve future content and unresolved bindings, not a final story/map count.                                                                            |
| Lesson discovery/completion                                        | **Pending game publication / implemented reader:** only explicit `AlmanacProgress.lessonRecords`                                          | Save/publish actual lesson events before or after contract completion as appropriate. No completion-derived grants.                                     |
| Materials/properties                                               | **Implemented catalog:** six inspected definitions, local images, simulation units                                                        | Keep balance definitions reviewed; static properties are not discoveries or real-world engineering ratings.                                             |
| Material discoveries                                               | **Partial:** exact `AlmanacProgress.discoveredMaterials` membership                                                                       | Existing publisher historically maps five IDs; concrete-member mapping and runtime records need confirmation.                                           |
| Quiz records/review                                                | **Pending game publication / implemented reader:** optional `quizAttempts`                                                                | No verified game publisher/quiz ID catalog was established in the earlier audit. Find real implementation and retained results first.                   |
| Completed bridge photos                                            | **Pending game upload / implemented private reader:** bound PNG reference; legacy HTTPS URL support                                       | Local game PNG cache is not an uploaded Entity File. Implement finalization/reference association and retry safely.                                     |
| Single-player leaderboards                                         | **Implemented real-statistic reader; historical live records documented**                                                                 | Existing game `submitBridgeRunV1` publishes encoded best runs; verify actual installed-game submission. Separate from dashboard sync.                   |
| Multiplayer leaderboards                                           | **Implemented real-statistic reader:** wins/losses/draws                                                                                  | Verify genuine finalized matches publish the existing statistics. No website match submission or new guessed CloudScript name.                          |
| Achievement/level notifications                                    | **Implemented derived UI:** real unlock/completion records, stable targets, player-local read flags                                       | Publish stable IDs and actual event dates. No separate game “website notifications” payload required.                                                   |
| Wallet/shop/transactions                                           | **Implemented gated server paths; rollout depends on environment/account classification**                                                 | Follow separate v3/currency handoffs. Do not assume classic CO, local gold and shared-wallet balances are interchangeable.                              |
| Feedback, messages, bug reports                                    | **Implemented website-owned storage:** authenticated owner scoping and staff moderation; feedback eligibility uses a valid accepted run   | No new Unity publishing contract. A qualifying leaderboard record establishes feedback eligibility, not contract completion.                            |
| Release downloads, notes, gallery/CMS, public contact, admin tools | **Implemented website-owned features**                                                                                                    | Authorized staff maintain content/releases; Unity only supplies reviewed APK/assets/content. No new game sync payload.                                  |
| Recovery, contact email, optional release mail                     | **Implemented website/provider flows; provider configuration must be verified separately**                                                | No new game reward/progress event. Keep email opt-in/auth and SMTP/template operations website/operator owned.                                          |

## 4. Exact existing identity/read boundaries

See `src/lib/playfab/auth.ts`, `client.ts`, `player.ts`, `session-store.ts` and
server handlers. Player login uses `Client/LoginWithEmailAddress` or
`Client/LoginWithPlayFab`; registration uses `Client/RegisterPlayFabUser`.
`Client/GetAccountInfo` validates restored identity. Expired tickets require login;
an EntityToken is not a replacement SessionTicket or a browser refresh token.

Browser Client calls use the ticket owner, not a caller-selected player ID.
Privileged server calls use the existing server-only transport. The public title
ID may be configured through `VITE_PLAYFAB_TITLE_ID`; `PLAYFAB_SECRET_KEY`, database,
provider and SMTP secrets must **never** be placed in `VITE_`/public variables or
Unity/browser bundles. This handoff contains names, not values or setup grants.

Production uses real data: the source enables `VITE_PLAYFAB_DEMO=true` only in a
development build. Ensure demo mode is off during local integration acceptance;
demo fixtures are not evidence of a synchronized account.

The website does not request/decrypt `playerSaveData.json`. The game cloud-save
file is not the public/dashboard synchronization contract. Guest/local save
ownership and cloud conflict resolution must finish before publication.

### Current requested dashboard UserData keys

`DASHBOARD_USER_DATA_KEYS` in `player.ts` requests exactly:

```text
CurrentLevel, XP, XPToNextLevel, CurrentRegion,
AchievementsUnlocked, AchievementsTotal, BridgesCompleted, ChallengesCompleted,
MapProgress, AchievementProgress, EquippedCosmetics, AlmanacProgress,
CharacterSyncedAt, CharacterName, CharacterPortraitUrl
```

- CurrentLevel: shared account-level parser accepts nonnegative safe integers
  on reads; **the historically inspected sync writer requires 1–1000**. Do not
  confuse account level with contract Level 00/01/etc.
- Total/best score and bridge/challenge statistics are read through
  `Client/GetPlayerStatistics`. Precedence: TotalScore statistic; bridge/challenge
  statistic then matching requested UserData; best statistic BestSingleBuildScore
  then legacy BestBuildScore. Code also contains UserData score/best fallbacks,
  but those two UserData keys are not in the default requested list; do not rely
  on publishing them as a new alternative.
- CharacterSyncedAt is a server projection marker, **not** a completion/unlock
  time or proof that statistics, portraits, lessons and quizzes all succeeded.
- CharacterName is requested but does not establish the account name/sync state.
  CharacterPortraitUrl is a legacy compatibility image source.

## 5. Existing CloudScript publication contract

### `syncDashboardV1` — historically verified handler/caller, runtime acceptance still required

Existing game call: `Client/ExecuteCloudScript`, `FunctionName: syncDashboardV1`.
The later October 3 investigation observed published legacy CloudScript version 1,
Revision 8 and an existing game caller. That caller reportedly omitted
RevisionSelection; log/inspect the actual returned revision. The older example
explicitly uses `RevisionSelection: Live`. Reconfirm the approved published
revision rather than assuming either historical value is current today.

All **15** fields below belong in `FunctionParameter` on each existing full sync:

| Field                | Writer validation recorded for Revision 8            | Destination                              |
| -------------------- | ---------------------------------------------------- | ---------------------------------------- |
| schemaVersion        | integer exactly 1                                    | validation/result                        |
| currentLevel         | integer 1–1000                                       | UserData CurrentLevel                    |
| xp                   | integer 0–2147483647                                 | UserData XP                              |
| xpToNextLevel        | integer 1–2147483647                                 | UserData XPToNextLevel                   |
| currentRegion        | string length ≤100, empty allowed                    | UserData CurrentRegion                   |
| achievementsUnlocked | integer 0–10000, ≤ achievementsTotal                 | UserData AchievementsUnlocked            |
| achievementsTotal    | integer 0–10000                                      | UserData AchievementsTotal               |
| totalScore           | integer 0–2147483647                                 | statistic TotalScore                     |
| bridgesCompleted     | integer 0–2147483647                                 | UserData + statistic BridgesCompleted    |
| challengesCompleted  | integer 0–2147483647                                 | UserData + statistic ChallengesCompleted |
| bestSingleBuildScore | integer 0–2147483647                                 | statistic BestSingleBuildScore           |
| mapProgress          | serialized JSON **object string**, ≤10000 characters | UserData MapProgress                     |
| achievementProgress  | serialized JSON **array string**, ≤10000 characters  | UserData AchievementProgress             |
| equippedCosmetics    | serialized JSON **object string**, ≤10000 characters | UserData EquippedCosmetics               |
| almanacProgress      | serialized JSON **object string**, ≤10000 characters | UserData AlmanacProgress                 |

No numeric strings/null/booleans/fractions replace the scalar integers. Serialize
each nested projection once; the SDK serializes the enclosing request. Existing
reader support for legacy arrays/casing does not change the writer's outer-type
requirements. Do not truncate serialized JSON or supply fake defaults to pass
validation. All optional Almanac additions still share this 10,000-character
envelope; a parser's larger row limit is not permission to exceed it.

Optional historical Revision 8 inputs:

| Field                      | Existing validation/destination                                             |
| -------------------------- | --------------------------------------------------------------------------- |
| characterPortraitFile      | length ≤100; empty or exactly characterPortrait.png → CharacterPortraitFile |
| characterPortraitUpdatedAt | string length ≤64 → CharacterPortraitUpdatedAt                              |
| characterPortraitChecksum  | empty or 64 lowercase hex digits, length ≤64 → CharacterPortraitChecksum    |

Portrait metadata without a file fails; omitted fields preserve previous metadata.
These metadata keys are not the current website's file-selection mechanism: the
portrait reader always requests the fixed own-account Entity filename. They do
not authorize bridge-file access and do not replace actual file upload.

Historically, the handler uses authenticated `currentPlayerId`, writes private
projection UserData plus generated UTC `CharacterSyncedAt`, then updates four
statistics with `ForceUpdate: false`. It does not write CharacterName or
CharacterPortraitUrl. Writes are sequential, **not atomic**. Expected success is
`FunctionResult: { accepted: true, schemaVersion: 1 }` with no script Error.
The script does not define statistic aggregation or reject stale snapshot
sequences. An uncertain response/failed statistic write requires reconciliation;
do not assume blind retries of totals are idempotent.

The October 3 caller audit recorded OnSaveCommitted subscription, five-second
debounce, 30-second retry, loaded/cloud-ready/non-guest/login gates, and only one
in-flight request. It checked script Error but not explicitly accepted/schemaVersion.
These are **historical source findings**, not proof of the installed APK's current
behavior. Recommended improvements: validate the result, serialize/coalesce latest
state, reject obsolete account callbacks and verify aggregation before retries.

Use the existing [synthetic shape example](sync-dashboard-v1.example.json) only
as a serialization reference. Never execute it against a real account as seed data.

### Other CloudScript/function boundaries

- `submitBridgeRunV1`: existing game single-player best-run publisher referenced
  by the leaderboard docs. Its **name and resulting statistic mapping** are
  established; the request DTO/full handler is not checked into this repo.
  Obtain the approved game/handler contract before changing a submission; do not
  invent field names from website decoder names. The website never invokes it.
- Multiplayer source comments reference the game's `multiplayerCloudScript.js`.
  This repo establishes the output statistics, **not an exact match-submission
  function name/request schema**. Confirm those from the programmer's source.
- Lesson/quiz/snapshot synchronization is additive data inside the existing
  Almanac projection, not an implemented `syncLessons`/`syncQuiz`/`uploadBridge`
  CloudScript function. No such new function is proposed as already existing.
- Game-wallet v3 uses the existing first-party HTTP APIs in §10, not a new
  dashboard CloudScript or a fallback to old coin-mutation handlers.

## 6. Nested projection fields and game events

### Map, achievements and equipment

| Projection          | Existing preferred fields                                                                                                                                    | Expected game event / caution                                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MapProgress         | overallPercent, storyPercent, currentRegion, regions[]; region id (or regionId), name, completed, missionsCompleted, missionsTotal, optional bestScore/stars | After actual committed map/mission progress. Preserve stable IDs and real totals; no assumed final map count.                                                                                        |
| AchievementProgress | array entries id, name, description, unlocked, optional unlockedAt, progress, target metadata                                                                | After actual achievement progress/unlock save. Send true retained unlock dates only. Reader supports progressTarget/target forms; do not rename existing IDs.                                        |
| EquippedCosmetics   | accessoryIDs[], legacy accessoriesID, hairID, shirtID, pantsID, shoesID; optional existing tint metadata                                                     | After committed equipment change, not preview. Multiple accessories remain separate; Accessory_None is a no-accessory sentinel. Missing/unsupported data is different from an explicitly empty slot. |

Equipment ownership comes from GetUserInventory; item names/images may resolve
through GetCatalogItems or the website catalog. Ownership alone does not imply
equipped state. The website does not reconstruct a tinted 3D character. Confirm
the installed game's actual loadout DTO; the writer only validates an outer JSON
object, so parser support is not proof of publisher compatibility.

### Reader precedence and unavailable data (current source)

These are existing behaviors, not new fields or proposed writers.

| Feature | Exact reader behavior / unavailable state | Acceptance check |
| --- | --- | --- |
| Account/profile | Client/GetAccountInfo.AccountInfo: PlayFabId, Username, PrivateInfo.Email, Created; TitleInfo.DisplayName, AvatarUrl, Created, LastLogin. Missing/mismatched player ID errors. Display name falls back to Username then `Not available`. AvatarUrl is distinct from the character portrait. | Compare the same approved account in game/site, then switch accounts and expire the ticket. |
| Account level/XP | CurrentLevel uses parsePlayerLevel: nonnegative safe integer or null. XP/XPToNextLevel use finite UserData scalars or null. Historical writer accepts currentLevel **1–1000**. Tutorial **Level 00** is a story label, not an instruction to publish account level zero. | Compare actual game level/XP with UserData; never derive from score, rank or completed-contract count. |
| Dashboard statistics | Client/GetPlayerStatistics.Statistics[]: StatisticName, Value, optional Version. BridgesCompleted/ChallengesCompleted prefer statistics then same-name UserData. BestSingleBuildScore prefers that statistic, then legacy BestBuildScore, then UserData. TotalScore prefers its statistic then UserData. TotalScore/BestSingleBuildScore are **not requested** in default UserData keys: publish the established statistics. Missing values remain null; statistic failures can fall back to available requested scalars. | Check all four actual statistics independently after sync; CharacterSyncedAt alone proves neither statistics nor portrait upload. |
| Maps/achievements | Missing/malformed MapProgress becomes empty regions and zero percentages, not proof of zero saved game progress. Missing/malformed AchievementProgress becomes an empty list. Achievement totals use scalar UserData. | Compare a real committed mission/unlock, retained stable IDs and actual date; no catalog-based grants. |
| Equipment/ownership | GetUserInventory.Inventory[].ItemId establishes ownership; ItemInstanceId/DisplayName/ItemClass are provider fields. EquippedCosmetics is separate; missing/invalid payload remains missing/invalid, never default equipment. | Own an unequipped item; equip multiple accessories, commit, refresh; distinguish empty slots from absent projection. |
| Character portrait | Fixed private Entity File reader (§7), separate from legacy CharacterPortraitUrl fallback. Projection timestamp is not upload evidence. | Finalize a real own-account portrait, refresh, test missing file and account switch. |
| Journey/contracts | Missing/malformed AlmanacProgress becomes EMPTY_JOURNEY. Explicit levelsCompleted/levelsTotal/journeyPercent win; absent totals derive from parsed levels/completions. MapProgress alone does not populate the journey. | Compare a finalized contract's exact IDs, score, retained date, totals and notification target. |
| Bridge types | Explicit AlmanacProgress.discoveredBridgeTypeIds[] wins, including empty array. If absent, existing legacy fallback derives types from parsed completion.bridgeTypeId. Current local IDs: beam, truss, arch, suspension. This never grants lesson/material state. | Verify explicit empty, explicit discovered type and omitted legacy list against intended game semantics. |
| Materials | Exact string membership in discoveredMaterials[], deduplicated. Missing list stays empty; static properties/images grant nothing. | Discover one real material before completion; verify only its properties become available. |
| Engineering | Unique lessonRecords[{lessonId,state}] only. Missing record is pending sync; missing game ID is unavailable; unknown IDs remain unmapped. | Discover before contract completion; complete an unrelated contract and confirm no extra grants. |
| Quizzes | Only validated quizAttempts. Missing dates/review stay unavailable; valid aggregate survives invalid optional review. All duplicate immutable attempt keys are discarded. | Compare real retained attempts, then isolated missing-review/duplicate fixtures. |
| Achievements/rankings | AchievementProgress owns unlocks. Leaderboards use provider statistics/positions, separately from story and account level. Service errors are not successful empty rankings. | Compare actual unlock, accepted single-player run and finalized multiplayer results separately. |

The website requests projections only; it does not deserialize encrypted game
save files to fill missing data. Reader tolerance is compatibility, not proof of
writer validation. Summaries, map progress and Almanac must reflect the same
committed save despite non-atomic publication. Test procedures are expanded in §11.

### AlmanacProgress — existing website read contract

Top-level fields: `regions[]`, `levelsCompleted`, `levelsTotal`, `journeyPercent`,
`discoveredBridgeTypeIds[]`, `discoveredMaterials[]`, optional `lessonRecords[]`
and `quizAttempts[]`. Use the existing lowercase preferred spelling; legacy casing
is compatibility support, not a reason to fork the contract.

Region: `regionId`, `name`, `status`, `levels[]`. Level: `levelId`, `levelName`,
`order`, optional `stageOrder`, `status`, `engineeringConceptIds[]`, optional
`completion`. Status values are completed/current/locked; unavailable/invalid
reader values become unknown. Exported `order` may be alphabetic catalog position
and is **not** a story level. The shared verified mapping wins for known contracts.

Completion: `playerId` (if published), `levelId`, `regionId`, `bridgeTypeId`,
`score`, `status: success`, `completedAt`, optional `achievementId`, legacy
`completionScreenshotUrl`, optional `snapshot`. Nested IDs must match their owning
level/region; no generated array-position ID is a safe deep-link identity. Publish
the actual score/bridge payload; the tolerant legacy parser is not evidence of
an omitted score being a genuine zero. An actual completion can remain undated.
Do not synthesize its date from sync time, login time or website access.

Publish finalized completion records after the true game completion/turn-in
boundary. The earlier game audit found saved-bridge-based completion and a
sync-time date fallback: confirm/fix those semantics in the game separately.
Do not have the website rewrite historical player progression.

### Lessons — implemented reader; game publication pending confirmation

Location: **inside AlmanacProgress**, not a separate UserData lesson key.

```json
{ "lessonRecords": [{ "lessonId": "deadload", "state": "discovered" }] }
```

This is a shape example, not a player grant. Accepted states: discovered/completed.
Use exact, trimmed runtime LessonData.Id as actually defined by the game; website
matching is exact. Publish after real saved discovery/introduction, even while a
contract is incomplete. Use completed only for an actual distinct lesson event.
Duplicate IDs are ambiguous and ignored; missing data remains pending. Unknown
future IDs remain parsed/unmapped without fabricated content or progression.
Never send a website `concept:*` / `reference:*` key as a guessed game lesson ID.

The historically inspected writer validates the outer almanacProgress JSON object,
not these nested fields. Confirm that the actual game serializer and approved
handler preserve additions on later full saves before claiming synchronization.

### Materials — existing five publisher mappings, sixth pending

| Game material ID    | Existing website discovery ID | Status                                       |
| ------------------- | ----------------------------- | -------------------------------------------- |
| Beam                | wood_beam                     | Historically mapped by DashboardSyncService  |
| Pier                | wood_support                  | Historically mapped                          |
| RopeMaterial / Rope | rope                          | Historically mapped                          |
| Wood Road           | wood_road                     | Historically mapped                          |
| Concrete Road       | concrete_road                 | Historically mapped                          |
| ConcreteBeam        | concrete_member               | Website catalog exists; game mapping pending |

Publish exact cumulative `discoveredMaterials` IDs after actual material discovery;
never derive from money, level or website access. Catalog units are PHP/m, kg/m,
m and N for one simulated member; dual placement doubles cost/mass, and tall piers
have game buckling reduction. Values are not real-world design ratings. The first
three card positions are Timber Beam, Timber Pier, Timber Road Deck; later entries
preserve the in-repo catalog's remaining relative order, not a newly asserted
final gameplay sequence. See [material discovery](almanac-material-discovery.md).

### Quizzes — implemented reader, pending verified game publisher

`AlmanacProgress.quizAttempts[]` entries:

```text
quizId, attemptId, title, optional topic, status: "completed",
score, totalQuestions, optional completedAt, optional answers[]
answers[]: questionId, question, choices[], selectedIndex, correctIndex
```

score/totalQuestions are actual integers, 0 ≤ score ≤ totalQuestions, total 1–500.
Choice indexes are zero-based, in range, with 2–20 nonempty choices. Review is
shown only for all questions, unique IDs and a correct-answer count matching score.
Invalid review does not remove an otherwise valid aggregate result. Missing dates
or answers remain unavailable. Duplicate (quizId, attemptId) copies are ignored.
The reader bounds retention at 1,000 attempts; the existing sync string size limit
still applies. Never fabricate history or reconstruct old choices from a new quiz
version. Publish only actual finalized retained attempts. Confirm the quiz build,
stable IDs and persistence first; no approved quiz source/publisher was found by
the earlier audit. Full existing examples: [Almanac handoff](almanac-unity-integration-handoff.md).

## 7. Private images: portraits and completed bridges are different

Both server readers authenticate the supplied SessionTicket, exchange that same
credential for its own title_player_account entity token, then use File/GetFiles.
Only the resolved own-entity file is downloaded, with private/no-store response,
bounded 8 MiB PNG body, signature validation, HTTPS Azure Blob host restriction
and no credential forwarding or redirects to storage.

| Image            | Existing website endpoint and reference                                                      | Game work                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Character        | GET /api/player/character-portrait, bearer ticket, **no query**; fixed characterPortrait.png | Verify actual portrait capture/upload; previous source audit found CharacterPortraitUploadService.   |
| Completed bridge | GET /api/player/bridge-snapshot?contractId=…&regionId=…, bearer ticket                       | Upload/finalize PNG and publish the nested reference below. Local photo cache alone is insufficient. |

Existing completion-bound snapshot format (example identifiers only):

```json
{
  "snapshot": {
    "contractId": "ShopKeeper",
    "regionId": "canyon_crossing",
    "fileName": "bridge-example-result.png"
  }
}
```

Place it in the **correct existing completion**. The contract and region IDs must
match their owner level/region. Filename must match
`^bridge-[A-Za-z0-9_-]{1,160}\.png$`. The endpoint requires exactly one verified
matching completion and rejects caller-selected identity/entity/filename fields.
It never substitutes characterPortrait.png. Use unique result-bound filenames;
late older uploads must not replace a newer completion's reference.

Recommended game upload lifecycle, reusing its existing portrait approach:
InitiateFileUploads → PUT bytes to the returned upload URL → FinalizeFileUploads →
publish the completion reference. Keep references unpublished until finalization.
Retry upload failures without deleting the completion. Optional capturedAt,
attemptId and completionRecordId in the earlier handoff are **recommended
association metadata, not required/consumed fields of today's website reader**.
Do not put local filesystem paths, entity tokens or signed download URLs in the
new reference. Legacy completionScreenshotUrl HTTPS records still display with
a graceful labeled fallback; new private screenshots should use Entity Files.

## 8. Verified story and engineering mappings

### Stable contract display mapping — current portion only

| Saved ID                                             | Existing display                              |
| ---------------------------------------------------- | --------------------------------------------- |
| TUT_CONTRACT1                                        | Tutorial 1 (Level 00)                         |
| TUT_CONTRACT2                                        | Tutorial 2 (Level 00)                         |
| ShopKeeper; legacy display alias ShopKeeperContract  | Level 01                                      |
| ReedsContract                                        | Level 02                                      |
| VancesContract                                       | Level 03                                      |
| SilasMainContract; asset/display alias SilasContract | Level 04                                      |
| MainContractSilas                                    | Level 05                                      |
| ReedSideInspection; VanceSideRealignment             | Side contract, outside numbered main sequence |

Original saved IDs and notification URLs are preserved. Display aliases are not
permission to rename player records. MarshID and placeholder/new/unmapped IDs do
not receive speculative canonical level numbers. Refer to `level-records.ts` for
the exact display aliases, not the leaderboard selector/catalog array position.

### Documented lesson introductions — not unlock requirements

| Introduction                      | Topic                | Verified game LessonData IDs         | Contract binding                                                |
| --------------------------------- | -------------------- | ------------------------------------ | --------------------------------------------------------------- |
| Professor Bhan — Initial Tutorial | Dead Load; Live Load | deadload; LESSON001                  | Level 00 chapter; exact introduction sub-contract/phase unbound |
| Professor Bhan — Truss Tutorial   | Equilibrium          | What is Equilibrium                  | Level 00 chapter; exact phase unbound                           |
| Reed — Supply Route               | Bending              | **Missing**                          | ReedsContract, existing Level 02                                |
| Vance — Direct Route              | Tension; Compression | What is Tension; What is Compression | VancesContract, existing Level 03                               |
| Silas — Community Connection      | Load Distribution    | **Missing**                          | SilasMainContract, existing Level 04                            |
| Silas — Later Main Quest          | Load Transfer        | **Missing**                          | MainContractSilas, existing Level 05                            |
| Brooks — Market Connection        | Moving Load          | **Missing**                          | Contract ID/map/number unverified                               |
| Mills — Heavy Equipment Route     | Structural Failure   | **Missing**                          | Contract ID/map/number unverified                               |

Beam Bridge (`LESSON002`) and What is Truss (`LESSON004`) remain preserved bridge-type
references. Support, shear and other existing popup concepts are not silently
turned into new game LessonData unlocks. Tutorial 1's presentation hides Bending
only in its popup; other recorded levels and Reed's catalog topic retain it.

Verified titles/introductions do not imply complete educational assets. Bending,
Load Distribution and Structural Failure reuse existing website concept text and
diagrams; their actual game lesson IDs remain unknown. Load Transfer and Moving
Load have no approved full educational text/image in this repo and show pending
notes/image fallbacks. Do not substitute textbook prose as supposedly authored
game material. The catalog is not a declaration of final map/contract/NPC count.

## 9. Leaderboards: separate publication and exact statistic mapping

The website reads these actual best-run statistics through its server allowlist;
it does not manufacture ranking entries or write game scores.

| Contract             | Suffix shared by CC_E_ / CC_S_ |
| -------------------- | ------------------------------ |
| ShopKeeper           | 24A0506A7A79A0DB               |
| TUT_CONTRACT1        | 6C19CA5B77A6FF90               |
| ReedsContract        | 7AD47CC6EE895E44               |
| VancesContract       | C29D1DB10DD4940D               |
| TUT_CONTRACT2        | 6C19CD5B77A704A9               |
| ReedSideInspection   | 6CC5505F08AAC340               |
| VanceSideRealignment | 0FCFDEF8DF951749               |
| SilasMainContract    | B57A013AC08B9A90               |
| MainContractSilas    | DD46490E01484D5A               |

Source: `src/lib/playfab/leaderboard-config.server.ts`. `CC_E_` is efficient and
`CC_S_` strongest. For packed = 2147483647 − score:

- efficient: cost = floor(packed / 1001); stress = (packed % 1001) / 10.
- strongest: cost = packed % 1000001; stress = floor(packed / 1000001) / 10.

Integers/bounds are validated: cost 0–1000000, peak stress 0–100 percent. The modes
are separate best runs; never merge them into a synthetic bridge. PlayFab rank is
Position + 1. Current weekly UI is disabled; use existing all-time behavior.
TotalScore is a legacy profile metric, not the bridge ranking/account-level source.

`civilcraft.leaderboard.visibility.v1` is existing **Title Internal Data**, with
`{schemaVersion:1, contractIds:[…]}`. GET /api/leaderboard/contracts reads it for
the shared selection; admin saves are separately authorized. Current validation
allows only the nine IDs above; adding future _ranked_ contracts requires explicit
review of the shared allowlist/statistic protocol, not merely a new lesson stage.
Absent selection preserves all nine; an empty selection hides all; malformed data
fails rather than defaulting to all. See the visibility guide for game compatibility.

Multiplayer: `CC_MP_Wins`, `CC_MP_Losses`, `CC_MP_Draws`, nonnegative int32 counts.
GET /api/leaderboard/public/multiplayer reads top 15 wins, with bounded loss/draw
lookups. Win rate = wins/(wins+losses); draws are excluded. Missing valid record
counts may be zero, while malformed/service failures are errors. Confirm the
game's actual finalized-result publisher separately; do not create match outcomes
from website visits or single-player progress.

## 10. Website-owned and separately governed integrations

- **Notifications:** `ach-<achievementId>` and `lvl-<levelId>` derive from actual
  unlock/completion records. Exact destinations include stable IDs/region as
  appropriate. Mark All Read uses browser-local
  `civilcraft.notifications.read.v1:<playerId>`, not cross-device PlayFab read flags.
  Undated completions stay undated; achievement notifications require an unlock
  date under current behavior. No additional Unity notification payload is needed.
- **Feedback/messages/contact:** existing Title Internal Data under
  `civilcraft.website.v1.` stores contact-settings, messages, independent replies,
  status/deletion and notification markers. Ownership is verified server-side.
  Feedback checks a valid stored accepted CC_E_/CC_S_ run on each create; this is
  eligibility, not independent completion/anti-cheat proof. See [feedback](player-feedback.md)
  and [contact](contact-system.md). No game code should directly overwrite this store.
- **Bug reports:** existing `civilcraft.bug.v1.` Title Internal Data records and
  /api/player/bug-reports are website-operated. No new game CloudScript is required.
- **Recovery/mail:** existing recovery uses PlayFab SendAccountRecoveryEmail with
  the configured template; login/register may safely fill an absent own contact
  email. Optional release preferences/delivery and contact SMTP remain existing
  website/operator systems. Do not add game progression to email/profile fields.
- **Downloads/CMS/admin:** preserve their existing website storage and staff
  workflows. The Unity deliverable is a reviewed versioned APK/content, not a
  player-data sync function. Do not edit release/CMS records to repair game sync.

### Shared wallet/shop: do not replace it with a competing PlayFab balance

`src/lib/game-wallet/api.server.ts` implements existing authenticated first-party
routes. They derive player identity from the validated bearer ticket and reject
extra caller identity fields:

| Route                            | Method / existing body boundary                                                                                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| /api/game/wallet                 | GET, own authoritative wallet                                                                                                                                              |
| /api/game/entitlements           | GET, own permanent entitlements                                                                                                                                            |
| /api/game/wallet/import          | POST gold, saveHash, completedContracts, unlockedAchievements, purchasedShopItemIds, unlockedCosmeticIDs, unlockedContractMaterials, lifetimeGoldEarned, lifetimeGoldSpent |
| /api/game/rewards                | POST events[] (1–100); event kind/sourceId/eventId/amount/evidence; evidence finalCost/failureCount/quotedAmount/tutorial                                                  |
| /api/game/purchases              | POST operationId/targetKind/targetId/contractId                                                                                                                            |
| /api/game/purchases/:operationId | GET, own operation result                                                                                                                                                  |
| /api/game/shop-link              | POST currency (coins/diamonds), or GET token to verify the existing bound link                                                                                             |

These are **existing schema boundaries, not requests to perform an import/reward
or grant**. The service/catalog validates targets, rewards, permanent operations,
account classification and backend readiness; do not construct arbitrary grants
from the field list. Follow [v3 rollout](game-wallet-rollout.md) and the later
[new-account/cohort record](new-account-wallet-rollout.md). Shared signed-in Coins/
gold use `civilcraft_game_wallet_v3`; Diamonds remain separate. Classic CO appears
in legacy paths/history and is not a fallback authority for a shared account.
PayMongo checkout/receipts/maintenance gates are separately governed; historical
test-rollout documentation does not authorize live payments or enabling flags.

## 11. Integration test procedures

The following **future acceptance steps** require an approved development title/
account or separately authorized test workflow. They were **not executed live**
by this audit. Use no synthetic defaults, production player resets or real-money
transactions. Keep tickets, signed file URLs, provider responses and secrets out
of screenshots/logs shared with the team.

| Feature                   | Trigger/procedure                                                                                                                                         | Expected acceptance evidence                                                                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identity/session          | Sign into game and website as approved account A; compare IDs/title privately; repeat as B; test expiration and restoration outage                        | Same account binds correctly; A data never appears for B; expired credential prompts login; outages do not silently overwrite state.                                           |
| Dashboard scalars         | Finish load/conflict resolution, commit a real save, capture sanitized sync result, then independently read UserData/statistics and Refresh               | Actual accepted/schemaVersion, executed revision and source values match. Marker alone is insufficient. Verify level/XP definitions and no overwrite by a late older snapshot. |
| Admin level               | Use an account with CurrentLevel in UserData but no exported level statistic; inspect its table/detail                                                    | Same valid account level, null when genuinely absent, no rank-based derivation; filtering/paging/ban status stay intact.                                                       |
| Map/achievements          | Commit a real mission/achievement event with stable IDs and retained date; test missing date/legacy payload                                               | Exact progress and achievement modal; no invented event date or inferred unlocked defaults.                                                                                    |
| Equipment/inventory       | Equip two real accessories plus clothing; save; separately own an unequipped item; test explicit empty versus absent payload                              | Two accessories display; owned ≠ equipped; empty/missing/unsupported states remain distinct.                                                                                   |
| Portrait                  | Commit an actual portrait upload/finalization; load own image; repeat missing/unfinalized/invalid image and switch to B                                   | Correct own portrait; fixed filename; graceful fallback; no bridge/save-file substitution or cross-account access.                                                             |
| Lesson discovery          | Save a real lesson unlock while its contract remains incomplete, publish lessonRecords, Refresh; then finish a contract without a lesson event            | First unlock displays immediately; second does **not** unlock unrelated lessons. Completed only if explicitly recorded.                                                        |
| Unmapped lessons          | In isolated fixtures/dev workflow include unknown ID, duplicate ID and a known website key without a verified game binding                                | Unmapped notice/pending state; no fabricated card/body/unlock; no historical record mutation.                                                                                  |
| Materials                 | Discover one material before first project; sync; check unrelated catalog entries; later discover concrete member after mapping is implemented            | Only actual exact discovery IDs expose properties; no family/all-material grant; cumulative discoveries persist.                                                               |
| Completion popup          | Complete/turn in an actual contract; open its card and notification; exercise missing date, wrong region/contract, duplicate completion                   | Exact contract/stats and shared images; undated remains undated; ambiguous/foreign records do not resolve to a different completion.                                           |
| Bridge snapshot           | Capture the selected result, upload/finalize unique PNG, publish its bound reference; test a second attempt and delayed callback                          | Same exact bridge image in card/dialog; failed/missing upload keeps completion; older result cannot replace selected newer result; B cannot retrieve A's image.                |
| Quiz                      | Submit a real retained quiz attempt, including a wrong answer; then a second real attempt if history exists                                               | Actual score/percentage/review and dates only if retained; separate immutable IDs; missing review doesn't fabricate answers; duplicate IDs ignored.                            |
| Single-player leaderboard | Record baseline, complete a real accepted run through approved game publisher, compare both selected modes                                                | Correct stored statistic, decoded cost/stress and provider rank; no dashboard/lesson completion inferred from participation.                                                   |
| Multiplayer               | Finish real win/loss/draw cases in an authorized game test; compare stored counts and top-15 page                                                         | Counts and positions match; correct win-rate denominator; no invented outcomes or new website submission path.                                                                 |
| Notifications             | Trigger actual achievement/completion records; open exact modal, Back, refresh, Mark All Read, switch A/B                                                 | Stable links retained; read flags scoped to the local player's browser storage; no cross-player acknowledgment.                                                                |
| Wallet/shop               | Follow the separate approved rollout's test-only cases: classification, refresh, purchases/rewards, duplicate/uncertain response, restart, account switch | Same authoritative balance/entitlements on APK and website; permanent operation/receipt safeguards; never retry an uncertain classic grant blindly.                            |
| Feedback/messages/bugs    | Approved A submits eligible feedback/bug report; staff replies; B tries access; test notification failure                                                 | Stored conversation survives email failure; B cannot read A's private records; eligibility unavailable is not treated as eligible.                                             |
| Public/CMS/mail           | Staff-controlled website release/content workflow and approved provider test templates only                                                               | Download/release/content and mail remain website-owned; no effect on game progress or payment state.                                                                           |

## 12. Extending the partial Almanac safely

1. Confirm new authored content with the game team: exact stable LessonData.Id,
   NPC/stage display names, real contract/map IDs, introduction event, text and
   approved local image/diagram. Missing pieces stay pending, not inferred.
2. Preserve all released IDs. Add verified asset definitions to game-catalog.json
   through the reviewed export process, or verified concept content as appropriate.
   Export scripts are not authorization to alter Unity or read encrypted saves.
3. Add explicit ordered stages/lesson rows to lesson-metadata.json. Internal
   website keys can stay stable while a previously missing gameLessonId binding
   is added. Keep categories engineering versus bridge-type versus materials
   separate; no fixed “final map/level/lesson count” belongs in the UI.
4. The generic group builder renders new verified stages without new UI branches.
   Existing known contract numbering remains in level-records.ts. New numbered
   stages need separate verified mapping; the lesson catalog never invents them.
   New ranked contracts also need the independently reviewed leaderboard protocol.
5. Publish actual lesson state using the existing lessonRecords format at save
   time. Preserve unrelated Almanac fields, retained quiz attempts, historical
   completion records, discoveries and selected snapshot references on full sync.
6. Unknown game IDs remain unmapped until approved catalog bindings exist. Do not
   rename old player IDs, use display-title aliases as automatic migration, or
   backfill new lessons merely because old contracts are complete.
7. Test new content with missing state, explicit pre-completion discovery,
   duplicates, legacy records, image failures, new map/contract metadata and two
   players. Re-run website checks and coordinated game acceptance before release.

See [lesson progression](almanac-lesson-progression.md) for current metadata design
and [Almanac publishing handoff](almanac-unity-integration-handoff.md) for the
established optional payload examples. This consolidated guide does not replace
those contracts with another incompatible schema.

## 13. Repository verification and sign-off record

No application integration contract was changed for this documentation task.
Review anchors: `src/lib/playfab/{player,almanac,almanac-education,equipment,
level-records,leaderboard-config.server,multiplayer-leaderboard.server,
character-portrait.server,bridge-snapshot.server}.ts`, `src/lib/almanac/`,
`src/lib/game-wallet/api.server.ts`, and the referenced existing guides/tests.

Earlier handoff validation (historical, not this refresh's test count):

- `npx tsc --noEmit`: passed.
- Scoped ESLint of the audited dashboard/Almanac/equipment/private-image integration
  sources: passed.
- **186 tests passed, zero failures/skips**, covering dashboard sync/account,
  portrait, session lifecycle, admin PlayFab/player isolation, bridge codec,
  multiplayer, lesson progression, Almanac, notification navigation, material
  order, feedback API/UI, game-wallet catalog and mocked backend.
- `npm run build`: passed; local build only, not a deployment.
- All **20 relative documentation links** resolve; `git diff --check` passed.

### October 28 refresh

This refresh changes this handoff and the outdated popup-behavior paragraph in
`almanac-lesson-progression.md` only. No application contract or player record is
changed. Current compact popup navigation uses the existing catalog through
`lesson-navigation.ts`; lessonId URL keys can be website presentation keys and
must never be copied into PlayFab lessonRecords as invented game IDs. Tutorial 1
excludes Bending and keeps recorded Support pending, without granting lesson state.
See the linked lesson guide for the exact current presentation behavior.

Fresh validation: `npx tsc --noEmit`, scoped ESLint of the ten audited
projection/equipment/private-image/catalog/navigation sources, and `npm run build`
all exited **0**. The 14-file integration regression run passed **102 tests, no
failures or skips**: dashboard-sync-v1, dashboard-account-features,
character-portrait, player-session, player-level, bridge-score,
multiplayer-leaderboard, almanac-integration, almanac-discovery, lesson-progression,
lesson-navigation, level-progression, material-order and notification-navigation.
Existing test-renderer/dependency warnings are not live integration evidence.
Earlier test counts above are historical, not a claim of rerunning those suites.
All **20 relative documentation links** resolve; `git diff --check` passed.
No browser or installed-game/live-provider acceptance was performed in this
documentation refresh. Existing visual/end-to-end acceptance remains pending.
Do not run migration/grant/import scripts or live-provider verification as a
substitute for mocked website tests.

**Start-testing prerequisites:** approved test accounts on the intended title;
the actual installed APK/source revision; access by the programmer/operator to
the published handler and statistic aggregation settings; working website
server-only configuration; a safe retained-save/lesson event to exercise; and
an agreed sanitized evidence log. Missing lesson/quiz IDs block their respective
feature acceptance, not initial account/dashboard testing. No secret, ticket,
signed file URL, full save or live player identifier belongs in that log.

For each acceptance row in §11, record build/deployment revision, handler revision
where applicable, actual event, expected versus observed values, timestamp of the
test (not a fabricated game event date), and pass/fail/pending. Keep the actual
saved IDs unchanged. Reconfirm installed-game publication rather than treating
website regression tests as proof of a successful Unity round trip.

Remaining release blockers are **publication/identity acceptance, missing lesson/
quiz IDs/content, correct private photo uploads, true completion-date/turn-in
semantics, and coordinated installed-APK/deployment visual/end-to-end tests**.
These require programmer/operator participation, not another website UI redesign.
