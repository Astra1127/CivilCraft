import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";
import { APK_CONTENT_TYPE, MAX_APK_BYTES, validateApkSelection } from "../src/lib/cms/apk.ts";
import { validateApkArchive } from "../src/lib/cms/apk-validation.server.ts";

const binaryManifest = Buffer.from([3, 0, 8, 0, 8, 0, 0, 0]);
const dex = Buffer.from("dex\n035\0");
type Entry = { name: string; bytes: Buffer; method?: number; flags?: number };

/** Small structural fixtures; these tests never upload to a real storage provider. */
function zip(entries: Entry[]): Buffer {
  const localRecords: Buffer[] = [];
  const directoryRecords: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const method = entry.method ?? 0;
    const compressed = method === 8 ? deflateRawSync(entry.bytes) : entry.bytes;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(entry.flags ?? 0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    localRecords.push(local, name, compressed);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(entry.flags ?? 0, 8);
    directory.writeUInt16LE(method, 10);
    directory.writeUInt32LE(compressed.length, 20);
    directory.writeUInt32LE(entry.bytes.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(offset, 42);
    directoryRecords.push(directory, name);
    offset += local.length + name.length + compressed.length;
  }
  const directory = Buffer.concat(directoryRecords);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localRecords, directory, end]);
}

const apk = () =>
  zip([
    { name: "AndroidManifest.xml", bytes: binaryManifest },
    { name: "classes.dex", bytes: dex },
  ]);
const validate = (bytes: Buffer) =>
  validateApkArchive(bytes.length, async (start, end) => bytes.subarray(start, end + 1));

test("APK selection uses a 512 MiB limit and a safe, normalized APK filename", () => {
  assert.equal(MAX_APK_BYTES, 512 * 1024 * 1024);
  assert.equal(APK_CONTENT_TYPE, "application/vnd.android.package-archive");
  assert.equal(
    validateApkSelection({ name: " Civil Craft 1.2.APK ", size: 100 }),
    "Civil-Craft-1.2.apk",
  );
  assert.equal(validateApkSelection({ name: "game.apk", size: MAX_APK_BYTES }), "game.apk");
  for (const size of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, MAX_APK_BYTES + 1])
    assert.throws(() => validateApkSelection({ name: "game.apk", size }));
});

test("APK selection rejects other archive types, path segments and control characters", () => {
  for (const name of [
    "",
    "game.zip",
    "game.aab",
    "game.apk.exe",
    "../game.apk",
    "folder/game.apk",
    "folder\\game.apk",
    "game\0.apk",
    "x".repeat(256) + ".apk",
  ])
    assert.throws(() => validateApkSelection({ name, size: 100 }), name);
});

test("stored and deflated binary Android manifests with Android code are accepted", async () => {
  await validate(apk());
  await validate(
    zip([
      { name: "AndroidManifest.xml", bytes: binaryManifest, method: 8 },
      { name: "classes2.dex", bytes: dex },
    ]),
  );
  await validate(
    zip([
      { name: "AndroidManifest.xml", bytes: binaryManifest },
      { name: "lib/arm64-v8a/libgame.so", bytes: Buffer.from([0x7f, 0x45, 0x4c, 0x46]) },
    ]),
  );
});

test("deflated DEX and native library entries require valid Android code signatures", async () => {
  for (const entry of [
    { name: "classes.dex", bytes: dex },
    { name: "lib/arm64-v8a/libgame.so", bytes: Buffer.from([0x7f, 0x45, 0x4c, 0x46]) },
  ]) {
    await validate(
      zip([
        { name: "AndroidManifest.xml", bytes: binaryManifest },
        { ...entry, method: 8 },
      ]),
    );
    await assert.rejects(
      validate(
        zip([
          { name: "AndroidManifest.xml", bytes: binaryManifest },
          { ...entry, bytes: Buffer.from("bad-code"), method: 8 },
        ]),
      ),
    );
  }
});

test("a ZIP extension or signature alone cannot pass Android APK validation", async () => {
  for (const bytes of [
    Buffer.from("not an archive"),
    zip([{ name: "readme.txt", bytes: Buffer.from("ordinary zip") }]),
    zip([{ name: "AndroidManifest.xml", bytes: binaryManifest }]),
    zip([{ name: "classes.dex", bytes: dex }]),
    zip([
      { name: "AndroidManifest.xml", bytes: Buffer.from("<manifest package='fake' />") },
      { name: "classes.dex", bytes: dex },
    ]),
    zip([
      { name: "AndroidManifest.xml", bytes: binaryManifest },
      { name: "classes.dex", bytes: Buffer.alloc(0) },
    ]),
  ])
    await assert.rejects(validate(bytes));
});

