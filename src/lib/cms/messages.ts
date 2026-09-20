import { currentSessionTicket, requireSessionTicket } from "@/lib/playfab/client";
import { useQuery } from "@tanstack/react-query";
import { contentFetch } from "./content";
import type { ContactInput } from "./message-types";
import type { ContactMessage, MessageStatus } from "./types";

export const messageService = {
  submit(input: ContactInput) {
    const ticket = currentSessionTicket();
    return contentFetch<{ id: string }>("/api/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(ticket ? { Authorization: "Bearer " + ticket } : {}),
      },
      body: JSON.stringify(input),
    });
  },
  list() {
    return contentFetch<{ messages: ContactMessage[] }>("/api/admin/messages");
  },
  change(
    change:
      | { action: "status"; id: string; status: MessageStatus }
      | { action: "delete"; id: string }
      | { action: "reply"; id: string; message: string },
  ) {
    return contentFetch<{ success: boolean; notificationStatus?: string }>("/api/admin/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(change),
    });
  },
};

export function useMessages() {
  return useQuery({
    queryKey: ["contact-messages"],
    queryFn: messageService.list,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    retry: 1,
  });
}

export function usePlayerMessages(playerId: string) {
  return useQuery({
    queryKey: ["player-contact-messages", playerId],
    enabled: !!playerId,
    queryFn: () =>
      contentFetch<{ messages: ContactMessage[] }>("/api/player/messages", {
        headers: { Authorization: "Bearer " + requireSessionTicket() },
      }),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    retry: 1,
  });
}
export function replyAsPlayer(id: string, message: string) {
  return contentFetch("/api/player/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + requireSessionTicket(),
    },
    body: JSON.stringify({ action: "reply", id, message }),
  });
}
