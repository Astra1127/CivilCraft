import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AdminApiError, object, playFabAdmin } from "../playfab/admin-client.server.ts";
import { smallBody } from "../playfab/request-body.server.ts";
import { galleryCategories, maxImageBytes, updateCategories } from "./content-types.ts";
import { imageStorage, validateImage } from "./images.server.ts";
import type { GalleryItem, NewsArticle } from "./types.ts";

const prefix = "civilcraft.website.v1.";
const idSchema = z.string().uuid();
const gallerySchema = z.object({
  id: idSchema,
  caption: z.string().trim().min(3).max(200),
  category: z.enum(galleryCategories),
  visible: z.boolean(),
  createdAt: z.string().datetime(),
  storagePath: z.string().regex(/^civilcraft\/gallery\/[a-f0-9-]+\.(png|jpeg|webp)$/),
  contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
});
type StoredImage = z.infer<typeof gallerySchema>;
const articleFields = z.object({
  title: z.string().trim().min(3).max(160),
  category: z.enum(updateCategories),
  excerpt: z.string().trim().min(3).max(500),
  content: z.string().trim().min(3).max(5000),
  publishedAt: z.string().datetime(),
  status: z.enum(["draft", "published"]),
  coverUrl: z
    .string()
    .max(500)
    .refine((v) => {
      if (!v) return true;
      try {
        const url = new URL(v);
        return (
          url.protocol === "https:" &&
          !url.username &&
          !url.password &&
          !/\/api\/(?:admin\/)?content\/(?:update-images|images)\//.test(url.pathname) &&
          !url.hostname.endsWith(".private.blob.vercel-storage.com")
        );
      } catch {
        return false;
      }
    }, "Use a public HTTPS image URL or upload an image."),
  coverAlt: z.string().trim().max(200),
});
const storedHeroSchema = z.object({
  storagePath: z.string().regex(/^civilcraft\/updates\/[a-f0-9-]+\.(png|jpeg|webp)$/),
  contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
});
const articleSchema = articleFields.extend({
  hero: storedHeroSchema.optional(),
  notificationPublishedAt: z.string().datetime().optional(),
  retiredHeroes: z.array(storedHeroSchema).optional(),
  id: idSchema,
  slug: z.string().regex(/^[a-z0-9-]+$/),
});

type StoredArticle = z.infer<typeof articleSchema>;
const isPublished = (n: StoredArticle) =>
  n.status === "published" && Date.parse(n.publishedAt) <= Date.now();
function articleImageUrl(article: StoredArticle, admin: boolean) {
  return `${admin ? "/api/admin/content" : "/api/content"}/update-images/${article.id}?v=${article.hero?.storagePath.split("/").pop()}`;
}
function publicArticle(article: StoredArticle, admin: boolean): NewsArticle {
  const { hero, retiredHeroes, notificationPublishedAt, ...fields } = article;
  return { ...fields, coverUrl: hero ? articleImageUrl(article, admin) : fields.coverUrl };
}

