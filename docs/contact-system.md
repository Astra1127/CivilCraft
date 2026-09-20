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

The existing PlayFab SMTP add-on and `emailDelivery.send` are reused. No new provider or SMTP client is added. Configure these server-only Vercel environment variables:

- `PLAYFAB_CONTACT_ADMIN_PLAYER_ID`: an existing PlayFab account whose contact email is the admin notification mailbox.
- `PLAYFAB_CONTACT_ADMIN_EMAIL_TEMPLATE_ID`: generic “new contact message/reply” notification, linking to `/admin/messages`.
- `PLAYFAB_CONTACT_REPLY_EMAIL_TEMPLATE_ID`: generic “the team replied” notification, linking to `/dashboard/messages`.

Existing `PLAYFAB_SECRET_KEY`, `VITE_PLAYFAB_TITLE_ID`, and admin authentication variables remain in use. The title ID is public; the secret key and all email configuration stay server-side. SMTP credentials remain in PlayFab's existing add-on.

PlayFab's SendEmailFromTemplate delivers to an account's configured contact email, not an arbitrary address supplied in a form. Player notifications therefore target the verified conversation owner. Guests have no player thread or automated reply email; staff can use the existing Reply by email action for guests. Do not use the recovery template for contact notifications.

Persistence happens before sending email. Missing configuration or delivery failure returns a successful save with `not_configured` or `failed` notification status. Admin conversation views display that status. There is no automatic retry of ambiguous provider failures, avoiding unintended duplicate emails. A `sent` result means provider acceptance, not proof of inbox delivery.

## Verification

Automated tests cover shared settings across independent requests, stripping contact fields from legacy local persistence, ticket ownership, cross-user access denial, guest isolation, admin/player replies, status refresh, concurrent replies, deletion, and both successful and failed email provider responses. The full email flow is tested with mocked PlayFab transport, not live inbox delivery.

Final checks: TypeScript and production build passed. All changed source/test files passed lint. The selected regression/security suite plus the local-store regression passed 57 tests in total. Full-repository `npm run lint` reported 29 existing formatting errors and 13 warnings outside this work. The secret scan found none of the five configured server-only credential values in 124 public JavaScript bundles. `git diff --check` passed.

A live read-only check returned identical contact settings for two independent public requests. The shared store had no configured contact fields at the time of verification. Browser click-through testing was unavailable because no browser was connected. Live contact-email delivery requires the three environment variables above, which were absent from the local environment.

Manual check after configuration: save contact details in Admin Settings; open Contact in a separate browser; submit while signed in as player A; reply from Admin Messages; refresh player A's Dashboard → Messages; reply back; verify admin status updates and both notification mailboxes. Player B must not see or open player A's conversation. A guest submission must remain admin-only.

## Files for this contact extension

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
