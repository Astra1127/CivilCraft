import { createFileRoute } from "@tanstack/react-router";
import { PublicLeaderboard } from "@/components/site/PublicLeaderboard";

export const Route = createFileRoute("/dashboard/leaderboards")({
  component: LeaderboardsPage,
});

function LeaderboardsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl">Leaderboards</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Compare overall player standings, quest contract bridges, and multiplayer records.
        </p>
      </header>
      <PublicLeaderboard initialView="overall" />
    </div>
  );
}
