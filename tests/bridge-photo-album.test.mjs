import assert from "node:assert/strict";
import { test } from "node:test";
import {
  albumImage,
  cachedBridgeAlbum,
  MAX_ALBUM_BYTES,
  parseBridgePhotoAlbum,
  validateAlbumPng,
} from "../src/lib/playfab/bridge-photo-album.server.ts";
import { parseAlmanacProgress } from "../src/lib/playfab/almanac.ts";
import { handleBridgeSnapshot } from "../src/lib/playfab/bridge-snapshot.server.ts";
import { albumFixture, packStore, png } from "./helpers/bridge-photo-album.mjs";

test("canonical STORE album preserves exact result identity and returns only the selected PNG", () => {
  const f = albumFixture(),
    album = parseBridgePhotoAlbum(f.bytes);
  assert.deepEqual(albumImage(album, f.reference), f.image);
  for (const field of ["contractId", "regionId", "resultId", "entryName", "sha256"])
    assert.equal(albumImage(album, { ...f.reference, [field]: "wrong" }), undefined);
});
test("rejects duplicate, unknown, unindexed, traversal, mismatched and oversized entries", () => {
  const f = albumFixture();
  const bad = [
    Buffer.alloc(0),
    Buffer.alloc(MAX_ALBUM_BYTES + 1),
    packStore([...f.entries, f.entries[1]]),
    packStore([...f.entries, ["../photo.png", f.image]]),
    packStore([...f.entries, ["bridge-" + "b".repeat(32) + ".png", f.image]]),
    albumFixture({ photos: [f.photo, f.photo] }).bytes,
    albumFixture({ photo: { sha256: "0".repeat(64) } }).bytes,
    albumFixture({ photo: { resultId: "b".repeat(32) } }).bytes,
    albumFixture({ manifest: { schemaVersion: 2, photos: [f.photo] } }).bytes,
    packStore([["manifest.json", " ".repeat(65537)]]),
    albumFixture({ png: png(961, 1) }).bytes,
    albumFixture({ png: png(1, 541) }).bytes,
  ];
  for (const bytes of bad) assert.throws(() => parseBridgePhotoAlbum(bytes));
});
test("rejects compression, flags, ZIP64, disagreement, CRC failures and appended data", () => {
  const f = albumFixture();
  for (const [offset, value] of [
    [6, 1],
    [6, 8],
    [8, 8],
    [4, 45],
    [14, 1],
    [26, 0],
  ]) {
    const bad = Buffer.from(f.bytes);
    bad.writeUInt16LE(value, offset);
    assert.throws(() => parseBridgePhotoAlbum(bad));
  }
  const directory = f.bytes.readUInt32LE(f.bytes.length - 6);
  for (const [offset, value] of [
    [directory + 8, 1],
    [directory + 10, 8],
    [directory + 30, 1],
    [directory + 42, 1],
  ]) {
    const bad = Buffer.from(f.bytes);
    bad.writeUInt16LE(value, offset);
    assert.throws(() => parseBridgePhotoAlbum(bad));
  }
  assert.throws(() => parseBridgePhotoAlbum(Buffer.concat([f.bytes, Buffer.from([0])])));
  const badPng = Buffer.from(f.image);
  badPng[badPng.length - 1] ^= 1;
  assert.throws(() => validateAlbumPng(badPng));
});
test("archive snapshot requires known latest score and exact owning completion result", () => {
  const f = albumFixture();
  for (const [overrides, valid] of [
    [{}, true],
    [{ resultId: "b".repeat(32) }, false],
    [{ scoreKnown: false }, false],
  ]) {
    const j = parseAlmanacProgress(
      JSON.stringify({
        regions: [
          {
            regionId: f.photo.regionId,
            levels: [
              {
                levelId: f.photo.contractId,
                status: "completed",
                completion: {
                  status: "success",
                  score: 2,
                  resultId: f.photo.resultId,
                  completionScreenshotUrl: "https://example.test/old-design.png",
                  snapshot: f.reference,
                  ...overrides,
                },
              },
            ],
          },
        ],
      }),
    );
    assert.equal(!!j.regions[0].levels[0].completion.snapshotAlbum, valid);
    assert.equal(
      j.regions[0].levels[0].completion.completionScreenshotUrl,
      undefined,
      "An archive snapshot never falls back to another design's legacy URL",
    );
  }
});
test("album downloads deduplicate by owner and checksum, never across accounts/versions; failures retry", async () => {
  const f = albumFixture();
  let calls = 0;
  const load = async () => {
    calls++;
    await Promise.resolve();
    return f.bytes;
  };
  await Promise.all([
    cachedBridgeAlbum("cache-A", "version1", load),
    cachedBridgeAlbum("cache-A", "version1", load),
  ]);
  assert.equal(calls, 1);
  await cachedBridgeAlbum("cache-A", "version1", load);
  assert.equal(calls, 1);
  await cachedBridgeAlbum("cache-B", "version1", load);
  assert.equal(calls, 2);
  await cachedBridgeAlbum("cache-A", "version2", load);
  assert.equal(calls, 3);
  await assert.rejects(
    cachedBridgeAlbum("cache-A", "failed", async () => {
      throw Error("unavailable");
    }),
  );
  await cachedBridgeAlbum("cache-A", "failed", load);
  assert.equal(calls, 4);
  await cachedBridgeAlbum("cache-A", undefined, load);
  await cachedBridgeAlbum("cache-A", undefined, load);
  assert.equal(calls, 6);
});

