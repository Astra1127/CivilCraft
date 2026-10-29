# Private bridge photo album v1

This is a compatible website reader and Unity publication protocol, not evidence
that an installed APK has uploaded an album or that a live revision was deployed.
The existing save and portrait files remain separate. One fixed private Entity
File, `bridge-photos-v1.zip`, holds optimized copies of the latest bridge photos.
The title's Limits page was inspected and shows ten files per title-player
account. The 8 MiB archive budget below is an application limit, not a claimed
PlayFab platform maximum. It uses one additional player file slot, not one slot per result. Other files are
not deleted or moved by this integration.

## Wire contract

The canonical ZIP uses STORE (method 0), no encryption, descriptors, ZIP64,
comments, extra fields, directory entries or filesystem paths. Its entry names are
`manifest.json` and `bridge-<32 lowercase hex result ID>.png`. Local/central
headers, sizes and CRC32 must agree. The manifest is UTF-8 JSON:

```json
{
  "schemaVersion": 1,
  "photos": [
    {
      "contractId": "verified-contract-id",
      "regionId": "verified-region-id",
      "resultId": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "entryName": "bridge-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png",
      "sha256": "64-lowercase-hex-digits-of-the-actual-png"
    }
  ]
}
```

The hash string above is illustrative, not valid fixture data. Each contract and
region pair occurs once; result entry names are unique and every PNG is indexed.
`capturedAt` is optional and must never be substituted for the contract turn-in
date. Limits: 8 MiB complete archive, 64 photos, 64 KiB manifest, 512 KiB per PNG,
and image dimensions at most 960×540. Oversized content stays pending; do not
discard another contract's photo to make room or truncate JSON.

Publish this nested in the selected completion **after finalization and local
metadata persistence**:

```text
completion.resultId = selected result ID
completion.snapshot = {
  storage: "archive-v1",
  fileName: "bridge-photos-v1.zip",
  contractId, regionId, resultId, entryName, sha256
}
```

The snapshot result must equal its owning completion result. A known latest score
must describe that same result; `scoreKnown:false` displays Unavailable and does
not authorize an archive photo. Separate `bridge-*.png` references remain supported
for legacy records.

## Privacy, retries and loading

`GET /api/player/bridge-snapshot?contractId=…&regionId=…` keeps its existing bearer
session authentication. It rereads the owner's completion and resolves that same
ticket's title-player entity on every request. The browser cannot choose a player,
entity, archive name, entry or signed storage URL. Downloads remain restricted to
HTTPS Azure Blob storage with no redirects or forwarded credentials.

The reader checks exact manifest/result/contract/region/hash binding and validates
PNG chunks and checksums. It never extracts to disk. It returns only the PNG with
private/no-store headers. A stale reference returns 404, not the wrong design;
provider or malformed-file failure returns 503. Completion remains visible.

Overview's Recent builds uses the same authenticated snapshot loader as the
Almanac, including private archive and legacy separate-PNG references. It shows
an animated loading indicator until the image loads and a clear fallback if no
photo is synchronized or its download fails. The dashboard Refresh button retries
photo loading even when the published reference has not changed. Account/session
changes abort obsolete requests and revoke their temporary image URLs.

Album downloads are deduplicated in process by title/player/entity and PlayFab
file checksum. Cache retention is 60 seconds, at most eight albums and 32 MiB;
at most eight distinct cacheable loads run concurrently. No checksum means no
reusable cache entry. Authentication is still required on cache hits, and URLs or
credentials are never cache keys or response payloads.

The publisher must reread and merge the remote album when the expected profile
version conflicts. Failed/uncertain finalization is reconciled before retrying.
Save, portrait and photo work share an account/session-bound upload reservation;
an obsolete callback cannot unlock or update a new account.

Media waits for the selected gameplay save to be synchronized. If the entity
profile changes between save verification and album lookup, the game reconciles
its save again before merging; an offline cached save does not authorize replacing
a newer online album. Durable acknowledged-initiation receipts are reconciled
before cloud-save startup, including interrupted portraits. Unknown pending
transactions remain blocked for review rather than being guessed or blindly
aborted. This can occur if initiation succeeds but its acknowledgment is lost.

The outer dashboard schema remains version 1. New Almanac projections include
`publisherVersion:2` so compatibility merging can preserve genuine/unknown turn-in
dates across repeated older-client syncs. Optional records are preserved only when
omitted; an explicit null snapshot clears an obsolete image binding.

## Catalog and checks

Export only approved static assets from the active checkout; never read player
saves. The exporter now requires an explicit `--unity-assets <Assets directory>`.
The newer Bending, Load Distribution, Load Transfer and Moving Load lesson IDs
are bound to their existing website keys. Additional authored lessons without
verified introduction stages remain in the unmapped-stage group. Structural
Failure still has no verified game lesson ID. The new Concrete Pier definition
is catalog content only, not a new discovery grant or mapping.

Local checks:

```text
node --test tests/bridge-photo-album.test.mjs tests/almanac-integration.test.mjs
node --test tests/recent-build-photo.test.mjs
node --test tests/lesson-progression.test.mjs tests/lesson-navigation.test.mjs
npx tsc --noEmit
npm run build
```

Run coordinated installed-APK and two-account provider tests after reviewed
deployment. Mocked tests do not prove live uploads, cross-device conflict recovery
or device image quality. No payment, wallet migration or currency permission is
part of this protocol.
