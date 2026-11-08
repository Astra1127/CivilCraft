import { currentSessionTicket, requireSessionTicket } from "@/lib/playfab/client";
import { useQuery } from "@tanstack/react-query";
import { contentFetch } from "./content";
import type {
  ContactInput,
  FeedbackInput,
  PublicTestimonial,
  TestimonialStatus,
} from "./message-types";
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
      | { action: "testimonial_status"; id: string; status: TestimonialStatus }
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
      contentFetch<{ messages: ContactMessage[] }>("/api/player/messages?action=conversations", {
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

export function toggleTestimonialConsent(id: string, allowPublicTestimonial: boolean) {
  return contentFetch<{ success: boolean; allowPublicTestimonial: boolean }>(
    "/api/player/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + requireSessionTicket(),
      },
      body: JSON.stringify({ action: "toggle_testimonial_consent", id, allowPublicTestimonial }),
    },
  );
}

export function useFeedbackEligibility(playerId: string) {
  return useQuery({
    queryKey: ["feedback-eligibility", playerId],
    enabled: !!playerId,
    queryFn: () =>
      contentFetch<{ eligible: boolean }>("/api/player/messages?action=eligibility", {
        headers: { Authorization: "Bearer " + requireSessionTicket() },
      }),
    staleTime: 0,
    retry: 1,
  });
}
export function submitPlayerFeedback(input: FeedbackInput) {
  return contentFetch<{ id: string }>("/api/player/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + requireSessionTicket(),
    },
    body: JSON.stringify(input),
  });
}

export function useTestimonials() {
  return useQuery({
    queryKey: ["public-testimonials"],
    queryFn: () => contentFetch<{ testimonials: PublicTestimonial[] }>("/api/testimonials"),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}
