# Admin directory and Settings cleanup

## Changes

- The Player Directory panel now contains its count, search toolbar, sort selector, activity selector and account-status selector. Selected options include compact Sort, Activity and Status labels.
- Controls wrap on tablet and use full-width rows below the small-screen breakpoint. The existing table columns remain unchanged.
- Reset filters appears only for nondefault sort/activity/status values. It restores Recently Active / All / All and resets pagination to page one without clearing the identifier search.
- Existing backend sorting, activity definitions, status filtering, snapshots and filtering-before-pagination are unchanged. Row choices remain 10/20/50, default 20.
- Settings has General and Integrations tabs, selected through the URL. General retains its existing form and save behavior; unsaved form state remains in the parent while switching tabs.
- The separate Integration sidebar entry is removed. `/admin/integration` redirects with history replacement to `/admin/settings?tab=integrations`; the existing parent admin authentication guard still applies.
- Integrations retains the PlayFab connection probe, safe Title ID, administrative access status, staff configuration and browser-local content reset action. Its reset description now accurately distinguishes centralized Updates/Gallery from browser-local CMS state.
- Image storage and email show configuration statuses from the authenticated server endpoint, never credentials. SMTP delivery and scheduler operation are explicitly not claimed to be verified. Configuration is performed in the hosting environment/PlayFab, not by entering secrets into this page.
- Overview retains its backend card and links to Settings → Integrations.
- Gallery and Updates now show `Image storage is not configured.` with `Configure storage in Settings → Integrations.` and a direct link in the error notification.

## Validation

- `npm run build`: passed. The first sandboxed attempt failed on Nitro's Windows `readlink` permission; the authorized run outside the sandbox passed.
- `npx tsc --noEmit`: passed.
- `node --test tests/*.test.ts`: 73 passed, zero failures. Coverage includes all row sizes, filtering before pagination, authentication and safe integration configuration responses.
- `git diff --check`: passed.
- Scanned 124 built client JavaScript assets for privileged environment names and configured secret values: passed. No credential values were printed.
- Reset behavior, responsive classes, tab navigation and redirect were reviewed in source and type-checked. Interactive browser/viewport validation was unavailable because no browser was connected; these were not claimed as browser-tested.
- No authentication code, PlayFab credentials or player sorting/filter definitions were changed in this task. Existing uncommitted work was preserved.

## Files changed in this task

- `src/routes/admin.players.tsx`
- `src/routes/admin.settings.tsx`
- `src/routes/admin.integration.tsx`
- `src/routes/admin.tsx`
- `src/routes/admin.index.tsx`
- `src/routes/admin.gallery.tsx`
- `src/routes/admin.news.tsx`
- `src/components/admin/AdminIntegrations.tsx` (new)
- `src/components/admin/content-error.tsx` (new)
- `src/lib/playfab/admin-api.server.ts` (safe integration statuses only)
- `src/lib/playfab/admin-types.ts` (status DTO)
- `src/lib/cms/images.server.ts` (error wording)
- `tests/admin-playfab.test.ts` (configuration/credential regression)
- `ADMIN_DIRECTORY_UI_VALIDATION.md` (this report)
