# CivilCraft regression and security remediation

Date: 2026-10-09 (Asia/Manila). Repository: `C:\Users\jemma\Documents\Thesis\Website`.

**The two confirmed regressions are resolved. All 688 automated tests pass, with 0 failures and 0 skips. TypeScript and the production build pass. npm audit reports 0 vulnerabilities. Currency checkout is still not approved as production-ready.**

The prior `CIVILCRAFT_POST_MERGE_AUDIT.md` was reviewed before edits and remains a historical report. Its regression and dependency findings are superseded by the results below; its unverified deployment and payment findings remain outstanding.

## 1. Regression root causes and fixes

### Almanac

`tests/almanac-discovery.test.mjs` compared a raw, partial game record directly with normalized reader output. The established parser accepts camel/Pascal-case fields, supplies region/level identifiers, names, order, status, engineering concept arrays and completion defaults, derives totals/bridge discoveries when absent, and preserves explicit progression aggregates. Therefore exact raw-object equality was unrealistic.

The regression now compares equivalent normalized records with and without material discoveries. It also asserts normalization defaults, unchanged explicit aggregates, preserved bridge discovery, and material discovery. Existing malformed/legacy/material/UI tests remain enabled.

An independent application defect was confirmed: `parseAlmanacProgress` generated the current timestamp for a completion with no game-written date. This falsely represented a historical completion as newly completed on every read and could reorder dashboard cards/notifications. Missing dates now remain an empty string in the existing string contract. Completion records, counts, scores, status, discoveries and game data are retained. No game/progression writes occur.

All affected date consumers were inspected. Almanac cards/dialogs, dashboard completion cards and notifications display **Date unavailable** for missing/invalid dates. Dashboard/notification ordering uses a deterministic fallback rather than a NaN comparator. Normal game-era dated records remain newest-first; undated records follow them. Supplied completion dates remain unchanged, including Pascal-case input. New tests verify date preservation, retained completion/progression, unavailable-date UI and notification labels.

### Admin Player Directory

The fixture passed `TitleInfo.isBanned` to `mapIdentity`, expecting it to populate active/banned status. The production mapper intentionally initializes status to `null`; current status comes from authoritative `Admin/GetUserBans` enrichment (with expiration/active-state checks). Export flags are separate snapshot data and do not replace current authoritative status.

The sorting/filtering fixture now supplies the enriched `accountStatus` explicitly. Assertions still cover all 53 rows, sorting before 20-row pagination, active/banned filters, activity filters and their intersection. A new test ensures identity mapping cannot turn either legacy flag into authoritative status. Existing unknown-status, export, live-ban enrichment, moderation, authentication and directory tests pass. Production ban logic was not changed.

## 2. Files modified in this remediation

| File | Justification |
| --- | --- |
| `src/lib/playfab/almanac.ts` | Stop inventing completion dates; preserve normalization and progression. |
| `src/components/dashboard/almanac/AlmanacJournal.tsx` | Render missing/invalid completion dates safely. |
| `src/components/dashboard/almanac/LevelEntryDialog.tsx` | Render unavailable dates while preserving completion details. |
| `src/routes/dashboard.index.tsx` | Safe date display and deterministic completion-card ordering. |
| `src/lib/playfab/index.ts` | Deterministic notification date ordering; no currency/payment changes. |
| `src/components/dashboard/NotificationBell.tsx` | Avoid Invalid Date for undated completion notifications. |
| `tests/almanac-discovery.test.mjs` | Correct normalized comparison; add three date-contract/UI tests. |
| `tests/email-directory.test.ts` | Correct enriched-status fixture; add legacy-flag contract test. |
| `tests/public-content.test.ts` | Add real native PNG/JPEG/WebP decode/re-encode regression coverage. |
| `.gitignore` | Exclude private `env.production-handoff.md` copies at any directory depth. |
| `package.json` | Pin the targeted fixed Sharp patch, retaining existing scripts/framework choices. |
| `package-lock.json` | Targeted security patches and Sharp native-library lock entries. |
| `CIVILCRAFT_REMEDIATION_REPORT.md` | This report. |

Earlier audit tooling/report changes and pre-existing untracked handoff/setup documents were left intact. In particular, the verifier launcher/script/help/setup-doc changes predate this remediation. No broad formatting was performed; formatting is limited to touched files.

## 3. Dependency changes

| Dependency | Before | After | Scope |
| --- | --- | --- | --- |
| `sharp` | 0.35.4 (`^0.35.4`) | 0.35.5 (exact direct pin) | Fixed compatible patch; native platform packages follow 0.35.5. |
| `@img/sharp-libvips-*` | 1.3.3 | 1.3.4 | Required Sharp native dependency update across lockfile platforms. |
| `brace-expansion` (ESLint/minimatch 3 path) | 1.1.18 | 1.1.21 | Existing 1.x dependency range retained. |
| `brace-expansion` (typescript-estree/minimatch 10 path) | 5.0.9 | 5.0.12 | Existing 5.x dependency range retained. |
| `source-map-js` | 1.2.1 | 1.2.2 | Existing compatible dependency range retained. |

Commands: `npm install sharp@0.35.5 --save-exact --ignore-scripts`, then `npm update brace-expansion source-map-js --ignore-scripts`. No audit-fix/force command, major upgrade, or extra override was used. Lockfile version comparison found changes only in the listed packages and their Sharp native artifacts. Dependency lifecycle scripts were not run during installation; actual image decoding was subsequently exercised by automated tests.

