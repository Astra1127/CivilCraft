import { createFileRoute } from "@tanstack/react-router";
import { AdminHeading, AdminPage } from "@/components/admin/ui";
import { LeaderboardView } from "@/components/site/LeaderboardView";
export const Route = createFileRoute("/admin/leaderboard")({ component: AdminLeaderboard });
function AdminLeaderboard() {
  return (
    <AdminPage>
      <AdminHeading
        title="Leaderboard"
        description="Read-only engineering rankings recorded by Civil Craft."
      />
      <LeaderboardView admin />
    </AdminPage>
  );
}
