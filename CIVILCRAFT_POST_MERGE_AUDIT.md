# CivilCraft post-merge integration audit

Audit date: **2026-10-09, Asia/Manila**. Repository: `C:\Users\jemma\Documents\Thesis\Website`. Intended main deployment: **https://civil-craft.vercel.app**.

**Overall assessment: NOT production-ready for currency checkout.** The merged currency tests and build pass, and the existing Neon installation passed a real read-only health check using the private handoff configuration. The main Vercel environment, its endpoint-specific PayMongo signing secret, and main-site signed test-webhook fulfillment remain unverified. Two additional regression tests fail. Three high-severity dependency findings remain unresolved. Keep payment gates disabled until the rollout checks below are completed deliberately.

No payments, player currency changes, migrations, permission changes, environment-file edits, Vercel dashboard access, credential rotation, commits, pushes, branch merges, or Unity/CloudScript changes were performed. Credential values are deliberately excluded from this report.

## A. Current repository status

| Item | Finding |
| --- | --- |
| Branch | `main` |
| Commit | `922478570e4e4d40664b1e78d56945f29fa30322` |
| Cached `origin/main` | Same commit as local HEAD |
| Fresh remote verification | No fetch/pull performed; equality refers to the cached ref |
| Initial working tree | Clean |
| Programmer features | Present: Coin/Diamond products and shop, PayMongo checkout/webhook, PostgreSQL wallet and receipts, transaction history/layout, and multiplayer rankings |
| Final working tree | Only the local verification-tooling changes and this audit report; no application payment logic changed |

Implementation entry points: `src/lib/payments/{api,paymongo,fulfillment,orders,currency-database,coin-receipts}.server.ts`, `src/lib/playfab/premium-wallet.server.ts`, `database/currency-schema.sql`, `src/routes/dashboard.shop.tsx`, `src/routes/dashboard.transactions.tsx`, and `src/lib/playfab/multiplayer-leaderboard.server.ts`.

Reviewed repository setup/safety documentation and both supplied Downloads handoffs. The private `env.production-handoff.md` contains credentials; it was read with assignment values redacted, then its first configuration block was used only in a short-lived verifier process. It was not copied into the repository. The programmer's prior successful fork purchases/replays are historical handoff evidence, not fresh main-site verification.

### Local modifications

1. `package.json`: `verify:currencies` now invokes `scripts/verify-currency-database-local.mjs` rather than hardcoding Node's `--env-file=.env`.
2. `scripts/verify-currency-database-local.mjs`: selects `.env` if present, otherwise `.env.local`, otherwise uses the injected process environment. It launches the original read-only verifier with Node's env-file mechanism, forwards `--help` and the exit status, and rejects other launcher arguments. No file contents are printed, copied, or written. `.env.production` and `.env.example` are never automatically selected. When both local files exist, `.env` retains the original command's precedence; files are not merged. Existing process variables retain Node's normal precedence.
3. `scripts/verify-currency-database.mjs`: help text describes the launcher and explicit-file alternative. Database checks, feature-gate checks, output, and payment behavior are unchanged.
4. `docs/postgres-currency-setup.md`: documents selection and avoids instructing users to duplicate secrets.
5. `tests/currency-verification-env.test.mjs`: four passing environment-selection/launcher tests.
6. `CIVILCRAFT_POST_MERGE_AUDIT.md`: this report.

The lockfile and dependencies are unchanged. Diagnostic `.audit-*.log` files are Git-ignored and contain only sanitized audit results or test output.

## B. Environment configuration

### Files and loading

| Filename | Present | Git handling |
| --- | --- | --- |
| `.env` | No | Ignored |
| `.env.local` | Yes | Ignored; not tracked |
| `.env.production` | No | Ignored |
| `.env.example` | Yes | Intentionally tracked template |

The previous command failed before executing the verifier because Node was instructed to load a nonexistent `.env`. The file-selection error is **resolved** without overwriting environment files. `npm run verify:currencies` now loads the existing `.env.local`, then safely exits with a configuration error because that file does not explicitly select PostgreSQL storage. This is a configuration blocker, not an unresolved file-loading error.

