import { getAdminAnalytics } from "./analytics.server.ts";
import { contentRequest } from "../cms/content.server.ts";
import { smallBody } from "./request-body.server.ts";
import { listBugReports, changeBugReport } from "./bug-reports.server.ts";
import { getAdminAuthConfig } from "../admin-auth/config.server.ts";
import { isAuthorizedStaff, readAdminSession } from "../admin-auth/session.server.ts";
import { AdminApiError, adminGameConfig, object, playFabAdmin } from "./admin-client.server.ts";
import { directoryPage } from "./admin-directory.server.ts";
import { getAdminPlayer, lookupPlayer, mapBans } from "./admin-players.server.ts";
import type { AdminIntegrationStatus, PlayerSearchKind } from "./admin-types.ts";

const headers = {
  "Cache-Control": "no-store, private",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};
const json = (data: unknown, status = 200) => Response.json(data, { status, headers });
/** Own the entire privileged namespace, including unknown endpoints, before SSR. */
export async function handlePlayFabAdminRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return json({ error: "Invalid path." }, 400);
  }
  if (!/^\/api\/admin(?:\/|$)/i.test(path)) return null;
  try {
    const config = getAdminAuthConfig();
    const session = await readAdminSession(request);
    if (!config || !session.authenticated || !session.user)
      return json({ error: "Administrator sign-in is required." }, 401);
    if (!isAuthorizedStaff(config, session.user))
      return json({ error: "Administrator access is denied." }, 403);
    if (request.method !== "GET" && request.method !== "POST")
      return json({ error: "Method not allowed." }, 405);
    if (
      request.method === "POST" &&
      (request.headers.get("origin") !== config.origin ||
        request.headers.get("sec-fetch-site") === "cross-site")
    )
      return json({ error: "This request is not permitted." }, 403);

    const contentResponse = await contentRequest(request, true);
    if (contentResponse) return contentResponse;
    if (path === "/api/admin/analytics" && request.method === "GET")
      return json(await getAdminAnalytics(config, session.user.id));
    if (path === "/api/admin/bug-reports") {
      if (request.method === "GET") return json(await listBugReports());
      return json(await changeBugReport(await smallBody(request)));
    }
    if (path === "/api/admin/playfab/status" && request.method === "GET") {
      const { titleId, secret } = adminGameConfig();
      const status: AdminIntegrationStatus = {
        titleId,
        mode: "Live",
        connection: "Partially configured",
        adminApi: "Not configured",
        checkedAt: new Date().toISOString(),
        message:
          "PlayFab player authentication is configured, but administrative API access is not configured.",
      };
      if (secret) {
        try {
          await playFabAdmin("Admin/GetAllSegments");
          status.connection = "Connected";
          status.adminApi = "Available";
          status.message = "Administrative PlayFab access is connected.";
        } catch {
          status.connection = "Unavailable";
          status.adminApi = "Unavailable";
          status.message = "Civil Craft game services are temporarily unavailable.";
        }
      }
      status.checkedAt = new Date().toISOString();
      return json(status);
    }
    if (path === "/api/admin/transactions" && request.method === "GET") {
      if (!adminGameConfig().secret) return json({ configured: false, records: [] });
      // Reuse the administrative access probe. Current inventory is not a ledger,
      // and Civil Craft has no global transaction-history source implemented yet.
      await playFabAdmin("Admin/GetAllSegments");
      return json({ configured: true, records: [] });
    }
    if (path === "/api/admin/players" && request.method === "GET") {
      // Configuration is checked even when an export snapshot is cached.
      if (!adminGameConfig().secret)
        throw new AdminApiError(503, "Administrative PlayFab access is not configured.");
      const query = (url.searchParams.get("q") ?? "").trim();
      if (query.length > 100)
        throw new AdminApiError(400, "Search must be 100 characters or fewer.");
      if (query) {
        const kind = url.searchParams.get("kind") ?? "PlayFabId";
        if (!["PlayFabId", "Username", "TitleDisplayName"].includes(kind))
          throw new AdminApiError(400, "Choose a supported search identifier.");
        if (kind === "PlayFabId" && !/^[a-f0-9]{1,32}$/i.test(query))
          throw new AdminApiError(400, "Enter a valid PlayFab ID.");
        if (kind === "Username" && (query.length < 3 || query.length > 20))
          throw new AdminApiError(400, "Usernames must be 3 to 20 characters.");
        try {
          const player = await lookupPlayer(query, kind as PlayerSearchKind);
          return json({
            players: [await getAdminPlayer(player.playFabId)],
            pending: false,
            nextCursor: null,
            snapshotAt: null,
          });
        } catch (e) {
          if (e instanceof AdminApiError && e.status === 404)
            return json({ players: [], pending: false, nextCursor: null, snapshotAt: null });
          throw e;
        }
      }
      const pageSize = Number(url.searchParams.get("pageSize") ?? 20);
      const page = url.searchParams.has("page") ? Number(url.searchParams.get("page")) : undefined;
      if (
        ![10, 20, 50].includes(pageSize) ||
        (page !== undefined && (!Number.isSafeInteger(page) || page < 1 || page > 5000))
      )
        throw new AdminApiError(400, "Choose a valid page and 10, 20 or 50 rows per page.");
      return json(
        await directoryPage(
          config,
          session.user.id,
          url.searchParams.get("cursor"),
          process.env["NODE_ENV"] === "development" && url.searchParams.get("fresh") === "1",
          pageSize,
          page,
        ),
      );
    }
    const match = path.match(/^\/api\/admin\/players\/([a-f0-9]{1,32})(?:\/(ban|unban))?$/i);
    if (!match) return json({ error: "Endpoint not found." }, 404);
    const id = match[1]!,
      action = match[2]?.toLowerCase();
    if (!action && request.method === "GET") return json(await getAdminPlayer(id));
    if (!action || request.method !== "POST") return json({ error: "Method not allowed." }, 405);
    const body = await smallBody(request);
    if (body["confirm"] !== true) throw new AdminApiError(400, "Confirm the moderation action.");
    const reason = typeof body["reason"] === "string" ? body["reason"].trim() : "";
    const hours = body["durationHours"];
    if (
      action === "ban" &&
      (!reason ||
        reason.length > 140 ||
        [...reason].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127))
    )
      throw new AdminApiError(
        400,
        "Enter a reason between 1 and 140 characters without line breaks.",
      );
    if (
      action === "ban" &&
      hours !== null &&
      hours !== undefined &&
      (typeof hours !== "number" || !Number.isInteger(hours) || hours < 1 || hours > 8760)
    )
      throw new AdminApiError(400, "Temporary bans must be 1 to 8,760 whole hours.");
    await lookupPlayer(id, "PlayFabId"); // BanUsers itself does not validate account existence.
    const current = await playFabAdmin("Admin/GetUserBans", { PlayFabId: id });
    const active = mapBans(current["BanData"] ?? []).some((b) => b.active);
    if (action === "ban" && active)
      throw new AdminApiError(409, "This player is already banned. Refresh the record.");
    if (action === "unban" && !active)
      throw new AdminApiError(409, "This player has no active bans. Refresh the record.");
    try {
      if (action === "ban")
        await playFabAdmin("Admin/BanUsers", {
          Bans: [
            { PlayFabId: id, Reason: reason, ...(hours == null ? {} : { DurationInHours: hours }) },
          ],
        });
      else await playFabAdmin("Admin/RevokeAllBansForUser", { PlayFabId: id });
    } catch (e) {
      console.info(
        JSON.stringify({
          operation: action,
          administrator: session.user.id,
          target: id,
          at: new Date().toISOString(),
          result: "unconfirmed",
        }),
      );
      // A timeout may occur after PlayFab applied the action. Never automatically retry a mutation.
      throw new AdminApiError(
        e instanceof AdminApiError ? e.status : 503,
        "The moderation result could not be confirmed. Refresh the player record before trying again.",
      );
    }
    console.info(
      JSON.stringify({
        operation: action,
        administrator: session.user.id,
        target: id,
        at: new Date().toISOString(),
        result: "success",
      }),
    );
    return json({ success: true });
  } catch (e) {
    return json(
      {
        error:
          e instanceof AdminApiError
            ? e.message
            : "Civil Craft game services are temporarily unavailable.",
      },
      e instanceof AdminApiError ? e.status : 503,
    );
  }
}
