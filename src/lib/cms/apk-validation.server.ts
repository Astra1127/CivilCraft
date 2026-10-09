import { createInflateRaw, inflateRawSync } from "node:zlib";
import { AdminApiError } from "../playfab/admin-client.server.ts";
import { MAX_APK_BYTES } from "./apk.ts";

const MAX_DIRECTORY_BYTES = 8 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
type ReadRange = (start: number, end: number) => Promise<Uint8Array>;
const invalid = () => new AdminApiError(400, "This file is not a supported Android APK archive.");
type ZipEntry = {
  name: string;
  offset: number;
  compressed: number;
  uncompressed: number;
  method: number;
  flags: number;
};

/** Stop decompression once the short code magic is available, even for huge dex/native files. */
function inflatePrefix(bytes: Uint8Array, needed: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const inflater = createInflateRaw({ chunkSize: 256 });
    let prefix = Buffer.alloc(0);
    let settled = false;
    inflater.on("data", (chunk: Buffer) => {
      prefix = Buffer.concat([prefix, chunk.subarray(0, needed - prefix.length)]);
      if (prefix.length === needed && !settled) {
        settled = true;
        inflater.destroy();
        resolve(prefix);
      }
    });
    inflater.on("error", () => {
      if (!settled) {
        settled = true;
        reject(invalid());
      }
    });
    inflater.on("end", () => {
      if (!settled) {
        settled = true;
        reject(invalid());
      }
    });
    inflater.end(bytes);
  });
}

/** Inspect bounded ZIP records, not the entire APK or arbitrary compressed assets. */
export async function validateApkArchive(size: number, readRange: ReadRange): Promise<void> {
  if (!Number.isSafeInteger(size) || size < 22 || size > MAX_APK_BYTES) throw invalid();
  const read = async (start: number, end: number) => {
    if (start < 0 || end < start || end >= size || end - start + 1 > MAX_DIRECTORY_BYTES)
      throw invalid();
    const bytes = Buffer.from(await readRange(start, end));
    if (bytes.length !== end - start + 1) throw invalid();
    return bytes;
  };
  const tailStart = Math.max(0, size - 65557);
  const tail = await read(tailStart, size - 1);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === 0x06054b50 && i + 22 + tail.readUInt16LE(i + 20) === tail.length) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw invalid();
  const count = tail.readUInt16LE(eocd + 10);
  const directorySize = tail.readUInt32LE(eocd + 12);
  const directoryOffset = tail.readUInt32LE(eocd + 16);
  // Multi-disk and ZIP64 packages are not needed within the 512 MB upload limit.
  if (
    tail.readUInt16LE(eocd + 4) ||
    tail.readUInt16LE(eocd + 6) ||
    tail.readUInt16LE(eocd + 8) !== count ||
    !count ||
    count === 65535 ||
    !directorySize ||
    directorySize > MAX_DIRECTORY_BYTES ||
    directoryOffset + directorySize !== tailStart + eocd
  )
    throw invalid();
  const directory = await read(directoryOffset, directoryOffset + directorySize - 1);
  let cursor = 0;
  let manifest: ZipEntry | undefined;
  let code: ZipEntry | undefined;
  const names = new Set<string>();
  for (let entry = 0; entry < count; entry++) {
    if (cursor + 46 > directory.length || directory.readUInt32LE(cursor) !== 0x02014b50)
      throw invalid();
    const flags = directory.readUInt16LE(cursor + 8);
    const method = directory.readUInt16LE(cursor + 10);
    const compressed = directory.readUInt32LE(cursor + 20);
    const uncompressed = directory.readUInt32LE(cursor + 24);
    const nameLength = directory.readUInt16LE(cursor + 28);
    const extraLength = directory.readUInt16LE(cursor + 30);
    const commentLength = directory.readUInt16LE(cursor + 32);
    const offset = directory.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (
      !nameLength ||
      next > directory.length ||
      flags & 1 ||
      directory.readUInt16LE(cursor + 34) ||
      offset >= directoryOffset ||
      offset + 30 + nameLength + compressed > directoryOffset ||
      compressed === 0xffffffff ||
      uncompressed === 0xffffffff
    )
      throw invalid();
    const name = directory.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    if (
      names.has(name) ||
      name.includes("\0") ||
      name.includes("\\") ||
      name.startsWith("/") ||
      name.split("/").includes("..")
    )
      throw invalid();
    names.add(name);
    const record = { name, offset, compressed, uncompressed, method, flags };
    if (
      !code &&
      uncompressed > 0 &&
      (/^classes(?:[1-9][0-9]*)?\.dex$/.test(name) || /^lib\/[^/]+\/[^/]+\.so$/.test(name))
    )
      code = record;
    if (name === "AndroidManifest.xml") manifest = record;
    cursor = next;
  }
  if (
    cursor !== directory.length ||
    !manifest ||
    !code ||
    manifest.compressed < 8 ||
    manifest.compressed > MAX_MANIFEST_BYTES ||
    manifest.uncompressed < 8 ||
    manifest.uncompressed > MAX_MANIFEST_BYTES ||
    ![0, 8].includes(manifest.method)
  )
    throw invalid();
  const localDataStart = async (entry: ZipEntry) => {
    if (![0, 8].includes(entry.method)) throw invalid();
    const local = await read(entry.offset, entry.offset + 29);
    if (
      local.readUInt32LE(0) !== 0x04034b50 ||
      local.readUInt16LE(8) !== entry.method ||
      local.readUInt16LE(6) !== entry.flags
    )
      throw invalid();
    const nameLength = local.readUInt16LE(26);
    const extraLength = local.readUInt16LE(28);
    if (nameLength !== Buffer.byteLength(entry.name)) throw invalid();
    const name = await read(entry.offset + 30, entry.offset + 29 + nameLength);
    if (name.toString("utf8") !== entry.name) throw invalid();
    const start = entry.offset + 30 + nameLength + extraLength;
    if (start + entry.compressed > directoryOffset) throw invalid();
    return start;
  };
  const dataStart = await localDataStart(manifest);
  const compressed = await read(dataStart, dataStart + manifest.compressed - 1);
  let xml: Buffer;
  try {
    xml =
      manifest.method === 0
        ? compressed
        : inflateRawSync(compressed, { maxOutputLength: MAX_MANIFEST_BYTES });
  } catch {
    throw invalid();
  }
  // Android packages carry compiled binary XML, not a renamed ordinary ZIP.
  if (
    xml.length !== manifest.uncompressed ||
    xml.readUInt16LE(0) !== 3 ||
    xml.readUInt16LE(2) !== 8 ||
    xml.readUInt32LE(4) !== xml.length
  )
    throw invalid();
  const codeStart = await localDataStart(code);
  const needed = code.name.endsWith(".dex") ? 8 : 4;
  if (code.uncompressed < needed || code.compressed < 1) throw invalid();
  const rawPrefix = await read(
    codeStart,
    codeStart + Math.min(code.compressed, code.method === 0 ? needed : 65536) - 1,
  );
  const codePrefix = code.method === 0 ? rawPrefix : await inflatePrefix(rawPrefix, needed);
  if (code.name.endsWith(".dex")) {
    if (
      codePrefix.length !== 8 ||
      codePrefix.subarray(0, 4).toString("ascii") !== "dex\n" ||
      !/^[0-9]{3}$/.test(codePrefix.subarray(4, 7).toString("ascii")) ||
      codePrefix[7] !== 0
    )
      throw invalid();
  } else if (!codePrefix.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) throw invalid();
}
