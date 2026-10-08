# Coin purchase safety and test setup

Coin purchases still credit the existing PlayFab legacy virtual currency (normally `CO`); existing balances and packages are not migrated. Game Gold and the dedicated Diamonds wallet are unchanged. PayMongo remains simulation-only. This document describes the safety gate introduced to prevent repeated Coin credit when payment status persistence fails.

## Why pending Coin grants require review

PlayFab's legacy `Server/AddUserVirtualCurrency` increments a balance, but does not support a transaction with an Entity Object receipt or a provider idempotency key. It therefore cannot provide the same atomic balance-and-receipt operation used for Diamonds. [Legacy currency API](https://learn.microsoft.com/en-us/rest/api/playfab/server/player-item-management/add-user-virtual-currency?view=playfab-rest).

The website now conditionally reserves an order receipt in `civilcraft.coin-purchases.v1` before making **one** currency increment. `ExpectedProfileVersion` ensures concurrent requests cannot both claim that receipt. A verified successful increment is followed by a permanent `granted` receipt. Duplicate notifications and failed order-status persistence read that receipt instead of incrementing again. [Conditional Entity Object writes](https://learn.microsoft.com/en-us/rest/api/playfab/data/object/set-objects?view=playfab-rest).

If the currency request times out, its result is incomplete, or the final receipt cannot be confirmed, the receipt remains **pending**. Automatic retries must never call the currency increment again. This deliberately favors avoiding duplicate money over automatic recovery: a paid order may need manual reconciliation. The UI must not claim verified fulfillment for a pending receipt. There is no automatic lease expiry that makes an uncertain grant safe to repeat.

Historical unfulfilled orders without the new receipt-backed contract are held for review; they must not be automatically recredited. Their original checkout, reward, currency code, and account remain immutable.

## Before testing online

Stop simulated checkout during rollout using your deployment/payment controls. These new flags do **not** disable an older deployed revision that does not read them. Deploy the patched revision with checkout verification disabled first; run the checks below, then set only their verified outputs and redeploy. This change does not enable live payments.

1. Keep `PLAYFAB_COINS_RECEIPTS_VERIFIED=false` while preparing the revision. Checkout must remain disabled until the actual title passes both verifiers.
2. Complete the **full-size** Entity Objects [Diamonds setup verification](diamonds-setup.md), including the 8,192-byte capacity roundtrip and player `Object/SetObjects` denial. Old small-receipt attestations are not sufficient. Diamonds checkout itself may stay disabled; the shared storage/permission attestations must be valid.
3. Use the **same disposable test account** afterward. It must contain exactly the one-Diamond verification wallet, with no Coin ledger or other Entity Objects. Never run these smoke checks against a real player's progression account.
4. Confirm that the server's `PLAYFAB_COINS_CURRENCY_CODE` matches the existing game currency (`CO` by default), and retain PayMongo **test** keys only.
5. Put that test player's fresh browser/game session ticket into your private local environment as `PLAYFAB_COINS_VERIFICATION_PLAYER_TICKET`. Do not put it in `VITE_*`, git, deployment settings, screenshots, or a chat message.

Run from the website directory with Node 22.18 or newer:

```powershell
node --env-file=.env scripts/verify-coins-setup.mjs --test-player <TEST_PLAYFAB_ID> --confirm-test-writes
```

The explicit flag authorizes leaving **one Coin** and its permanent receipt on the disposable account. The script validates the supplied ticket/player mapping, current API policy and actual player-token denial, version-check enforcement, Coin balance availability, first receipt-ledger creation, concurrent duplicate handling, repeated delivery, and unchanged Diamonds. It never calls PayMongo, edits policy/catalog/environment files, or deletes an object. A broken permission/version check may leave a nonmonetary probe marker; stop and inspect the disposable account if a check fails.

Only after all checks succeed, review and set the script's nonsecret outputs in the server deployment environment:

```dotenv
PLAYFAB_COINS_RECEIPTS_VERIFIED=true
PLAYFAB_COINS_VERIFIED_TITLE_ID=<verified title>
PLAYFAB_COINS_VERIFIED_CONFIG_SHA256=<verified configuration fingerprint>
```

Preserve the verified Entity Objects Diamonds permission/bootstrap/capacity flags, title, and fingerprint. No `PLAYFAB_DIAMONDS_ENABLED=true` prerequisite is needed for Coin checkout. Remove the local verification ticket after use. Reverify after changing the title, receipt schema, shared capacity contract, or client mutation permissions; never fabricate verification outputs.

## Online regression checklist

- Log in with the correct test player and confirm the receiving account before paying.
- Complete one simulated Coin package: Coins increase by exactly its reward; Diamonds and game Gold do not change.
- Refresh/revisit the success page: it must not credit anything again.
- Deliver the same signed test event again: receipt-backed fulfillment is idempotent.
- Exercise concurrent duplicate notifications and a failed order-status save in mocked tests: the currency increment is attempted once, then status repair reads the receipt.
- If a request becomes uncertain, confirm the order remains pending/under review, not falsely fulfilled or automatically recredited.
- Test a simulated Diamond purchase separately and confirm it still stores balance and receipt atomically.

## Pending orders and storage limits

For a pending Coin order, inspect the immutable PayMongo checkout/payment, receiving PlayFab account, server-side grant logs/PlayFab events, and current receipt. A present `granted` receipt allows status repair without a monetary operation. A `pending` receipt is **not** proof that the currency was credited or not credited; neither deleting it nor replaying its payment is a valid recovery procedure. Reconcile with evidence and an explicit operator decision; refund or compensate only after determining the original outcome. This revision does not automate manual reconciliation or grant an operator blanket authority to alter balances.

Never delete, prune, expire, or reset Coin or Diamond receipts to reclaim space. Both ledgers and unrelated Entity Objects share the verified **8 KiB application budget**; receipt preflight blocks new checkout when there is insufficient space. Coin ledger creation also needs a free Entity Object slot. A concurrent purchase or unrelated profile change near capacity can still require support. This is a bounded simulation/testing backend, not an unlimited live-payment system. Use a reviewed transactional backend/migration before expanding paid usage.
