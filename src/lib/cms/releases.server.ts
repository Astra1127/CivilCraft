import { z } from "zod";
import { AdminApiError, object, playFabAdmin } from "../playfab/admin-client.server.ts";
import { smallBody } from "../playfab/request-body.server.ts";
import type { Release } from "./types.ts";
import type { AdminUser } from "../admin-auth/types.ts";
import { APK_CONTENT_TYPE } from "./apk.ts";
import { apkStorage } from "./apk-storage.server.ts";
import { validateApkArchive } from "./apk-validation.server.ts";
import { apkPathSchema, createApkUploadTicket, readApkUploadTicket } from "./apk-ticket.server.ts";
import type { HandleUploadPresignedBody } from "@vercel/blob/client";

const prefix = "civilcraft.website.v1.releases.";
const configKey = "civilcraft.website.v1.release-config";
const idSchema = z.string().regex(/^[a-zA-Z0-9-]{1,64}$/);
const apkSchema = z.object({
  storagePath: apkPathSchema,
  fileName: z.string().min(5).max(114),
  fileSizeBytes: z.number().int().positive(),
  etag: z.string().min(1).max(256),
  uploadedAt: z.string().datetime(),
});
const schema = z
  .object({
    id: idSchema,
    title: z.string().trim().max(160).default(""),
    version: z.string().trim().min(1).max(40),
    build: z.string().trim().min(1).max(40),
    notes: z.string().trim().max(5000),
    releaseDate: z.string().date(),
    published: z.boolean().default(false),
    status: z.enum(["draft", "current", "archived"]),
    platform: z.string().max(80),
    fileName: z.string().max(255).nullable(),
    fileSizeBytes: z.number().nonnegative().nullable(),
    fileUrl: z.string().max(2000).nullable(),
    apk: apkSchema.optional(),
    minAndroid: z.string().max(40),
    downloads: z.number().nonnegative(),
    minRequirements: z.array(z.string().max(300)).max(20),
    recommendedRequirements: z.array(z.string().max(300)).max(20),
  })
  .refine(
    (r) => !r.published || Boolean(r.title && r.notes),
    "Published updates require a title and release notes.",
  );
type StoredRelease = z.infer<typeof schema>;

function publicRelease(release: StoredRelease): Release {
  const { apk, ...fields } = release;
  return {
    ...fields,
    ...(apk
      ? {
          fileName: apk.fileName,
          fileSizeBytes: apk.fileSizeBytes,
          fileUrl: `/api/releases/${encodeURIComponent(release.id)}/download`,
          apkHosted: true,
        }
      : {}),
  };
}

async function data() {
  return object((await playFabAdmin("Admin/GetTitleInternalData"))["Data"]);
}
async function save(key: string, value: unknown) {
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text) > 9500)
    throw new AdminApiError(400, "Release content is too large. Shorten the notes.");
  await playFabAdmin("Admin/SetTitleInternalData", { Key: key, Value: text });
}
function read(saved: Record<string, unknown>) {
  if (!saved[configKey]) return { initialized: false, releases: [] as StoredRelease[] };
  try {
    const config = z
      .object({ currentId: idSchema.nullable() })
      .parse(JSON.parse(String(saved[configKey])));
    const releases: StoredRelease[] = Object.entries(saved)
      .filter(([k, v]) => k.startsWith(prefix) && v != null)
      .map(([key, value]) => {
        const release = schema.parse(JSON.parse(String(value)));
        if (key !== prefix + release.id) throw new Error();
        if (
          release.apk &&
          (!release.apk.storagePath.startsWith(`civilcraft/releases/${release.id}/`) ||
            !release.apk.storagePath.endsWith(`/${release.apk.fileName}`))
        )
          throw new Error();
        return {
          ...release,
          status:
            release.id === config.currentId
              ? "current"
              : release.status === "current"
                ? "archived"
                : release.status,
        };
      });
    return { initialized: true, releases };
  } catch {
    throw new AdminApiError(502, "Release data could not be read.");
  }
}
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store, private", Vary: "Cookie" },
  });
