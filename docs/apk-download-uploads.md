# Direct APK upload and download

This feature is maintained in the Jemma website repository. It does not alter
Coins, Diamonds, payment webhooks, feedback, or staff authentication.

## Admin workflow

1. Sign in to the main website's staff dashboard and open **Game & Download**.
2. Create a **draft build**, entering its real version and build number.
3. Drop one APK onto that build's upload control, or use **Choose APK**.
4. Select **Upload APK**. Keep the page open until verification finishes.
5. Use **Preview APK download** to test the attached file without publishing it.
6. Only after testing, use **Make current** to change the installer offered to players.

Uploading to a draft does not change the current player download. Release-note
publication is independent of which installer is current. Existing external
download links remain supported; uploaded APK metadata cannot be edited by the
browser. A failed upload or verification keeps the previous attachment intact.

## Deployment configuration

Use the existing connected **private Vercel Blob store**. The server needs
`BLOB_STORE_ID` and `BLOB_WEBHOOK_PUBLIC_KEY`; Vercel supplies its rotating
`VERCEL_OIDC_TOKEN`. Do not expose credentials as `VITE_` variables. The existing
staff-session configuration and PlayFab title credentials are also required.
No new APK-specific callback or PayMongo webhook is needed.

The browser uploads directly to Blob using a short-lived, path-scoped capability.
APK bytes do not pass through a Vercel function request body. The maximum selected
file size is **512 MiB**. Check the store's available quota and bandwidth before
uploading or publishing large builds; this is not unlimited free hosting.

The server checks the selected size, MIME type, object path, ZIP structure,
Android manifest header, and executable header through bounded range reads.
These checks are **not** antivirus scanning, signing verification, or an Android
installation test. Upload only trusted release builds and test installation on
a device separately.

Players use a stable website download endpoint. Only the current APK is public;
draft previews require an authenticated staff session. The endpoint redirects
to a private Blob GET capability that expires after five minutes and requests an
attachment download. The response is not cached. The underlying object remains
private rather than exposing a permanent public storage URL.

## Operational notes

- APK binaries and the local `Apk/` folder are Git-ignored. Do not commit builds,
  `.env` files, staff credentials, or signed URLs.
- Old attachments and interrupted upload objects are not deleted automatically.
  Review storage usage before doing a separately approved cleanup.
- Release records remain in PlayFab Title Internal Data. Reads before saving
  preserve intervening edits, but PlayFab does not provide compare-and-swap for
  this API. Avoid simultaneous edits of the same build from multiple sessions.
- Do not edit release records through the old fork's admin page. Its older
  schema does not understand hosted-APK metadata. Use the Jemma/main admin page.

## Verification

Run `npm run test:apk`, the release/auth/public-content regression tests,
`npx tsc --noEmit`, and `npm run build`. After deployment, upload a real APK to
a draft, preview its download, and compare its SHA-256 hash with the local file.
Confirm that the current public installer has not changed before publishing.
