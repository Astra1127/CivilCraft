# Contact settings and private conversations

The former settings flow saved `SiteSettings` in the admin browser's `civilcraft.cms.v3` localStorage. Public pages read their own browser's copy. Those copies could never synchronize across users.

Contact details now use shared PlayFab Title Internal Data through server API handlers. Empty fields are hidden; public pages do not fall back to browser-local contact details. Save the desired values once in Admin Settings. Existing browser-local contact values are not automatically uploaded. The shared store is initially empty.

## APIs and storage

| API | Access | Purpose |
| --- | --- | --- |
| `GET /api/contact-settings` | Public | Shared contact details and social links |
| `GET/POST /api/admin/contact-settings` | Existing staff cookie; same-origin writes | Read/save contact settings |
| `POST /api/contact` | Guest or existing player bearer ticket | Save initial message; derive ownership from verified ticket |
| `GET/POST /api/admin/messages` | Existing staff cookie; same-origin writes | Inbox, status, replies, deletion |
| `GET /api/player/messages` | Verified PlayFab session ticket | Own conversations only; optional `?id=` also enforces ownership |
| `POST /api/player/messages` | Verified PlayFab session ticket; same-origin | Reply to an owned conversation |

All authoritative data is in PlayFab Title Internal Data, under `civilcraft.website.v1.`:

- `contact-settings`: one shared settings object.
- `messages.<id>`: original submission and immutable `ownerId`, or null for guests.
- `message-replies.<messageId>.<replyId>`: independent reply records, preventing concurrent replies from replacing each other.
- `message-state.<id>.status` and `.deleted`: status and deletion markers.
- `message-notifications.<eventId>`: email delivery result.

Players cannot choose ownership or authorship, change status, or read another player's messages. Matching a guest's email does not grant access to the guest submission. Legacy messages without an owner remain guest submissions. Replies are plain text. Public endpoints never return conversations. Private responses use no-store caching.

## Email configuration

Contact notifications now support full HTML and plain-text copies through direct server-side SMTP using the SAME provider already configured in PlayFab's SMTP add-on. Nodemailer is an SMTP client, not another email provider. Recovery, verification, authentication and release notification code is unchanged.