test("authenticated archive route returns own selected image, reauthenticates cache hits and hides stale references", async () => {
  process.env.PLAYFAB_SECRET_KEY = "test-secret";
  const f = albumFixture();
  const original = globalThis.fetch;
  let downloads = 0,
    authenticates = 0;
  let player = "AAA111",
    resultId = f.photo.resultId,
    imageHash = f.photo.sha256;
  const envelope = (data) => Response.json({ code: 200, data });
  globalThis.fetch = async (url, init) => {
    const path = String(url);
    if (path.endsWith("AuthenticateSessionTicket")) {
      authenticates++;
      return envelope({ UserInfo: { PlayFabId: player } });
    }
    if (path.endsWith("GetUserData"))
      return envelope({
        Data: {
          AlmanacProgress: {
            Value: JSON.stringify({
              regions: [
                {
                  regionId: f.photo.regionId,
                  levels: [
                    {
                      levelId: f.photo.contractId,
                      status: "completed",
                      completion: {
                        status: "success",
                        playerId: player,
                        score: 2,
                        resultId,
                        snapshot: { ...f.reference, resultId, sha256: imageHash },
                      },
                    },
                  ],
                },
              ],
            }),
          },
        },
      });
    if (path.endsWith("GetEntityToken"))
      return envelope({
        Entity: { Id: player + "-entity", Type: "title_player_account" },
        EntityToken: "private-token",
      });
    if (path.endsWith("GetFiles"))
      return envelope({
        Metadata: {
          "bridge-photos-v1.zip": {
            Checksum: "route-v1",
            DownloadUrl: "https://test.blob.core.windows.net/private/album?sig=private",
          },
        },
      });
    assert.equal(init.headers, undefined);
    downloads++;
    return new Response(f.bytes);
  };
  const request = () =>
    new Request(
      `https://example.test/api/player/bridge-snapshot?contractId=${f.photo.contractId}&regionId=${f.photo.regionId}`,
      { headers: { Authorization: "Bearer owner-ticket" } },
    );
  try {
    for (let n = 0; n < 2; n++) {
      const r = await handleBridgeSnapshot(request());
      assert.equal(r.status, 200);
      assert.equal(r.headers.get("cache-control"), "private, no-store");
      assert.deepEqual(new Uint8Array(await r.arrayBuffer()), new Uint8Array(f.image));
    }
    assert.equal(authenticates, 2);
    assert.equal(downloads, 1);
    player = "BBB222";
    await handleBridgeSnapshot(request());
    assert.equal(downloads, 2);
    imageHash = "0".repeat(64);
    assert.equal((await handleBridgeSnapshot(request())).status, 404);
    assert.equal(downloads, 2, "Cached content cannot satisfy a different image hash");
    resultId = "b".repeat(32);
    assert.equal((await handleBridgeSnapshot(request())).status, 404);
  } finally {
    globalThis.fetch = original;
  }
});
