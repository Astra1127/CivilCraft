# Private image storage: Vercel OIDC

The image adapter previously required and explicitly passed `BLOB_READ_WRITE_TOKEN` for put/get/delete. That prevented a connected OIDC store from being used without a long-lived token and bypassed SDK credential discovery. The installed `@vercel/blob` is **2.8.0 before and after**; it already supports OIDC, so no dependency update is needed.

## Runtime authentication

Image operations now omit explicit credentials and let the SDK resolve the connected `BLOB_STORE_ID` and Vercel-issued runtime OIDC credentials. The SDK obtains rotating credentials from the Vercel request context or `VERCEL_OIDC_TOKEN`, including its supported local refresh mechanism. Store metadata and `BLOB_WEBHOOK_PUBLIC_KEY` are not authentication. Never put OIDC or Blob credentials in `VITE_` variables.

The SDK chooses OIDC when a usable OIDC token and store ID are available. It retains its native legacy environment-token fallback if OIDC is unavailable; the image adapter neither requires nor supplies that token. Production should use the existing OIDC-connected private store, with its store ID and Vercel runtime OIDC credential injection enabled. No store is created or reconfigured by this change.

References: [Vercel OIDC announcement and CLI workflow](https://vercel.com/changelog/vercel-blob-now-supports-oidc-authentication), and the installed `@vercel/blob/dist/chunk-YYMLUMXS.js` credential resolver. The installed resolver checks an explicit token before OIDC, so removing the old explicit token option is necessary.

## Preserved paths and access model

- Gallery uploads still decode/re-encode the image and use `put` with `access: private`, the existing pathname, MIME and suffix settings.
- Image delivery still uses `get` with `access: private` and `useCache: false`; the site proxies the private stream.
- Deletion still uses the same pathname through `del`.
- Gallery listing continues to use existing PlayFab metadata, not a new Blob listing system.
- Public image routes still serve only published/visible media. Hidden media still requires the existing admin route/session checks. No metadata, publication, deletion ordering, authentication or permission code changed.
- The shared image adapter also serves existing stored article hero media; their routes and metadata remain unchanged.

Integration status uses a read-only SDK `list` request limited to one entry under `civilcraft/gallery/`, with a five-second request abort signal. Only `Configured` or `Unavailable` leaves the server. No filenames, URLs, provider errors or credentials are returned. Configured means authenticated listing succeeded; it does not certify write permissions, successful uploads, or the store's access setting. An empty accessible store passes. Missing/expired/rejected credentials or provider failure fail closed to Unavailable. The check runs only through the existing staff-protected status endpoint.

## Local development

Use a current Vercel CLI signed into the existing project:

```powershell
vercel link
vercel env pull .env.local
npm run dev
```

Link the existing project rather than creating another. Confirm the Development environment is connected to the intended private Blob store and that the pulled environment contains `BLOB_STORE_ID`. Vercel's current CLI/SDK supplies and refreshes short-lived OIDC credentials; refresh the pulled environment and restart the dev server when needed. Do not copy production tokens into source or invent a store ID. `.env*` (except `.env.example`) and `.vercel` are already ignored. Do not commit generated credentials.

At verification, the local environment contained an OIDC token but no `BLOB_STORE_ID` or `BLOB_READ_WRITE_TOKEN`. No live store access, upload or deletion was attempted. Deployed project permissions and credential injection still require deployment verification.

## Remaining legacy token use

`src/lib/email/api.server.ts` still guards the optional legacy Updates dispatch with `BLOB_READ_WRITE_TOKEN`, and `src/lib/email/delivery.server.ts` explicitly passes that token when writing deduplication claims. Those email paths were intentionally untouched. The token is no longer required by image storage. Recovery, contact SMTP/messages, current What's New/APK releases and PlayFab persistence were not modified.

## Files and verification

- `src/lib/cms/images.server.ts`: SDK credential discovery and safe read-only capability check.
- `src/lib/playfab/integration-status.server.ts`, `admin-api.server.ts`, `admin-types.ts`: await the capability result and expose safe status labels only.
- `src/components/admin/AdminIntegrations.tsx`: accurate OIDC/access-check explanation.
- `.env.example`: store ID and distinction from legacy email token requirements.
- `tests/blob-oidc.test.ts`: actual SDK with mocked HTTP, OIDC request headers, private read/upload, deletion, and rejected-access status.
- `tests/admin-playfab.test.ts`: protected status integration; metadata alone is insufficient, successful access needs no legacy token.
- `tests/client-bundle-secrets.test.mjs`: post-build scan for configured secrets and server-only Blob auth code in client bundles.
- `docs/blob-oidc.md`: this migration report and local/deployment workflow.

Deployment checklist: open Integration and run Check connection; upload a test image as admin; verify its preview, keep it hidden and confirm public denial; publish and confirm Gallery delivery through the existing image route; hide again and confirm denial; delete it. Verify the underlying store remains Private in Vercel. A failed access check should show Unavailable without credential/provider details.

Validation: typecheck, changed-file ESLint, production build, and `git diff --check` passed. The Blob SDK, public-content, and admin suites passed all 52 tests; the post-build client-bundle credential scan passed its additional test (53 total, no skips). SDK network calls were mocked; these results do not claim live Vercel/OIDC verification. Git reported only line-ending normalization warnings.
