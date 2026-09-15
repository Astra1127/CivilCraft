import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy news URLs return to the public updates index. */
export const Route = createFileRoute("/community/news/$slug")({
  beforeLoad: () => {
    throw redirect({ to: "/updates" });
  },
});
