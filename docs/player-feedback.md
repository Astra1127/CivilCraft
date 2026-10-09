# Player game feedback

Feedback creation lives in Player Dashboard > Messages and uses the existing PlayFab Title Internal Data message, reply, status, and notification records. Historical messages, including the old Feedback category, remain readable. Public Contact keeps General, Technical Support, Partnership, and Educational categories; its server rejects old/new game feedback and Bug Report categories.

## Eligibility

`hasAcceptedCivilCraftRun` in `src/lib/cms/feedback-eligibility.server.ts` queries `Server/GetPlayerStatistics` for all 18 names derived from the nine-contract `BRIDGE_STATISTICS` mapping. It reuses `decodeBridgeScore` to validate integers, encoded bounds 1,146,482,647 through 2,147,483,647, and the mode-specific decoded cost/stress constraints. It queries actual stored statistics directly, never AroundUser's synthetic unranked entries. One valid statistic is sufficient; zero, unknown names, and invalid encodings do not qualify.

`GET /api/player/messages?action=eligibility` returns only an eligibility boolean. It is separate from message history so progress verification failures cannot prevent history access. `POST /api/player/messages` with action `feedback` validates the existing bearer session ticket, derives player identity server-side, checks strict category/subject/message input, and independently reads eligibility on every creation attempt. Browser-supplied identity or eligibility fields are rejected. Sender display name/contact email come from PlayFab, with an Engineer/player-ID label and empty email when unavailable. Creation retains the existing UUID, owner, date, New status, notification, and conversation model.

Missing accepted records yield 403 and unlock guidance. Statistics service failures/malformed top-level responses yield 503 and a retry message. Authentication, same-origin checks, body limits, ownership, staff authorization, existing reply access, and moderation remain intact. Successful save is independent of email delivery success.

## Rate limiting

New feedback attempts are limited to five per authenticated player per 15 minutes in each warm server process, including invalid input and denied eligibility attempts. Expired entries are removed; a 10,000-account memory cap fails closed for new accounts when full. Replies/history/general contact are unaffected. This is best-effort: restarts reset the limiter and separate server instances do not share counts. Durable distributed rate limiting would require a shared atomic store; this implementation is not a global abuse-prevention guarantee.

## Accepted limitations

- Eligibility is based on an accepted PlayFab run statistic, not independently verified gameplay or contract completion.
- Existing run measurements are client-reported. A malicious authenticated client may fabricate data via the existing `submitBridgeRunV1` CloudScript.
- Players who played without submitting an accepted qualifying record remain ineligible.
- Eligibility uses current stored records. If statistics are deleted or reset in future, previously eligible players may no longer qualify.
- Stronger completion verification requires future Unity/backend changes. This website feature is not tamper-proof.

No Unity, CloudScript, statistic definitions, scoring, player saves, progression, authentication behavior, payments, portraits, or dashboard sync were changed. Automated tests use mocked services and do not modify live PlayFab records.

## Changed files and validation

- `src/lib/cms/feedback-eligibility.server.ts`: accepted-record check and rate limit.
- `src/lib/cms/message-types.ts`, `messages.server.ts`, `messages.ts`: validation, history-compatible storage parsing, API creation/eligibility, and client helpers.
- `src/components/dashboard/FeedbackForm.tsx`, `src/routes/dashboard.messages.tsx`: form, unlock/download/retry states, success notification, and conversation refresh.
- `src/routes/contact.tsx`: public categories and copy.
- `src/routes/admin.messages.tsx`: feedback description and sender player ID; existing categories, dates, replies, and statuses reused.
- `tests/player-feedback.test.ts`, `tests/player-feedback-ui.test.mjs`, `tests/contact-messages-ui.test.mjs`: new API/UI coverage and updated public-contact harness.
- `docs/player-feedback.md`: contract, security, and limitations.

Validation: `npx tsc --noEmit`, changed-source ESLint, `git diff --check`, and `npm run build` passed. The first sandbox build failed on Nitro dependency-tracing filesystem permissions; the approved build outside the sandbox passed. 88 API/conversation/contact/codec/admin/session tests and three feedback UI tests passed, followed by the production client-secret scan (one passing test, no skips). No live account submission or manual authenticated browser session was tested.
