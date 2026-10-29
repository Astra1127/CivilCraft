import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { crc32 } from "../../src/lib/playfab/bridge-photo-album.server.ts";

export function png(width = 2, height = 2) {
  const chunk = (name, body) => {
    const result = Buffer.alloc(body.length + 12);
    result.writeUInt32BE(body.length);
    result.write(name, 4, "ascii");
    body.copy(result, 8);
    result.writeUInt32BE(crc32(result.subarray(4, 8 + body.length)), body.length + 8);
    return result;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.alloc((width * 4 + 1) * height))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
export function packStore(entries) {
  const local = [],
    central = [];
  let offset = 0;
  for (const [name, value] of entries) {
    const body = Buffer.from(value),
      encoded = Buffer.from(name),
      crc = crc32(body);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50);
    h.writeUInt16LE(20, 4);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(body.length, 18);
    h.writeUInt32LE(body.length, 22);
    h.writeUInt16LE(encoded.length, 26);
    local.push(h, encoded, body);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(body.length, 20);
    c.writeUInt32LE(body.length, 24);
    c.writeUInt16LE(encoded.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, encoded);
    offset += 30 + encoded.length + body.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
export function albumFixture(options = {}) {
  const image = options.png ?? png();
  const photo = {
    contractId: "ShopKeeper",
    regionId: "canyon-crossing",
    resultId: "a".repeat(32),
    entryName: `bridge-${"a".repeat(32)}.png`,
    sha256: createHash("sha256").update(image).digest("hex"),
    ...options.photo,
  };
  const photos = options.photos ?? [photo];
  const manifest = options.manifest ?? { schemaVersion: 1, photos };
  const entries = options.entries ?? [
    ["manifest.json", JSON.stringify(manifest)],
    [photo.entryName, image],
  ];
  return {
    image,
    photo,
    entries,
    bytes: packStore(entries),
    reference: { storage: "archive-v1", fileName: "bridge-photos-v1.zip", ...photo },
  };
}

// Explicit cross-runtime test artifact generator; never reads player files.
if (process.argv[2] === "--write-fixture") {
  if (!process.argv[3]) throw new Error("Pass the output fixture path");
  writeFileSync(process.argv[3], albumFixture().bytes);
  console.log("Wrote canonical website album fixture.");
}
