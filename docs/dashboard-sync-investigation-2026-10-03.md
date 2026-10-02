# Dashboard sync investigation — 2026-10-03

## Conclusion

Read-only live inspection of PlayFab title `17FA03` resolved username/display name `jeyben` to player `4515CB33C3D5E277` (title-player entity `3E05F109771C43E7`). `Server/GetUserData`, explicitly requesting the website's 15 keys, returned `DataVersion: 0`, `Data: {}`. None of the four dashboard statistics exists. Therefore no dashboard projection is stored for this account at the check. The upstream reason (not executed, failed, older installed build, or different active game account) remains unproven.

No website implementation defect was established that explains these missing records. No application, Unity, CloudScript, game save, or PlayFab data was changed. Live calls were limited to account lookup, UserData/statistics reads, and CloudScript revision download. The sync handler was not executed.

## Exact website read path and missing condition

- `src/routes/dashboard.index.tsx`: React Query calls `profileService.getProfile(id)`, progress, achievements, character, and almanac services. There is no dashboard snapshot HTTP loader or single stored `dashboardSnapshot` object.
- `src/lib/playfab/index.ts` delegates to `getPlayerProfile` in `player.ts`. It concurrently calls authenticated `Client/GetAccountInfo`, `Client/GetUserData`, and `Client/GetPlayerStatistics` directly from the browser.
- Client calls use the same stored player session ticket. AccountInfo must return a PlayFab ID matching the expected session identity or profile loading throws an error. UserData requests omit a target PlayFab ID and therefore read the ticket owner.
- The exact overview condition is `const isAwaitingSync = !p.characterSyncedAt`. The profile copies `CharacterSyncedAt` only when truthy. Missing/empty marker triggers the notice; whitespace or malformed nonempty timestamps are not validated here.
- Partially populated snapshots are not rejected as a unit. Numeric fields accept finite numeric strings; absent/blank/nonfinite fields become null. A marker does not guarantee other fields exist. Without a marker, independently available values can still render.
- Story content is gated separately on nonempty `progress.data?.regions.length`. Empty/malformed/missing MapProgress returns no regions. Achievement and Almanac JSON are parsed independently.
- Statistics failure is caught and treated as an empty map; this could hide a statistic-read failure, but the successful live server read independently confirmed the dashboard statistics are absent for this account.

### UserData keys requested

`CurrentLevel`, `XP`, `XPToNextLevel`, `CurrentRegion`, `AchievementsUnlocked`, `AchievementsTotal`, `BridgesCompleted`, `ChallengesCompleted`, `MapProgress`, `AchievementProgress`, `EquippedCosmetics`, `AlmanacProgress`, `CharacterSyncedAt`, `CharacterName`, `CharacterPortraitUrl`.

All 15 requested keys were absent in the live response. `CharacterName` is requested but not used to determine sync status; account display name is from AccountInfo.

### Statistics and precedence

- Total score: statistic `TotalScore` (the legacy leaderboard alias also equals TotalScore), then UserData TotalScore, then null.
- Bridges/challenges: corresponding statistic, then corresponding UserData key, then null.
- Best build: statistic `BestSingleBuildScore`, then legacy `BestBuildScore`, then UserData BestSingleBuildScore, then null.
- UserData TotalScore/BestSingleBuildScore fallbacks are coded but those keys are not in the requested key list.

The live account has ten `CC_E_*` / `CC_S_*` per-contract statistics, not `TotalScore`, `BridgesCompleted`, `ChallengesCompleted`, or `BestSingleBuildScore`. Those packed leaderboard metrics must not be converted into dashboard totals. Ranking and dashboard publication are separate operations.

### Nested projections

MapProgress accepts region arrays or an object with regions, numeric overallPercent/storyPercent, and currentRegion; legacy casing aliases are accepted. Region fields include id/regionId, name, completed, missionsCompleted, missionsTotal, bestScore, and stars. AchievementProgress accepts an array or supported wrapper/map and parses id/name/description/unlocked/progress/target metadata. AlmanacProgress accepts regions containing levels and completion records, plus completion totals, journeyPercent, discoveredBridgeTypeIds, and discoveredMaterials. EquippedCosmetics uses the dedicated equipment parser. These are independent readers, not evidence that any projection has been published.

### Portrait/entity files

The current website reads `CharacterPortraitUrl` from UserData. Its dashboard character path does not call Entity GetFiles or download `characterPortrait.png`. Revision 8 can write portrait file metadata, but the website does not read those metadata keys. This is a separate integration gap, not the cause of the missing dashboard marker. Entity files were not downloaded or inspected; they are not this dashboard's data source.

## Identity and environment limits

The configured website/server title is `17FA03`, demo mode is false, and the current Unity `PlayFabSharedSettings.asset` also specifies `17FA03`. No configured title mismatch was found in the inspected sources.

The live username lookup establishes jeyben's account ID. No browser is connected, so the actual localhost browser session could not be inspected or its ticket validated during this investigation. The implementation verifies ticket identity, but this is not a direct observation of that browser session. The active installed game's ID likewise remains unavailable. Therefore SAME ACCOUNT versus DIFFERENT ACCOUNT cannot yet be conclusively reported. Existing leaderboard activity on this account supports prior gameplay publication to it, but does not prove the current game session identity.

## Current deployed syncDashboardV1 contract

Live `Admin/GetCloudScriptRevision` returned version 1, revision 8, `IsPublished: true`; downloaded main.js contains `handlers.syncDashboardV1`. This supersedes the older Revision 5/no-caller description in `game-dashboard-sync-handoff.md`. The handler is present in the published backend, but authenticated execution reachability/success was not tested because executing it with a valid payload writes player data.