Vite's development server uses `loadEnv(mode, cwd, "")` and an explicit server-variable allowlist to populate unset process variables. Its public build defines load only `VITE_` keys. Production server handlers read `process.env`; local server-only credentials do not become deployed Vercel runtime configuration just because a build succeeds. Vite's usual mode/local-file precedence and expansion differ from the deliberately single-file verifier launcher. An explicit alternate file remains supported:

```sh
node --env-file=<private-file> scripts/verify-currency-database.mjs
```

No `vercel.json` is present. Nitro builds the server; runtime settings and any scheduler must be configured on the actual Vercel project. This audit did not inspect that dashboard.

### Local configuration status — names only

The local title matches the documented shared title, `17FA03`. PlayFab secret, PayMongo test key/signing secret, admin session/accounts, Blob credentials, Resend, Gmail SMTP, and the existing recovery/contact template IDs are present locally. Presence is not proof of provider validity or intended deployment binding.

**Missing from `.env.local` for the intended PostgreSQL checkout:**

- `PLAYFAB_DIAMONDS_STORAGE`
- `COIN_RECEIPTS_STORAGE`
- `CURRENCY_DATABASE_URL`
- `CURRENCY_DATABASE_ID`
- `CURRENCY_DATABASE_VERIFIED`
- `CURRENCY_DATABASE_VERIFIED_TITLE_ID`
- `CURRENCY_DATABASE_VERIFIED_CONFIG_SHA256`
- `PLAYFAB_DIAMONDS_ENABLED`
- `COIN_CHECKOUT_ENABLED`
- `PLAYFAB_COINS_RECEIPTS_VERIFIED`

Missing enable flags currently mean disabled, not an invitation to enable them. Configure all three payment gates explicitly false during setup. `.env.example` is not automatically loaded and does not supply missing configuration.

`PUBLIC_APP_URL` currently selects local development; `PUBLIC_SITE_URL` selects the main site. The PayMongo helper prioritizes `PUBLIC_APP_URL`, so Production must deliberately set it to the main HTTPS origin. This is valid local-development configuration, but must not be copied unchanged to Production. The available signing secret is described by the handoff as the fork endpoint's secret. **The main endpoint's `PAYMONGO_WEBHOOK_SECRET` is not established by this audit.** The private main setup draft explicitly contains a replacement marker for it.

`ADMIN_AUTH_ORIGIN`, `PLAYFAB_RELEASE_EMAIL_TEMPLATE_ID`, and `CRON_SECRET` are also absent locally. Admin auth currently has development/production origin defaults; an explicit correct origin is recommended for each deployment. The latter two are needed only if the release notification worker is deployed. Email verification is configured in PlayFab and does not have a new invented website template variable.

The handoff's first setup block has database connection/installation settings, both PostgreSQL storage selections, and disabled gates. Its database verified-title/fingerprint fields are intentionally blank pending a new successful check; historical attestations elsewhere in the document should not be treated as current proof.

## C. Database verification

### Real read-only result

**PASSED**: the existing Neon endpoint described by the private handoff was reachable using its restricted runtime connection. The handoff/local title agreement was checked before execution. The documented verifier returned successful health/installation binding with gates explicitly false. Values were loaded only into that verifier process; neither `.env.local` nor Vercel settings were changed, and verification outputs were not automatically installed.

The verifier calls `SELECT * FROM civilcraft_currency.health(...)`; it does not call wallet/grant/receipt creation functions. It confirmed the configured installation UUID, title, schema version 1, table/function/trigger presence and the runtime-role checks implemented by that function. Connection strings, passwords, and attestation values are not included here.

**Conditional reuse:** the existing Neon installation can be used by the main deployment if it is configured with this same intended title, installation, exact runtime endpoint, and restricted login, and the outstanding-order cutover is reviewed. A new/empty database is not needed. This does not prove that main Vercel is currently using that connection, that every ledger record is correct, that provider timeouts/backups are suitable, or that the main payment flow works.

### Storage and integrity

