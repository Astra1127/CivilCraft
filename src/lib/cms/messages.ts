import { useQuery } from "@tanstack/react-query";
import { contentFetch } from "./content";
import type { ContactInput } from "./message-types";
import type { ContactMessage, MessageStatus } from "./types";

export const messageService = {
  submit(input: ContactInput) {
    return contentFetch<{ id: string }>("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  },
  list() {
    return contentFetch<{ messages: ContactMessage[] }>("/api/admin/messages");
  },
  change(
    change:
      { action: "status"; id: string; status: MessageStatus } | { action: "delete"; id: string },
  ) {
    return contentFetch("/api/admin/messages", {
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