The game uses `Client/ExecuteCloudScript`, FunctionName `syncDashboardV1`, with FunctionParameter below. The handler requires authenticated `currentPlayerId`; it accepts no caller-selected destination ID. The current Unity request omits RevisionSelection; the programmer should capture the response's actual Revision rather than assume which revision executed.

| Required request field | Validation | Destination |
| --- | --- | --- |
| schemaVersion | integer exactly 1 | validation/result |
| currentLevel | integer 1–1000 | CurrentLevel |
| xp | integer 0–2147483647 | XP |
| xpToNextLevel | integer 1–2147483647 | XPToNextLevel |
| currentRegion | string length <=100; empty accepted | CurrentRegion |
| achievementsUnlocked | integer 0–10000; <= achievementsTotal | AchievementsUnlocked |
| achievementsTotal | integer 0–10000 | AchievementsTotal |
| totalScore | integer 0–2147483647 | statistic TotalScore |
| bridgesCompleted | integer 0–2147483647 | UserData/statistic BridgesCompleted |
| challengesCompleted | integer 0–2147483647 | UserData/statistic ChallengesCompleted |
| bestSingleBuildScore | integer 0–2147483647 | statistic BestSingleBuildScore |
| mapProgress | serialized JSON object string, <=10000 characters | MapProgress |
| achievementProgress | serialized JSON array string, <=10000 characters | AchievementProgress |
| equippedCosmetics | serialized JSON object string, <=10000 characters | EquippedCosmetics |
| almanacProgress | serialized JSON object string, <=10000 characters | AlmanacProgress |

Numbers must be finite integers, not numeric strings. JSON objects must not be arrays/null; the handler validates outer types, not nested progression schemas. All 15 fields are required.

Optional portrait fields: characterPortraitFile (<=100 characters, empty or exactly characterPortrait.png), characterPortraitUpdatedAt (<=64), characterPortraitChecksum (<=64, empty or lowercase 64-digit hex). Metadata without a file fails. If any optional field is supplied, corresponding CharacterPortraitFile/CharacterPortraitUpdatedAt/CharacterPortraitChecksum UserData is written. Missing optional fields preserve older metadata.

After validation, the handler writes 12 projection UserData keys plus its generated UTC ISO CharacterSyncedAt, with Private permission, then writes four statistics using ForceUpdate:false. These two writes are sequential, not atomic. A statistic failure can leave UserData/marker stored. It does not write CharacterName or CharacterPortraitUrl. Success returns `{accepted:true,schemaVersion:1}`. Invalid fields/JSON, achievement count mismatch, missing authenticated player, or invalid portrait metadata throw errors; underlying write failures can also fail execution. The game must inspect the ExecuteCloudScript Error as well as API failure and FunctionResult.

## Current game caller: read-only findings

`Assets/Script/Player/PlayerSave/DashboardSyncService.cs` exists and calls ExecuteCloudScript. `PlayerDataManager.cs` adds the component dynamically when missing. It subscribes to OnSaveCommitted, debounces 5 seconds, and retries failures after 30 seconds.

Publishing is gated on dirty state, no request in flight, PlayerDataManager/current data availability, elapsed retry/debounce time, PlayFab Client logged in, PlayFabAuthManager present, IsCloudSaveReady true, and IsGuestSelected false. PlayFabAuthManager sets readiness from CloudSaveManager session completion. The caller sends the 15 required fields plus portrait metadata.

The caller checks result.Error but does not explicitly verify FunctionResult.accepted/schemaVersion before logging success. This is a response-handling weakness to discuss with the game programmer; it is not proven to have caused this account's missing data. No matching DashboardSync/syncDashboardV1/validation messages were found in the current local Unity Editor log. That does not establish what happened on an Android device or older build.

## Caching and parser verdict

React Query uses account-specific keys, default QueryClient settings, refetchOnMount:"always", and the dashboard Refresh button refetches all five queries. Auth changes clear/invalidate player queries. No persistent dashboard snapshot cache or website backend dashboard cache was found. A direct live server read bypassed browser query cache and still found no stored projection, so stale website caching cannot explain the absence in PlayFab.

The website has no current stored dashboard payload to reject. Its missing-data behavior matches the live results. The absent marker is the immediate cause; data publication failure/nonexecution/account ownership remains the upstream diagnostic question. Case A is confirmed for this account at the read; B/E/F/G/J remain unresolved possibilities. C/D/H are not supported as explanations of the missing snapshot; I was not found in inspected configuration.

## Exact next action for the game programmer

1. Run the installed/current game build, authenticate jeyben, and compare its PlayFabId with `4515CB33C3D5E277` and title `17FA03`. Share only IDs, never tickets/passwords/entity tokens.
2. Confirm DashboardSyncService is active on PlayerDataManager and log which publication readiness gate remains false, especially IsCloudSaveReady and guest selection.
3. After the actual save finishes loading, trigger a real committed save and capture the actual serialized FunctionParameter and ExecuteCloudScript response: Revision, Error, FunctionResult, and non-sensitive Logs. Do not send synthetic/default progression to make validation pass.
4. Verify all 15 required fields against the table and optional portrait constraints. Check API failure callback/LastSyncError if no success response occurs. Require accepted:true/schemaVersion:1 as success evidence.
5. Re-read this same account's private UserData and four statistics, then use website Refresh. If the game identity differs, establish the intended account before publishing; do not transfer or fabricate saves.

Classification: confirmed missing PlayFab dashboard data, upstream publisher/runtime/account cause unknown. No website fix is justified yet. No Unity or CloudScript changes were made.