- PostgreSQL schema: `civilcraft_currency`; tables: `installation`, `accounts`, `receipts`.
- `installation` binds database UUID, PlayFab title, and schema version. Accounts bind title/player/entity identity. Receipts permanently bind order, receiving identity, currency, amount, fingerprint, claim state, and attempt where appropriate.
- Diamond `DI` balance and receipt are committed together under the SQL account lock. Duplicate matching orders return their permanent proof rather than incrementing again.
- Coins remain classic PlayFab `CO`; PostgreSQL stores a permanent pre-grant claim and confirmation. Only a confirmed newly acquired claim permits the non-idempotent PlayFab increment. An uncertain result leaves the claim pending for review; blind retries, expiration, deletion, or takeover would be unsafe.
- Immutable/permanent triggers, row-level security, revoked direct table privileges, fixed-search-path SECURITY DEFINER functions, and the restricted function allowlist are part of the shipped schema. Runtime access must not be the schema/table/function owner, inherit an owner/admin role, or have direct table write/read privileges prohibited by health checks.
- Use a SQL-created restricted Neon login with the `civilcraft_currency_app` group, not a default owner/console-created administrative role. Installing schema and changing roles are operator actions; neither was performed.
- The server driver uses certificate-verified remote TLS, at most two connections per process, disabled prepared statements for transaction pooling, and bounded connect/idle/lifetime settings. Configure the restricted role's statement timeout through an operator review; the verifier does not validate that timeout.
- The fingerprint binds title, installation, schema/protocol, and protocol/host/port/database target; credentials are excluded. Switching pooled/direct hostname or database target requires new verification. Old orders also retain target binding. A stale restore at the same endpoint cannot be detected from endpoint identity alone.

Blockers: missing main/local runtime settings and fresh deployed attestations; no main payment smoke test; reconcile historical/ambiguous Coin receipts and any outstanding fork sessions before cutover. Never rerun the installation SQL blindly on the existing schema, restore a stale ledger, or delete receipts to resolve readiness errors.

## D. PayMongo and currency integration

| Component | Code/test findings | Unverified deployment requirements |
| --- | --- | --- |
| Player identity | Existing bearer session is authenticated server-side; browser player IDs do not select a receiving wallet. Order reads check ownership. | No live authenticated player session exercised in this audit. |
| Coin balance | Reads PlayFab `Server/GetUserInventory` classic `CO`; PostgreSQL mode also checks the currency definition. Unavailable is distinct from zero. | Main title currency definition and live account balance not freshly inspected. |
| Diamond balance | PostgreSQL `DI` selected through the wallet facade; missing/unverified setup fails closed. Legacy Entity Objects/Economy v2 remain explicit alternatives, not automatic outage fallback. | Current main storage/attestation/gates unknown. |
| Products/checkout | Server resolves active products and snapshots currency, reward, price, owner, backend/installation/target. Unknown/inactive products fail. Returns to configured dashboard success/cancel routes, never caller-selected redirect hosts. | Verify correct main products, test account, and callback origin privately. |
| Provider mode | Only `sk_test_` checkout keys are permitted. Signed events and paid evidence must explicitly be test mode. No live enablement is provided. | Local test key present; main key/account not inspected. |
| Webhook | Exact route `/api/webhooks/paymongo`; raw-body HMAC-SHA256, `te` test signature, timestamp freshness (300 seconds), constant-time comparison, bounded body, and supported signed envelope validation. | Main enabled registration and matching endpoint-specific secret not inspected; no POST/replay performed. |
| Payment proof | Bound session/reference/metadata, paid status, exact amount and PHP currency validated. Incomplete signed payloads retrieve the stored bound checkout session server-side. | No fresh main signed paid event or provider retrieval/fulfillment exercised. |
| Diamond duplicate protection | Permanent SQL receipt plus atomic balance transaction; lost-response recovery reads receipt. | Covered by mocked/local SQL tests, not a new main test purchase. |
| Coin duplicate protection | Permanent new claim before PlayFab increment, account/amount binding, confirmation repair; ambiguous grants require review. | Cross-service atomicity is not possible. Pending claims may require manual reconciliation, not automatic regrant. |
| Audit/history | Order/event projections remain in PlayFab Title Internal Data. Receipts are monetary authority. Individual owner order reads can repair audit status from receipt proof. | Audit availability and history correctness on main remain untested. |
| Multiplayer | Read-only top-15 `CC_MP_Wins` board; losses/draws are bounded follow-up reads. No scoring writes. Main public endpoint returned 200. | Fresh game-published match results and authenticated display not exercised. |

