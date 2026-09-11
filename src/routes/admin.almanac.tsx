import { createFileRoute, redirect } from "@tanstack/react-router";

// Preserve old bookmarks without exposing an administrative content editor.
export const Route = createFileRoute("/admin/almanac")({
  beforeLoad: () => {
    throw redirect({ to: "/admin", replace: true });
  },
});
