import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/site/PublicLayout";
import { PublicLeaderboard } from "@/components/site/PublicLeaderboard";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Leaderboard — Civil Craft" },
      { name: "description", content: "Explore Civil Craft engineering rankings by contract." },
    ],
  }),
  component: LeaderboardPage,
});

function LeaderboardPage() {
  return (
    <PublicLayout>
      <section className="blueprint bg-background px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <header className="mb-8">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Engineering through play
            </p>
            <h1 className="mt-3 text-4xl sm:text-5xl">Leaderboard</h1>
            <p className="mt-4 text-muted-foreground">
              Discover the most efficient and strongest bridges built by Civil Craft engineers.
            </p>
          </header>
          <PublicLeaderboard />
        </div>
      </section>
    </PublicLayout>
  );
}
