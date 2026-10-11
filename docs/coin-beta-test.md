# Account-limited TEST Coin checkout

This is a default-off, main-site-only exception to Coin maintenance for one reviewed account and the `coins_500` package: 500 Coins, PHP 5,000 centavos in PayMongo TEST mode. It is not live-payment activation, approval of legacy receipts, or a general wallet rollout.

Keep `COIN_FULFILLMENT_MAINTENANCE=true`. Do not disable this fence just to test a fresh account: that also reopens legacy Coin handlers. Diamonds and their existing receipt protocol are unchanged. The fork remains off and is not a beta consumer.

## Server-only configuration

- `COIN_BETA_CHECKOUT_ENABLED=false` by default.
- `COIN_BETA_DELIVERY_ENABLED=false` by default.
- `COIN_BETA_SCOPE_ID`: one stable reviewed scope identifier.
- `COIN_BETA_TITLE_ID`: the verified title.
- `COIN_BETA_PLAYER_ID`: one verified classic PlayFab player ID, not a display name or a list.
- `COIN_BETA_ENTITY_ID`: that player's verified title-player-account entity.

Never expose these settings through `VITE_` variables or accept them from a browser. Do not commit real account identifiers or credentials. Checkout requires both beta gates, main HTTPS origin, a TEST PayMongo key and signing configuration, the exact active server catalog package/price/reward, and a verified imported version-3 database wallet whose entity matches the reviewed scope. The existing account-bound game link/login checks remain in force.

The original order freezes a server-authored beta binding together with its version-3 destination, product, payment amount and reward. Delivery must validate that binding and signed, explicitly TEST, completed paid checkout/payment evidence. Legacy v1/v2/unknown-version and unbound/non-beta Coin orders remain fenced. Browser success/cancel pages and unpaid payments cannot credit currency. A genuinely verified delayed paid order is not discarded just because its repairable audit status says failed/cancelled.

Provider references: [Checkout Session Resource](https://docs.paymongo.com/reference/checkout-session-resource) defines TEST resource mode and explains that the cancel URL does not cancel records. [Hosted Checkout](https://docs.paymongo.com/docs/payment-channels-hosted-checkout) documents the paid webhook and its checkout/payment evidence.

## Closing or stopping a beta

Closing `COIN_BETA_CHECKOUT_ENABLED` stops new checkouts. Keep the delivery gate and exact scope/identity configuration unchanged while any accepted paid test order needs delivery or receipt repair. The delivery gate is separate so closing checkout does not strand such an order. Turning delivery off is an emergency hold, not cancellation or permission to retry a credit manually. Investigate the permanent receipt before another attempt.

This implementation restricts account/package and retains permanent per-order idempotency. It does **not** add a durable one-order-per-account quota. Run one manually controlled test attempt; do not claim that multiple intentional separate checkouts are technically impossible.

## Controlled test

1. Review/test/build the source, deploy main with the beta gates still off, then deliberately enable only the reviewed production scope while global Coin maintenance stays on.
2. Confirm the fresh account's zero-opening migration, one existing hard-hat entitlement and unchanged balance across refresh/restart/Android before buying. Keep other sessions idle and do not reset/import guest progress.
3. Sign in on the main website with that exact player account. Only the 500 Coin package should be enabled for Coins. Other accounts/packages remain blocked.
4. The human tester completes one PayMongo TEST checkout using sandbox inputs, never real payment details. Do not create another order if paid delivery is pending; retain the order reference for review.
5. Verify the signed webhook and permanent version-3 receipt credit the same wallet exactly once; the game should refresh from 0 to 500 Coins. A browser return alone is not credit evidence.
6. Repeat balance refresh/restart/Android read checks. Verify the permanent order receipt, wallet version/ledger/entitlements and no classic Coin grant. Cancellation/unpaid checkout must add nothing; duplicate callbacks must not add another 500.
7. Close new beta checkout after the test; preserve delivery/scope until accepted test orders are reconciled. Leave global legacy maintenance on. Broader rollout and uncertain old account resolution remain separately reviewed work.
