import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PublicLayout } from "@/components/site/PublicLayout";

export const Route = createFileRoute("/community")({
  component: CommunityLayout,
});

function CommunityLayout() {
  return (
    <PublicLayout>
      <Outlet />
    </PublicLayout>
  );
}
