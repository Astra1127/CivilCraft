import { useQuery, useQueryClient } from "@tanstack/react-query";
import { contentFetch } from "./content";
import type { Release } from "./types";

export type PublishedRelease = Pick<
  Release,
  "id" | "title" | "version" | "build" | "releaseDate" | "notes"
>;
export function useReleasePosts() {
  return useQuery({
    queryKey: ["releases", "public"],
    queryFn: () =>
      contentFetch<{
        initialized: boolean;
        current: Release | null;
        latest: PublishedRelease | null;
      }>("/api/releases"),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}
export function useAdminReleases() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["releases", "admin"],
    queryFn: () =>
      contentFetch<{
        initialized: boolean;
        releases: Release[];
      }>("/api/admin/releases"),
    staleTime: 0,
  });
  const mutate = async (body: unknown) => {
    await contentFetch("/api/admin/releases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await client.invalidateQueries({ queryKey: ["releases"] });
  };
  return { ...query, mutate };
}
