import { useQuery } from "@tanstack/react-query";
import type { PublicPolicy } from "./policy-types";

export function usePublicPolicy(id: "privacy" | "terms") {
  return useQuery<PublicPolicy>({
    queryKey: ["website-policy", id],
    queryFn: async () => {
      const res = await fetch(`/api/policies?id=${id}`);
      if (!res.ok) throw new Error("Policy unavailable");
      return (await res.json()) as PublicPolicy;
    },
    staleTime: 60_000,
  });
}
