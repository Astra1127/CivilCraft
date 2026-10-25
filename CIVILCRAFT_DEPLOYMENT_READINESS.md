# CivilCraft main deployment readiness

Prepared: 2026-10-09 (Asia/Manila). Main site: **https://civil-craft.vercel.app**.

**Local remediation is validated and committed. It has not been pushed or deployed. Main Coin/Diamond purchases remain BLOCKED for readiness approval. Local checkout is disabled; remote payment gates are unverified and were not changed.**

References reviewed: `CIVILCRAFT_POST_MERGE_AUDIT.md`, `CIVILCRAFT_REMEDIATION_REPORT.md`, `docs/website-currency-developer-handoff.md`, `docs/main-site-purchase-setup.md`, and relevant payment/verifier code. Earlier fork purchases and the prior Neon health check are historical evidence, not a new main-site payment test.

## A. Git status

| Item | Result |
| --- | --- |
| Branch | `main` |
| Local commit | `5791df0dec1dfef229b5cddafc09aac1b04d903e` |
| Message | `fix: complete post-merge remediation and security updates` |
| Parent | `922478570e4e4d40664b1e78d56945f29fa30322` |
| Push | **Not performed** |
| Cached remote comparison | Local HEAD is one commit ahead of cached `origin/main`; no fetch was performed. This is not a fresh remote-state assertion. |
| Working tree immediately after commit | Clean |
| Remaining review artifact | This report, `CIVILCRAFT_DEPLOYMENT_READINESS.md`, is intentionally uncommitted. It was generated after the remediation commit to record its exact hash. |
| Private local files | Environment files, `docs/env.production-handoff.md`, ignored diagnostics/build outputs remain local and excluded. |

Twenty reviewed files were explicitly staged and committed:

| Classification | Files |
| --- | --- |
| Regression/application fixes | `src/lib/playfab/almanac.ts`, `src/lib/playfab/index.ts`, `src/routes/dashboard.index.tsx`, `src/components/dashboard/NotificationBell.tsx`, `src/components/dashboard/almanac/AlmanacJournal.tsx`, `src/components/dashboard/almanac/LevelEntryDialog.tsx` |
| Regression/native image coverage | `tests/almanac-discovery.test.mjs`, `tests/email-directory.test.ts`, `tests/public-content.test.ts` |
| Targeted dependency updates | `package.json`, `package-lock.json` |
| Verification tooling | `scripts/verify-currency-database-local.mjs`, `scripts/verify-currency-database.mjs`, `tests/currency-verification-env.test.mjs`, `docs/postgres-currency-setup.md` |
| Credential exclusion | `.gitignore` |
| Safe documentation | `CIVILCRAFT_POST_MERGE_AUDIT.md`, `CIVILCRAFT_REMEDIATION_REPORT.md`, `docs/main-site-purchase-setup.md`, `docs/website-currency-developer-handoff.md` |

No deleted files or unrelated application changes were found. No reset, revert, history rewrite, branch merge or forced add was used. Three trailing-whitespace lines in the newly added safe handoffs were removed for the staged diff check; handoff instructions were preserved. The historical reports describe earlier working-tree states and should be read with this current report.

## B. Security review

- `.env`, `.env.local`, `.env.production`, and the private environment handoff are not tracked or staged. `git check-ignore` confirms their exclusion; the handoff filename rule applies at every directory depth. `.env.example` remains the intentionally tracked placeholder template.
- Proposed commit scan: **20 files passed**, using configured private credential values from local configuration and the private handoff, plus credential-like literal checks. No actual values were printed. The safe setup/developer guides passed these checks.
- Staged snapshot: exactly the reviewed files; credential checks passed, index contents matched reviewed working files, no restricted payment/database/environment changes were staged, and `git diff --cached --check` passed.
- Reachable history: **872 historical text blobs** scanned for known credentials; no matches. Sensitive filename inventory found no committed private environment/handoff/key path under the checked patterns. No affected credential-containing commit was identified.
- These checks cannot prove absence of unknown old credentials, remote-only refs, binaries, or external disclosures. No credential rotation is mandated by the evidence found here. **Any independently confirmed prior exposure requires rotation/revocation before production approval**, coordinated with outstanding orders and webhook ownership. No rotation was performed.
- Fresh generated client bundle scan passed. Secrets must remain server-only; do not create public/VITE copies of API secrets, database URLs or signing secrets.
- Fresh npm audit: **0 vulnerabilities** at all severities. Fixed versions: Sharp **0.35.5**, native Sharp/libvips artifacts **0.35.5 / 1.3.4**, brace-expansion **1.1.21 / 5.0.12**, source-map-js **1.2.2**. Vite, TanStack, Nitro and the Rolldown override are unchanged.

