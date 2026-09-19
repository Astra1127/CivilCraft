import { createFileRoute, redirect } from "@tanstack/react-router";

/** Retired Updates URLs lead to the current release; stored articles are preserved. */
export const Route = createFileRoute("/community/news/$slug")({
  beforeLoad: () => {
    throw redirect({ to: "/download", hash: "whats-new", replace: true });
  },
});
