import { createHash } from "node:crypto";
import type { BridgeAlbumSnapshot } from "./types.ts";

export const BRIDGE_ALBUM_FILE = "bridge-photos-v1.zip";
export const MAX_ALBUM_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_BYTES = 512 * 1024;
const MAX_MANIFEST_BYTES = 64 * 1024;
const IMAGE_NAME = /^bridge-[a-f0-9]{32}\.png$/;
const HASH = /^[a-f0-9]{64}$/;
const RESULT = /^[a-f0-9]{32}$/;
const PNG = [137, 80, 78, 71, 13, 10, 26, 10];
export interface AlbumPhoto {
  contractId: string;
  regionId: string;
  resultId: string;
  entryName: string;
  sha256: string;
  capturedAt?: string;
}
export interface BridgePhotoAlbum {
  photos: AlbumPhoto[];
  images: Map<string, Uint8Array>;
  byteLength: number;
}
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const id = (v: unknown): v is string =>
  typeof v === "string" &&
  v.length > 0 &&
  v.length <= 200 &&
  v.trim() === v &&
  [...v].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127);
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** A bounded structural PNG check. No image decoding or file extraction occurs here. */
export function validateAlbumPng(bytes: Uint8Array): void {
  if (bytes.length < 57 || bytes.length > MAX_IMAGE_BYTES || !PNG.every((v, i) => bytes[i] === v))
    throw new Error("Invalid album PNG");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let hasData = false;
  let ended = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error("Truncated PNG");
    const size = view.getUint32(offset);
    if (size > bytes.length - offset - 12) throw new Error("Invalid PNG chunk");
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (!/^[A-Za-z]{4}$/.test(type)) throw new Error("Invalid PNG chunk type");
    if (crc32(bytes.subarray(offset + 4, offset + 8 + size)) !== view.getUint32(offset + 8 + size))
      throw new Error("Invalid PNG checksum");
    if (offset === 8) {
      if (type !== "IHDR" || size !== 13) throw new Error("Missing PNG dimensions");
      const width = view.getUint32(offset + 8);
      const height = view.getUint32(offset + 12);
      if (!width || !height || width > 960 || height > 540)
        throw new Error("PNG dimensions exceeded");
    } else if (type === "IHDR") throw new Error("Duplicate PNG header");
    if (type === "IDAT" && size > 0) hasData = true;
    if (type === "IEND") {
      if (size !== 0 || offset + 12 !== bytes.length) throw new Error("Invalid PNG end");
      ended = true;
    }
    offset += size + 12;
  }
  if (!hasData || !ended) throw new Error("Incomplete PNG");
}