Expected main registration: **https://civil-craft.vercel.app/api/webhooks/paymongo**, enabled in the intended PayMongo **test** account for `checkout_session.payment.paid`. The code also recognizes `qr.paid`, but a valid paid event must still resolve to the expected bound checkout-session evidence; this is not authorization to accept arbitrary QR resources. Review the exact current provider event shape against the shipped envelope tests.

A success-page visit/poll does not itself increment currency. A valid paid event is necessary before fulfillment. Gates also participate in fulfillment readiness: turning them off on an old deployment can block outstanding paid orders. Drain/reconcile existing sessions through a reviewed cutover rather than switching off the old service and assuming pending webhooks will fulfill elsewhere.

### Issues requiring review, not changed here

1. The handoff reports **five historical paid sessions without permanent receipts**. This audit did not independently inspect those private order records. Their earlier Coin grant state is unknown; do not auto-backfill, regrant, delete, or reinterpret them.
2. Transaction UI maps failed/cancelled orders to `refunded`. This is a display label, not evidence or execution of a provider refund. Recommend a status-label correction after review.
3. `transactions.ts` catches some inventory/history fetch failures as empty arrays; rows can silently be omitted. Recommend explicit unavailable/partial-history state.
4. Checkout creation authenticates a bearer session but lacks an explicit same-origin check, a small streaming request-body limit, and a per-player checkout rate limiter in `payments/api.server.ts`. Bearer auth reduces conventional cookie-CSRF exposure, but does not control session abuse/provider resource consumption. Recommend scoped controls; no payment code was changed.
5. PlayFab order/event projections have no atomic compare-and-swap. Permanent monetary receipts protect duplicate credit, but concurrent projection updates can still need status repair. Do not treat event audit markers or an apparently fulfilled projection alone as monetary authority.

## E. Regression tests and non-destructive checks

| Command/check | Result |
| --- | --- |
| `npm run test:currencies` | **419 passed, 0 failed** |
| `npm run test:transactions` | **4 passed, 0 failed** |
| `node --test --test-concurrency=2` with 32 remaining test files | **253 passed, 2 failed** (255 tests) |
| `node --test tests/currency-verification-env.test.mjs` | **4 passed, 0 failed** |
| `node --test tests/client-bundle-secrets.test.mjs` after build | **1 passed, 0 failed**, no skips |
| `node --test tests/almanac-discovery.test.mjs tests/email-directory.test.ts` | Isolated confirmation: 13 passed, same 2 failures; not counted twice |
| `npx tsc --noEmit` | Passed |
| `npm run build` | Passed, including client, SSR, Nitro output; approved filesystem access used for dependency tracing |
| `node --check` on verifier, launcher, and new tests | Passed |
| New launcher/test formatting | Formatted; no application-wide formatting |
| `git diff --check` | Passed |
| `npm audit --json` | Successful registry inspection; exits nonzero for **3 high** findings, not an audit transport failure |
| `npm run verify:currencies` using `.env.local` | File-loading problem resolved; safely blocked by missing PostgreSQL storage selections |
| Documented real health check using private handoff | Passed; SELECT-only database verification, no settings installed |

Unique automated results across the selected suites: **681 passed, 2 failed (683 tests)**. `npm ci` was reported successful before this audit and was not rerun; installed versions were inspected. Node used for this audit: 24.14.1. Repository setup documents require Node 22.18+ for native TypeScript execution; select a supported compatible Vercel Node runtime deliberately.

### Two confirmed failures

