# Main-site merge and purchase setup

Prepared: **2026-10-09 (Asia/Shanghai)**
Audience: developer responsible for the main Civil Craft website

## Confirmed destination

| Component                       | Intended destination                                                   |
| ------------------------------- | ---------------------------------------------------------------------- |
| Main website                    | **https://civil-craft.vercel.app**                                     |
| Fork / previous test deployment | https://civil-craft-website.vercel.app                                 |
| Upstream repository             | `Astra1127/CivilCraft`, branch `main`                                  |
| Fork repository                 | `Hyakkuniku/CivilCraftWebsite`, branch `main`                          |
| Existing shared Neon resource   | `neon-citrine-bridge`, database `neondb`, current main branch          |
| Shared PlayFab purchase title   | `17FA03`, subject to the main developer's identity/configuration check |
| New main webhook URL            | **https://civil-craft.vercel.app/api/webhooks/paymongo**               |

The owner confirmed that **civil-craft.vercel.app is the main site**. Older documents use the fork domain as a historical setup example; replace the application origin with the main domain for this rollout.

The owner reports that the developer now has Neon collaborator access. Acceptance, role permissions, main-site configuration, and current online purchase readiness have **not** been verified by this document. This request created documentation only; it did not merge code, change credentials, register webhooks, or deploy.

## What must happen next

There are three independent parts:

1. **Merge the code** while keeping newer upstream features.
2. **Configure the main developer's Vercel project**; environment variables do not move through Git.
3. **Configure and verify PayMongo delivery to the main site** against the existing shared ledger.

Neon access is not the same as Vercel access, a database runtime credential, or PayMongo access. Both developers can keep separate Vercel accounts. No database transfer or fresh database is needed for this plan.

Diamonds remain PostgreSQL `DI`; Coins remain PlayFab classic `CO`, with PostgreSQL purchase claims/receipts. Game gold is unchanged. This is **test/simulation checkout only**, not live-payment enablement.

## Step 1 — Agree on the shared services and a cutover window

Before merging/deploying, both developers must confirm privately:

- The main website uses the same intended PlayFab title/account population as the existing ledger: `17FA03`. Do not overwrite a different main title ID merely to pass setup; stop for a reviewed plan if it differs.
- The same existing Neon database, installation, and **exact runtime endpoint** will be reused, not a preview branch, clone, or empty database.
- The intended PayMongo **test account** is agreed. For continuing existing checkouts, retain access to the test account/key that created those sessions.
- Who controls the main Vercel deployment, PayMongo dashboard, Neon administration/backups, and the GitHub merge.
- A maintenance/drain window and the exact revisions currently accepting checkout and webhooks.

Stop **new checkout creation** during cutover using a reviewed server-side rollout control that leaves existing fulfillment available. Hiding a Buy button alone is insufficient. Older deployed revisions may not honor the new environment gates.

**Do not turn off the old deployment's currency gates while assuming its pending webhooks will still fulfill.** These gates also participate in fulfillment readiness. Inventory pending/paid orders, drain or reconcile them, and keep the original hardened webhook service/configuration available for outstanding sessions until a reviewed handoff is complete.

Do not replay historical payments through an older implementation that lacks permanent receipt protection. Do not delete orders/claims, regenerate the ledger, or grant balances manually to make the shop appear ready.

## Step 2 — Reconcile the repositories through a reviewed PR

Committing to the fork's `main` does not update upstream `main`, and neither action synchronizes Vercel settings.

The local cached comparison at document preparation showed seven fork-only commits and no cached upstream-only commits. **No fresh remote fetch was performed.** This does not prove that upstream has no newer work or that the final merge will be conflict-free.

The developer should:

1. Preserve all uncommitted work and use a clean integration checkout/worktree.
2. Fetch the latest fork and upstream refs.
3. Create a branch such as `codex/upstream-currency-merge` from the refreshed fork `main`.
4. Merge the refreshed upstream `main` with a normal merge.
5. Resolve conflicts by retaining both required behaviors; do not replace whole files with “ours” or “theirs.”
6. Validate the combined tree, then push the integration branch normally.
7. Open a pull request with:
   - Base: **Astra1127/CivilCraft → main**
   - Head: **Hyakkuniku/CivilCraftWebsite → codex/upstream-currency-merge**
8. Have both developers review and use **Create a merge commit**.

This repository is connected to Lovable. Do not force-push, rebase, amend, or squash published commits/history.

### Changes that must survive the merge

