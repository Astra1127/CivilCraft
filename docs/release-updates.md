# What's New implementation

Previously, the What's New editor changed the current browser-local release's `notes` field directly. The public Download page displayed those notes, tied to that browser's current build. There was no independent post publication state or entry editor.

Game & Download now includes Create update, Edit update, Save draft, and Publish update. Entries have title, version, build number, date, release notes, and published status. Each entry is the existing Release record, extended with a `published` flag. Version and build are not duplicated into a second post model. One release record has one update entry.

Release records are stored through server-only PlayFab Title Internal Data at `civilcraft.website.v1.releases.<id>`. `civilcraft.website.v1.release-config` stores the current release ID and, after a version change, its notification event. Publication and current APK selection are independent. Publishing or editing a post does not change which release is current.

On first use, select Import existing releases in Game & Download. This copies the existing browser's release records, preserving APK metadata and the current selection. Imported notes start as drafts. The import is idempotent and does not overwrite an initialized shared store. Legacy browser data is retained, but shared release records become authoritative after import. Build fields now have an explicit Save build action for persistent writes.

The public Download page uses `GET /api/releases`, through React Query with no-store fetches. The server returns current build information separately from the latest published update. The latest entry is selected by descending date, then ID for deterministic same-date ordering. Draft notes are excluded. Public rendering includes title, version, build, date and notes, plus loading/error/empty states. The existing APK link uses the current release's file URL as before. Until import, the existing local build remains the fallback.

Staff use `GET/POST /api/admin/releases` behind the existing administrator session and origin checks. No authentication changes were made. Server credentials are not exposed to public JavaScript.

## Build management

The active build is first and stays expanded. Drafts and backups start collapsed;
their details can be opened without losing selected APKs or unsaved edits. Newly
created drafts open for uploading. Making a different build current requires a
confirmation showing the selected version and its email consequence.

Noncurrent drafts and published backups have a Delete action with confirmation.
Deletion hides both the build and its release notes; a separate permanent
`civilcraft.website.v1.release-deleted.<id>` tombstone also blocks stale saves and
upload completion from bringing it back. Stored APKs and private metadata are
retained for operator recovery, not deleted from Blob. The active build cannot
be deleted. Deletion is not an APK storage cleanup operation.

## Version update emails

Activating a different public version, or saving a changed version on the active
build, records a version announcement. Creating drafts, editing notes, replacing
an APK, changing only its build number, and reselecting the same version do not
create a new announcement. Use a draft for new APKs so the version is announced
only after its installer has been verified and made current.

Only players who opted into email updates before the announcement and have a
confirmed contact email are eligible. Draft notes are never put in emails.
Existing Gmail SMTP settings send branded messages with the version, build,
website Download link and preference link. With SMTP entirely absent, a configured
PlayFab release template is supported as a generic update notification. Partial
SMTP settings or provider failure do not silently switch providers.

The queue is persisted alongside the active pointer. A small first batch is
attempted after activation. A separate protected worker at
`GET/POST /api/email/releases/dispatch` resumes bounded batches using a private
cursor. `vercel.json` schedules it daily at 01:00 UTC (09:00 Asia/Shanghai), within
Vercel Hobby's once-per-day restriction. Large recipient lists may span several
batches/days; this is not an instant mass-mail guarantee. The legacy article
worker at `/api/email/dispatch` is unchanged and is not scheduled by this change.

Required configuration: existing PlayFab title/server credentials, private Blob
OIDC connection, valid SMTP settings (or PlayFab release template), canonical HTTPS
website origin, and server-only `CRON_SECRET`. Never add these as `VITE_` variables.
The admin page reports readiness separately from activation success. Enabling the
feature does not email historical builds; there must be an actual version change.

Permanent create-only claims are scoped to title, version and player. Concurrent
workers/retries cannot send the same version twice to the same player. An ambiguous
provider result stays claimed and is reported for review rather than blindly
resent; at-most-once attempts are not guaranteed mailbox delivery. Deleted or
superseded versions and newly opted-out players are rechecked before delivery.

PlayFab Title Internal Data has no compare-and-swap support. Avoid simultaneous
edits of the same build from multiple staff sessions. Use only the Jemma/main
admin page; the old fork's schema does not understand the current metadata.

Files: `src/lib/cms/types.ts`, `src/lib/cms/releases.server.ts`, `src/lib/cms/releases.ts`, `src/components/admin/ReleasePosts.tsx`, `src/routes/admin.releases.tsx`, `src/routes/download.tsx`, `src/server.ts`, `src/lib/playfab/admin-api.server.ts`, `tests/release-posts.test.ts`, and `tests/release-posts-ui.test.mjs`.

TypeScript, changed-file lint, production build, six release API tests and one component workflow test passed. The component workflow created a draft, edited its notes, published it, verified its public title/date/notes, and confirmed the existing APK URL and build remained unchanged. Browser click-through verification was unavailable because no browser was connected. No live release records were imported or published during testing.
