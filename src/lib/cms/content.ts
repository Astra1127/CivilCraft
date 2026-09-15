import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PublishedContent } from "./content-types";

export async function contentFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, cache: "no-store", credentials: "same-origin" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Unable to load website content.");
  return body as T;
}
export function useContent(admin = false) {
  return useQuery({
    queryKey: ["website-content", admin ? "admin" : "public"],
    queryFn: () => contentFetch<PublishedContent>(admin ? "/api/admin/content" : "/api/content"),
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}
export function useRefreshContent() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ["website-content"] });
}
export function contentMutation(path: "gallery" | "updates", body: unknown) {
  return contentFetch(`/api/admin/content/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
