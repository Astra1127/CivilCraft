import type {
  AdminIntegrationStatus,
  AdminPlayerDetail,
  AdminPlayerPage,
  PlayerSearchKind,
} from "./admin-types";
import type { Transaction } from "./types";
async function request<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/admin/${path}`, {
      credentials: "same-origin",
      cache: "no-store",
      ...(body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    });
  } catch {
    throw new Error("Civil Craft game services are temporarily unavailable.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "Civil Craft game services are temporarily unavailable.",
    );
  return data as T;
}
export const adminPlayerService = {
  searchPlayers(query: string, kind: PlayerSearchKind = "PlayFabId", cursor: string | null = null) {
    const params = new URLSearchParams({ q: query, kind });
    if (cursor) params.set("cursor", cursor);
    return request<AdminPlayerPage>(`players?${params}`);
  },
  getPlayer(id: string) {
    return request<AdminPlayerDetail>(`players/${encodeURIComponent(id)}`);
  },
  getStatus() {
    return request<AdminIntegrationStatus>("playfab/status");
  },
  moderate(id: string, action: "ban" | "unban", reason: string, durationHours: number | null) {
    return request<{ success: true }>(`players/${encodeURIComponent(id)}/${action}`, {
      confirm: true,
      reason,
      durationHours,
    });
  },
  async getTransactions(): Promise<Transaction[]> {
    throw new Error("Administrator transaction integration is not configured.");
  },
};
