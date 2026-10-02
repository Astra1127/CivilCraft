import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Preserve older plural links to the single public leaderboard.
 */
export const Route = createFileRoute("/leaderboards")({
  beforeLoad: () => {
    throw redirect({ to: "/leaderboard", replace: true });
  },
});
