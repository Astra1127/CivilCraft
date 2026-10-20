import { useQuery } from "@tanstack/react-query";
import { contentFetch } from "./content";

export type ReleaseDownloadStats =
  | {
      available: true;
      total: number;
      byRelease: Record<string, number>;
      trackingSince: string | null;
    }
  | {
      available: false;
      total: null;
      byRelease: Record<string, never>;
      trackingSince: null;
    };

/** Live counters are independent of editable release metadata and its local CMS fallback. */
export function useReleaseDownloadStats() {
  return useQuery({
    queryKey: ["release-download-stats"],
    queryFn: () => contentFetch<ReleaseDownloadStats>("/api/admin/releases/download-stats"),
    staleTime: 0,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}
