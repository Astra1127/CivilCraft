import { targetSearch } from "@/lib/playfab/notification-navigation";
import { createFileRoute } from "@tanstack/react-router";
import { AlmanacJournal } from "@/components/dashboard/almanac/AlmanacJournal";

export const Route = createFileRoute("/dashboard/almanac")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: string; levelId?: string; regionId?: string } => ({
    ...(typeof search["tab"] === "string" ? { tab: search["tab"] } : {}),
    ...(targetSearch(search, "levelId") ? { levelId: targetSearch(search, "levelId")! } : {}),
    ...(targetSearch(search, "regionId") ? { regionId: targetSearch(search, "regionId")! } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Bridge Almanac — Player Dashboard" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content:
          "Your personal Civil Craft engineering journal: completed levels, bridge screenshots and engineering knowledge.",
      },
    ],
  }),
  component: DashboardAlmanacPage,
});

function DashboardAlmanacPage() {
  const { tab, levelId, regionId } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <AlmanacJournal
      initialTab={tab ?? "journey"}
      levelId={levelId}
      regionId={regionId}
      onLevelChange={(level) =>
        void navigate({
          search: {
            tab: "journey",
            ...(level ? { levelId: level.levelId, regionId: level.regionId } : {}),
          },
        })
      }
    />
  );
}
