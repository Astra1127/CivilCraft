import { randomUUID } from "node:crypto";
import { AdminApiError, object, playFabAdmin } from "./admin-client.server.ts";
import { smallBody } from "./request-body.server.ts";
import { authenticatePaymentPlayer } from "../payments/player-auth.server.ts";

const prefix = "civilcraft.private-message.";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export interface PlayerMessage {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}
async function list(playerId: string): Promise<PlayerMessage[]> {
  const result = await playFabAdmin("Server/GetUserInternalData", { PlayFabId: playerId });
  const rows: PlayerMessage[] = [];
  for (const [key, value] of Object.entries(object(result["Data"]))) {
    if (!key.startsWith(prefix)) continue;
    try {
      const row = JSON.parse(String(object(value)["Value"])) as PlayerMessage;
      if (
        uuid.test(row.id) &&
        key === prefix + row.id &&
        typeof row.title === "string" &&
        typeof row.body === "string" &&
        row.title.length <= 100 &&
        row.body.length <= 2000 &&
        Number.isFinite(Date.parse(row.createdAt))
      )
        rows.push({ id: row.id, title: row.title, body: row.body, createdAt: row.createdAt });
    } catch {
      /* Ignore unrelated or malformed records, never expose raw internal data. */
    }
  }
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
/** Called only after the shared administrator authorization and same-origin checks. */
export async function adminPlayerMessages(request: Request): Promise<unknown | null> {
  const match = new URL(request.url).pathname.match(
    /^\/api\/admin\/players\/([a-f0-9]{1,32})\/messages$/i,
  );
  if (!match) return null;
  const playerId = match[1]!.toUpperCase();
  if (request.method === "GET") return { messages: await list(playerId) };
  const input = await smallBody(request);
  if (input["action"] === "delete") {
    if (typeof input["id"] !== "string" || !uuid.test(input["id"]))
      throw new AdminApiError(400, "Invalid message.");
    await playFabAdmin("Server/UpdateUserInternalData", {
      PlayFabId: playerId,
      KeysToRemove: [prefix + input["id"]],
    });
    return { deleted: true };
  }
  if (input["action"] !== "send") throw new AdminApiError(400, "Invalid message action.");
  const title = typeof input["title"] === "string" ? input["title"].trim() : "";
  const body = typeof input["body"] === "string" ? input["body"].trim() : "";
  if (!title || title.length > 100 || !body || body.length > 2000)
    throw new AdminApiError(
      400,
      "Enter a title (1–100 characters) and message (1–2,000 characters).",
    );
  const rows = await list(playerId);
  if (rows.length >= 20)
    throw new AdminApiError(409, "Delete an older message first (20 messages per player).");
  const message: PlayerMessage = {
    id: randomUUID(),
    title,
    body,
    createdAt: new Date().toISOString(),
  };
  await playFabAdmin("Server/UpdateUserInternalData", {
    PlayFabId: playerId,
    Data: { [prefix + message.id]: JSON.stringify(message) },
  });
  return { message };
}
export async function handlePlayerMessages(request: Request): Promise<Response | null> {
  if (new URL(request.url).pathname !== "/api/player/messages") return null;
  const headers = {
    "Cache-Control": "no-store, private",
    Vary: "Authorization",
    "X-Content-Type-Options": "nosniff",
  };
  if (request.method !== "GET")
    return Response.json({ error: "Method not allowed." }, { status: 405, headers });
  try {
    const { playFabId } = await authenticatePaymentPlayer(request);
    return Response.json({ messages: await list(playFabId) }, { headers });
  } catch (error) {
    return Response.json(
      { error: "Private messages are unavailable. Please sign in and retry." },
      {
        status: error instanceof AdminApiError ? error.status : 503,
        headers,
      },
    );
  }
}