| Area                      | Preserve / review                                                                                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main-only features        | Inventory the main developer's latest changes; test them explicitly rather than assuming a clean merge preserves behavior                                                     |
| Dependencies              | Combine `package.json` changes; retain `postgres`, test-only `@electric-sql/pglite`, and both test scripts; regenerate the lockfile from the resolved manifest                |
| Environment loading       | Combine `vite.config.ts` allowlists and existing settings; keep server secrets out of browser `define` values and retain server import protection                             |
| Payment backend           | Signed test webhooks, server-derived player/account/product, immutable order snapshots, PG storage and permanent receipts                                                     |
| Coin fulfillment          | Pre-grant durable claim, one grant attempt, and uncertain outcomes remaining under review                                                                                     |
| Routes / navigation       | Keep upstream routes and the Coin/Diamond shop, login redirect, success/cancel pages, history, and API interception; regenerate route tree from final route sources if needed |
| Existing leaderboard work | Keep single-player/multiplayer rankings, readable player names, and account/session behavior                                                                                  |
| Transaction layout        | Keep `3d74f86` mobile/tablet cards and scrollable/wrapping details dialog                                                                                                     |
| Other services            | Preserve main auth/admin, contact/email, gallery/storage, CMS/releases, and their existing configuration                                                                      |

The fork's purchase changes build on earlier commits, not just its final hardening commit. Review the complete comparison. Core recent checkpoints are `f8f3df6` (PG ledger), `5e64046` (hosted checkout), and `3d74f86` (layout).

## Step 3 — Use the existing Neon ledger, not the administrator login

After accepting the Neon invitation, verify access to the correct project/main branch/database. Collaborator access does not automatically prove that the developer can see credentials or administer roles.

Obtain the **restricted runtime connection string** privately from the owner. The existing runtime role is `civilcraft_currency_runtime`, granted the NOLOGIN permission group `civilcraft_currency_app`. It must not own the schema, inherit an owner/admin role, or directly mutate wallet/receipt tables.

For this rollout:

- Keep the existing `civilcraft_currency` schema and permanent records.
- **Do not rerun `database/currency-schema.sql`** on the installed database.
- Keep the same pooled hostname, protocol, port, and database path used by existing orders. Changing pooled/direct hostnames changes the binding even when the underlying database is identical.
- Obtain the existing installation UUID privately and confirm its title/schema binding through the verifier.
- Do not use a preview database simply because a Vercel/Neon integration offers its URL.
- A separate equally restricted login can be provisioned deliberately by an administrator if needed. Credential rotation alone does not change target identity; a new endpoint does.
- A Neon-generated default owner URL is **not** an acceptable website runtime URL.

The website expects **`CURRENCY_DATABASE_URL`**, not merely `DATABASE_URL` or `STORAGE_URL`. The main developer can configure this directly in their own Vercel project without joining the other developer's Vercel team.

## Step 4 — Set the main Vercel environment with checkout off

Select the Vercel project that owns **civil-craft.vercel.app**, confirm its Git repository/Production branch, and configure **Production** explicitly. Preserve unrelated main-site variables; do not paste the fork's entire environment over them.

| Variable                                   | Initial setup value / source                                 |
| ------------------------------------------ | ------------------------------------------------------------ |
| `VITE_PLAYFAB_TITLE_ID`                    | `17FA03`, only after confirming the intended game title      |
| `PLAYFAB_SECRET_KEY`                       | Private title secret for that title                          |
| `PAYMONGO_SECRET_KEY`                      | Private `sk_test_` key for the agreed test account           |
| `PAYMONGO_WEBHOOK_SECRET`                  | Signing secret for the **main endpoint**, obtained in Step 6 |
| `PUBLIC_APP_URL`                           | `https://civil-craft.vercel.app`                             |
| `PUBLIC_SITE_URL`                          | `https://civil-craft.vercel.app` for public/email links      |
| `PLAYFAB_COINS_CURRENCY_CODE`              | `CO`                                                         |
| `PLAYFAB_DIAMONDS_STORAGE`                 | `postgres`                                                   |
| `COIN_RECEIPTS_STORAGE`                    | `postgres`                                                   |
| `CURRENCY_DATABASE_URL`                    | Existing restricted runtime URL, exact original target       |
| `CURRENCY_DATABASE_ID`                     | Existing installation UUID                                   |
| `CURRENCY_DATABASE_VERIFIED`               | `false` initially; use verifier output afterward             |
| `CURRENCY_DATABASE_VERIFIED_TITLE_ID`      | Verifier output, not an invented value                       |
| `CURRENCY_DATABASE_VERIFIED_CONFIG_SHA256` | Verifier output for the chosen target/title/protocol         |
| `PLAYFAB_DIAMONDS_ENABLED`                 | `false` during setup                                         |
| `COIN_CHECKOUT_ENABLED`                    | `false` during setup                                         |
| `PLAYFAB_COINS_RECEIPTS_VERIFIED`          | `false`; legacy Entity Objects gate, not PG proof            |

