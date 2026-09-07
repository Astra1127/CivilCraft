import { createFileRoute, redirect } from "@tanstack/react-router";

/** News was retired — version announcements live on the Download page. */
export const Route = createFileRoute("/community/news/")({
  beforeLoad: () => {
    throw redirect({ to: "/download" });
  },
});
