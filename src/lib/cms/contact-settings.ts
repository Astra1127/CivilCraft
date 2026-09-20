import { useQuery, useQueryClient } from "@tanstack/react-query";
import { contentFetch } from "./content";
import type { ContactSettings } from "./contact-settings-types";
export { emptyContactSettings } from "./contact-settings-types";

export function useContactSettings(admin = false) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["contact-settings", admin ? "admin" : "public"],
    queryFn: () =>
      contentFetch<ContactSettings>(
        admin ? "/api/admin/contact-settings" : "/api/contact-settings",
      ),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    retry: 1,
  });
  const save = async (settings: ContactSettings) => {
    await contentFetch("/api/admin/contact-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    await client.invalidateQueries({ queryKey: ["contact-settings"] });
  };
  return { ...query, save };
}
