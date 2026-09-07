import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The Community hub was retired: its content now lives on Home (updates),
 * Gallery (media) and the player dashboard (leaderboards).
 */
export const Route = createFileRoute("/community/")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
