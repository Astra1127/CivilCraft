import { randomUUID } from "node:crypto";
import { AdminApiError, object, playFabAdmin } from "./admin-client.server.ts";
import { smallBody } from "./request-body.server.ts";
import type { BugReport, BugStatus } from "../cms/types.ts";

const prefix = "civilcraft.bug.v1.";
const statuses: BugStatus[] = ["New", "Investigating", "Resolved", "Closed"];
const categories = ["Gameplay", "Graphics", "Performance", "Account", "Website", "Other"];
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function parse(raw: unknown): BugReport {
  try {
    const r = JSON.parse(String(raw)) as BugReport;
    if (
      !idPattern.test(r.id) ||
      !r.playFabId ||
      !statuses.includes(r.status) ||
      typeof r.description !== "string"
    )
      throw new Error();
    return r;
  } catch {
    throw new AdminApiError(502, "A stored bug report could not be read.");
  }
}
export async function listBugReports(): Promise<BugReport[]> {
  const result = await playFabAdmin("Admin/GetTitleInternalData");
  const data = object(result["Data"]);
  return Object.entries(data)
    .filter(([key]) => key.startsWith(prefix) && idPattern.test(key.slice(prefix.length)))
    .map(([, value]) => parse(value))
    .filter((r) => data[prefix + r.id + ".deleted"] !== "true")
    .map((r) => ({
      ...r,
      status: statuses.includes(data[prefix + r.id + ".status"] as BugStatus)
        ? (data[prefix + r.id + ".status"] as BugStatus)
        : r.status,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}
export async function changeBugReport(body: Record<string, unknown>) {
  const id = String(body["id"]);
  if (
    !idPattern.test(id) ||
    (body["action"] !== "delete" && !statuses.includes(body["status"] as BugStatus))
  )
    throw new AdminApiError(400, "Invalid report update.");
  const key = prefix + id;
  const data = object((await playFabAdmin("Admin/GetTitleInternalData", { Keys: [key] }))["Data"]);
  if (!data[key]) throw new AdminApiError(404, "Bug report not found.");
  parse(data[key]);
  // Separate status and deletion keys prevent stale reads or concurrent status edits resurrecting a deletion.
  await playFabAdmin("Admin/SetTitleInternalData", {
    Key: key + (body["action"] === "delete" ? ".deleted" : ".status"),
    Value: body["action"] === "delete" ? "true" : body["status"],
  });
  if (body["action"] === "delete")
    await playFabAdmin("Admin/SetTitleInternalData", { Key: key, Value: null });
  return { success: true };
}
export async function handlePlayerBugRequest(request: Request): Promise<Response | null> {
  if (new URL(request.url).pathname !== "/api/player/bug-reports") return null;
  const json = (value: unknown, status = 200) =>
    Response.json(value, {
      status,
      headers: {
        "Cache-Control": "no-store, private",
        Vary: "Authorization",
        "X-Content-Type-Options": "nosniff",
      },
    });
  try {
    if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
    const ticket = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
    if (!ticket || ticket.length > 4096) return json({ error: "Player sign-in is required." }, 401);
    const body = await smallBody(request);
    const description = typeof body["description"] === "string" ? body["description"].trim() : "";
    if (
      !categories.includes(String(body["category"])) ||
      description.length < 10 ||
      description.length > 2000
    )
      throw new AdminApiError(
        400,
        "Choose a category and enter a description of 10–2000 characters.",
      );
    const auth = await playFabAdmin("Server/AuthenticateSessionTicket", { SessionTicket: ticket });
    const user = object(auth["UserInfo"]);
    if (
      auth["IsSessionTicketExpired"] ||
      typeof user["PlayFabId"] !== "string" ||
      !/^[a-f0-9]{1,32}$/i.test(user["PlayFabId"])
    )
      return json({ error: "Player sign-in is required." }, 401);
    const optional = (value: unknown) =>
      typeof value === "string" ? value.trim().slice(0, 100) : "";
    const report: BugReport = {
      id: randomUUID(),
      playFabId: user["PlayFabId"],
      player:
        optional(object(user["TitleInfo"])["DisplayName"]) ||
        optional(user["Username"]) ||
        "Not available",
      category: String(body["category"]),
      description,
      gameVersion: optional(body["gameVersion"]),
      device: optional(body["device"]),
      createdAt: new Date().toISOString(),
      status: "New",
    };
    await playFabAdmin("Admin/SetTitleInternalData", {
      Key: prefix + report.id,
      Value: JSON.stringify(report),
    });
    return json({ id: report.id }, 201);
  } catch (e) {
    return json(
      {
        error: e instanceof AdminApiError ? e.message : "Bug reports are temporarily unavailable.",
      },
      e instanceof AdminApiError ? e.status : 503,
    );
  }
}