async function records() {
  return object((await playFabAdmin("Admin/GetTitleInternalData"))["Data"]);
}
async function save(kind: string, id: string, value: unknown) {
  const serialized = value === null ? null : JSON.stringify(value);
  if (serialized && Buffer.byteLength(serialized) > 9500)
    throw new AdminApiError(400, "This article is too large. Shorten its content.");
  await playFabAdmin("Admin/SetTitleInternalData", {
    Key: prefix + kind + "." + id,
    Value: serialized,
  });
}
function parseRows<T>(data: Record<string, unknown>, kind: string, schema: z.ZodType<T>): T[] {
  return Object.entries(data)
    .filter(([key, value]) => key.startsWith(prefix + kind + ".") && value != null)
    .map(([key, value]) => {
      try {
        const result = schema.parse(JSON.parse(String(value)));
        if (key !== prefix + kind + "." + (result as { id: string }).id) throw new Error();
        return result;
      } catch {
        throw new AdminApiError(502, "Website content could not be read.");
      }
    });
}
function publicImage(image: StoredImage, admin: boolean): GalleryItem {
  return {
    id: image.id,
    caption: image.caption,
    category: image.category,
    visible: image.visible,
    createdAt: image.createdAt,
    url: `${admin ? "/api/admin/content" : "/api/content"}/images/${image.id}`,
  };
}
export async function listContent(admin = false) {
  const data = await records();
  return {
    gallery: parseRows(data, "gallery", gallerySchema)
      .filter((g) => admin || g.visible)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
      .map((g) => publicImage(g, admin)),
    updates: parseRows(data, "updates", articleSchema)
      .filter((n) => admin || isPublished(n))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id))
      .map((n) => publicArticle(n, admin)),
  };
}
async function readUpload(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data"))
    throw new AdminApiError(415, "An image file upload is required.");
  const reader = request.body?.getReader();
  if (!reader) throw new AdminApiError(400, "Choose an image file.");
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > maxImageBytes + 16_384)
        throw new AdminApiError(413, "Images must be 4 MB or smaller.");
      parts.push(part.value);
    }
  } finally {
    await reader.cancel();
  }
  try {
    return await new Response(Buffer.concat(parts), {
      headers: { "Content-Type": request.headers.get("content-type")! },
    }).formData();
  } catch {
    throw new AdminApiError(400, "The upload could not be read.");
  }
}
export async function uploadGallery(request: Request) {
  const form = await readUpload(request);
  const fields = z
    .object({
      caption: gallerySchema.shape.caption,
      category: gallerySchema.shape.category,
      visible: z.enum(["true", "false"]),
    })
    .parse(Object.fromEntries(form));
  const file = form.get("file");
  if (!(file instanceof File)) throw new AdminApiError(400, "Choose an image file.");
  const id = randomUUID();
  const image = await storeUpload(file, "gallery");
  const storagePath = image.storagePath;
  const record: StoredImage = {
    ...fields,
    id,
    visible: fields.visible === "true",
    storagePath,
    contentType: image.contentType,
    createdAt: new Date().toISOString(),
  };
  try {
    await save("gallery", id, record);
  } catch (error) {
    await imageStorage.remove(storagePath).catch(() => undefined);
    throw error;
  }
  return publicImage(record, true);
}
export async function changeGallery(body: Record<string, unknown>) {
  const input = z
    .object({
      id: idSchema,
      action: z.enum(["visibility", "delete"]),
      visible: z.boolean().optional(),
    })
    .parse(body);
  const image = parseRows(await records(), "gallery", gallerySchema).find((g) => g.id === input.id);
  if (!image) throw new AdminApiError(404, "Gallery item not found.");
  if (input.action === "delete") {
    // Hide first: even if object deletion fails, visitors cannot retrieve it.
    await save("gallery", image.id, { ...image, visible: false });
    await imageStorage.remove(image.storagePath);
    await save("gallery", image.id, null);
  } else {
    if (typeof input.visible !== "boolean")
      throw new AdminApiError(400, "Choose a visibility state.");
    await save("gallery", image.id, { ...image, visible: input.visible });
  }
  return { success: true };
}
/** Both Gallery and article images share bounded multipart parsing, Sharp and Blob. */
async function storeUpload(file: File, kind: "gallery" | "updates") {
  const image = await validateImage(new Uint8Array(await file.arrayBuffer()), file.type);
  const storagePath = await imageStorage.write(
    `civilcraft/${kind}/${randomUUID()}.${image.extension}`,
    image.bytes,
    image.mime,
  );
  return { storagePath, contentType: image.mime as "image/png" | "image/jpeg" | "image/webp" };
}
/** Retired images remain recorded for retry if object storage is unavailable. */
async function cleanRetired(article: StoredArticle) {
  const remaining: NonNullable<StoredArticle["retiredHeroes"]> = [];
  for (const image of article.retiredHeroes ?? []) {
    try {
      await imageStorage.remove(image.storagePath);
    } catch {
      remaining.push(image);
    }
  }
  return { ...article, retiredHeroes: remaining };
}
export async function changeUpdate(body: Record<string, unknown>, file?: File) {
  const action = z.enum(["save", "delete"]).parse(body["action"]);
  const id = body["id"] ? idSchema.parse(body["id"]) : randomUUID();
  const existing = parseRows(await records(), "updates", articleSchema).find((n) => n.id === id);
  if (body["id"] && !existing) throw new AdminApiError(404, "Update not found.");
  if (action === "delete") {
    if (!existing) throw new AdminApiError(404, "Update not found.");
    // Revoke public article/image access before object deletion, allowing safe retries.
    await save("updates", id, { ...existing, status: "draft" });
    for (const image of [
      ...(existing.retiredHeroes ?? []),
      ...(existing.hero ? [existing.hero] : []),
    ])
      await imageStorage.remove(image.storagePath);
    await save("updates", id, null);
    return { success: true };
  }
  const keepHero =
    !file &&
    !!existing?.hero &&
    [articleImageUrl(existing, true), articleImageUrl(existing, false)].includes(
      String(body["coverUrl"]),
    );
  const fields = articleFields.parse({
    ...body,
    coverUrl: keepHero || file ? "" : body["coverUrl"],
  });
  const base =
    fields.title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80)
      .replace(/-$/g, "") || "update";
  const hero = file ? await storeUpload(file, "updates") : keepHero ? existing?.hero : undefined;
  const retiredHeroes = existing ? (await cleanRetired(existing)).retiredHeroes : [];
  if (existing?.hero && !keepHero) retiredHeroes.push(existing.hero);
  const article: StoredArticle = {
    ...fields,
    id,
    slug: existing?.slug ?? `${base}-${id}`,
    ...(existing?.notificationPublishedAt
      ? { notificationPublishedAt: existing.notificationPublishedAt }
      : fields.status === "published" && existing?.status !== "published"
        ? {
            notificationPublishedAt: new Date(
              Math.max(Date.now(), Date.parse(fields.publishedAt)),
            ).toISOString(),
          }
        : {}),
    ...(hero ? { hero } : {}),
    retiredHeroes,
  };
  try {
    await save("updates", id, article);
  } catch (error) {
    if (file && hero) await imageStorage.remove(hero.storagePath).catch(() => undefined);
    throw error;
  }
  // Unique upload paths are owned by one article, never shared or accepted from clients.
  if (retiredHeroes.length) {
    // Do not write the article again after slow object cleanup: that could
    // overwrite a newer edit or resurrect an article another admin deleted.
    // References are pruned on the next save; deletion is idempotent.
    await cleanRetired(article);
  }
  return publicArticle(article, true);
}
async function updateImageResponse(id: string, admin: boolean) {
  if (!idSchema.safeParse(id).success) throw new AdminApiError(404, "Image not found.");
  const article = parseRows(await records(), "updates", articleSchema).find(
    (n) => n.id === id && (admin || isPublished(n)),
  );
  if (!article?.hero) throw new AdminApiError(404, "Image not found.");
  return storedImageResponse(article.hero);
}
async function storedImageResponse(image: { storagePath: string; contentType: string }) {
  const result = await imageStorage.read(image.storagePath);
  if (!result || result.statusCode !== 200) throw new AdminApiError(404, "Image not found.");
  return new Response(result.stream, {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
async function imageResponse(id: string, admin: boolean) {
  if (!idSchema.safeParse(id).success) throw new AdminApiError(404, "Image not found.");
  const image = parseRows(await records(), "gallery", gallerySchema).find(
    (g) => g.id === id && (admin || g.visible),
  );
  if (!image) throw new AdminApiError(404, "Image not found.");
  return storedImageResponse(image);
}
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
    },
  });
