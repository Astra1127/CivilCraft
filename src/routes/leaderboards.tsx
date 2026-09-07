import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Leaderboards live inside the authenticated player dashboard; the public URL
 * is kept as a redirect so older links do not break.
 */
export const Route = createFileRoute("/leaderboards")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/leaderboards" });
  },
});