- `tests/almanac-discovery.test.mjs:79`: “material field does not alter existing project or bridge progression.” It compares raw region data directly against the normalized output. `src/lib/playfab/almanac.ts` supplies IDs, names, order/status/concept defaults and completion fields, including a current timestamp when `completedAt` is absent. **Review the normalization contract and fabricated timestamp behavior**, then use a realistic normalized expectation or compare equivalent normalized inputs with a controlled clock. Do not remove material coverage or assert the whole Almanac is broken based solely on this mismatch. Code and test were left unchanged.
- `tests/email-directory.test.ts:32`: “full directory sorts/filter before 20-row pagination.” Expected 26 active players, received 0. Its fixture supplies `TitleInfo.isBanned` to `mapIdentity`, which deliberately initializes `accountStatus: null`; authoritative ban status is populated elsewhere. Sorting assertions preceding this pass; the status fixture conflicts with the current contract. Recommend explicitly supplying active/banned status or exercising authoritative ban enrichment. The separate current admin authorization/directory/moderation tests passed. Code and test were left unchanged.

Additional suites exercise admin auth, registration/session lifecycle, reset-password API/UI, mail rendering/delivery mocks, portrait access, dashboard equipment/sync/progression, public content/releases/FAQ, single-player/multiplayer leaderboards, Almanac discovery, shop layout, and feedback/conversation ownership. Passing tests are not fresh account creation, live verification email delivery, live password reset, real game sync, or a manual authenticated browser test.

### Production read-only smoke checks

GET requests made without credentials or mutations:

- `/`, `/login`, `/signup`, `/download`, `/leaderboard`, `/faq`, `/contact`: 200 HTML with expected page titles and no detected application-error marker.
- `/almanac`: 200 HTML with the Player Dashboard title; this alone does not prove protected user data or successful authenticated rendering.
- `/api/leaderboard/public/multiplayer`, `/api/shop/products`: 200 JSON.
- `/api/player/currencies`, `/api/payments/paymongo/player-orders`: 401 as an unauthenticated visitor.
- `/api/webhooks/paymongo` with GET: 405 as expected. This does not prove signature verification or webhook delivery on the live endpoint.

No login, registration, checkout creation, signed/forged webhook POST, payment replay, or authenticated order repair was performed. Transaction/mobile layout assertions pass; current production mobile visuals and authenticated dashboard behavior still need manual browser checks.

## F. Security findings

### Credential handling and history

- `.env.local` is ignored and untracked. Git history's sensitive-filename inventory found only `.env.example`; no `.env`, `.env.local`, `.env.production`, private production handoff, or key/certificate file under the checked patterns was found in reachable refs.
- Exact-match scanning of **872 historical text blobs** found no current locally configured secret value; the tracked working tree scan also found none. Historical PayMongo values in `.env.example` were confirmed to be ellipsis placeholders, not the configured secret. This is scoped evidence, not a guarantee that no different old secret ever appeared in an unscanned binary, remote-only ref, external log, or unrelated system.
- The post-build client-secret scan passed. Keep secrets out of `VITE_` variables; only the title ID belongs in that public build namespace. A PlayFab session ticket is still used by the established client session mechanism, not a server credential to place in environment/source files.
- The Downloads production handoff intentionally duplicates plaintext credentials. It is outside the repository and is not encrypted. Main `.gitignore` rules for `.env*` do **not** establish protection for a file named `env.production-handoff.md` if someone copies it into this repository. Do not copy or commit it; use a private encrypted transfer and remove duplicates through the owner's normal retention procedure.
- **No proven credential exposure requiring automatic rotation was found.** If that private handoff was shared insecurely or committed elsewhere, rotate/revoke the database runtime password in `CURRENCY_DATABASE_URL`, `PLAYFAB_SECRET_KEY`, `PAYMONGO_SECRET_KEY`, and the included fork `PAYMONGO_WEBHOOK_SECRET`. Investigate any exposed Blob/Resend/SMTP/admin-session credentials separately. Do not rotate silently: reconcile outstanding orders and endpoint bindings first.

### Dependencies — reviewed, not upgraded

The registry audit identifies three vulnerable **packages**, with multiple brace-expansion advisory records, rather than only three independent advisories.

