import { createFileRoute, redirect } from "@tanstack/react-router";

/** Retired Updates URLs lead to the current release; stored articles are preserved. */
export const Route = createFileRoute("/admin/news")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/releases", hash: "whats-new", replace: true });
  },
});