Keep credentials Secret/server-only. `PUBLIC_APP_URL`, `PUBLIC_SITE_URL`, and public `VITE_PLAYFAB_TITLE_ID` are Config values. Never create a `VITE_`/`PUBLIC_` copy of a secret.

Review main-specific `ADMIN_AUTH_ORIGIN`, email links, storage access, and other origin-dependent features if configured. Keep the main project's existing admin/session/mail credentials unless a deliberate service change requires rotation.

The separately provided private MD includes available **current local/fork credentials**. It is not proof of deployed main readiness, and the old webhook signing secret is not automatically the new endpoint's secret.

## Step 5 — Verify the merged code and existing database

Use Node 22.18+ and the resolved lockfile:

```sh
npm ci
npm run test:currencies
npm run test:transactions
npm run test:auth
npm run test:admin
npm run test:content
npm run test:reset
npx tsc --noEmit
npm run build
npm run lint
```

Also run the combined repository's leaderboard, session, dashboard, contact/email, gallery, release, and client-secret isolation regressions. Record actual outcomes, including pre-existing failures.

The earlier fork passed 419 currency tests and four layout tests, but these are **historical fork results**, not validation of a new merged/main deployment.

With private local configuration targeting the existing ledger and all three checkout gates off, run:

```sh
npm run verify:currencies
```

The PostgreSQL verifier is read-only. It checks installation/title/schema/runtime restrictions and emits the four database attestation values only on success. It does not configure Vercel, register PayMongo, or enable checkout.

Copy the exact successful outputs into the main project's Production configuration. The website domain change does not change the database target fingerprint. A database endpoint/title/protocol change does.

Do not casually run the older Coin/Entity Objects setup scripts; some deliberately write test state. See [PostgreSQL setup](./postgres-currency-setup.md) for details, substituting the confirmed main application URL.

## Step 6 — Register the main PayMongo TEST webhook

Deploy the merged backend to the main site with new checkout still disabled. Confirm the webhook route is reachable by PayMongo and not redirected to an interactive login/protection page.

In the agreed PayMongo account:

