/** Privileged transport: imported only by the server entry and server modules. */
export class AdminApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export function adminGameConfig() {
  const titleId = process.env["VITE_PLAYFAB_TITLE_ID"]?.trim() || "17FA03";
  if (!/^[a-f0-9]{1,16}$/i.test(titleId))
    throw new AdminApiError(503, "Administrative PlayFab configuration is invalid.");
  return { titleId, secret: process.env["PLAYFAB_SECRET_KEY"]?.trim() || "" };
}
type Operation =
  | "Admin/GetAllSegments"
  | "Admin/ExportPlayersInSegment"
  | "Admin/GetSegmentExport"
  | "Admin/GetUserAccountInfo"
  | "Admin/GetUserBans"
  | "Admin/BanUsers"
  | "Admin/RevokeAllBansForUser"
  | "Server/GetUserData"
  | "Server/GetPlayerStatistics"
  | "Server/GetUserInventory";
export async function playFabAdmin(
  operation: Operation,
  body: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const { titleId, secret } = adminGameConfig();
  if (!secret) throw new AdminApiError(503, "Administrative PlayFab access is not configured.");
  try {
    const response = await fetch(`https://${titleId}.playfabapi.com/${operation}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-SecretKey": secret },
      body: JSON.stringify(body),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
    });
    const value = (await response.json()) as Record<string, unknown>;
    if (!response.ok || value["code"] !== 200) {
      if (["AccountNotFound", "UserNotFound", "UserisNotValid"].includes(String(value["error"])))
        throw new AdminApiError(404, "Player could not be found.");
      if (response.status === 429 || value["error"] === "AsyncExportRateLimitExceeded")
        throw new AdminApiError(429, "Game services are busy. Please try again shortly.");
      throw new AdminApiError(503, "Civil Craft game services are temporarily unavailable.");
    }
    return object(value["data"]);
  } catch (error) {
    if (error instanceof AdminApiError) throw error;
    throw new AdminApiError(503, "Civil Craft game services are temporarily unavailable.");
  }
}
export function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.slice(0, 256) : null;
}
export function numberValue(value: unknown): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function dateValue(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;
}
