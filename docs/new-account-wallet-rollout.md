# Legacy/new-account split — local implementation

This is not deployed or activated. Checkout remains closed. No player data is reset.

## Approved behavior

- Unmigrated accounts created before the rollout cutoff keep legacy Coins and progress;
  they cannot buy website Coins into a separate shared wallet.
- Accounts created at/after the cutoff start a shared wallet at zero.
- Previously migrated accounts stay shared, regardless of creation date.
- Purchases remain PayMongo TEST-only. No live-payment activation is authorized.

## Implemented foundation

`cohort-policy.ts` classifies verified account evidence. The cutoff comparison uses
`UserInfo.TitleInfo.Created`, not first login, local save age or browser-supplied dates.
See [PlayFab's account fields](https://learn.microsoft.com/en-us/rest/api/playfab/admin/account-management/get-user-account-info?view=playfab-rest).
Missing/malformed/future evidence fails closed; it is never an offline legacy fallback.

`cohort.server.ts` verifies the classic player/Entity pair server-side, checks the
existing wallet first and prepares zero opening for eligible new accounts only.
Wallet reads and import requests now use it when the cohort is enabled. An import
request cannot transfer client gold into the new zero opening or migrate a legacy
account. Its default-off settings do not open checkout and must not be enabled
independently of the compatible game and SQL capability.

`database/game-wallet-new-account-cohort.sql` is an additive, unapplied migration.
It adds an owner-configured immutable cutoff and a restricted zero-opening function.
It does not insert the cutoff or touch any player. The function serializes opening,
rejects held/nonempty unimported records, and permanently marks zero enrollment.
The existing health check is extended to verify the new function/table privileges.
Never rerun original database initialization or grant direct table access.

## Required before activation

1. Review/install the additive SQL and pin one coordinated future cutoff. No cutoff
   value or database change has been applied by this implementation.
2. Build and distribute the updated Unity client. The new service accepts legacy
   authority only from a valid same-session server response and only for unmigrated
   saves. Spending/display paths retain legacy gold; Diamonds remain independent.
   Unknown accounts stay fail-closed. A restart needs a fresh authority check.
3. Deploy the compatible server with checkout closed. Check the installed capability,
   cohort cutoff and representative APK behavior before activation.
4. Enable TEST-only checkout separately. The new path supports the existing 500-Coin
   product only, not all packages. Keep `COIN_FULFILLMENT_MAINTENANCE=true`.
   Closing `COIN_COHORT_TEST_CHECKOUT_ENABLED` stops new cohort orders; retain
   `COIN_COHORT_TEST_DELIVERY_ENABLED` and the immutable cutoff for accepted delivery.
   Do not repurpose original beta scopes. General cohort orders use a separate
   cutoff/player-derived scope and the existing immutable v3 wallet fingerprint.

Existing unresolved reward queues are preserved, not automatically converted into
legacy balance. No historical receipt, account, Coin balance or save is deleted.

No per-player purchase test is required for every development account. Representative
integration coverage is required for these new paths, not a repetition of all prior tests.

## Local verification

- Coin checkout/delivery: 125 tests passed, including the real API/service/restricted
  SQL cohort fixture; payment network and authentication use synthetic test records.
- Currency regression: 483 passed. Migration regression: 125 passed, one skipped.
- Cohort policy/additive SQL: six passed.
- Unity wallet policy: 121 checks; actual wallet-service recovery: 136 scenarios passed.
- Website type check and production build passed.

This is not an Android build or an on-device acceptance result. The updated APK,
SQL installation, cutoff configuration, publication and activation are still pending.
