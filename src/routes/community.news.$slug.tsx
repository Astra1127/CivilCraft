import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy news URLs return to the homepage updates list. */
export const Route = createFileRoute("/community/news/$slug")({
  beforeLoad: () => {
    throw redirect({ to: "/", hash: "updates" });
  },
});
