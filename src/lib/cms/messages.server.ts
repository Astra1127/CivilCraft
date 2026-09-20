import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AdminApiError, object, playFabAdmin } from "../playfab/admin-client.server.ts";
import { smallBody } from "../playfab/request-body.server.ts";
import { contactSchema } from "./message-types.ts";
import { notifyContact } from "../email/contact-notifications.server.ts";

const prefix = "civilcraft.website.v1.messages.";
const replyPrefix = "civilcraft.website.v1.message-replies.";
const statePrefix = "civilcraft.website.v1.message-state.";
const notificationPrefix = "civilcraft.website.v1.message-notifications.";
const idSchema = z.string().uuid();
const statusSchema = z.enum(["New", "In Progress", "Resolved"]);
const messageSchema = contactSchema.extend({
  id: idSchema,
  createdAt: z.string().datetime(),
  status: statusSchema,
  ownerId: z
    .string()
    .regex(/^[a-f0-9]{1,32}$/i)
    .nullable()
    .default(null),
});
const replyInput = z.object({
  action: z.literal("reply"),
  id: idSchema,
  message: z.string().trim().min(1).max(2000),
});
const replySchema = z.object({
  id: idSchema,
  messageId: idSchema,
  author: z.enum(["admin", "player"]),
  message: z.string(),
  createdAt: z.string().datetime(),
});
const changeSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), id: idSchema, status: statusSchema }),
  z.object({ action: z.literal("delete"), id: idSchema }),
  replyInput,
]);
async function records(keys?: string[]) {
  return object(
    (await playFabAdmin("Admin/GetTitleInternalData", keys ? { Keys: keys } : {}))["Data"],
  );
}
async function save(key: string, value: unknown) {
  const text = value === null ? null : JSON.stringify(value);
  if (text && Buffer.byteLength(text) > 9500)
    throw new AdminApiError(400, "The message is too large.");
  await playFabAdmin("Admin/SetTitleInternalData", { Key: key, Value: text });
}
function parseRecord(key: string, raw: unknown) {
  try {
    const value = messageSchema.parse(JSON.parse(String(raw)));
    if (key !== prefix + value.id) throw new Error();
    return value;
  } catch {
    throw new AdminApiError(502, "Contact messages could not be read.");
  }
}
function notification(data: Record<string, unknown>, id: string) {
  try {
    const value = JSON.parse(String(data[notificationPrefix + id]));
    return ["sent", "failed", "not_configured", "not_applicable"].includes(value)
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}
function thread(
  data: Record<string, unknown>,
  message: ReturnType<typeof parseRecord>,
  admin: boolean,
) {
  const replies = Object.entries(data)
    .filter(([key, value]) => key.startsWith(replyPrefix + message.id + ".") && value != null)
    .map(([key, value]) => {
      try {
        const reply = replySchema.parse(JSON.parse(String(value)));
        if (reply.messageId !== message.id || key !== replyPrefix + message.id + "." + reply.id)
          throw new Error();
        return { ...reply, ...(admin ? { notificationStatus: notification(data, reply.id) } : {}) };
      } catch {
        throw new AdminApiError(502, "Conversation replies could not be read.");
      }
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  let status = message.status;
  if (data[statePrefix + message.id + ".status"] != null) {
    const parsed = statusSchema.safeParse(
      JSON.parse(String(data[statePrefix + message.id + ".status"])),
    );
    if (parsed.success) status = parsed.data;
  }
  return {
    ...message,
    status,
    replies,
    ...(admin ? { notificationStatus: notification(data, message.id) } : {}),
  };
}
async function playerId(request: Request, optional = false): Promise<string | null> {
  const authorization = request.headers.get("authorization");
  if (optional && !authorization) return null;
  const ticket = authorization?.match(/^Bearer (\S+)$/)?.[1];
  if (!ticket || ticket.length > 4096) throw new AdminApiError(401, "Player sign-in is required.");
  const auth = await playFabAdmin("Server/AuthenticateSessionTicket", { SessionTicket: ticket });
  const id = object(auth["UserInfo"])["PlayFabId"];
  if (auth["IsSessionTicketExpired"] || typeof id !== "string" || !/^[a-f0-9]{1,32}$/i.test(id))
    throw new AdminApiError(401, "Player sign-in is required.");
  return id.toUpperCase();
}
async function notify(id: string, kind: "admin" | "player", ownerId?: string | null) {
  const status = await notifyContact(kind, ownerId);
  try {
    await save(notificationPrefix + id, status);
  } catch {
    console.warn("[contact/email] Could not record delivery status");
  }
  return status;
}
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      Vary: "Cookie, Authorization",
      "X-Content-Type-Options": "nosniff",
    },
  });
