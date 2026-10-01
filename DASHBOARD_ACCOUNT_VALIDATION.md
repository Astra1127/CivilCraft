# Dashboard and account changes

## Website-only synchronization follow-up

See [the programmer handoff](docs/game-dashboard-sync-handoff.md) and [sanitized request example](docs/sync-dashboard-v1.example.json) for the exact Revision 5 requirements, unresolved schemas, recommended timing/error handling and proposed backend coordination. No Unity files or CloudScript were changed.

The website now additionally accepts the inspected `CosmeticLoadoutData` shape if the programmer publishes it, preserving multiple accessories through parsing, inventory data and profile rendering. It renders only the game's five categories for this shape. This is compatibility support, not evidence of an existing publisher. Missing snapshots explicitly show “Awaiting game sync”; profile/overview placeholders for unknown levels, XP, scores, starting region and pre-sync progress were removed.

The sanitized example was replayed locally against the previously downloaded Revision 5 source with mocked server methods: accepted, with the expected two writes; all 15 missing-required-field cases rejected before writes. No API mutation was made. Progression derivation, nested progression schemas, actual publishing DTO, retry-safe aggregation and web thumbnail delivery still need programmer confirmation.

## Implemented

- Profile no longer displays Current Region. The stored data and other readers remain intact.
- Admin directory and player details distinguish last-login Activity from Account Status. “Not banned” maps only to the backend `active` state; unavailable ban data remains “Not available.” Recently active means age <= 7 days; inactive means age > 30 days or never logged in. Intermediate activity is labeled separately. Malformed/future timestamps are unknown. Export rows use the same snapshot time as filtering.
- Coin Shop is `/dashboard/shop`, under the existing player-only dashboard guard and sidebar. `/shop` redirects there. Checkout callbacks use `/dashboard/payment/success` and `/dashboard/payment/cancel`; legacy callbacks redirect and retain `order_id`. Existing server-side TEST checkout, verification, packages and fulfillment remain in place.
- Equipment distinguishes missing, unsupported, successfully empty and populated snapshots. Unknown slot schemas are not silently presented as empty. Real published item IDs are enriched by exact `ItemId` matches in the default PlayFab catalog when available. Names/images from the published snapshot remain usable; unresolved IDs stay visible without invented equipment. Optional catalog outages do not erase a published snapshot. Profile UserData failures now show an error instead of claiming no sync.
- Settings separates immutable login username, login email, display name, contact email and password recovery. Contact-email changes reauthenticate using the current account's backend username/email and supplied password, check the returned PlayFab ID and reject a changed browser session before writing. Passwords are cleared from form state after submission and never persisted. Contact state is refetched; the login identity is not rewritten. Existing session-expiration and admin isolation remain intact.

## Read-only live findings — 2026-10-01

Using the website's configured title `17FA03`:

- `Admin/GetCloudScriptRevision` returned **Revision 5, IsPublished=true**, including `syncDashboardV1`.
- The handler requires schemaVersion 1 and `equippedCosmetics` as a JSON object string. It writes that string to private UserData `EquippedCosmetics` and writes `CharacterSyncedAt`. It does **not** validate or define the object's slot/item keys.
- `Server/GetUserData` for the user-provided ID **4515CB33C3D5E277**, requesting `EquippedCosmetics`, `CharacterSyncedAt` and `CharacterName`, returned `DataVersion: 0` and empty `Data`. No successful dashboard projection is stored for this player at the time of the check. This is not evidence of an empty outfit.
- The default `Server/GetCatalogItems` response was empty.
- Reinspection of the user-confirmed Unity folder `../CivilCraft_Apk/Civil-Craft` found an updated wardrobe implementation in `Assets/Script/Player/PlayerSave/CosmeticDefinition.cs`: `cosmeticLoadout.accessoryIDs` (multiple items), legacy `accessoriesID`, `hairID`, `shirtID`, `pantsID`, and `shoesID`, with per-category colors. The old `equippedHatID` is migrated into accessories. Headwear and safety vests are accessories, and this source has no separate gloves category. `Assets/BridgeBuilder/Data/Cosmetics/*.asset` supplies permanent IDs, display names and some sprite references; several items have no icon. `Assets/Scenes/Main Menu.unity` configures title `17FA03`. Searches across Assets, Packages and ProjectSettings still found no `syncDashboardV1` call or `EquippedCosmetics` publisher. `CloudSaveManager.cs` uploads the save through PlayFab entity files, which is distinct from publishing dashboard UserData. No speculative dashboard wire schema was inferred from the save model, and the encrypted save was not read or modified.

**Still needed for actual equipment verification:** the current Unity dashboard-publisher source (where `ExecuteCloudScript` calls `syncDashboardV1`), its dashboard equipment serializer, or a successfully published `EquippedCosmetics` sample. Local item metadata is now located, but Unity sprite references still need web-accessible assets and the multiple-accessory payload needs a confirmed publishing contract. The website's existing slot-map and legacy array forms remain supported with validation; their correspondence to the current game cannot yet be claimed. The supplied ID is verified against website storage, but the active Unity login ID still needs comparison.

## PlayFab platform limits and email verification

