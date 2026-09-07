import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The Bridge Almanac is no longer a public page — it is the player's personal
 * engineering journal inside the dashboard. The old public URL is preserved as
 * a redirect so existing links keep working.
 */
export const Route = createFileRoute("/almanac")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/almanac" });
  },
});
