# Diamonds — PayMongo without a PlayFab card

Diamonds uses regular **PlayFab Entity Objects**, not the Economy v2 catalog. No catalog item, legacy DI currency, or PlayFab billing-card setup is needed for this backend. PayMongo still handles simulated checkout; PlayFab only stores the receiving player's wallet. The title's actual free-tier access and permissions must pass the verification below before checkout is enabled.

Existing Coins (`CO`), Coin packages, and game-earned Gold are untouched. The three test packs remain 500 Diamonds / ₱50, 1,000 / ₱95, and 2,500 / ₱220. Website design, Coins/Diamonds tabs, `/shop?currency=diamonds` login routing, and independent validated browser sessions are unchanged. This phase does not implement Unity linking, spending/conversion, live payments, or automatic return to the game.

## What changed

Each server-resolved `title_player_account` has a dedicated object named `civilcraft.premium-wallet.v1`. It stores `DI`, the balance, account identity, and a permanent receipt ledger. It is separate from local/cloud game save files.

The server reads `Object/GetObjects`, then saves the balance **and** receipt together through one `Object/SetObjects` request with `ExpectedProfileVersion`. A version mismatch, concurrent edit, or uncertain timeout triggers a receipt reread before retry. There is no unconditional monetary write, separate receipt step, or fixed idempotency ID. First-wallet creation is the same single conditional write, including profile version zero; it does not require an Economy bootstrap marker. [Conditional writes](https://learn.microsoft.com/en-us/rest/api/playfab/data/object/set-objects?view=playfab-rest).

A hashed order key and immutable grant fingerprint prevent repeated credit, including replay beyond 14 days. Receipt checks repair failed order-status persistence without granting again. Invalid identity, corrupted balance/receipts, missing profile versions, and backend failures fail closed. Unavailable balances are shown as unavailable, never fabricated zeros.

The receiving account, reward, price, and wallet provider remain server-authenticated, immutable order snapshots. Checkout accepts only `productId`. Signed test-mode payment evidence must match the stored checkout, paid payment, amount, PHP currency, and metadata; incomplete evidence is retrieved server-side. Visiting a success URL cannot credit currency.

## Step 1 — server environment

Keep checkout disabled while configuring and verifying:

```dotenv
PLAYFAB_DIAMONDS_STORAGE=entity-objects
PLAYFAB_DIAMONDS_ENABLED=false
PLAYFAB_DIAMONDS_ITEM_ID=
PLAYFAB_DIAMONDS_RECEIPT_ITEM_ID=
PLAYFAB_DIAMONDS_BOOTSTRAP_VERIFIED=false
PLAYFAB_DIAMONDS_PLAYER_WRITES_DENIED=false
PLAYFAB_DIAMONDS_VERIFIED_TITLE_ID=
PLAYFAB_DIAMONDS_VERIFIED_CONFIG_SHA256=
```

Keep the existing `VITE_PLAYFAB_TITLE_ID`, server-only `PLAYFAB_SECRET_KEY`, `PAYMONGO_SECRET_KEY=sk_test_...`, `PAYMONGO_WEBHOOK_SECRET`, and explicit `PUBLIC_APP_URL` configuration. Production return URLs must use HTTPS. No secret or verification ticket belongs in `VITE_*`, browser code, git, or a screenshot.

If Economy item IDs were previously configured, review the old wallet/orders first. The new provider deliberately rejects those IDs instead of showing a misleading empty balance. See the legacy section below before clearing them.

## Step 2 — deny player object mutations

In the Civil Craft PlayFab title:

1. Open **Title settings → API Access Policy**.
2. Find the **Object** category (or search `Object/SetObjects`).
3. Deny/uncheck **SetObjects** and save only that change.
4. Preserve all existing rules; do not reset defaults or replace the entire policy.
5. Leave `Object/GetObjects` and the game's **File** APIs permitted. Cloud saves/portraits currently use Files, not Object/SetObjects.

The required unconditional player denial is:

```json
{
  "Resource": "pfrn:api--/Object/SetObjects",
  "Action": "*",
  "Effect": "Deny",
  "Principal": "*"
}
```

This blocks both client object writes and object deletion. The website uses server-held title credentials. Verification checks that title writes still work and the player's own token is actually denied. If you use a JSON editor, **append** this statement to the existing list rather than pasting it as the complete policy. [API Access Policy instructions](https://learn.microsoft.com/en-us/xbox/playfab/live-service-management/gamemanager/api-access-page-doc).

No PlayFab catalog, billing, policy, or real-account changes have been applied automatically by this revision.

## Step 3 — verify the real test title

Use a fresh disposable test player, not your own progression account. It must have no premium-wallet object and at least one free Entity Object slot. Set `PLAYFAB_DIAMONDS_VERIFICATION_PLAYER_TICKET` in your private local environment to that player's current session ticket. The script validates it against the explicitly supplied PlayFab ID.

From the website directory, using Node 22.18 or newer:

```powershell
node --env-file=.env scripts/verify-diamonds-setup.mjs --test-player <TEST_PLAYFAB_ID> --confirm-test-writes
```

The explicit consent flag is required. The script:

- Inspects the current policy and account mapping.
- Tests a player-token nonmonetary write, requiring an explicit authorization denial.
- Tests an intentionally mismatched profile version, requiring a concurrency rejection.
- Runs concurrent/repeated one-Diamond grants and confirms exactly one Diamond and one permanent receipt.
- Restores its process environment afterward; it never edits environment files or deployed settings.

It leaves one test Diamond on the disposable account, with its permanent receipt. It makes no PayMongo purchase, deletes no data, and changes no policy. If permissions/CAS are unexpectedly broken, a nonmonetary permission/CAS probe object may be left on the disposable account before the script stops. Never use a valuable player for this check.

Only after **all real-title checks pass**, review and set the script's nonsecret deployment outputs:

```dotenv
PLAYFAB_DIAMONDS_ENABLED=true
PLAYFAB_DIAMONDS_BOOTSTRAP_VERIFIED=true
PLAYFAB_DIAMONDS_PLAYER_WRITES_DENIED=true
PLAYFAB_DIAMONDS_VERIFIED_TITLE_ID=<verified title>
PLAYFAB_DIAMONDS_VERIFIED_CONFIG_SHA256=<verified configuration fingerprint>
```

Keep `PLAYFAB_DIAMONDS_STORAGE=entity-objects` and both item-ID values empty. The legacy bootstrap flag now attests verified first-object creation, not a catalog bootstrap. The fingerprint binds the exact title and wallet provider/configuration; changing providers requires new verification. Remove the verification ticket afterward. **Mocked tests are not a substitute for this real-title check.**

## Step 4 — test website purchases

In authenticated Product Administration, use **Add Missing Defaults** only if the Diamond packs are missing. This preserves existing/disabled/edited products; public shop reads never create or reactivate packages.

Use PayMongo test keys and configure the test webhook at `/api/webhooks/paymongo`. Test logged-out, logged-in, expired-session, and wrong-account routing. Show/confirm the receiving account before purchase. Simulate each Diamond pack, confirm verified fulfillment, and inspect the player's object under **Players → selected test player → Objects**. Confirm Coins and game Gold do not change.

Test cancellation, delayed confirmation, duplicate notifications, account switching, and failed status saves. Keep live payments disabled. Unity linking/display is a later phase.

## Capacity and operational boundaries

Microsoft documents a free-tier allowance of up to **three Entity Objects per entity**. This wallet uses one; checkout is blocked before a first purchase if all three slots are already occupied. Existing unrelated objects and Files are never overwritten or removed. [Entity Objects](https://learn.microsoft.com/en-us/xbox/playfab/live-service-management/game-configuration/entities/entity-objects).

The implementation also uses a conservative **8 KiB application cap** for this wallet's JSON. This is not a claim about PlayFab's actual byte quota or an unlimited production wallet. Permanent receipt storage grows with each purchase; roughly a few dozen lifetime receipts fit, depending on identity/amount lengths. New checkouts are rejected at the cap. Concurrent checkouts near capacity can still leave a paid order awaiting support; fulfillment must retain its receipts and remain pending/retryable, never grant without a receipt.

For higher purchase volume, use a reviewed transactional database or wallet migration before increasing capacity. Never expire, spend, prune, or delete receipts to reclaim space; replay protection must survive any migration. Monitor the title's actual service limits. Additional service usage can have platform quotas/costs even though this implementation does not use the card-gated Economy catalog.

## Legacy Economy v2 wallets

The original Economy v2 implementation remains available with `PLAYFAB_DIAMONDS_STORAGE=economy-v2` and its published Diamond/hidden-receipt item IDs. Existing order snapshots without a provider continue to mean Economy v2. Their old verification fingerprint format is preserved.

Do not silently switch a deployed wallet containing money or pending orders to the new object provider. Disable checkout, reconcile all old payments, preserve receipts/balances, and use an explicitly reviewed migration. This revision does not migrate existing Diamond funds or reroute historical orders. Retaining the old provider requires its original catalog setup and unconditional denials of mutating Inventory APIs; the verifier continues supporting those checks.

## Automated checks

`npm run test:currencies` uses mocked services only. It covers both providers, all three Diamond packs, legacy Coin checkout, disabled/unverified setup, server reward/owner enforcement, payment evidence checks, first-object creation, duplicate/concurrent grants, stale reads, timeout after commit, replay beyond 14 days, capacity, receipt corruption, permission denial, CAS enforcement, status repair, and existing shop routing/layout regressions.