/** Admin writes are called only through the existing staff session/origin gate. */
export async function releaseRequest(
  request: Request,
  admin = false,
  actor?: AdminUser,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const root = admin ? "/api/admin/releases" : "/api/releases";
  if (path !== root && !path.startsWith(root + "/")) return null;
  try {
    const saved = await data();
    const state = read(saved);
    const download = path.match(/^\/api\/(?:admin\/)?releases\/([a-zA-Z0-9-]{1,64})\/download$/);
    if (download) {
      if (request.method !== "GET" && request.method !== "HEAD")
        return json({ error: "Method not allowed." }, 405);
      const release = state.releases.find(
        (r) => r.id === download[1] && (admin || r.status === "current"),
      );
      if (!release?.apk) return json({ error: "APK not found." }, 404);
      const headers = new Headers({
        "Cache-Control": "no-store, private",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      });
      if (request.method === "HEAD") {
        headers.set("Content-Type", APK_CONTENT_TYPE);
        headers.set("Content-Length", String(release.apk.fileSizeBytes));
        headers.set("Content-Disposition", `attachment; filename="${release.apk.fileName}"`);
        return new Response(null, { headers });
      }
      headers.set("Location", await apkStorage.downloadUrl(release.apk.storagePath));
      return new Response(null, { status: 307, headers });
    }
    if (path !== root) {
      if (!admin || request.method !== "POST") return json({ error: "Endpoint not found." }, 404);
      if (!actor) throw new AdminApiError(401, "Administrator sign-in is required.");
      if (!state.initialized) throw new AdminApiError(409, "Import existing releases first.");
      const body = await smallBody(request);
      if (path === root + "/apk/prepare") {
        const input = z
          .object({
            releaseId: idSchema,
            fileName: z.string().max(255),
            fileSizeBytes: z.number().int(),
          })
          .parse(body);
        const release = state.releases.find((r) => r.id === input.releaseId);
        if (!release) throw new AdminApiError(404, "Release not found.");
        const { ticket, claim } = createApkUploadTicket({
          ...input,
          staffId: actor.id,
          previousStoragePath: release.apk?.storagePath ?? null,
        });
        return json({
          ticket,
          pathname: claim.storagePath,
          fileName: claim.fileName,
          fileSizeBytes: claim.fileSizeBytes,
          expiresAt: claim.expiresAt,
        });
      }
      if (path === root + "/apk/upload") {
        if (body["type"] !== "blob.generate-presigned-url")
          throw new AdminApiError(400, "Choose a valid APK upload action.");
        const payload = object(body["payload"]);
        const ticket = readApkUploadTicket(payload["clientPayload"], actor.id);
        if (
          payload["pathname"] !== ticket.storagePath ||
          typeof payload["multipart"] !== "boolean" ||
          !state.releases.some((r) => r.id === ticket.releaseId)
        )
          throw new AdminApiError(400, "Upload authorization does not match this build.");
        return json(
          await apkStorage.upload(request, body as unknown as HandleUploadPresignedBody, ticket),
        );
      }
      if (path === root + "/apk/finalize") {
        const ticket = readApkUploadTicket(body["ticket"], actor.id);
        const existing = state.releases.find((r) => r.id === ticket.releaseId);
        if (!existing) throw new AdminApiError(404, "Release not found.");
        if (existing.apk?.storagePath === ticket.storagePath)
          return json({ success: true, release: publicRelease(existing) });
        const metadata = await apkStorage.head(ticket.storagePath);
        if (
          metadata.pathname !== ticket.storagePath ||
          metadata.size !== ticket.fileSizeBytes ||
          metadata.contentType !== APK_CONTENT_TYPE ||
          !metadata.etag
        )
          throw new AdminApiError(400, "The uploaded APK does not match the selected file.");
        await validateApkArchive(metadata.size, (start, end) =>
          apkStorage.readRange(ticket.storagePath, start, end),
        );
        // Read again after verification so an intervening notes/build edit is retained.
        const latest = read(await data()).releases.find((r) => r.id === ticket.releaseId);
        if (!latest) throw new AdminApiError(404, "Release not found.");
        if ((latest.apk?.storagePath ?? null) !== ticket.previousStoragePath)
          throw new AdminApiError(
            409,
            "Another APK was attached during this upload. Refresh and select the file again.",
          );
        const updated: StoredRelease = {
          ...latest,
          apk: {
            storagePath: ticket.storagePath,
            fileName: ticket.fileName,
            fileSizeBytes: metadata.size,
            etag: metadata.etag,
            uploadedAt: new Date().toISOString(),
          },
          fileName: ticket.fileName,
          fileSizeBytes: metadata.size,
          fileUrl: `/api/releases/${ticket.releaseId}/download`,
        };
        await save(prefix + latest.id, updated);
        return json({ success: true, release: publicRelease(updated) });
      }
      return json({ error: "Endpoint not found." }, 404);
    }
    if (request.method === "GET") {
      if (admin) return json({ ...state, releases: state.releases.map(publicRelease) });
      const latest = state.releases
        .filter((r) => r.published)
        .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate) || b.id.localeCompare(a.id))[0];
      const current = state.releases.find((r) => r.status === "current");
      // Draft notes stay private even when the corresponding APK is current.
      return json({
        initialized: state.initialized,
        current: current ? { ...publicRelease(current), notes: "", title: undefined } : null,
        latest: latest
          ? {
              id: latest.id,
              title: latest.title,
              version: latest.version,
              build: latest.build,
              releaseDate: latest.releaseDate,
              notes: latest.notes,
            }
          : null,
      });
    }
    if (!admin || request.method !== "POST") return json({ error: "Method not allowed." }, 405);
    const body = await smallBody(request);
    if (body["action"] === "initialize") {
      if (state.initialized) return json(state);
      const releases = z.array(schema).max(20).parse(body["releases"]);
      if (releases.some((r) => r.apk))
        throw new AdminApiError(400, "Attach APK files through the upload control.");
      if (
        new Set(releases.map((r) => r.id)).size !== releases.length ||
        releases.filter((r) => r.status === "current").length > 1
      )
        throw new AdminApiError(400, "Release IDs must be unique with at most one current build.");
      for (const release of releases)
        await save(prefix + release.id, { ...release, published: false });
      await save(configKey, {
        currentId: releases.find((r) => r.status === "current")?.id ?? null,
      });
    } else {
      if (!state.initialized) throw new AdminApiError(409, "Import existing releases first.");
      if (body["action"] === "current") {
        const id = idSchema.parse(body["id"]);
        const chosen = state.releases.find((r) => r.id === id);
        if (!chosen) throw new AdminApiError(404, "Release not found.");
        if (!chosen.apk && !chosen.fileUrl?.trim())
          throw new AdminApiError(
            400,
            "Attach an APK or download link before making this build current.",
          );
        await save(configKey, { currentId: id });
      } else if (body["action"] === "save") {
        if (Object.hasOwn(object(body["release"]), "apk"))
          throw new AdminApiError(400, "APK storage references cannot be supplied by the browser.");
        const release = schema.parse(body["release"]);
        const previous = read(await data()).releases.find((r) => r.id === release.id);
        await save(prefix + release.id, {
          ...release,
          status: previous?.status ?? "draft",
          ...(previous?.apk
            ? {
                apk: previous.apk,
                fileName: previous.apk.fileName,
                fileSizeBytes: previous.apk.fileSizeBytes,
                fileUrl: `/api/releases/${release.id}/download`,
              }
            : {}),
        });
      } else throw new AdminApiError(400, "Choose a valid release action.");
    }
    return json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError)
      return json({ error: "Check title, version, build, date and release notes." }, 400);
    return json(
      {
        error:
          error instanceof AdminApiError
            ? error.message
            : "Release data is temporarily unavailable.",
      },
      error instanceof AdminApiError ? error.status : 503,
    );
  }
}
