import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/admin/leaderboard")({
  beforeLoad: () => {
    throw redirect({ to: "/leaderboard", replace: true });
  },
});