## C. Fresh local validation

| Command | Outcome |
| --- | --- |
| `npm run test:currencies` | 419 passed, 0 failed, 0 skipped |
| `npm run test:transactions` | 4 passed, 0 failed, 0 skipped |
| Full functional suite, 50 files | 687 passed, 0 failed, 0 skipped; 0 cancelled/TODO |
| Post-build `node --test tests/client-bundle-secrets.test.mjs` | 1 passed, 0 failed, 0 skipped |
| **Unique full-suite total, all 51 files** | **688 passed, 0 failed, 0 skipped** |
| `npx tsc --noEmit` | Passed, exit 0 |
| `npm run build` | Passed, exit 0; client, SSR and Nitro output completed |
| `npm audit` and `npm audit --json` | Passed, exit 0; 0 vulnerabilities |
| Staged/unstaged `git diff --check` | Passed before commit |

The currency and transaction commands overlap the full suite and are not added again to its total. Native CMS PNG/JPEG/WebP processing and invalid-upload tests are included. Node used: 24.14.1, Windows x64. Vercel's selected Node/Linux runtime still requires deployment verification.

Reproducible full-suite command documented by the remediation report, executed in PowerShell:

```powershell
$testFiles = @(rg --files tests -g '*.test.ts' -g '*.test.mjs' |
  Where-Object { $_ -notmatch 'client-bundle-secrets' })
node --test --test-concurrency=2 @testFiles
npm run build
node --test tests/client-bundle-secrets.test.mjs
```

No tests were removed, skipped, disabled or weakened. Diagnostics are ignored `.deployment-*.log` files. No fresh database verification, live authentication, browser interaction, checkout, webhook POST, provider replay or paid fulfillment was performed during this preparation.

## D. Vercel configuration audit

Authenticated main Vercel access was not established or used. **All remote values and deployment status are unverified.** Git commits and local builds do not synchronize Vercel environments. No local environment or dashboard was edited.

| Variable | Purpose/intended Production configuration | Available local evidence |
| --- | --- | --- |
| `VITE_PLAYFAB_TITLE_ID` | Public title selection at build/runtime; must match existing intended users/ledger. | Present; matches documented shared title. |
| `PLAYFAB_SECRET_KEY` | Server API credential for that title. | Present; provider validity/main binding not freshly tested. |
| `PAYMONGO_SECRET_KEY` | Agreed test account's server-only checkout/retrieval key; live keys rejected. | Present; test-key prefix confirmed. |
| `PAYMONGO_WEBHOOK_SECRET` | Signing secret for the exact main test endpoint. | Present locally; handoff describes fork binding, not verified main binding. Main draft has a replacement marker. |
| `PUBLIC_APP_URL` | Explicit main HTTPS checkout return origin: `https://civil-craft.vercel.app`. | Present but loopback development origin; do not copy unchanged to Production. |
| `PUBLIC_SITE_URL` / `SITE_URL` | Site/mail origin; payment fallback after `PUBLIC_APP_URL`. | Public site variable present; avoid conflicting origins. |
| `PLAYFAB_COINS_CURRENCY_CODE` | Existing PlayFab classic `CO`; verify definition without modifying it. | Present; definition not freshly inspected. |
| `PLAYFAB_DIAMONDS_STORAGE` | Explicit `postgres` for intended wallet. | Missing locally. |
| `COIN_RECEIPTS_STORAGE` | **Also required**: explicit `postgres` for durable Coin claims. | Missing locally. |
| `CURRENCY_DATABASE_URL` | Existing restricted runtime URL, exact intended endpoint, certificate-verified TLS. | Missing locally; available only in private handoff. |
| `CURRENCY_DATABASE_ID` | Existing installation UUID. | Missing locally. |
| `CURRENCY_DATABASE_VERIFIED` | True only from successful intended-target verification. | Missing locally. |
| `CURRENCY_DATABASE_VERIFIED_TITLE_ID` | Matching title from successful verifier. | Missing locally. |
| `CURRENCY_DATABASE_VERIFIED_CONFIG_SHA256` | Exact current target/title/schema/protocol fingerprint. | Missing locally. |
| `PLAYFAB_DIAMONDS_ENABLED` | False during setup; operator-approved future test enablement only. | Absent; disabled. |
| `COIN_CHECKOUT_ENABLED` | False during setup; operator-approved future test enablement only. | Absent; disabled. |
| `PLAYFAB_COINS_RECEIPTS_VERIFIED` | Keep false in PostgreSQL mode; legacy flag is not PG attestation. | Absent; disabled. |