| Package installed | Finding and project exposure | Reviewed mitigation |
| --- | --- | --- |
| `sharp@0.35.4` (direct runtime dependency) | High: vulnerable librsvg dependency; upstream describes possible RCE under particular glibc-Linux runtime conditions. `cms/images.server.ts` invokes Sharp metadata parsing before checking decoded format. Rejecting SVG MIME labels and later checking PNG/JPEG/WebP format is useful but does not establish that the native SVG parser cannot run on hostile bytes. Admin auth reduces reachable upload exposure; production exploitability was not tested. | Priority: review a focused update to **0.35.5 or later fixed compatible version**, test native Linux deployment and image validation. Upstream also documents disabling the SVG loader as a workaround. No code/dependency workaround was applied. |
| `brace-expansion@1.1.18` and `5.0.9` | High recursion/stack exhaustion plus a moderate quadratic-expansion advisory. Paths: ESLint → minimatch 3; TypeScript ESLint → minimatch 10. Primarily tooling/glob processing here; no public app route was found passing attacker-controlled glob patterns. | Review same-line updates to **1.1.21** and **5.0.12** or newer compatible fixed releases, addressing the later moderate advisory too. Preserve parent compatibility and lockfile reproducibility. |
| `source-map-js@1.2.1` | High indexed-source-map offset DoS. Paths: Tailwind node and Vite/PostCSS. Mainly build/tool processing in this project; no uploaded-source-map runtime endpoint was found. | Review a compatible transitive lockfile update to **1.2.2 or newer fixed version**; rerun build, CSS/source-map and regression checks. |