test("manifest chunk header and declared binary XML size must match", async () => {
  for (const offset of [0, 2, 4]) {
    const manifest = Buffer.from(binaryManifest);
    manifest[offset] = manifest[offset]! ^ 1;
    await assert.rejects(
      validate(
        zip([
          { name: "AndroidManifest.xml", bytes: manifest },
          { name: "classes.dex", bytes: dex },
        ]),
      ),
    );
  }
});

test("ambiguous, encrypted and unsafe archive entries are rejected", async () => {
  for (const extra of [
    { name: "AndroidManifest.xml", bytes: binaryManifest },
    { name: "../asset.txt", bytes: Buffer.from("unsafe") },
    { name: "assets\\asset.txt", bytes: Buffer.from("unsafe") },
    { name: "/asset.txt", bytes: Buffer.from("unsafe") },
    { name: "encrypted.txt", bytes: Buffer.from("secret"), flags: 1 },
  ])
    await assert.rejects(
      validate(
        zip([
          { name: "AndroidManifest.xml", bytes: binaryManifest },
          { name: "classes.dex", bytes: dex },
          extra,
        ]),
      ),
    );
});

test("malformed central directories and local manifest records fail closed", async () => {
  const wrongDirectory = apk();
  wrongDirectory.writeUInt32LE(0xffffffff, wrongDirectory.length - 22 + 16);
  const multiDisk = apk();
  multiDisk.writeUInt16LE(1, multiDisk.length - 22 + 4);
  const wrongLocal = apk();
  wrongLocal.writeUInt32LE(0, 0);
  const wrongName = apk();
  wrongName[30] = "X".charCodeAt(0);
  for (const bytes of [
    wrongDirectory,
    multiDisk,
    wrongLocal,
    wrongName,
    apk().subarray(0, apk().length - 1),
  ])
    await assert.rejects(validate(bytes));
});

test("code payload bounds must fit before the central directory", async () => {
  const bytes = apk();
  const directoryOffset = bytes.readUInt32LE(bytes.length - 22 + 16);
  const codeRecord = directoryOffset + 46 + Buffer.byteLength("AndroidManifest.xml");
  bytes.writeUInt32LE(500_000_000, codeRecord + 20);
  await assert.rejects(
    validateApkArchive(bytes.length, async (start, end) => {
      assert.ok(
        start >= 0 && end < bytes.length,
        "Invalid code metadata cannot trigger an out-of-bounds storage read",
      );
      return bytes.subarray(start, end + 1);
    }),
  );
});

test("code local records and Android code signatures must agree with directory metadata", async () => {
  const badOffset = apk();
  const directoryOffset = badOffset.readUInt32LE(badOffset.length - 22 + 16);
  const codeRecord = directoryOffset + 46 + Buffer.byteLength("AndroidManifest.xml");
  const codeOffset = badOffset.readUInt32LE(codeRecord + 42);
  badOffset.writeUInt32LE(1, codeRecord + 42);
  const badSignature = apk();
  badSignature.writeUInt32LE(0, codeOffset);
  const badName = apk();
  badName[codeOffset + 30] = "X".charCodeAt(0);
  const badDex = apk();
  badDex[codeOffset + 30 + Buffer.byteLength("classes.dex")] = "X".charCodeAt(0);
  const badNative = zip([
    { name: "AndroidManifest.xml", bytes: binaryManifest },
    { name: "lib/arm64-v8a/libgame.so", bytes: Buffer.from("not ELF") },
  ]);
  for (const bytes of [badOffset, badSignature, badName, badDex, badNative])
    await assert.rejects(validate(bytes));
});

test("invalid object sizes are rejected before any storage range is read", async () => {
  for (const size of [0, 21, -1, 25.5, MAX_APK_BYTES + 1]) {
    let calls = 0;
    await assert.rejects(
      validateApkArchive(size, async () => {
        calls++;
        return new Uint8Array();
      }),
    );
    assert.equal(calls, 0);
  }
});

test("short storage ranges are rejected instead of silently accepting truncated data", async () => {
  const bytes = apk();
  await assert.rejects(
    validateApkArchive(bytes.length, async (start, end) => bytes.subarray(start, end)),
  );
});

test("validation reads only bounded metadata and manifest ranges for a large APK", async () => {
  const largeDex = Buffer.alloc(12 * 1024 * 1024, 7);
  dex.copy(largeDex);
  const bytes = zip([
    { name: "AndroidManifest.xml", bytes: binaryManifest },
    { name: "classes.dex", bytes: largeDex },
  ]);
  const ranges: [number, number][] = [];
  await validateApkArchive(bytes.length, async (start, end) => {
    assert.ok(start >= 0 && end < bytes.length && start <= end);
    ranges.push([start, end]);
    return bytes.subarray(start, end + 1);
  });
  const bytesRead = ranges.reduce((total, [start, end]) => total + end - start + 1, 0);
  assert.ok(bytesRead < 1024 * 1024, `Read ${bytesRead} bytes from a ${bytes.length}-byte APK`);
  assert.ok(ranges.length < 20);
});
