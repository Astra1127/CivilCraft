import { createFileRoute } from "@tanstack/react-router";
import { SectionHeading } from "@/components/common/PageHeader";
import { LeaderboardView } from "@/components/site/LeaderboardView";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/dashboard/leaderboards")({
  component: PlayerLeaderboardPage,
});

function PlayerLeaderboardPage() {
  const { player } = useAuth();
  return (
    <div className="space-y-6">
      <SectionHeading title="Leaderboard" description="Your position among all engineers." />
      <LeaderboardView highlightId={player?.playFabId} />
    </div>
  );
}
