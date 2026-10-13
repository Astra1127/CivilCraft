# APK retention: keep the current build only

Back up APKs yourself before uploading/publishing. Removed Blob objects cannot be restored from this website.

## Normal workflow

1. Create a draft and upload its APK. The current APK stays available during upload and archive validation.
2. Select **Make current** and confirm. The server verifies the saved object identity and size, commits the new active download, then retires other release records and deletes their hosted APKs.
3. Uploading a replacement attachment directly to the current build performs the same cleanup after successful verification/save. The public download URL remains stable.

**Delete build** now removes a non-current build's hosted APK as well as hiding the release record. Small private tombstones/metadata remain to reject stale saves and upload tickets. External URLs are never remotely deleted.

## Existing files and retry

Use **Clean old APKs** after verifying the current filename. It preserves the exact current Blob object, removes retired release attachments, and sweeps valid APK paths under `civilcraft/releases/` older than one hour. Recent unfinished uploads are protected for one hour (upload tickets last 30 minutes); rerun cleanup later if needed. Gallery, email, wallet, and other paths are excluded.

If cleanup reports pending, the saved/current release remains committed. Retry cleanup; do not upload the same APK again. A missing current object or metadata mismatch prevents cleanup. A missing old object is treated as already removed.

## Concurrency and recovery

All release writes acquire a private, atomically created Blob at `civilcraft/release-control/write-lock.json`. Writers never steal an expired lock. Deletion of the lock is conditional on its ETag. Use only the newly deployed canonical admin site; older deployments do not implement this lock and must not be used for release edits during cleanup.

A crashed or timed-out writer can leave the lock in place. If release editing stays locked, an operator must inspect the active release and storage state, establish that no release request is running, and only then explicitly remove that exact lock object. Do not delete the whole control directory or add automatic timed takeover.

Initial production cleanup is separate from deployment: inventory current and retired objects, confirm backups/deletion scope, then run cleanup and verify current download plus remaining Blob inventory. Deployment alone does not remove APKs.
