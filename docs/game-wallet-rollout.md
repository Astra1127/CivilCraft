# Unified game Coins/gold wallet — v3 rollout

This is source implementation, not proof of a live rollout. No SQL migration,
secret retrieval, deployment, payment or account import was performed by this task.
Keep `GAME_WALLET_ENABLED=false` until the following owner-reviewed steps are complete.

## Authority and compatibility

Signed-in Coins/gold use one PostgreSQL balance in `civilcraft_game_wallet_v3`.
Earned rewards, website test-payment credits, game purchases and permanent
entitlements share transactional, idempotent SQL. Guest/offline local gameplay
remains separate. Signed-in spending requires a reachable verified backend.
Diamonds retain their existing separate balance/purchase path; no Diamond spending
or conversion is introduced.

`database/game-wallet-v3.sql` is an **additive** administrator-reviewed migration.
It copies the existing installation UUID/title into a separate namespace and does
not modify the v1 identity, schema, balances, receipts or immutable order snapshots.
Never rerun `currency-schema.sql`, delete permanent receipts, or reset an existing
installation to enable this feature. The new runtime group
`civilcraft_game_wallet_app` is NOLOGIN, with schema USAGE and vetted function
EXECUTE only. A reviewed restricted login may receive this group alongside its
existing `civilcraft_currency_app` permissions; it must not own either schema,
have direct table CRUD, inherit a migration-owner/superuser role, or bypass RLS.

Use the same privately configured `CURRENCY_DATABASE_URL` and installation ID.
Remote TLS certificate verification and endpoint/target binding remain enforced.
An endpoint clone must not silently accept old orders because it copied a UUID.

## Deployment gates

Server-only variables (no `VITE_` prefix):

- `GAME_WALLET_ENABLED=false` controls **new** game mutations and Coin checkout.
- `GAME_WALLET_VERIFIED=false`, `GAME_WALLET_VERIFIED_TITLE_ID`, and
  `GAME_WALLET_VERIFIED_CONFIG_SHA256` attest the exact capability/target configuration.
- `GAME_WALLET_LEGACY_HANDLERS_QUIESCED=false` is an operator cutover attestation,
  not something the read-only verifier can prove or set.

Run the read-only capability verifier **only after owner approval of the migration
and privately supplied restricted runtime credentials**:

```sh
node --env-file=.env scripts/verify-game-wallet.mjs
```

It prints nonsecret verification attestations only, does not install SQL, mutate
players, edit `.env`, grant money, or claim that other handlers have stopped.
`--help` does not connect to services. Review the migration once, apply it with a
separate migration administrator, verify the restricted runtime and existing v1
health, then configure attestations privately. Never expose database/PlayFab/PayMongo
secrets, session tickets, or signed file URLs in browser code or command output.

Turning ENABLED off after rollout is maintenance, **not migration rollback**:
verified PG reads, old v3 settlement and legacy overlays remain bound to PG.
Do not clear verification/identity flags to make new operations fall back to classic
CO. Default all-false new paths perform no DB/PlayFab lookup; legacy helpers are no-ops.

## Cutover and one-time import

1. Freeze new Coin checkout and drain/update every old Coin grant consumer,
   including the original site, fork, webhooks, scheduled work and retry handlers.
   Deploy all legacy paths with the v3 account gate and precise before-Add phase hook.
   Prevent unsupported clients/other admin paths from mutating active Coins.
2. Reconcile ambiguous old classic claims. A pending receipt or unprovable historic
   fulfilled grant blocks that account; no automatic repeat Add, refund or migration.
3. Attest handler quiescence only after the actual rollout is checked. Resume through
   the new code; new Coin checkout requires that player's import to be complete.
4. Lazily import each account after Unity approves the selected local/cloud account
   save. Under the durable account gate, read classic CO and classify original
   permanent legacy grant receipts. In one PG transaction, add classic CO plus the
   chosen legacy gold, mark INCLUDED legacy receipts, preserve lifetime-earned/spent
   baselines, import known wardrobe/material ownership, and tombstone already-completed
   contract/achievement rewards. Zero opening still creates an import marker.
5. Import is once per title/player. Another device, guest-save choice or old-save
   restoration cannot add a second opening or overwrite PG balance. Local gold is
   a display cache afterward. Do not import queued rewards that were never included
   in legacy gold as already-paid completion tombstones.

The chosen legacy local balance is not cryptographically server-verifiable.
Authenticate the account, record the approved save hash, validate numeric bounds
and audit the import; these controls prevent repeat imports, not forged historical
local gold. Future reward amounts are server catalog/formula selected, not an
arbitrary client `addGold(amount)` endpoint. Client bridge evidence is bounded but
not an authoritative physics anti-cheat proof.

## Existing orders

