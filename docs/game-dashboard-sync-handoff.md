# Game → website dashboard synchronization handoff

## Scope and evidence

This is a website-only implementation and programmer handoff. No Unity script, asset, scene or configuration was changed. No CloudScript was modified, invoked to write data, or deployed.

The source inspected on 2026-10-01 was the downloaded **title 17FA03, published legacy CloudScript Revision 5** (`Admin/GetCloudScriptRevision`, `IsPublished: true`). It contains `handlers.syncDashboardV1`. Revision 4 was the earlier leaderboard revision; do not treat it as the dashboard schema reference. Confirm the Live revision before implementing if the backend changes after this review.

The Unity checkout `C:/Users/jemma/Documents/Thesis/CivilCraft_Apk/Civil-Craft` has no `syncDashboardV1` caller. `CloudSaveManager.cs` uploads encrypted entity files; that does not publish the private UserData projection consumed by the website. The Main Menu scene configures the matching title ID `17FA03`.

The prior read-only check of player `4515CB33C3D5E277` returned no `EquippedCosmetics` or `CharacterSyncedAt` and UserData version 0. This proves no snapshot was stored at that check, not that the player wears no cosmetics. The active Unity login's player ID still needs comparison.

## Confirmed deployed request requirements

Use authenticated **Client/ExecuteCloudScript**, function `syncDashboardV1`, with `RevisionSelection: "Live"`. `FunctionParameter` is an object containing **all 15 fields below on every call**. Authenticate as the same PlayFab account used on the website; do not send a target player ID. The handler writes for authenticated `currentPlayerId`. No title secret belongs in Unity or the browser. See the [official ExecuteCloudScript request and response reference](https://learn.microsoft.com/en-us/rest/api/playfab/client/server-side-cloud-script/execute-cloud-script?view=playfab-rest).

| FunctionParameter field | Exact JSON type and validation in Revision 5 | Stored destination |
| --- | --- | --- |
| `schemaVersion` | integer number, exactly `1` | Validated; returned on success |
| `currentLevel` | integer number, 1–1000 inclusive | UserData `CurrentLevel` |
| `xp` | integer number, 0–2147483647 inclusive | UserData `XP` |
| `xpToNextLevel` | integer number, 1–2147483647 inclusive | UserData `XPToNextLevel` |
| `currentRegion` | string, at most 100 JavaScript string code units; empty string accepted | UserData `CurrentRegion`; retained even though removed from profile UI |
| `achievementsUnlocked` | integer number, 0–10000 inclusive; must be <= `achievementsTotal` | UserData `AchievementsUnlocked` |
| `achievementsTotal` | integer number, 0–10000 inclusive | UserData `AchievementsTotal` |
| `totalScore` | integer number, 0–2147483647 inclusive | statistic `TotalScore` |
| `bridgesCompleted` | integer number, 0–2147483647 inclusive | UserData and statistic `BridgesCompleted` |
| `challengesCompleted` | integer number, 0–2147483647 inclusive | UserData and statistic `ChallengesCompleted` |
| `bestSingleBuildScore` | integer number, 0–2147483647 inclusive | statistic `BestSingleBuildScore` |
| `mapProgress` | string containing valid JSON **object**, not array/null; string length <=10000 | UserData `MapProgress` |
| `achievementProgress` | string containing valid JSON **array**; string length <=10000 | UserData `AchievementProgress` |
| `equippedCosmetics` | string containing valid JSON **object**, not array/null; string length <=10000 | UserData `EquippedCosmetics` |
| `almanacProgress` | string containing valid JSON **object**, not array/null; string length <=10000 | UserData `AlmanacProgress` |

Numbers must be finite integers, not numeric strings, booleans, fractions or null. Missing required values fail validation. JSON fields are **serialized strings inside FunctionParameter**, not nested objects supplied directly. In C#, serialize each projection DTO once before putting its string in FunctionParameter; the SDK then serializes the enclosing request. Length limits apply to those serialized strings, not to decoded property counts. Do not silently truncate IDs or JSON to fit.

The handler converts scalar UserData values to strings, sets private UserData permissions, and generates `CharacterSyncedAt` itself as a UTC ISO timestamp. It does not read a client timestamp. It does not write `CharacterName` or `CharacterPortraitUrl`; adding them to the request has no effect. It publishes statistics with `ForceUpdate: false`; it does not define statistic aggregation or reset policies. These are separate from the per-contract statistics published by `submitBridgeRunV1`.

## Confirmed Unity equipment model versus proposed publication format

**Confirmed game source:** `Assets/Script/Player/PlayerSave/CosmeticDefinition.cs`, class `CosmeticLoadoutData`; `PlayerData.cs` stores it under `cosmeticLoadout`.

| Game field | Type / meaning | Website representation if this model is published |
| --- | --- | --- |
| `accessoryIDs` | list of string permanent IDs; supports multiple equipped accessories | One card per accessory, without overwriting previous entries |
| `accessoriesID` | legacy single string accessory ID | Fallback when the list is absent or empty, following the game's migration behavior |
| `hairID` | string permanent ID | Hair |
| `shirtID` | string permanent ID | Top |
| `pantsID` | string permanent ID | Pants |
| `shoesID` | string permanent ID | Shoes |
| `accessoriesColor`, `hairColor`, `shirtColor`, `pantsColor`, `shoesColor` | Unity Color values | Accepted as metadata in this model; the website does not render/reconstruct tint |

`Accessory_None` (case-insensitive) is the game's no-accessory sentinel. Empty strings represent no ID. A populated accessory list is authoritative over the legacy field. The website preserves all distinct published accessory IDs, including both `EngineeringHardHat` and `Accessory_SafetyVest`; it does not reclassify them as separate Head/Vest slots. The game categories are Accessories, Hair, Shirt, Pants and Shoes, not eight independently equipped slots. Unknown IDs remain visible as IDs, not guessed names. No items are inferred from ownership, unlocked defaults, or the old encrypted save.

Actual permanent IDs and display names are in `Assets/BridgeBuilder/Data/Cosmetics/*.asset`, including `EngineeringHardHat` (Engineering Hard Hat), `Accessory_SafetyVest` (Safety Vest), `Hair_1` (Side Sweep), `Shirt_Tee1` (Work Tee), `Pants_Cargo` (Cargo Pants), and `Shoes_Boots1` (Work Boots). Some assets have sprite references, others `icon: {fileID: 0}`. Unity sprite GUIDs are not web URLs. The default PlayFab catalog was empty at the read-only check.

**Not yet confirmed:** whether the programmer intends to serialize `CosmeticLoadoutData` directly into `equippedCosmetics`, or publish a separate DTO. Revision 5 only validates that this field contains a JSON object; it does not define any inner keys. The website now supports the above inspected loadout shape **if published**, plus its earlier slot-map format. This is forward compatibility, not a claim that Unity currently sends it. For the loadout shape, include all four clothing ID strings and either the accessory list or legacy accessory field; partial/unrecognized shapes show an unsupported-format state instead of invented empty slots.

## Sanitized request example

The machine-readable example is [sync-dashboard-v1.example.json](sync-dashboard-v1.example.json). **It is a synthetic shape example, not this player's data, not a default loadout and not a request to send to production.** The progression numbers are illustrative. The empty progression objects/array satisfy the handler's outer-type validation but do not define a real progression schema. Replace every field with an agreed projection of the real loaded game state; never send zeros/empty objects merely to make validation pass.

```json
{
  "FunctionName": "syncDashboardV1",
  "RevisionSelection": "Live",
  "FunctionParameter": {
    "schemaVersion": 1,
    "currentLevel": 1,
    "xp": 0,
    "xpToNextLevel": 100,
    "currentRegion": "",
    "achievementsUnlocked": 0,
    "achievementsTotal": 10,
    "totalScore": 0,
    "bridgesCompleted": 0,
    "challengesCompleted": 0,
    "bestSingleBuildScore": 0,
    "mapProgress": "{}",
    "achievementProgress": "[]",
    "equippedCosmetics": "{\"accessoryIDs\":[\"EngineeringHardHat\",\"Accessory_SafetyVest\"],\"accessoriesID\":\"EngineeringHardHat\",\"hairID\":\"Hair_1\",\"shirtID\":\"Shirt_Tee1\",\"pantsID\":\"Pants_Cargo\",\"shoesID\":\"Shoes_Boots1\"}",
    "almanacProgress": "{}"
  }
}
```

The equipment subobject in this example is the proposed direct-loadout projection described above. It passes Revision 5's structural validation, but programmer agreement is still needed before treating it as the live wire contract. No player ID, email, session ticket, secret, file upload URL or encrypted save belongs in this example.

Validation performed: replayed the downloaded Revision 5 source locally with mocked `UpdateUserData` and `UpdatePlayerStatistics`. The example returned accepted/schemaVersion 1 and produced the expected private UserData and statistic calls. Omitting each of the 15 required fields in turn failed before any mock write. This checks the deployed handler's validation logic without sending the synthetic payload to PlayFab; it does not prove that unknown statistic configuration or real game progression semantics are correct.

## Sync timing and response handling — recommendations, not existing behavior

There is currently no caller and no confirmed cadence. Recommended lifecycle for the programmer:

1. After successful account login, **wait for save download/conflict resolution and loadout migration to finish**. Then publish a full snapshot for that account. Never sync default/new-player values while the real save is still loading, or sync a guest save to a newly signed-in account.
2. Publish after committed equipment changes and progression/achievement/completed-run changes. Coalesce rapid changes; serialize sends so older snapshots cannot arrive after newer ones. Publish after a successful save/commit, not from preview UI. Reconcile again after reconnect/resume. Do not rely only on app quit.
3. Capture the account identity and snapshot generation for each request. Discard obsolete callbacks after account switching, and do not acknowledge a newer local snapshot from an older response. Keep equipment rendering/ownership controlled by Unity.
4. Check both the SDK API error callback and the successful API response's **`Error`** field. A successful HTTP/SDK callback alone is not a successful script execution. Require `FunctionResult.accepted === true` and `FunctionResult.schemaVersion === 1`; record returned revision and a non-sensitive correlation ID. Missing/truncated results are not proof of success. The expected function result is `{"accepted":true,"schemaVersion":1}`. See [ExecuteCloudScript response fields](https://learn.microsoft.com/en-us/rest/api/playfab/client/server-side-cloud-script/execute-cloud-script?view=playfab-rest).
5. Schema/validation failures need a programmer fix, not repeated identical requests. On expired authentication, use the game's supported re-login flow; never extend validity locally. For transient failures, retain a dirty/latest snapshot and retry with bounded backoff **only after confirming statistic aggregation is safe for retries**. Do not queue historical snapshots indefinitely or persist credentials in diagnostic logs.

**Confirmed consistency limitation:** Revision 5 writes UserData (including `CharacterSyncedAt`) first, then calls `UpdatePlayerStatistics`. These writes are not atomic. A later statistic failure can leave a fresh timestamp/equipment with old statistics. Therefore `CharacterSyncedAt` alone does not prove the complete sync succeeded. A lost response also leaves success uncertain. Do not assume retries are idempotent: if a statistic uses Sum, resubmitting totals could double count. Verify actual aggregation/reset settings and the intended total/best semantics before enabling automatic retries. Revision 5 has no snapshot sequence check to reject delayed older requests.

## Information needed from the programmer

- Confirm direct `CosmeticLoadoutData` versus a separate dashboard DTO, with an actual serialized sample containing **two accessories** and one explicitly empty category.
- Supply the source and semantics of every progression scalar. In particular, is `xp` current-level or lifetime XP, and is `xpToNextLevel` a threshold or remaining amount? How are total/best score and completed/achievement counts computed? No derivation is defined by CloudScript.
- Agree the inner schemas/IDs for `mapProgress`, `achievementProgress` and `almanacProgress`. Current website readers are in `src/lib/playfab/player.ts` (`parseMapProgress`, `parseAchievementProgress`) and `src/lib/playfab/almanac.ts`; these readers describe website expectations, not proof of a game publishing contract.
- Confirm the actual PlayFab statistic aggregation/reset definitions, conflict-resolution rules, maximum payload sizes and retry policy.
- Confirm metadata delivery: a populated catalog (including its version) or an agreed item-metadata projection; provide web-accessible thumbnails for available Unity sprites. Confirm the same active PlayFab player ID in Unity and the website without sharing credentials.

## Backend coordination proposals — not implemented

No backend change is necessary solely to transport the proposed loadout JSON object through the existing handler. Coordinate inner-schema agreement and the Unity caller first. Separately consider:

- Versioned validation of the nested projections and item metadata, instead of accepting arbitrary JSON objects.
- A snapshot ID/sequence and retry-safe statistic semantics to address old writes, repeated calls and partial success. Decide whether the sync timestamp denotes projection-write time or full-sync success.
- A separate cosmetics-only handler or a versioned partial-update contract if the game cannot truthfully supply all required progression fields. The current function requires them all; do not bypass this with fabricated values.
- Explicit metadata/portrait publication if names, thumbnails, colors or a character portrait should appear on the website. Revision 5 does not itself publish a portrait or catalog entries.

These are proposals for programmer/backend ownership. No replacement CloudScript is supplied or deployed.

## Verification

After the publishing contract is agreed and the game programmer implements the caller, sign into both clients with the same player ID/title, equip two real accessories, and trigger a committed game save. Confirm the full script success response, then inspect private UserData `EquippedCosmetics` and `CharacterSyncedAt` and the four stored statistics in Game Manager. Refresh the website: both accessories must appear; a missing snapshot must say “Awaiting game sync,” a valid empty category must say “Empty,” and an unsupported payload must show an error. Repeat with an explicit empty loadout, an offline failure/retry, and an account switch. Website pages must never submit scores or equipment.

Website validation: 136 relevant automated tests passed; TypeScript and production build passed. Tests cover multiple accessory parsing/rendering, legacy single-accessory migration, explicitly empty versus missing/unsupported snapshots, and the overview's absent-progression state. Live game-to-website verification remains pending implementation of the game-owned publisher and agreement of the unresolved schemas.

Website files changed in this follow-up: `src/lib/playfab/equipment.ts`, `src/lib/playfab/player.ts`, `src/lib/playfab/inventory.ts`, `src/lib/playfab/types.ts`, `src/routes/dashboard.profile.tsx`, `src/routes/dashboard.index.tsx`, and `tests/dashboard-account-features.test.mjs`; this handoff, its JSON example and `DASHBOARD_ACCOUNT_VALIDATION.md` document the integration. Earlier account/shop changes were preserved.
