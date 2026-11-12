import { playerFetch, requireSessionTicket } from "./client.ts";

export interface DeleteAccountInput {
  confirmationText: string;
  confirm: boolean;
  password?: string | undefined;
}

export interface DeleteAccountResponse {
  success: boolean;
  status: "completed" | "processing" | "failed" | "pending";
  message: string;
  queuedAt?: string | undefined;
  deletedAt?: string | undefined;
  affectedTitleIds?: string[] | undefined;
  recoveryToken?: string | undefined;
}

export interface DeletePreflightResponse {
  playFabId: string;
  currentTitleId: string;
  affectedTitleIds: string[];
  hasMultipleTitles: boolean;
  publisherWarning: string;
}

export interface DeletionStatusResponse {
  hasPendingDeletion: boolean;
  isDeleted: boolean;
  record: {
    status: "pending" | "processing" | "completed" | "failed";
    requestedAt: string;
    queuedAt?: string | undefined;
    completedAt?: string | undefined;
    affectedTitleIds?: string[] | undefined;
  } | null;
}

export async function getDeletePreflight(): Promise<DeletePreflightResponse> {
  const ticket = requireSessionTicket();
  const response = await playerFetch("/api/player/account/delete/preflight", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${ticket}`,
    },
    cache: "no-store",
  });

  const data = (await response.json()) as { error?: string } & DeletePreflightResponse;
  if (!response.ok) {
    throw new Error(data.error || "Unable to check account deletion preflight.");
  }
  return data;
}

export async function deletePlayerAccount(
  input: DeleteAccountInput,
): Promise<DeleteAccountResponse> {
  const ticket = requireSessionTicket();
  const response = await playerFetch("/api/player/account/delete", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ticket}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
    cache: "no-store",
  });

  const data = (await response.json()) as { error?: string } & DeleteAccountResponse;
  if (!response.ok) {
    throw new Error(data.error || "Unable to delete account.");
  }
  return data;
}

export async function getPlayerDeletionStatus(
  recoveryToken?: string,
): Promise<DeletionStatusResponse> {
  const headers: Record<string, string> = {};
  let url = "/api/player/account/delete/status";

  if (recoveryToken) {
    url += `?token=${encodeURIComponent(recoveryToken)}`;
  } else {
    try {
      const ticket = requireSessionTicket();
      headers["Authorization"] = `Bearer ${ticket}`;
    } catch {
      // If no session ticket and no recovery token, playerFetch will fail
    }
  }

  const response = await playerFetch(url, {
    method: "GET",
    headers,
    cache: "no-store",
  });

  const data = (await response.json()) as { error?: string } & DeletionStatusResponse;
  if (!response.ok) {
    throw new Error(data.error || "Unable to retrieve deletion status.");
  }
  return data;
}
