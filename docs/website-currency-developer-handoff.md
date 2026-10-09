# Website currency purchase handoff

Last updated: **2026-10-09 (Asia/Shanghai)**
Repository: **Hyakkuniku/CivilCraftWebsite** (fork)
Website: [civil-craft-website.vercel.app](https://civil-craft-website.vercel.app/)

## 1. Status and scope

The website can sell Coins and Diamonds through **PayMongo test/simulation checkout**. The currency backend and responsive transaction-card changes are committed on `main`.

| Commit    | Change                                                              |
| --------- | ------------------------------------------------------------------- |
| `f8f3df6` | PostgreSQL currency storage, permanent receipts, setup verification |
| `5e64046` | Hosted Neon/PayMongo checkout hardening                             |
| `3d74f86` | Responsive transaction cards and details dialog                     |

Production on Vercel means the deployed website environment, **not live payments**. Live PayMongo keys/payments remain prohibited by the implementation.

Deployment settings and online results below are previously observed session evidence dated above; they were not freshly queried while writing this document. Source contracts were checked against the current repository.

This phase does **not** implement Unity's plus-button wiring, in-game Diamond display, Diamond spending/conversion, automatic return to Unity, upstream changes, or live-payment enablement. Existing leaderboard work and website styling were preserved. Do not rewrite published Git history.

## 2. Currency ownership and storage

| Currency  | Logical code                 | Balance authority                | Purchase protection                                            |
| --------- | ---------------------------- | -------------------------------- | -------------------------------------------------------------- |
| Coins     | `CO`                         | PlayFab classic virtual currency | Permanent PostgreSQL claim/receipt around the external grant   |
| Diamonds  | `DI`                         | PostgreSQL account balance       | Balance increment and permanent receipt in one SQL transaction |
| Game gold | Existing game implementation | Unchanged by this phase          | Not a website purchase reward                                  |

Diamonds are **not** currently stored in PlayFab Economy v2, a classic `DI` currency, or Unity's local save.

The original Economy v2 approach encountered a PlayFab card requirement. The Entity Objects alternative was constrained by the actual title-player object limit of **1,000 bytes**, below the former wallet capacity assumption. PostgreSQL replaces that storage path while retaining PlayFab player identity and PayMongo checkout. Older compatibility code remains; it is not an outage fallback.

PlayFab title `17FA03` was missing its classic `CO` definition. Only that missing definition was created, named Civil Craft Coins, with initial deposit and recharge values of **zero**. Creating it did not grant Coins or reset balances.

### Package templates

| Product ID      | Reward   | Test price | Stored amount   |
| --------------- | -------- | ---------- | --------------- |
| `coins_500`     | 500 CO   | PHP 50     | 5,000 centavos  |
| `coins_1000`    | 1,000 CO | PHP 95     | 9,500 centavos  |
| `coins_2500`    | 2,500 CO | PHP 220    | 22,000 centavos |
| `diamonds_500`  | 500 DI   | PHP 50     | 5,000 centavos  |
| `diamonds_1000` | 1,000 DI | PHP 95     | 9,500 centavos  |
| `diamonds_2500` | 2,500 DI | PHP 220    | 22,000 centavos |

The stored product catalog is authoritative; these are templates, not automatic fallbacks. Missing Diamond defaults were added without replacing existing Coin/custom products or reactivating disabled packages.

Products use `rewardCurrency` and `rewardAmount`. Legacy records lacking both fields are interpreted as Coins. `rewardCoins` remains a compatibility field; Diamond products set it to zero. Public reads never seed products. The authenticated admin action `seed-missing-defaults` adds absent keys only.

## 3. Purchase flow and trust boundaries

1. The browser authenticates with a Civil Craft game account. Unity login does not automatically authenticate the browser.
2. The shop displays the receiving account and separate balances. Unavailable balances display **Unavailable**, never a fabricated zero.
3. Checkout accepts only `{ productId }`. The server validates the PlayFab session and resolves the account/entity, product, reward, price, and enabled state.
4. An immutable order snapshot is stored before redirecting to PayMongo test checkout.
5. PayMongo sends a signed paid webhook. The server validates payment evidence against that stored order.
6. The appropriate permanent receipt workflow fulfills the reward.
7. Authenticated order polling observes fulfillment and refreshes balances/history.

Visiting a success URL does **not** grant currency. Visiting the cancellation URL does not itself alter payment state.

### Payment validation

The webhook validates the signature over the **raw body**, timestamp tolerance, test mode, checkout session ID, paid payment, amount in centavos, PHP currency, and expected order/account/product metadata. Incomplete evidence is retrieved server-side from the stored checkout session. Browser-supplied payment claims are never sufficient.

The current implementation creates `/v2/checkout_sessions` and retrieves bound evidence through `/v1/checkout_sessions/{id}`. Preserve the tested integration when changing provider versions.

Both supported PayMongo webhook envelopes are normalized strictly; mixed/conflicting envelopes are rejected. A missing modern event ID produces a signed-body SHA-256 audit identifier. **Webhook IDs and audit records are not the permanent duplicate-credit guard.** Standalone QR payment evidence is not accepted as hosted-checkout proof.

### Immutable order snapshots

Common fields bind account, product, reward currency/amount, expected PHP amount, and checkout evidence. Legacy Coin compatibility fields remain.

- DI: `premiumWallet` includes `storage: "postgres"`, `collectionId: "premium-wallet"`, database installation ID, target ID, schema version 1, and the resolved `title_player_account` entity.
- CO: `coinCurrencyCode`, `coinReceiptVersion: 2`, and a PostgreSQL `coinReceipt` snapshot bind installation/target/schema.

Later product edits must not change rewards for an existing order.

## 4. Exactly-once safeguards and manual review

The schema contains `installation`, `accounts`, and `receipts`. Receipts are permanent and globally keyed by `(title_id, order_id)`, binding player identity, immutable reward, and fingerprint.

### Diamonds

An account lock, balance increment, and receipt insert occur **in one SQL transaction**. Duplicate delivery finds the receipt and adds nothing. An ambiguous commit response triggers a receipt reread; safe retries remain guarded by permanent identity/fingerprint checks.

### Coins

PlayFab's classic `AddUserVirtualCurrency` call is external and non-idempotent. PostgreSQL cannot make it part of an atomic database transaction.

A durable pending claim is recorded **before one grant attempt**. Only a fresh, acknowledged claim owns that attempt. An uncertain claim response, uncertain PlayFab grant, or failed receipt completion is retained for **manual review**, not automatically regranted.

A completed receipt allows repair of a failed order-status save without another credit. Pending reservations and maximum classic currency headroom are checked.

**Never delete/recycle pending claims, clear a receipt to retry, blindly call AddUserVirtualCurrency again, expire receipts, or treat process memory/order-status saves as the credit authority.**

### Database permissions

The deployment uses a restricted runtime login, not the database owner:

- `civilcraft_currency_app`: NOLOGIN permission group.
- `civilcraft_currency_runtime`: restricted login with group membership.
- RLS enabled; no direct table CRUD, schema creation, ownership, or administrator role membership.
- Only seven narrow SECURITY DEFINER entry points: `health`, `diamond_balance`, `receipt_status`, `grant_diamonds`, `coin_capacity`, `claim_coins`, `complete_coins`.
- Function search paths explicitly place `pg_temp` last.
- Runtime role statement timeout was set to 15 seconds.

The pool verifies TLS certificates, uses a small connection limit, and disables prepared statements for the pooled endpoint. Do not send `statement_timeout` as a Postgres.js startup parameter; PgBouncer may reject it. The health check does not certify every operational setting.

## 5. Routes and API contract

Authentication for player APIs is `Authorization: Bearer <PlayFab session ticket>`. The server validates it with PlayFab and rejects expired tickets. Never share tickets or place them in URLs.

| Method / path                                    | Access                  | Response / purpose                                                |
| ------------------------------------------------ | ----------------------- | ----------------------------------------------------------------- |
| GET `/api/shop/products`                         | Public                  | `{ products }`                                                    |
| GET `/api/player/currencies`                     | Player                  | `{ coins, diamonds, diamondsAvailable }`                          |
| POST `/api/payments/paymongo/create-checkout`    | Player                  | Body `{ productId }`; returns `{ success, orderId, checkoutUrl }` |
| GET `/api/payments/paymongo/order?id=<ORDER_ID>` | Owner                   | Safe order directly, **not** `{ order }`                          |
| GET `/api/payments/paymongo/player-orders`       | Player                  | `{ orders }`                                                      |
| POST `/api/webhooks/paymongo`                    | Signed provider request | Verified fulfillment                                              |

Coin/Diamond balances are numbers or `null` when unavailable. `diamondsAvailable` also reflects checkout readiness; Coin checkout has its own gate. Missing authentication returns 401; a missing/wrong-owner order returns 404 after authentication.

Browser pages:

- `/dashboard/shop`: canonical shop, separate Coins/Diamonds tabs.
- `/shop?currency=diamonds`: alias; selected currency survives login redirects.
- `/dashboard/transactions`: inventory and purchase history.
- `/dashboard/payment/success?order_id=<ORDER_ID>`
- `/dashboard/payment/cancel?order_id=<ORDER_ID>`

**Polling API uses `id`; success/cancel pages use `order_id`.** Success polling is sequential, up to 20 attempts at 2.5-second intervals, and invalidates balances/history after fulfillment.

## 6. Deployment inventory and configuration

Previously observed deployment:

- Vercel team **CivilCraft**, project **civil-craft-website**, fork connected to `main`.
- Latest layout deployment: [Vercel deployment](https://vercel.com/civil-craft/civil-craft-website/GKAsqMK99dSPRDPJoAUSytCfEazC).
- Neon resource **neon-citrine-bridge**, database **neondb**, main branch, Singapore region.
- Schema **civilcraft_currency**, version 1, protocol `atomic-diamonds-permanent-coin-claims-v1`.
- Runtime database credentials and purchase gates configured for Vercel **Production**, not preview environments.
- One matching enabled **test** PayMongo webhook for `checkout_session.payment.paid`, pointing to `https://civil-craft-website.vercel.app/api/webhooks/paymongo`.

Required configuration contract, with **placeholders only**:

```dotenv
VITE_PLAYFAB_TITLE_ID=17FA03
PLAYFAB_SECRET_KEY=<server-secret>
PAYMONGO_SECRET_KEY=<sk_test_server-secret>
PAYMONGO_WEBHOOK_SECRET=<matching-test-webhook-signing-secret>
PUBLIC_APP_URL=https://civil-craft-website.vercel.app

PLAYFAB_DIAMONDS_STORAGE=postgres
COIN_RECEIPTS_STORAGE=postgres
CURRENCY_DATABASE_URL=<restricted-runtime-pooled-connection-url>
CURRENCY_DATABASE_ID=<verified-installation-uuid>
CURRENCY_DATABASE_VERIFIED=true
CURRENCY_DATABASE_VERIFIED_TITLE_ID=17FA03
CURRENCY_DATABASE_VERIFIED_CONFIG_SHA256=<real-verifier-output>
PLAYFAB_DIAMONDS_ENABLED=true
COIN_CHECKOUT_ENABLED=true
PLAYFAB_COINS_RECEIPTS_VERIFIED=false
```

These enabled values describe the previously verified deployed setup, **not safe defaults for a new environment**. The legacy `PLAYFAB_COINS_RECEIPTS_VERIFIED` flag is not PostgreSQL verification.

Keep credentials server-only. Never give a secret a `VITE_` or `PUBLIC_` prefix. Vercel requires `PUBLIC_APP_URL` to use Config visibility, not Secret. The runtime URL must use Secret visibility. Never deploy the owner connection string.

Environment changes require a new deployment. A Git push does not configure missing variables. Local `.env` gates were deliberately left off for verification; they need not match deployed Production.

### New-environment procedure

Follow [PostgreSQL currency setup](./postgres-currency-setup.md) and [.env.example](../.env.example).

1. Keep `PLAYFAB_DIAMONDS_ENABLED`, `COIN_CHECKOUT_ENABLED`, and `PLAYFAB_COINS_RECEIPTS_VERIFIED` **false**.
2. Install the schema with owner credentials **once**, then provision restricted runtime access.
3. Select PostgreSQL for both storage settings, configure the exact title/test credentials and runtime endpoint privately.
4. Run `npm run verify:currencies`. It is read-only: no grants, receipts, player tickets, or permission changes.
5. Use only the real successful verifier's installation/title/fingerprint values. Mock tests do not attest a deployed database.
6. Configure the matching test webhook and verify active products and classic CO definition.
7. Enable the two checkout gates in the intended environment, redeploy, and run controlled test purchases.

The installation SQL intentionally aborts if the schema already exists. Existing installations need a reviewed migration, **not a drop/recreate or blind rerun**. Old Entity Objects/Economy verification scripts are not the PostgreSQL setup procedure.

## 7. Verification record

### Automated/local checks previously completed

- `npm run test:currencies`: **419/419 passed**.
- `npm run test:transactions`: **4/4 passed**.
- TypeScript no-emit, scoped lint, production build, and Git whitespace checks passed.

Mocked/local PostgreSQL tests cover duplicate/concurrent deliveries, simultaneous purchases, stale reads, ambiguous timeouts, failed audit persistence, legacy handling, payment mismatches, wrong-owner/expired authentication, permission restrictions, and replay beyond 14 days. These failure scenarios were **not deliberately injected into live player purchases**.

### Real provider checks previously completed

- Restricted pooled Neon runtime verification succeeded.
- Empty-wallet/first Diamond purchase path exercised.
- Actual test purchases of **500, 1,000, and 2,500 DI**, plus **500 CO**, fulfilled with permanent receipts.
- The owner approved using an existing account for simulations. Its baseline before the final three purchases was 5,000 CO / 500 DI; afterward it was **5,500 CO / 4,000 DI**. These are historical results, not initial balances or fixture constants.
- Duplicate DI and CO webhook replays returned idempotent success without changing balances.
- Unauthenticated currencies/order requests returned 401; forged webhook evidence returned 400.
- Provider test mode, webhook binding, packages, and CO definition were checked.

Different-owner valid tickets and intentionally expired tickets were covered by automated checks, not a separate hosted session test. Unity/game gold was not altered by the website purchase paths; this is not a fresh Unity integration test.

Use PayMongo simulation controls/test cards only. Do not use real cards or scan test QR codes with real banking/wallet apps. See [PayMongo payment testing](https://docs.paymongo.com/docs/payment-acceptance-testing).

## 8. Transaction layout changes

Commit `3d74f86` changes the history cards and details dialog without changing payment logic.

- Grid: one column, two at `sm`, three at `xl` (not `lg`, where the sidebar made cards too narrow).
- Bounded preview heights replace oversized 4:3 previews.
- Zero-minimum widths, wrapping labels/amounts, and aligned wrapping footers avoid clipping.
- Details dialog fits viewport width and dynamic height; overflow scrolls vertically.
- Mobile metadata stacks; larger screens use two zero-minimum columns.
- Complete IDs remain visible, monospace, correctly cased, and wrap rather than truncate.

Hosted layouts were checked at phone 375×812, tablet 1024×768, and desktop widths. No horizontal overflow was observed. Layout guards are in [dashboard-transactions-layout.test.mjs](../tests/dashboard-transactions-layout.test.mjs).

## 9. Remaining limitations and operational cautions

- **Legacy paid orders:** five old paid sessions lacked permanent receipts. Available evidence could not prove whether their earlier Coin grants occurred. They were left untouched. Do not automatically backfill, regrant, delete, or reinterpret these orders; reconcile manually.
- **Ambiguous Coin attempts:** pause/review using receipts, provider evidence, and PlayFab audit evidence. A current zero balance is not proof that a historic grant never happened.
- **History labels:** failed/cancelled orders may appear as “refunded”; this label does **not** perform or prove a PayMongo refund.
- **History completeness:** some provider fetch failures can omit rows. The history-list endpoint does not repair receipt status; authenticated individual order reads can.
- **Database changes/restores:** snapshots bind the protocol/host/port/database target, excluding credentials. Switching pooled/direct endpoints changes the target. Cloning an installation UUID does not authorize a new target for old orders. Same-endpoint stale restores are not automatically detectable.
- Restoring PostgreSQL does not undo PayMongo payments or PlayFab Coin grants. Pause purchases and reconcile before resuming after a restore/migration.
- Missing configuration or backend failure disables checkout safely; do not bypass gates, fabricate balances, or reactivate disabled products to hide errors.
- Never prune/expire purchase receipts. Any future spending system must be separate from immutable purchase receipts.
- Preview environments need deliberate isolated setup; do not point arbitrary preview builds at the Production ledger.
- Future live-payment enablement requires a separate reviewed implementation; replacing a test key is insufficient.

## 10. Developer entry points

| Area                         | Files                                                                                                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup / schema               | [setup guide](./postgres-currency-setup.md), [currency-schema.sql](../database/currency-schema.sql), [verifier](../scripts/verify-currency-database.mjs)                                                                        |
| Database / receipt workflows | [currency-database.server.ts](../src/lib/payments/currency-database.server.ts), [coin-receipts.server.ts](../src/lib/payments/coin-receipts.server.ts), [premium-wallet.server.ts](../src/lib/playfab/premium-wallet.server.ts) |
| Authentication / API         | [player-auth.server.ts](../src/lib/payments/player-auth.server.ts), [api.server.ts](../src/lib/payments/api.server.ts)                                                                                                          |
| Provider / fulfillment       | [paymongo.server.ts](../src/lib/payments/paymongo.server.ts), [fulfillment.server.ts](../src/lib/payments/fulfillment.server.ts)                                                                                                |
| Products / order snapshots   | [products.ts](../src/lib/payments/products.ts), [products.server.ts](../src/lib/payments/products.server.ts), [orders.server.ts](../src/lib/payments/orders.server.ts), [types.ts](../src/lib/payments/types.ts)                |
| Shop / success / history     | [dashboard.shop.tsx](../src/routes/dashboard.shop.tsx), [dashboard.payment.success.tsx](../src/routes/dashboard.payment.success.tsx), [dashboard.transactions.tsx](../src/routes/dashboard.transactions.tsx)                    |
| Local environment loading    | [vite.config.ts](../vite.config.ts), [.env.example](../.env.example)                                                                                                                                                            |

Products, order projections, and webhook audit records still use PlayFab TitleInternalData prefixes `civilcraft.website.v1.coin-products.`, `civilcraft.website.v1.payment-orders.`, and `civilcraft.website.v1.payment-events.`. PostgreSQL receipts remain the monetary duplicate guard.

Use Node **22.18+** and the lockfile:

```sh
npm ci
npm run test:currencies
npm run test:transactions
npx tsc --noEmit
npm run build
npm run dev
```

Run `npm run verify:currencies` separately only after private setup with gates off. Never commit `.env`, database URLs/passwords, PlayFab title secrets, PayMongo keys/signing secrets, session tickets, or payment details.

For the next phase, connect Unity to the authenticated website/server balance contracts deliberately; do not create a second local Diamond authority.