- The [Client Account Management API](https://learn.microsoft.com/en-us/rest/api/playfab/client/account-management?view=playfab-rest) does not offer renaming an existing login username or updating its existing login email. `AddUsernamePassword` adds credentials to an anonymous account; it is not an account rename.
- [AddOrUpdateContactEmail](https://learn.microsoft.com/en-us/rest/api/playfab/client/account-management/add-or-update-contact-email?view=playfab-rest) changes the contact address, not login credentials. Settings reads `ContactEmailAddresses.VerificationStatus` and does not infer verification from a successful update.
- [Contact-email verification](https://learn.microsoft.com/en-us/gaming/playfab/live-service-management/game-configuration/title-communications/emails/using-a-rule-to-verify-a-contact-email-address) requires a title rule for `com.playfab.player_updated_contact_email` and a verification email template. Rule/template delivery was not verified or configured during this task. Check these in Game Manager before relying on verification delivery; the UI explicitly explains this dependency.
- Password changes use the existing recovery-email route and reset-token flow, not a local password edit. The configured recovery template determines delivery to the contact address; the login email is used for account lookup. Email delivery and a real password reset remain pending, and no test emails were sent during development.

## Manual live verification

1. Log in as the same player on Unity and the website. Compare Unity's successful login `PlayFabId` to the profile ID and confirm title `17FA03` in both. Do not log tickets or passwords.
2. Equip a known cosmetic in Unity, invoke the game's normal dashboard synchronization, and inspect the callback for `accepted: true`, schemaVersion 1 and no CloudScript error. Do not invoke website writes to manufacture a snapshot.
3. In PlayFab Game Manager, select title `17FA03`, Players, ID `4515CB33C3D5E277`, Player Data/User Data. Confirm `CharacterSyncedAt` advances and inspect `EquippedCosmetics`. Compare every published ID with the game's equipment serializer and catalog metadata. Refresh the website profile: missing sync should disappear only once an actual snapshot exists; empty equipment should appear only for an explicit valid empty snapshot. If schema is unsupported, provide that payload/current publisher for an exact mapping update.
4. Open `/dashboard/shop` and legacy `/shop` while logged out and with only an admin session: both must require player Login. After player login, confirm desktop/mobile dashboard navigation remains visible. Start a PayMongo TEST purchase and cancel, then complete a second TEST purchase. Both returns must retain `order_id` inside the dashboard; fulfilled orders and balance must agree with PlayFab. Revisit the callback to confirm fulfillment is not duplicated. Expire the player session during checkout and confirm Login preserves the full callback destination.
5. In admin Players, compare recent, intermediate, never-login and >30-day accounts with their filters. Confirm a non-banned inactive account reads “Inactive” and “Not banned,” and a banned recent account reads “Recently active” and “Banned.” Unknown ban data must not be labeled not banned. Compare to PlayFab's actual ban state.
6. In Settings, verify username, login email and contact email independently. Try an incorrect current password: no contact write should occur. Save a new contact email with the correct password, refresh backend status, follow the verification email and refresh until PlayFab reports Confirmed. Verify original login credentials still work in Unity and website. Use password-reset email, complete the existing token flow, then log into both with the new password. Check network/server failures do not clear the player session and logout in a second tab blocks an in-flight update from restoring it.

## Changed files

- Profile/equipment: `src/routes/dashboard.profile.tsx`, `src/lib/playfab/player.ts`, `src/lib/playfab/equipment.ts`, `src/lib/playfab/types.ts`.
- Activity/status: `src/routes/admin.players.tsx`, `src/components/admin/PlayerRecordModal.tsx`, `src/lib/playfab/directory-filters.ts`.
- Account settings: `src/routes/dashboard.settings.tsx`, `src/components/dashboard/AccountSettings.tsx`, `src/lib/playfab/account-settings.ts`.
- Shop/callback routing: `src/routes/dashboard.tsx`, `src/routes/dashboard.shop.tsx`, `src/routes/shop.tsx`, `src/routes/dashboard.payment.success.tsx`, `src/routes/dashboard.payment.cancel.tsx`, `src/routes/payment.success.tsx`, `src/routes/payment.cancel.tsx`, `src/lib/payments/paymongo.server.ts`, generated `src/routeTree.gen.ts`.
- Tests: `tests/dashboard-account-features.test.mjs`, `tests/paymongo.test.ts`, `tests/player-session.test.mjs`, `tests/shop-navigation-ui.test.mjs`.

## Automated validation results

- `npx tsc --noEmit`: passed.
- Relevant account, cosmetics/profile, activity/directory, dashboard routing, session, admin authentication, payment/fulfillment, contact email and password-reset suites, including the website-only sync follow-up: **136 passed, 0 failed, 0 skipped**.
- `npm run build`: passed. Nitro dependency tracing required the approved execution outside the Windows filesystem sandbox.
- `node --test tests/client-bundle-secrets.test.mjs`: passed against the final production client bundle; no configured server credentials found.
- `git diff --check`: passed.

Live end-to-end equipment publication, TEST checkout callbacks and email/password delivery still require the manual steps above. Automated UI tests use rendered React components and mocked APIs, not authenticated browser screenshots.
