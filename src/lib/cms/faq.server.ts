import { z } from "zod";
import { AdminApiError, object, playFabAdmin } from "../playfab/admin-client.server.ts";
import { smallBody } from "../playfab/request-body.server.ts";
import { seedState } from "./seed.ts";
import type { FaqEntry } from "./types.ts";

const prefix = "civilcraft.website.v1.faq.";
const idSchema = z.string().trim().min(1).max(64);

export const faqCategories = ["Download", "Gameplay", "Account", "General"] as const;

export const faqSchema = z.object({
  id: idSchema,
  question: z.string().trim().min(3).max(300),
  answer: z.string().trim().min(3).max(5000),
  category: z.enum(faqCategories),
  order: z.number().int().nonnegative(),
  published: z.boolean().default(true),
});

async function getStoredData() {
  return object((await playFabAdmin("Admin/GetTitleInternalData"))["Data"]);
}

async function saveKey(key: string, value: unknown) {
  const serialized = value === null ? null : JSON.stringify(value);
  if (serialized && Buffer.byteLength(serialized) > 9500) {
    throw new AdminApiError(400, "FAQ content is too large. Shorten the question or answer.");
  }
  await playFabAdmin("Admin/SetTitleInternalData", {
    Key: key,
    Value: serialized,
  });
}

function parseFaqRows(data: Record<string, unknown>): FaqEntry[] {
  const rows: FaqEntry[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith(prefix) && value != null) {
      try {
        const item = faqSchema.parse(JSON.parse(String(value)));
        if (key !== prefix + item.id) continue;
        rows.push(item);
      } catch {
        throw new AdminApiError(502, "FAQ content could not be read.");
      }
    }
  }
  return rows.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
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

/**
 * Handles public and administrative FAQ requests.
 * Admin endpoints require pre-authentication by the admin route handler.
 */
export async function faqRequest(request: Request, admin = false): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const targetPath = admin ? "/api/admin/faq" : "/api/faq";
  if (path !== targetPath) return null;

  try {
    const rawData = await getStoredData();
    let entries = parseFaqRows(rawData);

    // If PlayFab Title Internal Data has no FAQ records yet, seed with defaults
    if (entries.length === 0) {
      entries = [...seedState.faq].sort((a, b) => a.order - b.order);
    }

    if (request.method === "GET") {
      if (admin) {
        return json(entries);
      }
      return json(entries.filter((f) => f.published));
    }

    if (request.method === "POST" && admin) {
      const body = await smallBody(request);
      const action = z.enum(["save", "reorder", "delete", "initialize"]).parse(body["action"]);

      if (action === "save") {
        const entry = faqSchema.parse(body["entry"]);
        await saveKey(prefix + entry.id, entry);
        return json({ success: true, entry });
      }

      if (action === "reorder") {
        const orderList = z
          .array(
            z.object({
              id: idSchema,
              order: z.number().int().nonnegative(),
            }),
          )
          .parse(body["orders"]);

        const orderMap = new Map(orderList.map((o) => [o.id, o.order]));
        for (const item of entries) {
          if (orderMap.has(item.id)) {
            const nextOrder = orderMap.get(item.id)!;
            if (item.order !== nextOrder) {
              await saveKey(prefix + item.id, { ...item, order: nextOrder });
            }
          }
        }
        return json({ success: true });
      }

      if (action === "delete") {
        const id = idSchema.parse(body["id"]);
        await saveKey(prefix + id, null);
        return json({ success: true });
      }

      if (action === "initialize") {
        const toSeed = z.array(faqSchema).parse(body["entries"] ?? seedState.faq);
        for (const item of toSeed) {
          await saveKey(prefix + item.id, item);
        }
        return json({ success: true, count: toSeed.length });
      }
    }

    return json({ error: "Method not allowed." }, 405);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ error: "Check the FAQ fields and try again." }, 400);
    }
    if (error instanceof AdminApiError) {
      return json({ error: error.message }, error.status);
    }
    return json({ error: "FAQ service is temporarily unavailable." }, 503);
  }
}