The private handoff must not be committed or copied wholesale over unrelated settings. Verification title/fingerprint blanks and the main webhook replacement marker are intentional blockers, not values to deploy. The handoff's old attestation snapshot is not current proof.

Preserve existing admin/session/origin settings, recovery/contact mail configuration, Blob authentication and optional worker secrets. See audit section G for their exact names. This task did not validate those providers remotely. `PAYMONGO_PUBLIC_KEY` has no runtime consumer in the hosted checkout implementation. Legacy Entity Objects/Economy wallet variables are not required for the selected PG integration and must not bypass PG readiness.

**Production vs Preview:** scope values deliberately per project/environment. Main Production must use the agreed title, existing ledger, restricted login, main origin and endpoint-specific test secret. Preview should keep checkout off or use isolated test services and its own explicit origin; do not automatically attach every preview to the shared purchase ledger. Use a supported Node runtime and redeploy after configuration changes. No `vercel.json` supplies environment settings or a cron schedule here.

## E. Payment and Neon preparation

### What code/local tests verify

- Expected main route: **https://civil-craft.vercel.app/api/webhooks/paymongo**, POST only; GET is rejected. Prior public GET smoke is historical routing evidence, not signed-delivery proof.
- Register the intended PayMongo **test** event `checkout_session.payment.paid`. Code also handles `qr.paid` only with bound hosted-checkout evidence; standalone QR resources are acknowledged without granting.
- Signature: original raw body and `Paymongo-Signature`, HMAC-SHA256 of timestamp/body, `t` and test `te`, 300-second freshness, constant-time comparison, matching endpoint-specific secret. Do not rewrite/re-serialize the signed body or disable verification. Request body is bounded.
- Event/session must explicitly be test mode. Bound order/session ID, reference/metadata, owner, paid status, exact PHP amount and immutable product/reward/storage snapshots are checked. Incomplete evidence retrieves the bound session through the same test account.
- Duplicate authority is permanent monetary receipts, not a success-page visit or an event/audit projection. DI balance and receipt commit atomically in PostgreSQL. CO uses classic PlayFab credit only after a permanent newly acquired pre-grant claim.
- An uncertain CO response stays pending for review and cannot be safely reacquired/regranted. Projection errors can be repaired from receipt proof. Transient failures generally return retryable errors; invalid evidence is rejected; historical missing-proof Coin orders require reconciliation. Receipt deletion/claim expiration is unsafe.

### Existing Neon evidence and additional checks

The previous audit performed a successful real **read-only** health check against the private handoff's restricted runtime endpoint with gates false. It confirmed installation/title/schema and implemented role/function/table/trigger restrictions. This preparation reviewed that evidence and did not reconnect or mutate the database.

Before main deployment approval, rerun the documented SELECT-only verifier against the exact intended Production runtime connection/title/installation, with all gates false; install fresh successful attestations privately through the operator. Confirm main runtime actually uses that target. Endpoint/title changes require new verification; switching pooled/direct hostnames changes the binding of existing orders even for the same underlying database. Do not create an empty replacement database or rerun installation SQL on the existing ledger.

Review backups/restore procedures and runtime statement timeout with the owner; the health check does not establish those policies, all receipt correctness or detect a stale restore at the same endpoint. Outstanding-order/receipt investigations need a separate approved read-only operator plan; no grant or write is justified by a historical paid-session list alone.

### Remaining risks

- Main configuration, deployed revision, endpoint registration/signing secret, real signed delivery and test fulfillment are unverified.
- The handoff reports five historical paid sessions without permanent receipts. Prior Coin grants are uncertain; no automatic backfill or regrant.
- Fork-created sessions retain old return URLs and account-origin sessions. Drain/reconcile using hardened code and original account access before retiring the old processor. Payment gates also affect fulfillment; switching them off can strand pending paid orders.
- Source-map/image dependency fixes pass locally, but hosted Linux uploads and main authenticated/mobile features need smoke checks.
- The earlier transaction-label/partial-history, checkout-abuse controls and concurrent projection recommendations remain separate work. No payment logic changed in this commit.

Safe current checks are the mocked payment suites, local fixture SQL tests, build/client isolation, code review and the separately configured read-only verifier. Real checkout, signed webhook delivery/replay and account balance effects are future actions requiring their own authorization.

## F. Manual deployment checklist