Vite **8.1.5**, TanStack React Start **1.168.60**, React Router **1.170.41**, router plugin **1.168.42**, Nitro **3.0.260603-beta**, and the Rolldown **1.2.1** override are unchanged. No other dependency version was upgraded.

The installed Windows x64 native runtime reports Sharp 0.35.5, libvips 8.18.7 and librsvg 2.63.2. PNG/JPEG/WebP processing, CMS authenticated uploads/storage/public-content behavior and rejection of mismatched MIME, SVG and oversized uploads pass. Production Linux native runtime and hosted upload smoke checks were not performed.

References: [Sharp maintainer fixed-version advisory](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w), [brace-expansion recursion advisory](https://github.com/advisories/GHSA-qhr7-859c-m2p7), [brace-expansion later quadratic advisory](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), and [source-map-js fixed release](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2). Registry audit confirms both brace-expansion installations and the other targeted packages are no longer reported vulnerable.

## 4. Complete validation results

Node: 24.14.1; platform: Windows x64. All **51** existing test files were included. The client-bundle test ran after the final completed build; it was not skipped. Five new regression tests augment the prior 683-test inventory.

| Final validation | Passed | Failed | Skipped | Result |
| --- | ---: | ---: | ---: | --- |
| All 50 functional test files: `node --test --test-concurrency=2 <all tests/*.test.ts and tests/*.test.mjs except client-bundle-secrets>` | 687 | 0 | 0 | Pass; 0 cancelled, 0 TODO. |
| Post-build `node --test tests/client-bundle-secrets.test.mjs` | 1 | 0 | 0 | Pass; actual generated client assets scanned. |
| **Unique total** | **688** | **0** | **0** | **Pass** |
| `npx tsc --noEmit` | — | — | — | Pass, exit 0. |
| `npm run build` | — | — | — | Pass, exit 0; client, SSR and Nitro output completed. |
| `npm audit` | — | — | — | Pass, exit 0: **found 0 vulnerabilities**. |
| `npm audit --json` | — | — | — | 0 info/low/moderate/high/critical vulnerabilities. |
| Targeted application ESLint | — | — | — | Pass on changed application TypeScript/TSX files. |
| `git diff --check` | — | — | — | Pass. |

This includes all currency/payment mocked and local SQL suites, transaction layout, authentication, directory/moderation, CMS/images, mail, player sessions, leaderboard, feedback/conversation ownership, equipment/portraits, dashboard sync and Almanac discovery suites. Local SQL tests use their existing test fixtures; no Neon connection or production schema/receipts were modified. Currency tests do not constitute fresh provider payment or deployed fulfillment evidence.

Focused and intermediate runs passed too; they are not added to the unique total. The final full run and build were repeated after downstream date-consumer changes. Ignored `.remediation-*.log` files hold command results. Existing React test-renderer deprecation and build timing/bundle notices are non-failing; no tests were removed or skipped.

## 5. Remaining security findings

**No vulnerabilities are reported by the final npm registry audit.** This is scoped dependency evidence, not proof that application code or future dependency releases are vulnerability-free. The client-bundle credential/authentication scan passes; credential values are excluded from this report.

The repository already contained untracked handoff/setup documents at task start. They were not edited, staged or published in this remediation. Following the document-review request, the copies under `docs/` were reviewed together with the audit. Their guidance is consistent with the previously reviewed Downloads handoffs; byte-for-byte equality was not established because the original private Downloads file is no longer available at its former path. The main-site setup guide agrees on restricted existing-ledger reuse, endpoint-specific test-webhook secrets, disabled setup gates, and deliberate outstanding-order reconciliation. Historical fork results do not establish main readiness.

The private environment handoff was untracked but initially **not ignored**, despite its own claim that it was Git-ignored. `.gitignore` now excludes `env.production-handoff.md` at any directory depth; `git check-ignore` confirms the docs copy is ignored. `.env.local` remains ignored. No private handoff was staged or committed. Other documents must still be reviewed for credentials before any future staging; ignore rules cannot protect an already tracked file or an explicit forced add.

A local names/status-only check confirms the Diamond, Coin and legacy receipt enable gates are not true, so checkout remains disabled locally. No environment file was edited. Remote Vercel gates were not inspected or changed and cannot be claimed disabled from local evidence.

## 6. Remaining deployment blockers

Production currency readiness remains **unapproved** despite green automated validation:

- Main Vercel PostgreSQL settings, restricted runtime connection binding and fresh intended-target attestations remain unverified/uninstalled by this task.
- Main PayMongo test registration and endpoint-specific signing secret, callback origin and signed delivery need operator verification.
- Controlled main-site test DI/CO purchases, exact balance/receipt evidence, duplicate signed replay and uncertain-result recovery remain unperformed.
- Historical paid sessions without permanent receipts and outstanding fork orders still need deliberate reconciliation. Do not regrant, backfill blindly or delete receipts.
- Production Linux image runtime/upload smoke testing and live account, mail, game-sync, moderation and mobile-browser checks remain outstanding.
- The earlier report's transaction labels/partial-history states, checkout request controls and concurrent audit-projection recommendations were not addressed; payment logic was explicitly outside this remediation.

No environment files, PlayFab balances/player records, Neon databases/receipts, PayMongo payments, Vercel configuration, checkout/webhook/fulfillment logic, Unity or CloudScript were changed. No commit or push was made. Existing local feature gates and remote settings were left untouched.