/** admin=true is reached only through the existing staff session/origin gate. */
export async function messageRequest(request: Request, admin = false): Promise<Response | null> {
  const url = new URL(request.url),
    path = url.pathname;
  const player = path === "/api/player/messages";
  if (admin ? path !== "/api/admin/messages" : path !== "/api/contact" && !player) return null;
  try {
    if (
      !["GET", "POST"].includes(request.method) ||
      (!admin && !player && request.method !== "POST")
    )
      return json({ error: "Method not allowed." }, 405);
    if (
      request.method === "POST" &&
      !admin &&
      (request.headers.get("origin") !== url.origin ||
        request.headers.get("sec-fetch-site") === "cross-site")
    )
      return json({ error: "This request is not permitted." }, 403);
    const owner = admin ? null : await playerId(request, !player);
    if (request.method === "GET") {
      const data = await records();
      const requested = url.searchParams.get("id");
      const messages = Object.entries(data)
        .filter(([key, value]) => key.startsWith(prefix) && value != null)
        .map(([key, value]) => parseRecord(key, value))
        .filter(
          (m) =>
            data[statePrefix + m.id + ".deleted"] !== "true" &&
            (admin || m.ownerId === owner) &&
            (!requested || m.id === requested),
        )
        .map((m) => thread(data, m, admin))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
      if (requested && !messages.length) throw new AdminApiError(404, "Contact message not found.");
      return json({ messages });
    }
    const body = await smallBody(request);
    if (!admin && !player) {
      const input = contactSchema.parse(body),
        id = randomUUID();
      await save(prefix + id, {
        ...input,
        id,
        ownerId: owner,
        createdAt: new Date().toISOString(),
        status: "New",
      });
      const notificationStatus = await notify(id, "admin");
      return json({ id, notificationStatus }, 201);
    }
    const change = admin ? changeSchema.parse(body) : replyInput.parse(body);
    const data = await records(),
      key = prefix + change.id;
    if (data[key] == null || data[statePrefix + change.id + ".deleted"] === "true")
      throw new AdminApiError(404, "Contact message not found.");
    const message = parseRecord(key, data[key]);
    if (!admin && message.ownerId !== owner)
      throw new AdminApiError(404, "Contact message not found.");
    if (change.action === "reply") {
      const reply = {
        id: randomUUID(),
        messageId: message.id,
        author: admin ? "admin" : "player",
        message: change.message,
        createdAt: new Date().toISOString(),
      };
      await save(replyPrefix + message.id + "." + reply.id, reply);
      const notificationStatus = await notify(
        reply.id,
        admin ? "player" : "admin",
        message.ownerId,
      );
      return json({ success: true, id: reply.id, notificationStatus }, 201);
    }
    if (change.action === "status") await save(statePrefix + message.id + ".status", change.status);
    else {
      await save(statePrefix + message.id + ".deleted", true);
      await save(key, null);
      for (const replyKey of Object.keys(data).filter((k) =>
        k.startsWith(replyPrefix + message.id + "."),
      ))
        await save(replyKey, null);
    }
    return json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError)
      return json({ error: "Check the message fields and try again." }, 400);
    if (error instanceof AdminApiError) return json({ error: error.message }, error.status);
    return json({ error: "Contact messages are temporarily unavailable. Please try again." }, 503);
  }
}
