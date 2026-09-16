import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/admin/integration")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/settings", search: { tab: "integrations" }, replace: true });
  },
});
