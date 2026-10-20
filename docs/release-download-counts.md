# APK download counts

Admin → Game & Download now shows **Downloads** for the current hosted build and **Total downloads** across tracked builds, including builds that have since been removed. Counts refresh every minute while the page is visible, on focus, or using **Refresh counts**.

These are recorded requests for a public APK download link, not unique players, completed transfers, or installations. Repeated ordinary GET requests can count. Admin preview routes, HEAD requests, byte-range requests, browser prefetch/prerender requests, invalid/draft/archived downloads, and failed link generation do not count. Legacy external URLs are not tracked. Reusing a temporary signed storage URL bypasses the website counter.

Counting starts with the first recorded request after deployment. Previous downloads cannot be recovered, and the old editable release `downloads` field is not imported or used as a substitute for live statistics.

## Storage and availability

The existing private Vercel Blob connection is reused; no new environment variables or database migration are required. Title-scoped statistics live at `civilcraft/release-analytics/<TITLE-ID>/downloads.json`, separate from APK files and release metadata. Existing APK cleanup cannot sweep this namespace. Do not manually delete the statistics object if history must be retained.

Updates use origin reads and conditional ETag writes. A bounded window of random request IDs prevents a storage SDK retry from counting the same request twice. These IDs are temporary deduplication receipts, not visitor identities, and are not returned to the browser. No IP address, account, cookie, or user-agent data is stored.

Analytics has a three-second overall budget and five compare-and-swap attempts. An unavailable/corrupt/full counter or exhausted retry budget never prevents the APK redirect; such requests may be missing from totals. Admin storage-read failures render **Unknown**, not an invented zero. The document has a 256 KiB/1,000 distinct build limit; at that point download delivery continues but analytics requires an operator review. Do not reset counters or overwrite a malformed document to hide a failure.

`GET /api/admin/releases/download-stats` uses the existing staff-session authorization and private/no-store headers. It returns `available`, `total`, `byRelease`, and nullable `trackingSince`; it exposes no Blob paths, credentials, visitor data, or private retry receipts.

Run `npm run test:apk`, `npm run test:releases`, `npx tsc --noEmit`, and `npm run build`. Tests stub storage and PlayFab completely; they do not publish builds, send emails, or change real counts. After deployment, use one public hosted-APK request and refresh the admin counts; a staff-only preview or HEAD probe intentionally will not increment them.
