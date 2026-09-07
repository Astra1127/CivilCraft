import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * News management was retired — version announcements and release notes are
 * managed under Game & Download.
 */
export const Route = createFileRoute("/admin/news")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/releases" });
  },
});
