# Public updates and gallery validation

Validated September 15, 2026.

## Implemented

- `/updates` lists all published articles, newest first. Homepage `View All Updates` goes there; `Read Update` goes to `/updates/$slug`.
- Article pages display category, date, title, optional image, complete plain-text content with paragraph breaks, and `Back to Updates`. Missing/unpublished slugs display `Update not found.`
- Admin **Content → Updates** creates, edits, publishes, unpublishes and deletes articles. Slugs include a unique suffix and remain stable when a title changes. No automatic publication of old browser records occurs.
- Legacy Community news URLs redirect to `/updates`. The main public navbar remains Home, About, Gallery, Download, Contact.
- Admin Gallery supports file picker, drag-and-drop, revocable in-memory preview, caption, category, hidden/published state, publish/hide and delete.
- Uploads accept static PNG, JPEG (including `.jpg` filenames), and WebP, up to 4 MiB and 25 million decoded pixels. The server bounds the request body, checks declared MIME against decoded format, fully decodes and re-encodes the image using Sharp, and strips metadata. Corrupt images, mismatched types, SVG and oversized input are rejected.
- Public Gallery renders only persisted visible uploads. No image placeholders are substituted. Its empty state is **“No gallery items yet.”** / **“Screenshots and development media from Civil Craft will appear here.”**

## Storage and access

Images use a **private Vercel Blob store** through server-only `@vercel/blob` calls. Set `BLOB_READ_WRITE_TOKEN` for the private store in the server environment; `.env.example` documents the variable. No upload writes an image to runtime disk, `public/`, localStorage or sessionStorage. Temporary preview object URLs are revoked when replaced/unmounted.

Gallery metadata and update articles use the project's existing server-side PlayFab administrative transport, in separate Title Internal Data keys:

- `civilcraft.website.v1.gallery.<UUID>`
- `civilcraft.website.v1.updates.<UUID>`

Retrieval uses `Admin/GetTitleInternalData`; persistence uses `Admin/SetTitleInternalData`. Per-record keys avoid overwriting a shared list when different administrators create content. This small CMS remains subject to the title's PlayFab storage/API quotas.

The public API `/api/content` returns published data only. Image bytes are streamed by `/api/content/images/<UUID>` after checking visibility. Private Blob paths and write credentials are not returned. The admin image route permits previews of hidden uploads after authentication. Responses use `no-store`; image access is rechecked on every request. This cannot revoke copies a visitor already downloaded while an image was published.

All `/api/admin/content` routes pass through the existing signed staff session and same-origin write checks. Authentication implementation was not changed. Failed metadata creation attempts clean up the uploaded object; deletion first hides the record, then deletes the object and metadata. Storage/provider failures return errors, without reporting success or inserting fallback records.

References: [Vercel private storage](https://vercel.com/docs/vercel-blob/private-storage), [Blob SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk), [PlayFab Set Title Internal Data](https://learn.microsoft.com/en-us/rest/api/playfab/admin/title-wide-data-management/set-title-internal-data?view=playfab-rest).

## Removed sample content and placeholders

All 12 gallery seeds were removed: Canyon Crossing, Engineer Character, Truss Bridge, Bridge Construction, Desert Construction Site, Beam Bridge, Load Testing, Arch Bridge, NPC Engineer, Build Interface, Suspension Bridge and Challenge Interface.

All six sample news records were removed: Civil Craft Prototype Version Released, Bridge Almanac Expanded, Physics Tuning — Patch Notes, Development Update: Regions, Community Build Showcase and Upcoming Features (Draft).

Legacy localStorage hydration and mutations explicitly discard news/gallery arrays. Public and admin content pages use the backend API, not these legacy arrays.

About excludes incomplete published team entries and placeholder academic values, filters invalid roles, and suppresses placeholder contributions. Contact hides unset socials, invalid placeholder contact details, and the map placeholder; the form expands into the freed space. No team/institution/contact values were invented. The other requested public pages were audited without unnecessary content changes. Other legacy CMS settings and the existing contact form storage were not migrated by this task.

## Verification results

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Passed |
| `node --test tests/*.test.ts` | 54 passed, 0 failed |
| `npm run build` | Passed with required Windows filesystem access; sandboxed Nitro packaging initially hit EPERM |
| Client asset scan | 125 JS files checked; no server credential names/values or Blob SDK exposed |
| Production server smoke check | `/`, `/updates`, article route, `/gallery`, `/about`, `/contact`, `/download`, `/faq`, `/privacy`, `/terms` render successfully |
| Targeted public placeholders | Absent from production-rendered HTML on checked pages |
| Guest admin content request | HTTP 401 |
| PNG/JPEG/WebP server validation and upload lifecycle | Passed with real encoded test images and mocked external providers |
| Separate request contexts/reloads | Identical shared metadata in mocked-provider tests |
| Hidden images/draft articles/public write rejection | Passed |
| Live cross-browser upload and redeployment persistence | **Not run: private Blob token is not configured locally** |
| Interactive browser/visual QA | Not performed |

The nine new content tests also exercise corrupt/mismatched/oversized input, safe empty storage, stable article slugs, visibility changes, deletion and cross-origin/unauthenticated write rejection. External provider calls are mocked: these tests do not establish live Blob availability or successful production redeployment.

## Required live configuration and acceptance check

Connect a private Vercel Blob store and configure `BLOB_READ_WRITE_TOKEN` server-side for the deployment environments used by the site. Retain the existing PlayFab administrative and admin session configuration. Never use a `VITE_` prefix for credentials.

Then upload a PNG, JPEG and WebP through Admin Gallery; publish them; reload in a second browser; confirm captions and images match; hide an item and confirm its public image endpoint rejects it; redeploy against the same Blob store and PlayFab title; confirm the remaining published images still render. Publish a real update and follow both homepage links to its index and article page.

## Files changed

- New: `src/lib/cms/content-types.ts`, `content.ts`, `content.server.ts`, `images.server.ts`.
- New: `src/components/site/UpdateCard.tsx`, `src/routes/updates.index.tsx`, `src/routes/updates.$slug.tsx`.
- Updated public routes: `src/routes/index.tsx`, `gallery.tsx`, `about.tsx`, `contact.tsx`, `community.news.index.tsx`, `community.news.$slug.tsx`.
- Updated admin routes: `src/routes/admin.tsx`, `admin.gallery.tsx`, `admin.news.tsx`.
- Updated integration/store: `src/server.ts`, `src/lib/playfab/admin-api.server.ts`, `src/lib/cms/seed.ts`, `store.ts`, `types.ts`, generated `src/routeTree.gen.ts`.
- Dependencies/config: `package.json`, `package-lock.json`, `.env.example`.
- Tests/report: `tests/public-content.test.ts`, `PUBLIC_CONTENT_VALIDATION.md`.