/** Canonical STORE-only ZIP. Rejects compression, descriptors, ZIP64 and ambiguous paths. */
export function parseBridgePhotoAlbum(bytes: Uint8Array): BridgePhotoAlbum {
  if (bytes.length < 22 || bytes.length > MAX_ALBUM_BYTES) throw new Error("Invalid album size");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  if (
    v.getUint32(end, true) !== 0x06054b50 ||
    v.getUint16(end + 4, true) !== 0 ||
    v.getUint16(end + 6, true) !== 0 ||
    v.getUint16(end + 20, true) !== 0
  )
    throw new Error("Invalid ZIP end");
  const count = v.getUint16(end + 10, true);
  const directorySize = v.getUint32(end + 12, true);
  const directory = v.getUint32(end + 16, true);
  if (
    !count ||
    count > 65 ||
    count !== v.getUint16(end + 8, true) ||
    directory + directorySize !== end
  )
    throw new Error("Invalid ZIP directory");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const files = new Map<string, Uint8Array>();
  let central = directory;
  let local = 0;
  for (let n = 0; n < count; n++) {
    if (central + 46 > end || v.getUint32(central, true) !== 0x02014b50)
      throw new Error("Invalid ZIP entry");
    const flags = v.getUint16(central + 8, true);
    const size = v.getUint32(central + 24, true);
    const nameLength = v.getUint16(central + 28, true);
    if (
      v.getUint16(central + 6, true) > 20 ||
      (flags !== 0 && flags !== 0x800) ||
      v.getUint16(central + 10, true) !== 0 ||
      v.getUint32(central + 20, true) !== size ||
      v.getUint16(central + 30, true) !== 0 ||
      v.getUint16(central + 32, true) !== 0 ||
      v.getUint16(central + 34, true) !== 0 ||
      v.getUint32(central + 42, true) !== local ||
      !nameLength ||
      nameLength > 100 ||
      central + 46 + nameLength > end ||
      ((v.getUint32(central + 38, true) >>> 16) & 0xf000) === 0xa000
    )
      throw new Error("Unsupported ZIP entry");
    const name = decoder.decode(bytes.subarray(central + 46, central + 46 + nameLength));
    if (
      (name !== "manifest.json" && !IMAGE_NAME.test(name)) ||
      files.has(name) ||
      size > (name === "manifest.json" ? MAX_MANIFEST_BYTES : MAX_IMAGE_BYTES)
    )
      throw new Error("Invalid album entry name or size");
    if (
      local + 30 + nameLength + size > directory ||
      v.getUint32(local, true) !== 0x04034b50 ||
      v.getUint16(local + 4, true) > 20 ||
      v.getUint16(local + 6, true) !== flags ||
      v.getUint16(local + 8, true) !== 0 ||
      v.getUint32(local + 14, true) !== v.getUint32(central + 16, true) ||
      v.getUint32(local + 18, true) !== size ||
      v.getUint32(local + 22, true) !== size ||
      v.getUint16(local + 26, true) !== nameLength ||
      v.getUint16(local + 28, true) !== 0 ||
      decoder.decode(bytes.subarray(local + 30, local + 30 + nameLength)) !== name
    )
      throw new Error("ZIP headers disagree");
    const body = bytes.subarray(local + 30 + nameLength, local + 30 + nameLength + size);
    if (crc32(body) !== v.getUint32(central + 16, true)) throw new Error("Invalid ZIP checksum");
    files.set(name, body);
    local += 30 + nameLength + size;
    central += 46 + nameLength;
  }
  if (local !== directory || central !== end) throw new Error("Unexpected ZIP data");
  const manifestBytes = files.get("manifest.json");
  if (!manifestBytes) throw new Error("Missing album index");
  const manifest = record(JSON.parse(decoder.decode(manifestBytes)));
  if (
    manifest["schemaVersion"] !== 1 ||
    !Array.isArray(manifest["photos"]) ||
    manifest["photos"].length > 64
  )
    throw new Error("Invalid album index");
  const photos: AlbumPhoto[] = [];
  const targets = new Set<string>();
  const entries = new Set<string>();
  for (const value of manifest["photos"]) {
    const p = record(value);
    if (
      !id(p["contractId"]) ||
      !id(p["regionId"]) ||
      typeof p["resultId"] !== "string" ||
      !RESULT.test(p["resultId"]) ||
      p["entryName"] !== `bridge-${p["resultId"]}.png` ||
      typeof p["sha256"] !== "string" ||
      !HASH.test(p["sha256"])
    )
      throw new Error("Invalid photo identity");
    const key = JSON.stringify([p["regionId"], p["contractId"]]);
    const name = p["entryName"] as string;
    const image = files.get(name);
    if (targets.has(key) || entries.has(name) || !image || sha256(image) !== p["sha256"])
      throw new Error("Ambiguous or mismatched photo");
    validateAlbumPng(image);
    targets.add(key);
    entries.add(name);
    photos.push({
      contractId: p["contractId"],
      regionId: p["regionId"],
      resultId: p["resultId"],
      entryName: name,
      sha256: p["sha256"],
      ...(typeof p["capturedAt"] === "string" ? { capturedAt: p["capturedAt"] } : {}),
    });
  }
  if (files.size !== entries.size + 1) throw new Error("Unindexed album images");
  files.delete("manifest.json");
  return { photos, images: files, byteLength: bytes.length };
}

export function albumImage(
  album: BridgePhotoAlbum,
  reference: BridgeAlbumSnapshot,
): Uint8Array | undefined {
  const photo = album.photos.find(
    (p) => p.contractId === reference.contractId && p.regionId === reference.regionId,
  );
  if (
    !photo ||
    photo.resultId !== reference.resultId ||
    photo.entryName !== reference.entryName ||
    photo.sha256 !== reference.sha256
  )
    return undefined;
  return album.images.get(photo.entryName);
}

// The cache never substitutes authorization: the handler reauthenticates and
// rereads own projection/entity/file metadata before each lookup.
const cache = new Map<string, { value: BridgePhotoAlbum; expires: number }>();
const pending = new Map<string, Promise<BridgePhotoAlbum>>();
const MAX_CACHE_BYTES = 32 * 1024 * 1024;
const MAX_CACHE_ITEMS = 8;
export async function cachedBridgeAlbum(
  owner: string,
  checksum: unknown,
  load: () => Promise<Uint8Array>,
): Promise<BridgePhotoAlbum> {
  // No checksum means no reusable version signal. Never cache by a signed URL.
  if (typeof checksum !== "string" || !/^[A-Za-z0-9+/=_-]{1,128}$/.test(checksum))
    return parseBridgePhotoAlbum(await load());
  const key = JSON.stringify([owner, checksum]);
  const now = Date.now();
  for (const [k, item] of cache) if (item.expires <= now) cache.delete(k);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit.value;
  }
  const active = pending.get(key);
  if (active) return active;
  if (pending.size >= 8) throw new Error("Album service busy");
  const request = (async () => {
    const value = parseBridgePhotoAlbum(await load());
    cache.set(key, { value, expires: Date.now() + 60_000 });
    let total = [...cache.values()].reduce((sum, item) => sum + item.value.byteLength, 0);
    while (cache.size > MAX_CACHE_ITEMS || total > MAX_CACHE_BYTES) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      total -= cache.get(oldest)!.value.byteLength;
      cache.delete(oldest);
    }
    return value;
  })();
  pending.set(key, request);
  try {
    return await request;
  } finally {
    pending.delete(key);
  }
}