Sources: [Sharp maintainer advisory](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w), [brace-expansion recursion advisory](https://github.com/advisories/GHSA-qhr7-859c-m2p7), [brace-expansion quadratic expansion advisory](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), [source-map-js maintainer fixed release](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2) and [indexed-source-map advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

`npm audit fix`, dependency upgrades, exploit payloads, and live-image testing were not performed. Review focused patch/lockfile changes in a separate change; keep existing TanStack/Vite compatibility decisions and the rolldown override intact unless separately justified.

## G. Vercel deployment checklist

Vercel settings are **not accessible evidence from this audit**. The table lists required names/purposes, not credentials to copy blindly. Environment changes require redeployment. Only configure the main project after confirming the operator has its access; Git merges do not synchronize environments.

| Variable(s) | Purpose / required configuration |
| --- | --- |
| `VITE_PLAYFAB_TITLE_ID` | Same intended title at build and runtime; public configuration. Confirm compatibility with existing users/ledger, not just a passing test. |
| `PLAYFAB_SECRET_KEY` | Matching title's server-only API secret. Never prefix with `VITE_`. |
| `PUBLIC_APP_URL` | Main Production checkout origin `https://civil-craft.vercel.app`; Preview uses its deliberate isolated/test origin. Must be configured explicitly. |
| `PUBLIC_SITE_URL` (or `SITE_URL`) | Site/mail-link origin and PayMongo fallback when `PUBLIC_APP_URL` is absent. Avoid inconsistent competing values. |
| `PAYMONGO_SECRET_KEY` | Agreed PayMongo test account's server-only `sk_test_` key. Existing sessions require the original account/key access. Live keys are rejected by this code. |
| `PAYMONGO_WEBHOOK_SECRET` | Secret for the exact main enabled test webhook registration. Do not reuse the fork value without confirming that registration's current URL/secret. |
| `PLAYFAB_COINS_CURRENCY_CODE` | Classic currency code `CO`; verify existing definition, do not create or change it automatically. |
| `PLAYFAB_DIAMONDS_STORAGE`, `COIN_RECEIPTS_STORAGE` | Both `postgres` for this intended integration. No implicit fallback or automatic migration. |
| `CURRENCY_DATABASE_URL` | Existing restricted runtime connection with provider TLS; server-only, pooled endpoint deliberately chosen. Never use owner/admin connection. |
| `CURRENCY_DATABASE_ID` | Existing installation UUID obtained privately from verified setup. |
| `CURRENCY_DATABASE_VERIFIED` | Setup gate; true only after a real successful verification for intended configuration. |
| `CURRENCY_DATABASE_VERIFIED_TITLE_ID` | Title from that successful verifier. |
| `CURRENCY_DATABASE_VERIFIED_CONFIG_SHA256` | Exact fresh configuration fingerprint; recompute after target/title/schema changes. |
| `PLAYFAB_DIAMONDS_ENABLED`, `COIN_CHECKOUT_ENABLED` | Explicitly false during setup. Enable only through reviewed simulation rollout after prerequisites. |
| `PLAYFAB_COINS_RECEIPTS_VERIFIED` | Keep false for PostgreSQL; legacy Entity Objects readiness flag is not PostgreSQL proof. |
| `ADMIN_AUTH_ORIGIN`, `ADMIN_SESSION_SECRET`, `ADMIN_USERS_JSON` | Correct deployment origin and existing admin credentials; preserve unrelated admin configuration. Defaults are not proof of Preview correctness. |
| `PLAYFAB_RECOVERY_EMAIL_TEMPLATE_ID` | Existing PlayFab recovery template; preserve reset callback/template configuration. |
| `RESEND_API_KEY`, `ADMIN_EMAIL`, `RESEND_FROM` | Existing admin contact notification delivery, if selected. |
| `GMAIL_SMTP_USER`, `GMAIL_SMTP_APP_PASSWORD`, optional `GMAIL_SMTP_HOST`, `GMAIL_SMTP_PORT`, `GMAIL_SMTP_SECURE` | Existing Support Reply delivery. Preserve selected provider credentials. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Alternate SMTP path if deliberately used. `SMTP_PASS` is a supported Gmail fallback, not a replacement name for every SMTP helper. |
| `PUBLIC_SITE_URL`, optional `ADMIN_AUTH_ORIGIN` | Mail/action-link origins; configure them consistently with the main site. |
| `BLOB_READ_WRITE_TOKEN`, or supported OIDC/resource configuration (`BLOB_STORE_ID`, provider-managed identity) | Existing Blob-backed content/upload and duplicate-marker features. Preserve the selected deployment authentication; local OIDC tokens are not permanent Production secrets to copy. |
| `PLAYFAB_RELEASE_EMAIL_TEMPLATE_ID`, `CRON_SECRET` | Optional notification worker. No cron schedule is supplied by a `vercel.json` in this checkout; configure deliberately if required. |

### Unused and backend-specific settings

- `PAYMONGO_PUBLIC_KEY` is listed in examples/dev loading but has no payment-runtime consumer in the inspected website; hosted checkout uses the server secret. It is not an additional requirement for this implementation.
- `PLAYFAB_DIAMONDS_ITEM_ID`, `PLAYFAB_DIAMONDS_RECEIPT_ITEM_ID`, `PLAYFAB_DIAMONDS_BOOTSTRAP_VERIFIED`, `PLAYFAB_DIAMONDS_PLAYER_WRITES_DENIED`, `PLAYFAB_DIAMONDS_CAPACITY_VERIFIED`, `PLAYFAB_DIAMONDS_VERIFIED_TITLE_ID`, `PLAYFAB_DIAMONDS_VERIFIED_CONFIG_SHA256`, `PLAYFAB_COINS_VERIFIED_TITLE_ID`, and `PLAYFAB_COINS_VERIFIED_CONFIG_SHA256` remain meaningful for explicit legacy/Economy wallet modes. They are **not** PostgreSQL readiness attestations. Do not treat them as universally unused or enable them to bypass PostgreSQL verification.
- `PLAYFAB_DIAMONDS_VERIFICATION_PLAYER_TICKET` and `PLAYFAB_COINS_VERIFICATION_PLAYER_TICKET` belong to opt-in legacy setup tools that can write test currency. They are unnecessary for PostgreSQL read-only verification and were not used.

### Safe rollout sequence

1. Agree on the intended shared title, existing ledger, exact runtime target, PayMongo test account, outstanding-order owners, and a drain/reconciliation window. Preserve hardened original fulfillment for old sessions; do not replay through older unprotected code.
2. Review/fix the high-severity dependencies and the two regression-contract failures separately. Reconcile the handoff's historical missing-receipt orders without granting currency blindly.
3. Keep all new-deployment payment gates explicitly false. Review main Vercel Production variables privately, preserving unrelated settings. Configure isolated Preview resources or keep Preview checkout off; never automatically connect arbitrary preview builds to the shared purchase ledger.
4. Use the already installed restricted Neon configuration; do not migrate/reset/recreate it. Rerun the read-only verifier against the exact intended Production target and install only its current successful attestations through the operator. This audit's successful process did not update deployment variables.
5. Review/register the main **test** webhook at `https://civil-craft.vercel.app/api/webhooks/paymongo` for the paid checkout event; privately install its actual signing secret. Confirm callback origins, packages, and existing classic `CO` definition. No dashboard settings were changed here.
6. Redeploy with reviewed settings. Test unauthenticated/other-owner/expired-ticket access, ordinary public/admin/player regressions, and mobile pages. Complete mail and game-sync checks through existing workflows.
7. Under a separate explicitly authorized simulation plan, enable only the intended test checkout gates and perform one test DI and one test CO purchase with a designated account. Verify provider payment, correct owner, permanent receipt, exact balance delta, duplicate signed replay/no second grant, pending/error recovery, and transaction display. Never use real payment methods for a simulation.
8. Only after that evidence, approve broader thesis test checkout availability. **Live-money production enablement remains out of scope**; substituting a live key is not sufficient.

## H. Final readiness assessment

| Component | Classification | Reason |
| --- | --- | --- |
| Local verifier file selection | **READY** | Missing `.env` issue fixed; existing `.env.local` loads; original guards preserved and new tests pass. |
| Existing Neon installation/role health | **READY** for checked handoff target | Real read-only verification passed. Not a claim about every receipt, timeout, backup, or main runtime deployment. |
| Main PostgreSQL environment/attestations | **NEEDS CONFIGURATION** | Local settings absent; main Vercel values not inspected or installed. |
| Checkout/provider code under automated tests | **READY** for reviewed simulation implementation | Currency/transaction suites pass; no new provider flow executed. |
| Main test webhook | **NEEDS CONFIGURATION / NEEDS TESTING** | Route exists; main registration/secret and signed delivery are unknown. GET 405 is only a routing check. |
| Main Coin/Diamond fulfillment | **BLOCKED** for readiness approval | Needs confirmed main settings, webhook, controlled test fulfillment/replay, and outstanding-order reconciliation. |
| Historical ambiguous Coin orders | **BLOCKED** for automatic recovery | Handoff reports missing permanent proof; no evidence permits safe regrant. |
| Public main pages and unauthenticated API guards | **READY** for basic HTTP smoke | Expected GET responses observed; interactive/mobile/account workflows remain untested. |
| Admin directory and Almanac regression contracts | **NEEDS TESTING / REVIEW** | Two reproduced failures; fixture/normalization mismatches investigated, not changed. |
| Auth, recovery/mail, portrait, game sync, achievements | **NEEDS TESTING** on main | Relevant mocked/local checks pass; live account/email/game/browser workflows not exercised. |
| Multiplayer leaderboard | **READY** for public read path; **NEEDS TESTING** for game/account integration | Current public GET succeeds and regression tests pass; real new match publication untested. |
| Mobile layouts | **NEEDS TESTING** on main | Automated transaction/shop guards pass; no current authenticated mobile browser inspection. |
| Dependency security | **BLOCKED** for clean security approval | Three high-severity packages remain; focused compatible remediation needs review. |
| Live-money payments | **BLOCKED / OUT OF SCOPE** | Code intentionally permits test-mode only. |

The repository contains the merged implementation and substantial successful automated coverage. **Do not interpret that as main-site production currency readiness.** The safe next work is operator configuration, reviewed regression/security remediation, and separately authorized test-mode end-to-end verification—not changes to balances, migration SQL, or blind historical payment replay.
