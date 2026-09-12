import { AdminApiError, object } from "./admin-client.server.ts";
export async function smallBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AdminApiError(415, "A JSON request is required.");
  const reader = request.body?.getReader();
  if (!reader) throw new AdminApiError(400, "A JSON body is required.");
  let size = 0;
  const parts: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 8192) throw new AdminApiError(413, "The request is too large.");
      parts.push(part.value);
    }
  } finally {
    await reader.cancel();
  }
  try {
    return object(JSON.parse(Buffer.concat(parts).toString("utf8")));
  } catch {
    throw new AdminApiError(400, "The request is invalid.");
  }
}
