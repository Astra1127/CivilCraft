# Private player messages

Admin → Players → open a player → Moderation → Private game messages.
Send a plain-text title and body, inspect the saved list, or delete with confirmation.
The target is the opened classic PlayFab player ID, not the display name or Entity ID.

Storage uses individual `civilcraft.private-message.<uuid>` keys in that player's
PlayFab **Internal Data**, not public Title Data or the public release-note cache.
The existing administrator authorization and same-origin POST checks protect send/delete.
`GET /api/player/messages` authenticates a PlayFab session ticket in the Authorization
header and derives the recipient from that ticket. It does not accept a recipient override.
Guests cannot read messages; administrators can manage them through the privileged route.

The updated game shows the inbox above public notes in the Main Menu Updates panel.
It refreshes on open, Retry, return to the foreground, account/session changes, and
every 30 seconds while open. Closing the panel, signing out, or changing accounts clears
private content. Private messages are memory-only and do not enter the public disk cache.
Deletion takes effect on the next successful refresh; it cannot recall content already read.
No rewards, wallet writes, save changes, broadcast delivery or push notifications are involved.

## Rollout and acceptance

Deploy the website backend first, then build/install the updated APK. Existing APKs do not
have the private inbox. No database migration or production messages are required for deployment.

1. Send a test message to account A; A sees it in Updates, B and guests do not.
2. Switch A → B with Updates open; A's message must disappear immediately.
3. Delete A's message and refresh Updates; it must disappear while public release notes remain.
4. Disconnect: show unavailable, never another player's or disk-cached private inbox.
5. Reconnect and Retry; recover the current recipient's list.
6. Test long text, Unicode and literal markup; markup must not execute or format game text.

Automated checks: `npm run test:admin`; game project:
`dotnet run --project Tests/MainMenuUpdates/MainMenuUpdates.csproj`.
The game harness uses engine/network doubles; it does not replace Unity/Android acceptance.
