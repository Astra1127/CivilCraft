# Leaderboard contract visibility

Administrators choose contract checkboxes at **Admin → Leaderboard Contracts** (`/admin/leaderboard`), then save the complete selection. Both ranking modes use the same selection. Multiplayer remains independent.

The shared read-only endpoint is `GET /api/leaderboard/contracts`. The administrator endpoint is `GET/POST /api/admin/leaderboard-contracts`; writes use the existing administrator session and same-origin gate.

PlayFab Title Internal Data stores the single key `civilcraft.leaderboard.visibility.v1` with this exact schema:

```json
{ "schemaVersion": 1, "contractIds": ["ShopKeeper", "ReedsContract"] }
```

Only the nine existing `LEADERBOARD_CONTRACTS` IDs are accepted. Unknown or duplicate IDs are rejected. An absent record preserves all nine contracts; an empty array displays none. A malformed record or storage failure returns an error, never an all-enabled fallback.

The supported IDs are `ShopKeeper`, `TUT_CONTRACT1`, `ReedsContract`, `VancesContract`, `TUT_CONTRACT2`, `ReedSideInspection`, `VanceSideRealignment`, `SilasMainContract`, and `MainContractSilas`. Other local game contract assets, such as `MarshID`, do not have an entry in the existing ranked protocol and remain excluded from this checklist.

Website contract selectors use the shared endpoint and choose the first visible contract if the current selection is removed. Hidden-contract website ranking requests are rejected as well. This setting does not delete statistics or change score submission, contract progression, rewards, or multiplayer.

Updated Unity builds read the same schema when leaderboards open and when Refresh is pressed. Install a newly built APK for game-side support. Older APKs do not gain this behavior automatically.
