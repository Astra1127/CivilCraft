# Multi-account Android wallet beta

> Historical checklist from the initial single-account beta. The status and
> prerequisites below describe that original test window, not current production.
> Subsequent account/device results and approvals are retained privately. See
> `new-account-wallet-rollout.md` for the later broader TEST rollout. For a new run,
> establish fresh account/build/balance baselines and an explicit test scope; do not
> change current flags based on this historical checklist.

Status: **physical-device run not started**. Local regressions are preparation,
not Android beta passes. No new checkout, payment, account import or activation is
authorized by this document. Do not reset saves or clear app data to simplify tests.

## Current prerequisites

- Main website: `https://civil-craft.vercel.app`; Coin checkout remains paused.
- Account A: the previously verified migrated reference account. Record its current
  balance at each case; previous test results are not a new baseline.
- Account B: not yet nominated or verified. Its classic PlayFab ID, receipt review,
  hold status, selected-save review and approved migration are required before it
  is opened in-game. Follow `game-wallet-migration-preparation.md` first.
- Device: previously reported Honor Pad 9, Android 14. Confirm the actual device and
  installed APK/version for this run; filenames alone do not establish build identity.
- Existing device testing reported purchase sync, persistence and offline spending
  blocking. Retain that as prior user evidence, not new multi-account results.

The current beta checkout/delivery policy is bound to **one account/entity and one
500-Coin package**. Opening payment tests for B needs a separately reviewed mechanism
that preserves accepted A orders. Do **not** rotate `COIN_BETA_PLAYER_ID`, Entity,
scope or delivery settings to B: that can invalidate verification of accepted A
orders. Do not turn off global Coin maintenance simply to make Buy work.

A computer cannot claim a device pass from Editor/.NET/PGlite results. If no device
is connected, the player runs the APK and reports observations. An authorized USB
debug connection is optional for read-only diagnostics; do not enable permissions,
install drivers, collect unrelated logs or automate login/payment authorization as
part of this checklist. The user signs in and completes any simulated provider flow
privately. Never share passwords, keys, session tickets, payment auth codes or raw
unredacted logs.

## Record before each test

Keep account identifiers/order references and detailed results private. Record:
date/time, APK filename/version (SHA256 if the APK is available), device model/Android
version, game account, website receiving account, before balances, after balances,
order reference or purchase-operation reference when available, observed message and
PASS/FAIL/NOT RUN. Stop quests/reward collection and other-device spending during a
balance-delta test, or explain those separate ledger events before judging the delta.

## Phase 1 — can run with checkout paused

Only use the already-reviewed migrated account A in-game. Account B may be used on
the website for the mismatch case after its identity is confirmed; website sign-in
does not authorize B's first game import.

| ID     | Player action                                                                                                                                                         | Required result                                                                                                                                                                                      |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AND-01 | Launch the existing APK as A; wait for its selected save and wallet refresh. Compare the main-site receiving account and balances.                                    | Same classic account and numeric verified balances. No unrelated account's balance, ownership or guest progress. Unavailable is not zero.                                                            |
| AND-02 | Open Coins using its + button, confirm the browser dialog, return normally to the game, then use Refresh balances once if needed. Repeat for Diamonds without buying. | Canonical main website, selected storefront, same receiving account, no duplicate browser launch, and balance refresh without credit. Coins remain paused.                                           |
| AND-03 | With game A, privately sign the website into confirmed B and open the link issued by A's + button. Do not click Buy.                                                  | Account mismatch is explained and account switching is offered. No checkout/payment/order/credit is created for the wrong account. Signing the website back into A restores the matching storefront. |
| AND-04 | Refresh A's already completed order in the website and return to the APK.                                                                                             | Its original package is verified, no extra credit, no wallet reset. Permanent ledger evidence still contains one original payment receipt.                                                           |

A temporary session/checking state is not a failure by itself. If it does not settle,
record the exact safe UI message and time, use one manual retry, and stop if it stays
unavailable. Never pay again to repair a display problem.

## Phase 2 — requires account B's completed reviewed migration

Do not start these tests while B's approval/hold/selected-save state is unknown or a
first import might happen without a controlled approval window. A freeze must prevent
the selected capture client itself from importing, not just close other devices.

