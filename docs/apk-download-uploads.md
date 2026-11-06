# Direct APK upload and download

This feature is maintained in the Jemma website repository. It does not alter
Coins, Diamonds, payment webhooks, feedback, or staff authentication.

## Admin workflow

### Current installer: GitHub Releases (2026-11-06)

The existing `CivilCraft_10-29-26.apk` now uses the public GitHub release asset at
`Astra1127/CivilCraft`, tag `android-2026-10-29`. Players click Download on the
website and receive the APK directly; they do not need a GitHub account or visit
the release page. APK bytes bypass Vercel Blob and Vercel function bodies.

The reviewed binding in `src/lib/cms/github-apk.server.ts` matches only release
`1db44dc0-eea1-43a1-8aeb-a4109fbf13e3`, version `BETA 0.0.0.6`, build `7`, Android
code `13`, its original APK name/size, and its pre-cutover attachment. Future
attachment replacements (including equal-sized ones) do not reuse this binding.
The asset is 128,537,911 bytes, GitHub asset ID `715709073`, SHA-256
`86e57ece9dfcbed4763108f0d66f035c9060e31eb080e147cc186bfc9608025c`.

This source-controlled delivery binding avoids the suspended Blob-backed writer
lock. It does not bypass that lock, write PlayFab release records, change the
current release/version/notes, send subscriber emails, or delete the old Blob.
Both old GET download links and the newer preparation buttons resolve the same
asset. Public access still requires the release to be current; staff previews
retain their existing authentication and origin checks.

Preparation checks a four-byte ZIP prefix and exact range/size through bounded,
allowlisted GitHub redirects. Successful checks are coalesced and cached for at
most 60 seconds. Failures show an on-page Retry. Full-file hashes are checked at
publication, not by downloading 123 MiB on every click. GitHub asset IDs and hashes
are recorded for audit; never replace the asset under this tag. Publish a new tag
for the next installer, verify its size/hash and Android code, and update the
reviewed website binding before deployment. APK binaries belong in release
assets, never Git commits. This is not an automatic GitHub upload integration.

The admin shows GitHub hosting and disables Blob upload/cleanup for this bound
installer. Existing download counters remain historical; GitHub deliveries do not
read or write the suspended Blob counter. The legacy Blob upload workflow below
remains available for other builds and requires working Blob quota.

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

Only the current APK is public; draft previews require an authenticated staff
session. Public and admin download buttons POST to the corresponding
`/api/(admin/)releases/{id}/download-link` endpoint. The server prepares a private
Blob GET capability that expires after five minutes, then verifies a four-byte
range with the APK MIME type, exact Content-Range/length and ZIP signature. A
metadata-only HEAD is not used as evidence that storage can deliver the file.
Ignored ranges and provider JSON errors are cancelled before reading the body.

The browser validates the small link response before starting the direct Blob
attachment download. Errors remain on the page with Retry instead of being saved
as JSON files. Repeated clicks during preparation start one request. No full APK
is buffered by the website or browser JavaScript. The link response is private
and not cached; the underlying object stays private. The old GET redirect endpoint
is retained for compatible direct links.

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

## Download interruption investigated, 2026-11-06

The current public download returned HTTP 503 with a JSON error, while its HEAD
returned synthetic APK metadata. The previous anchor's unconditional `download`
attribute caused the error to be saved as a file. Vercel's team dashboard showed
Blob Data Transfer at 10.19 GB of the 10 GB Hobby allowance, with stored data only
about 130 MB. Download traffic and retained storage are separate limits; deleting
old files cannot reverse completed transfer usage. The provider's Hobby policy
blocks Blob access when an included limit is exceeded.

Download preparation and its explicit error UI prevent saving that JSON response.
They do not increase quota, change billing, replace the current release, or move
the APK to another host. A successful installed APK download must be verified
after provider access is restored. Reference:
https://vercel.com/docs/vercel-blob/usage-and-pricing#hobby