1. Review local commit `5791df0dec1dfef229b5cddafc09aac1b04d903e` and this uncommitted report. Confirm only the listed safe files are included; preserve private handoffs. Check fresh remote state before pushing; if it diverged, review an integration plan without rewriting published Lovable history.
2. **Obtain explicit push authorization**, then push the approved branch normally. No push occurred here. Confirm GitHub contains the intended commit.
3. In the main Vercel project, confirm the domain, repository/Production branch, commit, supported Node runtime and successful deployment/build logs. Run public-page and authenticated player/admin/mobile smoke checks; inspect sanitized errors. A successful build is not runtime configuration evidence.
4. Agree on title, test provider account, existing ledger/endpoint, pending-order owners and safe drain window. Preserve existing hardened fulfillment for old sessions; do not indiscriminately disable an old processor and assume pending payments will drain.
5. Configure only reviewed Production variables privately, preserving unrelated features. **Keep new checkout gates explicitly false.** Configure Preview isolation. Fix main public origins, PG selections, restricted DB settings and main endpoint-specific secret; never paste placeholder attestations/secrets as real values. Redeploy as required.
6. With gates false, run `npm run verify:currencies` against the exact approved private configuration, or select an explicit private file. Use the fresh successful database outputs; confirm matching deployed runtime settings. Do not run legacy writing setup tools or installation SQL. Review owner backup/timeout policies separately.
7. Review/register the main **test** webhook for `checkout_session.payment.paid`, obtain its signing secret privately and redeploy. Verify provider reachability/signature handling under a separately approved non-grant test plan. With fulfillment gates off, paid delivery can fail fulfillment; this is not a successful purchase test.
8. Resolve the test-enable policy before purchasing: **the current code cannot create/fulfill a full purchase with its payment gates off and has no per-account rollout gate.** Preparation therefore leaves them off. Use an explicitly authorized isolated test deployment first, or obtain separate approval for a carefully controlled main test window after prerequisite checks. Do not interpret this checklist or handoff Step 7 as authorization to enable main checkout now.
9. In the approved test scope, use designated receiving accounts and test payment methods only. Test **CO** purchase: exact owner/title/package delta, permanent pre-grant/confirmation receipt, unchanged DI/game gold, success/cancel/pending UI and owner-only history. Never use real cards/banking apps.
10. Test **DI** purchase: exact owner/entity/package balance delta, atomic permanent receipt, unchanged CO/game gold, configured main return origin and unavailable/error handling. If tested only on an isolated environment, main remains unverified.
11. Under separately authorized signed replay testing, retry the same original event/session/order and confirm no second grant. Verify permanent receipt and balances, not just provider paid status or success-page text. Exercise ambiguous/transient recovery without deleting claims or changing identities. Stop and reconcile any uncertain Coin grant.
12. Reconcile historical missing-proof Coin payments and remaining fork sessions through the reviewed owner plan; nominate the canonical hardened processor and retain old returns/required delivery paths until safe retirement. Do not blind-backfill receipts or restore unsafe code/stale ledgers.
13. Review all recorded evidence and approve normal **test-mode** payment gates only after prerequisites and controlled tests succeed. Until such a policy and verification are authorized, Coin/Diamond approval remains BLOCKED. Live-money enablement is outside scope and is rejected by current checkout code.

## G. Final recommendation

| Main component | Status | Evidence / remaining requirement |
| --- | --- | --- |
| Public website | **NEEDS TESTING** | Local code/build READY for review/push; current commit not deployed. Prior public smoke predates it; verify new deployment and runtime content. |
| Player dashboard | **NEEDS TESTING** | Local regressions pass; current deployed authenticated/mobile/session/game workflows untested. Currency availability still depends on setup. |
| Admin dashboard | **NEEDS TESTING** | Auth/moderation/directory/CMS tests pass; preserve/check main credentials/origin, Linux upload/storage and live admin behavior. |
| Coin purchases | **BLOCKED** | Disabled locally; main PG/provider settings, controlled fulfillment/replay and historical reconciliation outstanding. |
| Diamond purchases | **BLOCKED** | Disabled locally; main PG/entity/provider configuration and atomic receipt/balance end-to-end evidence outstanding. |
| PayMongo webhook | **NEEDS CONFIGURATION** | Local signature/matching/replay tests pass; main registration/secret/delivery needs configuration and testing. |
| Neon database | **NEEDS CONFIGURATION** | Prior checked installation health READY; main runtime binding/fresh attestations and operational review remain unverified. |

Proceed with authorized code publication and payment-disabled deployment review once operator access and gate configuration are confirmed. **Do not approve production purchase processing from green automated tests alone.** No PlayFab data/balances, Neon records/receipts, Unity files, environment files, PayMongo/Vercel settings, payments or checkout gates were changed in this preparation.
