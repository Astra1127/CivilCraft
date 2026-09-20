# What's New implementation

Previously, the What's New editor changed the current browser-local release's `notes` field directly. The public Download page displayed those notes, tied to that browser's current build. There was no independent post publication state or entry editor.

Game & Download now includes Create update, Edit update, Save draft, and Publish update. Entries have title, version, build number, date, release notes, and published status. Each entry is the existing Release record, extended with a `published` flag. Version and build are not duplicated into a second post model. One release record has one update entry.

Release records are stored through server-only PlayFab Title Internal Data at `civilcraft.website.v1.releases.<id>`. `civilcraft.website.v1.release-config` stores only the current release ID. Publication and current APK selection are independent. Publishing or editing a post does not change which release is current.

On first use, select Import existing releases in Game & Download. This copies the existing browser's release records, preserving APK metadata and the current selection. Imported notes start as drafts. The import is idempotent and does not overwrite an initialized shared store. Legacy browser data is retained, but shared release records become authoritative after import. Build fields now have an explicit Save build action for persistent writes.

The public Download page uses `GET /api/releases`, through React Query with no-store fetches. The server returns current build information separately from the latest published update. The latest entry is selected by descending date, then ID for deterministic same-date ordering. Draft notes are excluded. Public rendering includes title, version, build, date and notes, plus loading/error/empty states. The existing APK link uses the current release's file URL as before. Until import, the existing local build remains the fallback.

Staff use `GET/POST /api/admin/releases` behind the existing administrator session and origin checks. No authentication changes were made. Server credentials are not exposed to public JavaScript.

Files: `src/lib/cms/types.ts`, `src/lib/cms/releases.server.ts`, `src/lib/cms/releases.ts`, `src/components/admin/ReleasePosts.tsx`, `src/routes/admin.releases.tsx`, `src/routes/download.tsx`, `src/server.ts`, `src/lib/playfab/admin-api.server.ts`, `tests/release-posts.test.ts`, and `tests/release-posts-ui.test.mjs`.

TypeScript, changed-file lint, production build, six release API tests and one component workflow test passed. The component workflow created a draft, edited its notes, published it, verified its public title/date/notes, and confirmed the existing APK URL and build remained unchanged. Browser click-through verification was unavailable because no browser was connected. No live release records were imported or published during testing.
