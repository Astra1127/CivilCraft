import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/leaderboards")({
  beforeLoad: () => {
    throw redirect({ to: "/leaderboard", replace: true });
  },
});