The old sender passed only a PlayFab recipient ID and template ID, so message text never reached the email. [PlayFab SendEmailFromTemplate](https://learn.microsoft.com/en-us/rest/api/playfab/server/account-management/send-email-from-template?view=playfab-rest) has no per-request subject/body or template-variable parameter. CustomTags are request metadata, not body substitutions. Do not store temporary message text in player profile fields to populate templates.

Configure these server-only Vercel variables with your existing SMTP provider's settings (never VITE_):

- SMTP_HOST: provider hostname.
- SMTP_PORT: 465 for implicit TLS, or 587 (default) with required STARTTLS. Certificate validation remains enabled.
- SMTP_USER and SMTP_PASSWORD: existing provider credentials.
- SMTP_FROM: bare provider-approved sender email address.

Reuse ADMIN_AUTH_ORIGIN as the trusted HTTPS website origin for buttons. Reuse PLAYFAB_CONTACT_ADMIN_PLAYER_ID for the admin mailbox's PlayFab account. SMTP recipients are resolved with server-side GetPlayerProfile from that account or the authenticated conversation owner's account, never from the form's email field. Missing profile contact emails fail notification without affecting storage.

All SMTP variables absent/empty preserves existing generic PLAYFAB_CONTACT_ADMIN_EMAIL_TEMPLATE_ID and PLAYFAB_CONTACT_REPLY_EMAIL_TEMPLATE_ID notifications during rollout. To enable readable copies, configure SMTP and redeploy. Partial/invalid SMTP configuration reports failure; it does not silently send a generic email. No automatic retry or template fallback after SMTP failure avoids duplicate notifications on ambiguous delivery outcomes.

Admin notifications contain submitted name, email, subject, full message (or latest player reply), and Open Admin Messages linking to /admin/messages. Player notifications contain conversation subject, the full admin reply, and View Conversation linking to /dashboard/messages. All user text is HTML-escaped; plain-text alternatives preserve the original content. Subject headers are fixed, links use trusted configuration, and no user input is used as From or Reply-To. Emails instruct recipients to reply on the website; email replies are not ingested. Guests still have no public conversation or automatic player reply notification.

PlayFab Title Internal Data remains the source of truth. Every message/reply is saved before profile lookup or sending. Missing configuration or provider failure cannot undo the save. Delivery status remains separate. Sent means provider acceptance, not confirmed inbox delivery. No email secrets or bodies are logged or returned to the browser.

## Verification and deployment checklist

Validation for the readable-copy change: 68 distinct tests passed across contact conversations, contact persistence/UI, admin authentication, password reset, contact-email synchronization, email directory/worker, and release-post suites. Type check and production build passed. Changed-file lint passed; repository lint still reports 29 existing formatting errors and 13 warnings in unrelated files. The client-bundle scan checked 124 JavaScript files against five configured secret values and SMTP/server-only identifiers, with no matches. Live SMTP/inbox delivery has not been verified: local contact templates are configured, but direct SMTP credentials are absent.

Automated conversation tests mock PlayFab and SMTP transport. They assert that an authenticated player's "I cannot access my account" appears in both admin email bodies, and "We checked your account, please try signing in again." appears in both player email bodies. They also cover exact-content persistence before sending, account-based recipients despite a different form email, follow-up player replies, HTML injection, unsafe link origins, SMTP failures, legacy template fallback, cross-user access denial and guest isolation. Mocked acceptance does not prove live inbox delivery.

1. Configure SMTP variables from the existing PlayFab SMTP provider in Vercel; confirm ADMIN_AUTH_ORIGIN is the deployed HTTPS origin and redeploy.
2. Sign in as player A and submit "I cannot access my account". Check Admin Messages after refresh and the admin inbox for name, email, subject, full text, and working Open Admin Messages button.
3. Reply in Admin Messages: "We checked your account, please try signing in again." Confirm the player inbox contains the reply and View Conversation opens Dashboard Messages (sign in if necessary).
4. Refresh player A's conversation and reply on the website; confirm admin receives that text. Player B must not see or open player A's conversation. Guest submissions remain admin-only.
5. In staging, temporarily use invalid SMTP credentials; submit/reply and refresh to confirm both records remain saved while notification status reports failed. Restore credentials.

## Files changed for readable email copies

- `src/lib/email/contact-smtp.server.ts`: escaped HTML/plain text, account recipient lookup and SMTP transport.
- `src/lib/email/contact-notifications.server.ts`: rich SMTP delivery with legacy template fallback when unconfigured.
- `src/lib/cms/messages.server.ts`: passes saved event content to notifications.
- `tests/contact-conversations.test.ts`: content, escaping, transport and failure regressions.
- `.env.example`, `docs/contact-system.md`: configuration and deployment checklist.
- `package.json`, `package-lock.json`: Nodemailer and TypeScript definitions.

## Files for the preceding contact extension

- `src/lib/cms/contact-settings-types.ts`, `contact-settings.server.ts`, `contact-settings.ts`: schema, shared API, query hook.
- `src/lib/cms/messages.server.ts`, `messages.ts`, `types.ts`: ownership, conversation persistence, queries and types.
- `src/lib/cms/store.ts`: excludes contact details from legacy local persistence.
- `src/lib/email/contact-notifications.server.ts`: existing-provider notifications after persistence.
- `src/server.ts`, `src/lib/playfab/admin-api.server.ts`: API routing behind existing authorization gates.
- `src/routes/admin.settings.tsx`, `contact.tsx`, `privacy.tsx`, `src/components/site/SiteFooter.tsx`: shared contact fields, with existing styling.
- `src/routes/admin.messages.tsx`, `dashboard.messages.tsx`, `dashboard.tsx`, `src/components/common/MessageConversation.tsx`: private conversation interfaces and navigation.
- `src/routeTree.gen.ts`: generated dashboard message route.
- `.env.example`: notification configuration names only.
- `tests/contact-conversations.test.ts`, `contact-settings-store.test.mjs`, `contact-messages.test.ts`, `contact-messages-ui.test.mjs`: regression/security tests.

The separate release-post changes were implemented for the preceding What's New request. This contact extension does not alter authentication or APK download logic.
