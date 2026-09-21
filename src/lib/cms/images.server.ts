import sharp from "sharp";
import { put, get, del, list } from "@vercel/blob";
import { AdminApiError } from "../playfab/admin-client.server.ts";
import { imageTypes, maxImageBytes } from "./content-types.ts";

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
  /** SDK resolves runtime OIDC credentials, including supported local CLI refresh. */
  async configuration(): Promise<"Configured" | "Unavailable"> {
    try {
      await list({
        prefix: "civilcraft/gallery/",
        limit: 1,
        abortSignal: AbortSignal.timeout(5000),
      });
      return "Configured";
    } catch {
      // Never expose provider errors, credentials, paths or listing results.
      return "Unavailable";
    }
  },
  async write(path: string, bytes: Uint8Array, contentType: string) {
    const result = await put(path, Buffer.from(bytes), {
      access: "private",
      contentType,
      addRandomSuffix: false,
    });
    return result.pathname;
  },
  async read(path: string) {
    return get(path, { access: "private", useCache: false });
  },
  async remove(path: string) {
    await del(path);
  },
};
