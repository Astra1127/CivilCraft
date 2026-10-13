# Legacy/new-account split — rollout status

Account classification is active on the main website as of October 13, 2026 (UTC+8).
Broader TEST Coin checkout was authorized October 13, 2026 (UTC+8).
Production activation verification is recorded privately in
`cohort-checkout-ready-20261013.json`; configuration alone is not deployment proof.
No existing player data was reset.

## Broader TEST checkout

- Potik's automatic zero opening and one 500-Coin TEST payment were verified against
  the provider and permanent receipt. Wallet version advanced from 1 to 2 and balance
  from 0 to 500. The user confirmed matching APK/website balances after restart.
- Initial broader checkout used PR #11. Subsequent main merges include PR #12
  (all catalog Coin packages) and PR #13 (admin-created Coin catalog support).
- `COIN_COHORT_TEST_CHECKOUT_ENABLED=true` and
  `COIN_COHORT_TEST_DELIVERY_ENABLED=true` admit server-verified shared wallets:
  eligible post-cutoff accounts and previously migrated accounts. Unmigrated legacy
  accounts remain excluded. PR #12 extends TEST checkout to the active 500, 1,000,
  2,500 and 5,000 Coin packages at their reviewed catalog prices. Production proof
  is recorded in `all-packages-ready-20261013.json`. Diamond packages are unchanged.
- Original beta checkout is closed; immutable beta scopes and delivery remain intact
  for prior accepted orders. Coin fulfillment maintenance remains enabled.
- No live payments are enabled. This broader cohort setting does not inherit the
  earlier potik-only 30-minute expiry. To pause new cohort purchases, close only
  `COIN_COHORT_TEST_CHECKOUT_ENABLED` and redeploy; keep delivery enabled for accepted
  payments. Do not rotate the cutoff or delete receipts.
- The 126 Coin tests and restricted database health checks passed immediately before
  applying these settings. No provider payment was initiated by the activation tool.
- Package expansion passed 128 payment tests, type checking and the production build.
  Accepted order price/reward snapshots remain immutable for receipt delivery.
  PR #13 permits active admin-created Coin products for new TEST orders; historical
  protocol-1 bindings retain their original fixed-package verification.

## Initial classification activation record (historical)

- Main PR #10 deployed commit `fe399a45db40f06627376d49f7c494933edf430c`.
- Additive SQL installed October 12; restricted Coin/Diamond health checks passed.
- User reported the updated APK passed existing-balance, cosmetics, both shop links
  and account-switching checks before approving classification activation.
- Immutable database and website cutoff: `2026-10-12T16:22:00.000Z`
  (October 13, 12:22 AM UTC+8).
- Deployment `dpl_FtFcv2KVHXFnRmxAr2c4e2cuvGk5` was READY on the canonical
  main-site alias at `2026-10-12T16:24:02.391Z`.
- `GAME_WALLET_NEW_ACCOUNT_COHORT_ENABLED=true`; both new cohort TEST checkout
  and delivery switches are false. Original checkout switches remain false,
  maintenance stays true, and accepted original beta delivery settings are unchanged.
- The cutoff transaction fingerprinted all 11 pre-existing data tables; all were
  unchanged. Only the new policy row was inserted. No manual player enrollment.
- Next acceptance check: create one post-cutoff account and verify automatic
  zero-wallet setup on the main website and updated APK. Coin checkout activation
  remains a separate step; live payments are not authorized.

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

`database/game-wallet-new-account-cohort.sql` is the installed additive migration.
It adds an owner-configured immutable cutoff and a restricted zero-opening function.
It does not insert the cutoff or touch any player. The function serializes opening,
rejects held/nonempty unimported records, and permanently marks zero enrollment.
The existing health check is extended to verify the new function/table privileges.
Never rerun original database initialization or grant direct table access.

## Original rollout sequence (classification steps completed above)

1. Review/install the additive SQL and pin one coordinated cutoff.
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

Automated harness results are not a full Android build result. Updated APK checks
were separately reported by the user. New-account setup and broader TEST checkout
were subsequently activated as recorded above; live payments remain disabled.
