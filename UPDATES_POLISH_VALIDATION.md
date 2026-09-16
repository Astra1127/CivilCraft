# Updates polish validation

September 15, 2026.

## Persistence and image storage

Updates remain in PlayFab Title Internal Data under `civilcraft.website.v1.updates.<UUID>`, accessed through the existing server-only administrative transport. The public and admin pages continue to use the centralized content API. No update database or image data is stored in localStorage/sessionStorage.

Hero uploads reuse Gallery's multipart reader, Sharp validation/re-encoding, and private Vercel Blob adapter. A shared `storeUpload` helper handles both uses. PNG, JPG/JPEG and WebP are supported, with the same 4 MiB and 25-megapixel limits. Uploads occur when Save is submitted; unsaved previews use revocable in-memory object URLs.

Owned hero paths stay server-side. `/api/admin/content/update-images/<ID>` serves authenticated previews; `/api/content/update-images/<ID>` serves only published articles whose publication date has arrived. Draft and future-dated images return 404 publicly. Optional external HTTPS URLs remain supported; protected content URLs/private Blob URLs cannot be supplied as shared external assets.

Replaced/removed images are cleaned up after the article save succeeds. Failed cleanup references remain in the stored article for retry on a later save or deletion. Cleanup does not rewrite article content after slow Blob operations, avoiding resurrection of an article deleted concurrently. Deletion first hides the article, then removes its owned images and record. External URL images are not deleted.

## Slugs and editing

The title is normalized to lowercase, accents are removed, and non-URL-safe characters become hyphens. New slugs append the article UUID to prevent collisions, including concurrent identical titles. Thus the URL is title-based but includes a uniqueness suffix rather than the exact unsuffixed example. Existing slugs and IDs remain unchanged when editing a title, preserving published links.

## Admin and public behavior

- Admin supports creating/editing drafts, publication date, category, excerpt, body, visibility, hero selection via picker/drop, preview, replacement/removal and image description.
- The four existing categories remain unchanged.
- Form Preview displays unsaved content in an admin-only dialog using the same article renderer as the public page. It does not save or publish anything.
- Existing records show title, category, status and publication date, with Edit, Preview and Delete, plus View when publicly available.
- Delete confirmation says **“Delete this update?”**.
- Public queries filter drafts and future-dated published records server-side, then sort newest first. This applies to Homepage, `/updates`, article lookup and hero-image access.
- Homepage shows one featured/latest update and up to two compact recent updates. Existing empty messages and `/updates` links remain intact.
- Image descriptions are used as alt text, not visible captions.
- Admin Overview does not currently display update counts, so no count migration was required.

## Validation

- `npx tsc --noEmit`: passed.
- `node --test tests/*.test.ts`: **62 passed, 0 failed**.
- `npm run build`: passed using the Windows filesystem access required by Nitro.
- Tests exercise draft creation, private draft image reads, edits, publishing, replacing/removing images, published edits and deletion for PNG, JPEG (`.jpg`) and WebP; public draft exclusion; future dates; newest-first ordering; concurrent duplicate titles; failed uploads; cleanup retries; and protection against cleanup resurrecting a deleted article.
- External PlayFab/Blob calls in these tests are mocked. Live Blob uploads, interactive browser preview and redeployment persistence were **not** tested: `BLOB_READ_WRITE_TOKEN` remains unconfigured locally. Configure the same private Blob store used by Gallery, then complete live browser acceptance checks.

## Files modified

- `src/lib/cms/content.server.ts`
- `src/routes/admin.news.tsx`
- `src/routes/index.tsx`
- `src/routes/updates.$slug.tsx`
- `src/components/site/UpdateCard.tsx`
- `src/components/site/UpdateArticle.tsx` (new shared renderer)
- `src/components/admin/UpdateHeroInput.tsx` (new image input)
- `tests/public-content.test.ts`
- `UPDATES_POLISH_VALIDATION.md` (this report)

Authentication, main navigation, storage credentials and the existing Updates route architecture were preserved.
