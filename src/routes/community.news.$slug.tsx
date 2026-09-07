import { createFileRoute, redirect } from "@tanstack/react-router";

/** Individual news posts were retired — release notes live on Download. */
export const Route = createFileRoute("/community/news/$slug")({
  beforeLoad: () => {
    throw redirect({ to: "/download" });
  },
});
