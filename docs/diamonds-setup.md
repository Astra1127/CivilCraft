# Diamonds — website-first test setup

Diamonds is a separate premium wallet. Existing Coin packs, legacy PlayFab `CO`, and game-earned Gold are not converted. The first website release offers 500 Diamonds / ₱50, 1,000 / ₱95, and 2,500 / ₱220 alongside existing Coins. PayMongo remains in simulation/test mode. Unity browser linking and spending are not implemented in this phase.

## Wallet and grant safety

Use two **published Economy v2** catalog items in the same Civil Craft PlayFab title:

- Diamonds: type `currency`, no expiry; record its actual item UUID as `PLAYFAB_DIAMONDS_ITEM_ID`.
- Purchase receipt: type `catalogItem`, hidden, no prices, no expiry; record its distinct UUID as `PLAYFAB_DIAMONDS_RECEIPT_ITEM_ID`. Do not include this item in purchasable bundles or marketplace mappings.

Each player's `premium-wallet` collection stores Diamonds in the explicit `default` stack and permanent receipts in `order-<sha256(orderId)>` stacks. A receipt includes a fingerprint of the exact player, entity, order, currency configuration, and reward. An empty wallet without an ETag is initialized using only a create-only **nonmonetary** `wallet-initialized-v1` marker. No monetary operation runs without a valid ETag.

`ExecuteInventoryOperations` atomically adds the receipt and Diamonds. On conflict or uncertain timeout the server rereads the receipt before retrying. A receipt can also repair payment status after credit succeeded but order-status persistence failed. No fixed `IdempotencyId` is combined with the ETag loop: the receipt provides permanent replay protection beyond the provider's 14-day idempotency window. [Atomic operations](https://learn.microsoft.com/en-us/rest/api/playfab/economy/inventory/execute-inventory-operations?view=playfab-rest), [ETags and retry semantics](https://learn.microsoft.com/en-us/xbox/playfab/economy-monetization/economy-v2/tutorials/etags-and-concurrency-control).

Never expire, spend, transfer, delete, or clean up purchase receipts or this collection. Hidden is presentation, not access control. The wallet is server-authoritative, not part of the game save blob. Do not grant Diamonds using legacy `AddUserVirtualCurrency` or store a client-editable second balance.

## Player write restrictions

Before enabling checkout, inspect the title's current API policy and append client denials; **do not replace its existing statements** or disable unrelated Client/legacy APIs. For this website-only phase, deny these Economy v2 inventory APIs to player callers:

`AddInventoryItems`, `SubtractInventoryItems`, `UpdateInventoryItems`, `DeleteInventoryItems`, `DeleteInventoryCollection`, `TransferInventoryItems`, `ExecuteInventoryOperations`, `ExecuteTransferOperations`, `PurchaseInventoryItems`.

Each denial must be unconditional with `Action: "*"`, `Effect: "Deny"`, `Principal: "*"`, and resource `pfrn:api--/Inventory/<APIName>`. A client denial of `pfrn:api--/Inventory/*` is also recognized by verification, but prevents direct player reads too; website reads use the server title token. No player-side Economy v2 mutations are needed by the existing game in this phase. Verify that title-authenticated operations still work. [API policies](https://learn.microsoft.com/en-us/gaming/playfab/live-service-management/gamemanager/api-access-page-doc), [Economy settings](https://learn.microsoft.com/en-us/gaming/playfab/economy-monetization/economy-v2/settings).

The implementation does not automatically alter catalog or policy. Policy changes affect the selected PlayFab title immediately and must be reviewed before applying them. Preserve Coins/Gold behavior and all current game authentication.

## Verify the actual title before enabling

The code is disabled by default. Set server-side catalog IDs and retain `PLAYFAB_DIAMONDS_ENABLED=false`. A title secret is server-only; PayMongo must use `sk_test_...`. Never place either secret in `VITE_*` variables or commit a real `.env` file.

Use a fresh, **disposable PlayFab test player** with an empty `premium-wallet`. Set `PLAYFAB_DIAMONDS_VERIFICATION_PLAYER_TICKET` to that player's current session ticket in your local secret environment. The ticket must authenticate to the explicitly selected player.

```powershell
node --env-file=.env scripts/verify-diamonds-setup.mjs --test-player <TEST_PLAYFAB_ID> --confirm-test-writes
```

This explicit test performs read-only account/catalog/policy inspections, verifies that a player-token Add is denied, then runs concurrent/repeated **one-Diamond** grants to the selected disposable player's `premium-wallet`. It leaves exactly one test Diamond and a permanent receipt. It does not remove or reset data, change catalog or policy, or write environment files. Its rejected permission probe targets only `premium-wallet-verification`; if client permissions are broken it could leave one noncurrency marker there before stopping. No real payment or PayMongo checkout occurs.

Only after **all checks pass**, review and copy its nonsecret output into the deployment environment:

```dotenv
PLAYFAB_DIAMONDS_ENABLED=true
PLAYFAB_DIAMONDS_BOOTSTRAP_VERIFIED=true
PLAYFAB_DIAMONDS_PLAYER_WRITES_DENIED=true
PLAYFAB_DIAMONDS_VERIFIED_TITLE_ID=<verified title>
PLAYFAB_DIAMONDS_VERIFIED_CONFIG_SHA256=<verified configuration fingerprint>
```

These values are an operator attestation of the actual checks, not credentials or a replacement for checking policy. The fingerprint binds the approved title, collection, and item IDs; changing them requires new verification. Remove the verification ticket afterward. Never enable this from mocked tests alone. No real-title verification has been performed by the code-generation workflow.

## Acceptance and operation

In the website's authenticated Product Administration, use **Add Missing Defaults** to add the three Diamond packages. This explicit action also adds any missing legacy Coin templates, but never replaces existing, disabled, modified, or malformed product records. Public shop reads never seed products or substitute active defaults during an outage. Review the stored packages before enabling checkout.

Configure server-only `PAYMONGO_SECRET_KEY=sk_test_...`, `PAYMONGO_WEBHOOK_SECRET`, and an explicit `PUBLIC_APP_URL` (or `PUBLIC_SITE_URL` / `SITE_URL`). Production return URLs must use HTTPS. Configure the test-mode webhook at `/api/webhooks/paymongo`; success/cancel page visits cannot grant currency. Browser sessions are validated independently of Unity login. Do not enable live payments.

Run mocked tests with `npm run test:currencies`. They cover first-wallet initialization, concurrent duplicate/distinct orders, stale reads, uncertain timeout after commit, receipt/config tampering, private errors, authentication, expired-session routing, catalog administration, Coin regressions, and disabled/unverified setup. They make no external calls.

Then simulate a test PayMongo purchase from the website and verify that only the authenticated player's Diamonds balance changes; Coins remain unchanged. Check cancellation, delayed webhook confirmation, account switching, and replay. A browser redirect alone must never grant currency.

Each receipt consumes an inventory stack; PlayFab's collection limit is 10,000 stacks. Do not delete old receipts to free space. At capacity, fulfillment must remain pending/retryable for support rather than granting without a receipt. A future archival/migration design must preserve deduplication before handling this limit.

If configuration is rotated, captured historical wallet snapshots fail closed rather than silently crediting new item IDs. Restore the previously verified configuration or implement a reviewed migration to reconcile those orders. Disabling checkout should be the first step before any catalog, policy, or wallet configuration change.
