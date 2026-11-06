# Upload Android releases from the staff dashboard

The staff dashboard can upload APKs to **Astra1127/CivilCraft** GitHub Releases.
GitHub credentials stay on the server. Players still use the existing Download
button without a GitHub account. This does not change game wallets or payments.

## One-time private setup

1. The repository owner creates a fine-grained GitHub personal access token with
   **only Astra1127/CivilCraft selected**, **Contents: Read and write**, and an
   appropriate expiration. Metadata read access is included by GitHub. No Actions,
   administration, organization, or other-repository permissions are needed.
   A collaborator cannot use their own fine-grained token to write another
   account's public repository. For the collaborator account, GitHub supports a
   **classic** personal access token with **public_repo only** for this public
   repository. This scope also covers other public repositories that account can
   access; it cannot be restricted to just CivilCraft. The owner's selected-repo
   fine-grained token remains the narrower option. Do not grant the broader
   `repo`, `workflow`, organization, or repository-deletion scopes for this setup.
2. Add the token privately to Vercel's **civil-craft** project as
   `GITHUB_APK_TOKEN`, **Production** only. Never paste it into chat, source code,
   browser-exposed configuration, or a `VITE_` variable. The credential authorizes
   the website's staff release tools to write this repository's releases.
3. Create one **draft** GitHub release with tag
   `civilcraft-admin-control-v1` and title `Private Civil Craft admin coordination`.
   Do not publish it or attach an APK. It holds small temporary lock records.
4. Set its numeric GitHub release ID as `GITHUB_APK_CONTROL_RELEASE_ID` in the same
   Vercel Production environment. An authorized operator can obtain it from the
   authenticated GitHub releases API; the tag and draft state are rechecked by
   every writer. This ID is configuration, not a secret.
5. Redeploy. Open **Admin → Game & Download**. The GitHub upload control must show
   configured readiness before testing. Partial configuration blocks writes and
   never falls back to a different locking system.

The existing public installer remains downloadable without either credential.
If the token expires, uploads/private previews need reconnection; public assets
continue to download directly from GitHub.

## Staff workflow

Production coordination draft established on 2026-11-06:
`GITHUB_APK_CONTROL_RELEASE_ID=436078745`, tag `civilcraft-admin-control-v1`.
This release is for coordination only; keep it unpublished and do not attach APKs.
The normal GitHub-to-Vercel deployment connection picks up Production environment
changes on the next deployment from `main`.

1. Create a draft build with its real version, build label and Android version code.
2. Choose an APK, then **Upload APK to GitHub**. Keep the page open while uploading
   and verifying. Upload progress is paced to respect GitHub's write limits.
3. Use **Preview APK download** and verify installation on a device.
4. Choose **Make current** when ready. The verified GitHub draft is published,
   then the website's current-build pointer changes. Existing version-notification
   behavior is preserved.

Uploading directly on the current build replaces its public APK after verification.
Use a separate draft for preview before publication. Replacing bytes alone does
not invent a new version or send a version-change email.

**Retry upload** resumes the same selected file's acknowledged parts or checks
finalization again. It does not blindly submit a second APK after an uncertain
response. Tickets live only in this staff page's memory and expire after two hours;
changing staff account, closing the page, or selecting another file starts a new
private upload. Abandoned drafts can be reviewed in GitHub; they are never exposed
as player downloads automatically.

Deleting a GitHub-backed website build removes its website entry and notes. Its
GitHub release backup is retained. Blob cleanup is disabled for GitHub builds.
Any permanent GitHub backup deletion is a separate operator action.

## Implementation and limits

- Vercel's function request body limit prevents forwarding an entire APK in one
  request. The browser sends sequential **3 MiB** parts to staff-authenticated,
  same-origin endpoints. The existing file limit is **512 MiB**.
- Each upload has a distinct private GitHub draft and a staff-bound signed ticket.
  Part names are fixed; retries verify the existing asset's digest and size.
- Finalization hashes the parts, performs the existing bounded APK archive checks,
  and streams them into one GitHub APK asset with a known Content-Length. APK
  bytes are never buffered as one full file by the server and never use Blob.
- A signed, non-secret verification receipt is saved before deleting temporary
  parts. Cleanup retries recover from partial completion. Drafts remain private
  until publication; no staging ticket or staff identifier is published.
- Every draft update explicitly preserves its tag and verifies the returned
  release identity. A provider-generated `untagged-…` draft can be repaired only
  when its original signed ticket or verification receipt still matches; arbitrary
  renamed releases or altered verification records are rejected.
- Private previews obtain a short-lived GitHub CDN link server-side. The bearer
  credential is sent only to GitHub API/upload hosts, never the CDN or browser.
  Public downloads keep their bounded four-byte availability check and safe Retry UI.
- A private control draft serializes metadata writes with a unique asset name.
  Writers unlock only their own immutable asset ID. Upload locks are separate from
  the metadata lock, so a long transfer does not monopolize release editing.
  No lock expires or takes over another writer automatically. A crashed/uncertain
  lock stays held for operator review; confirm the original writer has stopped
  before removing that exact lock asset. Never publish the control draft.
- The active attachment is compared again under the metadata lock before commit.
  Concurrent changes to version/build/attachment/current status reject the old
  upload. Intervening notes edits are preserved. Failed uploads/publication preserve
  the current download. A successful GitHub publication followed by an uncertain
  metadata response can be retried idempotently.
- GitHub download counts are not mixed into historical Blob counters.
- Nitro emits a 300-second Vercel function duration. Final assembly has a 240-second
  download/upload budget; very large/slow uploads may require retry or operator
  review. No automatic retry deletes an uncertain GitHub `starter` asset.
- The original October APK's reviewed GitHub binding is preserved into server-owned
  metadata on its next edit, so editing a version label cannot revive suspended Blob
  delivery. Server-supplied attachment fields cannot be forged by a staff browser.

## Validation

Run `npm run test:apk`, `npm run test:releases`, `npx tsc --noEmit`, scoped ESLint,
and a production build. With the real private connection configured, upload the
known backup into a **draft** first. Confirm its downloaded byte size and SHA-256,
private preview access, and unchanged public installer. Then test Make current
deliberately; do not claim the live integration passed based on mocked tests.

References: [Vercel payload limit](https://vercel.com/docs/errors/function_payload_too_large),
[GitHub release assets](https://docs.github.com/en/rest/releases/assets),
[GitHub releases](https://docs.github.com/en/rest/releases/releases),
[GitHub collaborator token limitations](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens),
[public_repo scope](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps).
