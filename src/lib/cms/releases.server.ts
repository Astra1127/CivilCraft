import { z } from "zod";
import { AdminApiError, object, playFabAdmin } from "../playfab/admin-client.server.ts";
import { smallBody } from "../playfab/request-body.server.ts";
import type { Release } from "./types.ts";

const prefix = "civilcraft.website.v1.releases.";
const configKey = "civilcraft.website.v1.release-config";
const idSchema = z.string().regex(/^[a-zA-Z0-9-]{1,64}$/);
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
    minAndroid: z.string().max(40),
    downloads: z.number().nonnegative(),
    minRequirements: z.array(z.string().max(300)).max(20),
    recommendedRequirements: z.array(z.string().max(300)).max(20),
  })
  .refine(
    (r) => !r.published || Boolean(r.title && r.notes),
    "Published updates require a title and release notes.",
  );

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
  if (!saved[configKey]) return { initialized: false, releases: [] as Release[] };
  try {
    const config = z
      .object({ currentId: idSchema.nullable() })
      .parse(JSON.parse(String(saved[configKey])));
    const releases: Release[] = Object.entries(saved)
      .filter(([k, v]) => k.startsWith(prefix) && v != null)
      .map(([key, value]) => {
        const release = schema.parse(JSON.parse(String(value)));
        if (key !== prefix + release.id) throw new Error();
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
export async function releaseRequest(request: Request, admin = false): Promise<Response | null> {
  if (new URL(request.url).pathname !== (admin ? "/api/admin/releases" : "/api/releases"))
    return null;
  try {
    const saved = await data();
    const state = read(saved);
    if (request.method === "GET") {
      if (admin) return json(state);
      const latest = state.releases
        .filter((r) => r.published)
        .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate) || b.id.localeCompare(a.id))[0];
      const current = state.releases.find((r) => r.status === "current");
      // Draft notes stay private even when the corresponding APK is current.
      return json({
        initialized: state.initialized,
        current: current ? { ...current, notes: "", title: undefined } : null,
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
        if (!state.releases.some((r) => r.id === id))
          throw new AdminApiError(404, "Release not found.");
        await save(configKey, { currentId: id });
      } else if (body["action"] === "save") {
        const release = schema.parse(body["release"]);
        const previous = state.releases.find((r) => r.id === release.id);
        await save(prefix + release.id, { ...release, status: previous?.status ?? "draft" });
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
