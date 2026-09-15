import sharp from "sharp";
import { put, get, del } from "@vercel/blob";
import { AdminApiError } from "../playfab/admin-client.server.ts";
import { imageTypes, maxImageBytes } from "./content-types.ts";

function options() {
  const token = process.env["BLOB_READ_WRITE_TOKEN"]?.trim();
  if (!token) throw new AdminApiError(503, "Gallery image storage is not configured.");
  return { token };
}

/** Decode and re-encode: MIME labels and filename extensions are not trusted. */
export async function validateImage(bytes: Uint8Array, mime: string) {
  if (!imageTypes.includes(mime as (typeof imageTypes)[number]))
    throw new AdminApiError(415, "Choose a PNG, JPEG or WebP image.");
  if (!bytes.length || bytes.length > maxImageBytes)
    throw new AdminApiError(413, "Images must be between 1 byte and 4 MB.");
  try {
    const image = sharp(bytes, { limitInputPixels: 25_000_000, failOn: "warning" });
    const metadata = await image.metadata();
    const format = mime === "image/jpeg" ? "jpeg" : mime.split("/")[1];
    if (metadata.format !== format || (metadata.pages ?? 1) > 1) throw new Error();
    const output = await image
      .rotate()
      .toFormat(format as "png" | "jpeg" | "webp")
      .toBuffer();
    if (output.length > maxImageBytes)
      throw new AdminApiError(413, "The processed image exceeds 4 MB.");
    return { bytes: output, mime, extension: format };
  } catch (error) {
    if (error instanceof AdminApiError) throw error;
    throw new AdminApiError(
      400,
      "The file is not a valid static PNG, JPEG or WebP image (maximum 25 megapixels).",
    );
  }
}

export const imageStorage = {
  async write(path: string, bytes: Uint8Array, contentType: string) {
    const result = await put(path, Buffer.from(bytes), {
      ...options(),
      access: "private",
      contentType,
      addRandomSuffix: false,
    });
    return result.pathname;
  },
  async read(path: string) {
    return get(path, { ...options(), access: "private", useCache: false });
  },
  async remove(path: string) {
    await del(path, options());
  },
};
