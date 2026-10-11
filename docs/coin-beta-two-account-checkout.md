# Two-account TEST Coin checkout

Implementation supports one optional second reviewed account alongside the original
beta account. **Implementation is not activation approval.** New checkout stays
paused during development/review; this change does not migrate accounts, change
balances, enable live payments, resolve legacy orders or open general purchases.

## Stable original orders

Keep the original `COIN_BETA_SCOPE_ID`, title, player and Entity unchanged. Existing
orders retain the exact original `CoinBetaBinding` version 1 and version-3 wallet
snapshot/fingerprint. Do not retarget an old order or rotate the original tuple to
test another player. The second scope must have a different scope ID, classic player
ID and title-player Entity ID. Both use the same verified title and database target.

An absent, disabled or malformed second tuple rejects the second account without
stranding the original account's accepted deliveries. Removing/changing either
accepted scope or turning off its delivery permission can hold its paid orders;
keep original bindings and delivery available after closing new checkout.

## Server-only settings (all new settings default closed)

The original globals remain mandatory for both accounts:

- `COIN_BETA_CHECKOUT_ENABLED`: new-checkout gate for both accounts.
- `COIN_BETA_DELIVERY_ENABLED`: accepted-order delivery gate for both accounts.
- Original scope/title/player/Entity settings: unchanged first-account identity.

The optional second account additionally requires:

| Setting                             | Default | Meaning                                                                            |
| ----------------------------------- | ------- | ---------------------------------------------------------------------------------- |
| `COIN_BETA_SECOND_CHECKOUT_ENABLED` | false   | New checkout for the second account only; cannot bypass the global gate.           |
| `COIN_BETA_SECOND_DELIVERY_ENABLED` | false   | Delivery/readiness for the second account; cannot bypass the global delivery gate. |
| `COIN_BETA_SECOND_SCOPE_ID`         | empty   | Unique, stable lowercase hyphenated scope ID, at most 64 characters.               |
| `COIN_BETA_SECOND_PLAYER_ID`        | empty   | Separately reviewed classic PlayFab player ID.                                     |
| `COIN_BETA_SECOND_ENTITY_ID`        | empty   | Verified title-player Entity belonging to that classic player.                     |

No new environment values are installed by the code or `.env.example`. Keep them
server-only: never add `VITE_` prefixes, browser settings or client-supplied bindings.
The server chooses a scope from the authenticated player, resolves the real Entity,
checks migrated-wallet readiness, and snapshots the binding before provider checkout.
Unapproved third accounts, crossed identities and browser-supplied beta markers are
rejected. Configuration cannot bypass a pending/held or unmigrated account wallet.

Only the existing active `coins_500` TEST product (500 Coins, PHP 5000 centavos) is
allowed under these scopes. The test provider key, explicit provider TEST evidence,
canonical `https://civil-craft.vercel.app` origin, signed webhook, immutable target,
owner-bound order polling and atomic permanent Coin receipt safeguards remain.
All legacy/non-beta Coin orders stay behind global Coin maintenance.

## Closure and rollback

- Global checkout false closes both accounts, including the second when its own
  checkout flag is true. This must not disable accepted-order delivery.
- Second checkout false closes only new second-account checkout; original checkout
  and both accepted deliveries remain independently protected.
- Accepted TEST deliveries can still complete during game-feature rollback if the
  verified settlement target and scope/delivery permissions remain intact.
- A failed audit write after a successful Coin credit is repaired from the permanent
  receipt on retry, not by another credit. An unpaid/cancelled visit never creates a
  receipt; genuinely verified late paid evidence still follows its original order.
- After accepting a second-account order, do not roll server code back to a
  one-account-only revision. Close checkout instead and retain this compatibility
  layer, both immutable tuples and delivery permissions until those orders settle.

## Validation and a later approved window

Run `npm run test:coin-beta`, the wider currency/migration regressions, typecheck and
website build before deployment review. The dedicated tests use fictional accounts,
signed fixture webhook envelopes, actual wallet service/database adapter and a
disposable in-memory PostgreSQL engine. PlayFab login/Entity responses, provider
network and audit storage are fixtures. These tests are not live provider, real
multi-worker Neon or Android payment observations.

Before any separately approved checkout window, verify both migrations, current
owned balances, deployment/target and retained accepted-order bindings. Agree the
duration/test budget and how checkout closes, including any required enforceable
quota/expiry controls. This change does **not** implement quotas or an expiry timer.

The proposed device run covers unpaid/cancelled checkout, one approved paid TEST
purchase per account, exact +500/other-account unchanged, repeated order reads,
restart/reconnect and interrupted purchase recovery. The user authorizes simulated
provider payment privately. Verify permanent receipts/ledger deltas afterward, then
close new checkout while retaining accepted delivery. General purchases, additional
player migrations and live payments require their own reviewed approval.