Original v1 Entity/v2 PG classic-receipt snapshots remain immutable. Their normal
protocol proves classic fulfillment; the new gate serializes it with opening.
Already-granted receipts INCLUDED by opening never add PG money again. A verified
late original grant not INCLUDED credits PG exactly once from its original reward
snapshot. Classic CO is then only legacy audit storage—not the active game balance.
No post-import inventory read can turn arbitrary classic balance changes into credits.
Old fulfilled audit records still need overlay repair when necessary; status alone
is never grant proof. An unavailable original Entity verification stays review-only,
never silently converts into a PG claim.

New Coin orders carry immutable `coinReceiptVersion:3` and `gameWallet` containing
`storage`, namespace, installation/target IDs, protocolVersion and player entity.
Credit+receipt commit atomically. Title Internal Data order status remains repairable
audit projection; loss of its status write cannot repeat the credit.

## API contract

All endpoints require `Authorization: Bearer <PlayFab session ticket>`. The server
derives player identity from PlayFab, never caller player IDs. Responses are JSON,
no-store, Vary Authorization, nosniff, with no-referrer. Unknown `/api/game/*` is JSON404.

| Endpoint                            | Purpose                                                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/game/wallet`              | `{coins,diamonds,ready,version,lifetimeGoldEarned,lifetimeGoldSpent}`; unavailable is null                                                                          |
| `POST /api/game/wallet/import`      | `{gold,saveHash,completedContracts,unlockedAchievements,purchasedShopItemIds,unlockedCosmeticIDs,unlockedContractMaterials,lifetimeGoldEarned?,lifetimeGoldSpent?}` |
| `POST /api/game/rewards`            | canonical `contract:<id>` / `achievement:<id>` event IDs; server-derived rewards                                                                                    |
| `POST /api/game/purchases`          | UUID operation ID, catalog target kind/ID and material contract; no prices or arbitrary credits                                                                     |
| `GET /api/game/purchases/<uuid>`    | verified-owner permanent result; another owner's operation is404                                                                                                    |
| `GET /api/game/entitlements`        | permanent wardrobe items and canonical contract/material save keys                                                                                                  |
| `POST /api/game/shop-link`          | Selected Coins or Diamonds currency → opaque account-bound one-hour link                                                                                            |
| `GET /api/game/shop-link?token=...` | verifies browser account/currency/expiry; mismatch409, expired410                                                                                                   |

Shop links are **not SSO** and contain no ticket/secret/player ID. Browser login is
still required with the same game account. The token is hashed in storage and must
be verified again before checkout. Configure `PUBLIC_APP_URL` to the canonical
original HTTPS site, not request Origin. PayMongo stays test-only; sandbox virtual
currency credits persist even though real money is not charged.

Purchase results use `completed`, `already_owned`, or `insufficient_funds`.
Insufficient funds is permanent for that operation UUID; retry with the same UUID
cannot suddenly charge after a top-up. Invalid catalog targets create a durable
rejection tombstone; POST/status return400 `{error,operationId,terminal:true}`. Only
that exact authenticated operation proof may clear a local pending journal.
Ordinary400, timeouts,503, and status404 are not terminal cancellation evidence.
Known valid duplicate reward events preserve the first immutable settlement, even
when another device's legitimate evidence differs; no additional reward is minted.

Lifetime earned counts include game rewards plus the imported baseline, not payment
credits. Lifetime spent includes game purchase costs plus its imported baseline.
All Coins and counters remain in Unity's nonnegative Int32 range; overflow rejects
the complete transaction rather than truncating/resetting money.

## Stranded gate/manual review

Gates have no lease expiry and cannot be stolen/reacquired, even by the same attempt.
Safe preparation/receipt-read failures release ownership. A lost import response
may release only after the permanent imported marker proves commit. A classic Add
attempt is fenced until its original receipt proves granted; otherwise support
review is required. A crashed worker can strand a gate without a currency attempt.

Operator repair requires an audited decision using the account's gate owner/reason,
original immutable order/claim, and provider evidence. Freeze that account, ensure
the old worker cannot still execute, and establish whether the original classic Add
did happen. Never use a changed balance as sole proof; other grants can change it.
After confirmed grant, complete/repair the **original** receipt and its required
overlay. After definitive no-attempt, release only that known gate owner through
`gate_release`; do not recycle/delete pending classic claims. Unknown outcomes stay
held. Never broadly clear every gate, reset receipts, rerun Add, or refund on timeout.

## Local verification (no external services)

```sh
node --test tests/game-wallet-catalog.test.ts tests/game-wallet-backend.test.mjs tests/game-wallet-sql.test.mjs
npx tsc --noEmit
```

PGlite tests exercise actual additive SQL, role restrictions, preserved v1 health,
zero/repeated import, INCLUDED/late credits, immutable receipts, reward tombstones,
concurrent/duplicate purchases, overflow, counters, and durable rejection. API/service
tests mock every external provider; they never execute actual payments or imports.