1. Use **Test mode**; do not substitute live keys.
2. Open **Settings → Webhooks** (or the dashboard's developer webhook section).
3. Create/review an endpoint at:
   **https://civil-craft.vercel.app/api/webhooks/paymongo**
4. Subscribe to **`checkout_session.payment.paid`**.
5. Retrieve this endpoint's signing secret privately.
6. Set the main project's `PAYMONGO_WEBHOOK_SECRET` to that exact secret.
7. Redeploy the main project and verify signed delivery in provider/deployment logs.

With fulfillment gates still off, a paid event can fail fulfillment even after its signature is accepted. At this stage verify reachability and signature handling in sanitized logs; successful paid delivery plus receipt/balance proof belongs to Step 7 after reviewed enablement. Do not bypass a gate to make a test delivery appear successful.

The backend must receive the original raw request body and `Paymongo-Signature`; never disable signature validation to clear an error. Creating checkout uses server-side test credentials. Visiting success does not credit currency.

**Old and new endpoints can have different signing secrets.** Do not copy the fork endpoint secret into the new endpoint configuration without checking. Do not paste webhook/API secrets into a PR, screenshot, chat, or client bundle.

### Existing fork-created checkouts

Existing PayMongo sessions retain their original fork return URLs; changing `PUBLIC_APP_URL` does not rewrite them.

Browser login is stored per origin. A player signed into the fork may need to sign into the main site again with the original receiving game account. Keep a reviewed old-return-page plan until those sessions finish; any explicit redirect must preserve its path and query.

A reviewed main webhook handoff can process an existing order only when it uses the same PlayFab title/order records, the appropriate PayMongo test account, and the exact stored PG target/installation. Never change old order identities to make them payable again.

During any overlap, both services must use the hardened receipt-aware code and the same authoritative ledger. Never leave an older grant-before-status-save implementation consuming paid events. Although the current ledger protects duplicate credit, avoid indefinite double endpoint delivery and audit races: nominate one canonical payment processor and reconcile outstanding sessions before retiring the old one.

Creating a new endpoint does not guarantee automatic replay of older paid events. Review provider delivery history and receipts; any controlled retry must retain the original order/session and idempotency checks.

## Step 7 — Enable and test the main site

Only after code, database verification, test credentials, webhook binding, and outstanding-order handling are reviewed:

1. Set `PLAYFAB_DIAMONDS_ENABLED=true` and `COIN_CHECKOUT_ENABLED=true` in **main Production**.
2. Keep `PLAYFAB_COINS_RECEIPTS_VERIFIED=false`.
3. Redeploy. Existing deployments do not pick up changed variables.
4. Use an explicitly approved disposable/game account for simulations; virtual credits persist even though no real money is charged.

Test on **civil-craft.vercel.app**:

- Logged-out `/shop?currency=diamonds` leads to login and returns to the selected shop.
- Receiving account and title are correct.
- Coin and Diamond balances are independent; unavailable values are not faked as zero.
- New checkout success/cancel URLs point to **civil-craft.vercel.app**, not the fork.
- DI packages grant exactly 500 / 1,000 / 2,500 for PHP 50 / 95 / 220.
- CO purchase grants exactly its package amount without changing DI or game gold.
- Payment remains pending until verified fulfillment; refreshing success does not grant again.
- A controlled duplicate delivery leaves balances unchanged.
- Log-out/expired sessions are rejected; another player cannot poll someone else's order.
- Phone/tablet transaction cards and full-ID details fit correctly.
- Main-only features still work after the merge.

Inspect PayMongo delivery status, sanitized Vercel errors, and permanent receipts together. A PayMongo paid session or a successful page load alone is not evidence that fulfillment completed. An uncertain CO grant must remain under review, never blindly retried.

Do not use real cards or scan test QR codes with a real banking app.

## Step 8 — Retire checkout on the fork safely

After main verification and outstanding-session reconciliation:

- Stop new checkout on the fork and deliberately decide whether it remains a read-only/demo site.
- Retire the old webhook only after confirming no required deliveries remain, or document the reviewed forwarding/handling arrangement.
- Keep permanent receipts, account balances, and order history.
- Do not restore old application revisions with unsafe fulfillment. A rollback of code is not a rollback of payments or balances.
- Use isolated test storage for future experimental forks/previews; do not silently attach them to the shared purchase ledger.

If setup fails, keep **new main checkout** disabled and correct the cause. Do not reinstall the schema, switch to an empty DB, delete pending claims, or force readiness flags.

## Troubleshooting

| Symptom                      | Check first                                                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Diamonds “Unavailable”       | Correct deployed revision, storage selectors, verification outputs, runtime permissions, title/endpoint binding, enable gate and PayMongo readiness |
| Coin checkout blocked        | `COIN_CHECKOUT_ENABLED`, PG readiness, and classic `CO` definition in the same title                                                                |
| Generic services unavailable | Sanitized Vercel runtime logs; PlayFab authentication/title secret, DB connectivity, provider test key/configuration                                |
| Paid but still pending       | Webhook URL/event/mode/signing secret, delivery status, stored session metadata and permanent receipt; no manual regrant                            |
| Return goes to fork          | Main `PUBLIC_APP_URL` and whether this was an older already-created session                                                                         |
| Merge lost a main feature    | Fresh full diff, combined route/nav/config/dependency behavior and the main feature's regression tests                                              |
| Changing env had no effect   | Production scope, correct Vercel project, fresh deployment/commit and latest deployment logs                                                        |

## Handoff completion checklist

- [ ] Both developers reviewed the merge; upstream features retained.
- [ ] Main Vercel project builds/deploys the reviewed merged commit.
- [ ] Same intended PlayFab title, CO definition, Neon installation and exact endpoint verified.
- [ ] Restricted runtime secret configured, not the owner URL.
- [ ] Main test webhook secret matches its endpoint; signed deliveries verified.
- [ ] Main application/public origins use civil-craft.vercel.app.
- [ ] Each controlled purchase and duplicate check has documented results.
- [ ] Old sessions and ambiguous legacy orders have an explicit handling plan.
- [ ] Fork checkout/webhook retirement is safe and documented.
- [ ] No secrets committed; private credential MD shared securely and removed when no longer needed.

## References

- [Earlier currency implementation handoff](./website-currency-developer-handoff.md) — historical fork setup/results.
- [PostgreSQL setup and ledger safety](./postgres-currency-setup.md).
- [Environment template](../.env.example).
- [Vercel environment management](https://vercel.com/docs/environment-variables/managing-environment-variables) — changes require a new deployment.
- [PayMongo hosted checkout setup](https://docs.paymongo.com/docs/payment-channels-hosted-checkout-quick-start) — test credentials and paid webhook.
- [PayMongo testing](https://docs.paymongo.com/docs/payment-acceptance-testing).