/** Admin callers must pass through the existing staff session/origin gate first. */
export async function contentRequest(request: Request, admin = false): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const root = admin ? "/api/admin/content" : "/api/content";
  if (path !== root && !path.startsWith(root + "/")) return null;
  try {
    if (request.method === "GET") {
      if (path === root) return json(await listContent(admin));
      if (path.startsWith(root + "/update-images/"))
        return await updateImageResponse(path.slice((root + "/update-images/").length), admin);
      if (path.startsWith(root + "/images/"))
        return await imageResponse(path.slice((root + "/images/").length), admin);
    }
    if (request.method === "POST" && admin) {
      if (path === root + "/upload") return json(await uploadGallery(request), 201);
      if (path === root + "/gallery") return json(await changeGallery(await smallBody(request)));
      if (path === root + "/updates") {
        if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
          const form = await readUpload(request);
          let body: Record<string, unknown>;
          try {
            body = object(JSON.parse(String(form.get("article"))));
          } catch {
            throw new AdminApiError(400, "The article could not be read.");
          }
          const file = form.get("file");
          if (!(file instanceof File)) throw new AdminApiError(400, "Choose an image file.");
          return json(await changeUpdate(body, file));
        }
        return json(await changeUpdate(await smallBody(request)));
      }
    }
    return json({ error: "Endpoint not found." }, 404);
  } catch (error) {
    if (error instanceof z.ZodError)
      return json({ error: "Check the content fields and try again." }, 400);
    if (error instanceof AdminApiError) return json({ error: error.message }, error.status);
    return json({ error: "Website content is temporarily unavailable. Please try again." }, 503);
  }
}
