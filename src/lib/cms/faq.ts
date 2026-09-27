import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FaqEntry } from "./types";

export async function faqFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, cache: "no-store", credentials: "same-origin" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Unable to load FAQ data.");
  return body as T;
}

export function useFaq(admin = false) {
  return useQuery<FaqEntry[]>({
    queryKey: ["website-faq", admin ? "admin" : "public"],
    queryFn: () => faqFetch<FaqEntry[]>(admin ? "/api/admin/faq" : "/api/faq"),
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

export function useRefreshFaq() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ["website-faq"] });
}

export function faqMutation(body: Record<string, unknown>) {
  return faqFetch<{ success: boolean; entry?: FaqEntry }>("/api/admin/faq", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