| ID     | Player action                                                                                                                           | Required result                                                                                                                                                                                 |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AND-05 | Using the existing normal login/logout flow, switch game A → B → A. Repeat website switching separately and compare receiving accounts. | Each account retains only its own wallet, ownership and save. No stale A number or outfit appears as B's authority. Existing account money is never overwritten by an older/local save.         |
| AND-06 | Start a balance refresh on A, then switch normally to B before the reply settles; reopen/refresh the app afterward.                     | Late A replies/callbacks do not update B's balance, ownership, purchase journal or browser link. B's valid response recovers its display.                                                       |
| AND-07 | Temporarily disconnect internet on a signed-in account and attempt an in-game cosmetic purchase. Reconnect and refresh once.            | Offline spending is blocked, not paid from cached Coins. Reconnection restores verified availability. Any queued earned rewards settle under their permanent identities, not arbitrary amounts. |
| AND-08 | Restart the APK after successful refresh/ownership reconciliation, then switch back to the other account.                               | Correct balances and owned items persist independently. No repeated debit/opening import or loss of confirmed ownership.                                                                        |

Preserve multiplayer leave safeguards. Do not switch a protected multiplayer visitor
into a different signed-in save or force-stop during unrelated unsaved gameplay.

## Phase 3 — requires separately approved, scoped TEST checkout

The following are **NOT RUN while Coin checkout is paused**. A disabled Buy button
is not evidence that a real provider cancellation or paid delivery passed.

Before opening a short test window, both account identities/migrations must be
verified, the explicit permitted package and test budget agreed, delivery bindings
for existing orders preserved, test-only provider/webhook verification checked,
and a reviewed checkout-close action ready. Global legacy holds and live payments
must remain unchanged. Do not hand-edit order status or replay a provider event to
simulate a success.

| ID     | Player action during the approved window                                                                                                                                               | Required result                                                                                                                                                                                                           |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AND-09 | Start one permitted TEST checkout for a matching account, then close/leave it unpaid without completing the simulated payment. Return to the game.                                     | No payment receipt or Coin credit. Website does not claim receipt merely because the cancel/success URL was opened. The unpaid order is preserved; do not delete it.                                                      |
| AND-10 | Complete one permitted 500-Coin TEST purchase for A, with both game and website signed into A. Return normally, refresh once, then restart the APK.                                    | Exactly one +500 payment ledger entry for A; B unchanged. A's confirmed balance persists after restart and matches the website.                                                                                           |
| AND-11 | Repeat one permitted TEST purchase for B under the independently approved B scope.                                                                                                     | Exactly one payment for B; A unchanged. Existing A receipts remain verifiable and deliverable.                                                                                                                            |
| AND-12 | Refresh the same completed order repeatedly and return/restart the APK. Retry status/balance reads after a temporary network interruption, without starting another purchase.          | No second +500 credit. Same permanent receipt/order binding; transient errors do not become fake zero or a false credit confirmation.                                                                                     |
| AND-13 | On an approved test account, make one agreed low-cost unowned cosmetic purchase and exercise a controlled timeout/restart recovery. Do not delete the journal or manually resend APIs. | One stable operation ID, one debit and one entitlement. Recovery/retry reconciles the same operation without a second charge. If the ID cannot be observed safely, record that evidence gap rather than declaring a pass. |

The user performs simulated payment authorization. No real funds are to be charged.
One completed purchase is not permission for unlimited repeats, another package or
general checkout activation. Cancelled/unpaid results require provider/order evidence
and a ledger check; an unchanged screen alone is insufficient. Never label a live
webhook replay test passed when only fixture/PGlite replay was run.

## Results and release gate

Keep the detailed results file private. Use this template for each case:

```text
Test ID:
Status: NOT RUN / PASS / FAIL
APK/version/hash:
Device / Android:
Game account / website receiving account:
Before Coins / Diamonds:
Action and observed UI message:
After Coins / Diamonds:
Private order/operation reference:
Restart/account-switch result:
Server receipt/ledger verification:
Evidence timestamp/screenshots:
Notes / limitations:
```

Do not mark the beta complete until required cases have actual device observations
and bound server evidence. Close new checkout after the scoped test window while
preserving accepted-order delivery. Failures, ambiguous grants, wrong ownership or
unexpected balance deltas stop rollout and preserve all records. General Coin
checkout needs separate approval after the beta; live payments remain off.
