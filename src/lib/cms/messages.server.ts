import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AdminApiError, object, playFabAdmin } from "../playfab/admin-client.server.ts";
import { smallBody } from "../playfab/request-body.server.ts";
import { contactSchema } from "./message-types.ts";

const prefix = "civilcraft.website.v1.messages.";
const messageSchema = contactSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  status: z.enum(["New", "In Progress", "Resolved"]),
});
const changeSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("status"),
    id: z.string().uuid(),
    status: messageSchema.shape.status,
  }),
  z.object({ action: z.literal("delete"), id: z.string().uuid() }),
]);

async function records(keys?: string[]) {
  return object(
    (await playFabAdmin("Admin/GetTitleInternalData", keys ? { Keys: keys } : {}))["Data"],
  );
}
function parseRecord(key: string, raw: unknown) {
  try {
    const message = messageSchema.parse(JSON.parse(String(raw)));
    if (key !== prefix + message.id) throw new Error();
    return message;
  } catch {
    throw new AdminApiError(502, "Contact messages could not be read.");
  }
}
async function save(id: string, value: unknown) {
  await playFabAdmin("Admin/SetTitleInternalData", {
    Key: prefix + id,
    Value: value === null ? null : JSON.stringify(value),
  });
}
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
    },
  });

/** admin=true is called only behind the existing staff session and origin gate. */
export async function messageRequest(request: Request, admin = false): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path !== (admin ? "/api/admin/messages" : "/api/contact")) return null;
  try {
    if (admin && request.method === "GET") {
      const data = await records();
      const messages = Object.entries(data)
        .filter(([key, value]) => key.startsWith(prefix) && value != null)
        .map(([key, value]) => parseRecord(key, value))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
      return json({ messages });
    }
    if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
    if (!admin) {
      if (
        request.headers.get("origin") !== new URL(request.url).origin ||
        request.headers.get("sec-fetch-site") === "cross-site"
      )
        return json({ error: "This request is not permitted." }, 403);
      const input = contactSchema.parse(await smallBody(request));
      const id = randomUUID();
      await save(id, { ...input, id, createdAt: new Date().toISOString(), status: "New" });
      return json({ id }, 201);
    }
    const change = changeSchema.parse(await smallBody(request));
    const key = prefix + change.id;
    const raw = (await records([key]))[key];
    if (raw == null) throw new AdminApiError(404, "Contact message not found.");
    const message = parseRecord(key, raw);
    await save(
      change.id,
      change.action === "delete" ? null : { ...message, status: change.status },
    );
    return json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError)
      return json({ error: "Check the message fields and try again." }, 400);
    if (error instanceof AdminApiError) return json({ error: error.message }, error.status);
    return json({ error: "Contact messages are temporarily unavailable. Please try again." }, 503);
  }
}
