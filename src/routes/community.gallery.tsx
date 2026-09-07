import { createFileRoute, redirect } from "@tanstack/react-router";

/** The gallery is now a top-level public page — keep old links working. */
export const Route = createFileRoute("/community/gallery")({
  beforeLoad: () => {
    throw redirect({ to: "/gallery" });
  },
});
