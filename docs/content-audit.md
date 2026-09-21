# Manuscript content audit

Reference: [Civil Craft capstone manuscript](https://docs.google.com/document/d/1eo48USE5gDgYSU2JPixUz7Lo-E7tpcp9ltKqCQHhg5E/edit?tab=t.0), fetched through Google Drive on 2026-09-20 (provider modification date 2026-08-30). The supplied text identifies the project, scope, definitions and website Figures 19-33. The provided document was used directly; no separate local DOCX was assumed to be identical.

Priority: working website implementation, approved backend data, manuscript, existing copy. This is a source/render-path audit, not verification of the Unity executable or every administrator's saved content. No production content records are being changed.

## Audit before edits

| Existing page / surface | Already correct | Gap, conflict or placeholder | Content-only action |
| --- | --- | --- | --- |
| Home | Build/Test/Learn; contracts, budget, materials; four bridge types; Android download; existing regions match story-flow names | Mobile/basic scope could be clearer; repeated loops use different ordering; environmental simulation wording is broad | Refine existing hero/pillars and test copy; retain sections, imagery and layout |
| About | Aspiring engineer, contracts, construction/test loop, learning; Story Mode only; configurable story/team | No concise gameplay-physics limitation; concepts omit explicit dead/live loads, equilibrium and material stress; Almanac wording promises a broader record than supplied | Update existing paragraphs/cards; identify the four manuscript team roles without assigning names; add limitation in existing academic paragraph |
| Download | Current build and latest published post are separate; requirements from same release object; editable installation guide and FAQ | Game-information heading could identify current build; initial seed contains unverified prototype version/date/specifications | Clarify heading; remove only bundled prototype seed; keep saved releases, API, import flow, requirements source and download behavior |
| FAQ | Eight existing entries; current requirements link; installation, reset and shared-account answers supported | Introductory definition missing; progress answer implies all play always syncs | Reuse existing first entry for definition/scope; qualify signed-in sync; retain IDs/count and saved admin overrides |
| Gallery | Shared published image API; categories Gameplay/Bridges/Environments/Characters/UI; no release notes | No content gap requiring a change | Retain |
| Contact / player Messages / admin Messages | Shared contact values; hidden empty fields; private saved conversations and email | Legacy seed still contains unused sample inquiry; real inbox uses server messages | Remove only unused bundled sample; no contact or email code changes |
| Overview | Identity/snapshot/level/XP, actual score/counts, story progress, achievements and Recent builds from AlmanacProgress | Actual completed-bridge reader already exists; absent game records yield empty state | Retain; do not invent a new bridge-history system |
| Dashboard Almanac | Four bridge categories; concepts/materials gated by recorded discoveries and completions | Truss explanation overstates ideal behavior; suspension claims exclusivity; load explanation lacks dead/live terminology | Refine existing definitions only; preserve IDs, discovery gates and records |
| Player/admin Leaderboard | All-Time uses TotalScore; no fake scores; Weekly deliberately returns empty | Weekly empty state implies functional recording; Monthly not implemented | State Weekly unavailable and point to All-Time; keep existing filters/API |
| Achievements | AchievementProgress supplied by game, including unlocked/progress fields | Availability depends on game records; no basis for new achievements | Retain |
| Player Profile | Backend identity, character, career/equipment; missing-data handling | No new data warranted | Retain mobile snapshot and layout unchanged |
| Player Transactions | Backend purchase/reward history and equipment status | No reason for invented purchases | Retain |
| Player Settings | Email preference is persisted; recovery independent | Public profile and Compact dashboard are local component state only; password wording overlooks website recovery | Mark controls as nonfunctional previews in existing descriptions; clarify recovery wording; no implementation changes |
| Login / Signup / Recovery / Reset | Same game identity; shared signup, email verification and recovery; separate staff identity | Signup introductory wording can name Civil Craft explicitly | Text only in signup; preserve forms, validation, login and recovery |
| Terms | Existing educational/nonprofessional disclaimer | Missing adjusted material properties and incomplete real-world conditions | Refine existing Educational use paragraph |
| Privacy | Shared player identity, backend gameplay records and stored inquiries accurately described | No change required by manuscript | Retain |
| Admin Overview | Real analytics separate from local legacy release panel | Stale paragraph incorrectly says gallery/releases/contact settings are all browser-local | Correct explanation of legacy panel and shared systems; no fetching changes |
| Admin Players, Game & Download, Gallery, FAQ, Transactions, Bug Reports, Settings, Integrations, Login | Existing controls/data access retained; transaction ledger unavailable instead of fabricated | FAQ/About/installation settings still legacy browser-local; Almanac editor is not implemented | Report limitations; preserve modules and storage |
| Existing redirect routes: community, community/gallery, community/news, updates, almanac, leaderboards, admin/news, admin/almanac, admin/integration | Existing bookmark/retired-page redirects | Manuscript diagrams do not reflect every current redirect | Preserve all routes, targets and navigation |
| Root/error states, header, footer, shared shells | Existing navigation, branded errors and shared contact footer | No manuscript content requires redesign | Retain |

## Boundaries and discrepancies

- Multiplayer is described in the manuscript, but this website repository cannot prove current Unity multiplayer availability. Existing visible pages advertise Story Mode only. No multiplayer or coming-soon promise is added.
- Weekly is an existing empty integration branch, not a weekly statistic. Monthly has no implementation. Implementing either requires a separate approved task.
- Public-profile visibility and compact layout controls do not persist or apply their advertised preferences. Only their descriptions change; implementing them needs approval.
- Recent builds already reads actual AlmanacProgress completion records. Whether the current game sends them for every player was not established; absent records remain absent.
- Almanac has existing shear/support/stability concepts as well as bending/tension/compression/load distribution/failure. Retain those IDs. No dedicated Load Transfer or Moving Load entries were found; do not invent game IDs or completion data. Explain dead/live loads within the existing Load entry and equilibrium in the existing Stability entry.
- The manuscript describes admin educational-reference management; the current admin/almanac route redirects to Admin and content definitions are code-owned. No editor is introduced.
- Existing Arcadia/Professor Bhan lore is not established by the fetched manuscript text. Preserve the configured story and existing project naming rather than inventing replacements or overwriting CMS data; final lore approval belongs to the project owner.
- Team names appear on the manuscript title page but name-to-role assignments are not established. Do not infer assignments or publish personal details. Hidden placeholder team/academic fields remain hidden; existing configured values remain intact.
- FAQ, About, installation steps, metadata and legacy release fallback use the pre-existing browser-local CMS. Shared contact settings, release posts/current selection and Gallery use their existing server systems. Migrating remaining local content requires separate approval.
- Manuscript development-machine specifications are not Android player requirements. Remove the unverified bundled prototype, not any persisted administrator release. Old browser copies of that seed may still exist; review these in Game & Download rather than silently deleting stored records.
- No academic research questions, literature, methods, costs, diagrams, test tables, endorsements, invented effectiveness figures or thesis citations are added to the product website.

## Changes delivered

No page, route, navigation item, feature, backend field or database record was added. No backend/API, authentication, password recovery, APK/download, release-post, Gallery storage, contact/messages/email or PlayFab persistence code changed. No production records were written. Components, icons, CSS classes, navigation targets, mobile hamburger placement and snapshot dimensions are unchanged.

The default release list is now empty rather than presenting an invented current prototype. This changes only the initial content for an unconfigured browser/site: the existing no-build state renders until an administrator supplies a release. Existing browser-saved records and shared current-build selection are untouched. Existing FAQ overrides likewise take precedence over the revised defaults. There are still eight default FAQ entries; no new CMS records or IDs were introduced.

New meaning added inside existing text slots: Android educational simulation scope; retry/improvement learning loop; dead/live loads, equilibrium and material stress; the four manuscript team roles; adjusted material properties and simulation limits. Removed/reworded content: unused sample inquiry, unverified prototype version/date/device specs, absolute truss/suspension claims, generic plural game-mode wording, nonfunctional setting promises, weekly availability implication, and stale admin storage claims. Repeated Home/About explanations remain brief and serve their existing page sections; no duplicate system was introduced.

## Files changed

- `src/routes/index.tsx`: hero, Build/Test/Learn pillars and test-loop copy.
- `src/routes/about.tsx`: scope, metadata, concepts, learning, team roles and educational disclaimer.
- `src/routes/download.tsx`: existing information panel renamed Current build.
- `src/routes/signup.tsx`: explicit Civil Craft account wording.
- `src/routes/dashboard.settings.tsx`: accurate implemented/preview preference descriptions and recovery wording.
- `src/routes/admin.index.tsx`: accurate local-versus-shared storage explanation.
- `src/routes/terms.tsx`: educational simulation limitations.
- `src/components/site/LeaderboardView.tsx`: truthful Weekly unavailable state.
- `src/lib/almanac/content.ts`: introductory explanations, preserving concept/bridge IDs and discovery behavior.
- `src/lib/cms/seed.ts`: revised existing FAQ defaults and removal of bundled sample message/prototype.
- `docs/content-audit.md`: this audit, discrepancies and validation report.

## Validation results

- TypeScript: `node node_modules/typescript/bin/tsc --noEmit` passed.
- ESLint on all ten changed source files: passed with no errors or warnings. Unrelated repository lint was not repaired.
- All existing tests: `node --test tests/*.test.ts tests/*.test.mjs` passed 121/121. Coverage includes Almanac discoveries, real-data/empty-state handling, release editing/public Download rendering, authentication/recovery, messages/email, shared contact settings, Gallery and admin permissions.
- Production build: `npm run build` passed. Existing Vite path-plugin/performance advisories remain nonblocking.
- `git diff --check`: passed.
- Client secret scan: 124 JavaScript bundles, five locally configured secret values plus server-only SMTP/PlayFab markers checked; zero matches.
- AST comparison against HEAD: all eight edited TSX files retain the same JSX element structure, CSS classes, styles, links, IDs, image sources and dimensions (line endings normalized). No route, navbar, dashboard shell or character-preview file changed. No new links were introduced.
- Source scan: no current multiplayer or coming-soon claims added; no second device-requirements list; no new fake achievements, purchases, screenshots or completion records. Saved CMS values were not overwritten.
- Browser visual verification at 320-430 px was not available: the browser tool returned no connected browsers. Unchanged layout code is not proof of identical text wrapping. Live account views, existing browser-local CMS copies and Unity gameplay availability were not manually verified.

Deployment review: open Home/About/Terms at 320, 375 and 430 px; check wrapping, right-side hamburger and horizontal overflow. Confirm Download still displays the configured current build, separate latest update and admin-defined requirements. In a fresh browser with no configured build, confirm the honest no-build state. Review any older saved prototype records and FAQ overrides in the existing admin UI. Sign in to check snapshot size, real Almanac progress, Weekly unavailable copy and preview-setting descriptions. None of these checks requires a new feature or storage migration.
