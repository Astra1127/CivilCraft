import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/site/PublicLayout";
import { PublicLeaderboard, type SinglePlayerView } from "@/components/site/PublicLeaderboard";

type LeaderboardSearch = {
  view?: SinglePlayerView | undefined;
};

export const Route = createFileRoute("/leaderboard")({
  validateSearch: (search: Record<string, unknown>): LeaderboardSearch => ({
    view: search["view"] === "contracts" ? "contracts" : "overall",
  }),
  head: () => ({
    meta: [
      { title: "Leaderboard — Civil Craft" },
      {
        name: "description",
        content:
          "Explore Civil Craft overall rankings, quest bridge contracts, and multiplayer match records.",
      },
    ],
  }),
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const { view } = Route.useSearch();
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
              Discover overall engineer rankings across CivilCraft, inspect individual quest and
              level bridge contracts, and compare multiplayer records.
            </p>
          </header>
          <PublicLeaderboard initialView={view ?? "overall"} />
        </div>
      </section>
    </PublicLayout>
  );
}
