import { createFileRoute } from "@tanstack/react-router";
import { AlmanacJournal } from "@/components/dashboard/almanac/AlmanacJournal";

export const Route = createFileRoute("/dashboard/almanac")({
  validateSearch: (search: Record<string, unknown>): { tab?: string } =>
    typeof search["tab"] === "string" ? { tab: search["tab"] as string } : {},
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
  const { tab } = Route.useSearch();
  return <AlmanacJournal initialTab={tab ?? "journey"} />;
}
