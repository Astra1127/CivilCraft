import { createFileRoute } from "@tanstack/react-router";
import { Image as ImageIcon, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Lightbox } from "@/components/common/Lightbox";
import { EmptyState } from "@/components/common/States";
import { PublicLayout } from "@/components/site/PublicLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useContent } from "@/lib/cms/content";
import type { GalleryCategory, GalleryItem } from "@/lib/cms/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/gallery")({
  head: () => ({
    meta: [
      { title: "Gallery — Civil Craft: Bridge Edition" },
      {
        name: "description",
        content:
          "Explore Civil Craft: Bridge Edition screenshots, environments, bridges, characters, and UI visuals from the low-poly bridge-building simulation.",
      },
      { property: "og:title", content: "Explore Civil Craft: Bridge Edition — Gallery" },
      {
        property: "og:description",
        content:
          "Official gallery for Civil Craft: Bridge Edition. Explore gameplay, canyon environments, custom bridge designs, and game art.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GalleryPage,
});

/** Display label mapping for categories */
const categoryDisplayNames: Record<string, string> = {
  Gameplay: "Gameplay",
  Environments: "Environments",
  Maps: "Environments",
  Bridges: "Bridges",
  Characters: "Characters",
  UI: "UI",
};

const filterTabs = ["All", "Gameplay", "Environments", "Bridges", "Characters", "UI"] as const;
type FilterTab = (typeof filterTabs)[number];

function matchesTab(itemCategory: string, tab: FilterTab): boolean {
  if (tab === "All") return true;
  if (tab === "Environments") {
    return itemCategory === "Environments" || itemCategory === "Maps";
  }
  return itemCategory.toLowerCase() === tab.toLowerCase();
}

function GalleryPage() {
  const query = useContent();
  const gallery = query.data?.gallery ?? [];
  const [selectedFilter, setSelectedFilter] = useState<FilterTab>("All");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const filteredItems = useMemo(() => {
    return gallery.filter((item) => matchesTab(item.category, selectedFilter));
  }, [gallery, selectedFilter]);

  const lightboxItems = useMemo(() => {
    return filteredItems.map((item) => ({
      id: item.id,
      caption: item.caption,
      url: item.url,
      category: categoryDisplayNames[item.category] || item.category,
      description: item.description,
    }));
  }, [filteredItems]);

  return (
    <PublicLayout>
      {/* Hero Header */}
      <section className="relative border-b-2 border-border bg-card/60 py-12 sm:py-16">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <div className="inline-flex items-center gap-1.5 rounded-full border-2 border-border bg-card px-3 py-1 text-xs font-extrabold uppercase tracking-widest text-gold shadow-sm">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Field Showcase
          </div>

          <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl md:text-5xl">
            Explore Civil Craft: Bridge Edition
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Explore screenshots, environments, bridges, characters, UI, and other visuals from the
            game.
          </p>
        </div>
      </section>

      {/* Main Gallery Area */}
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        {/* Category Filters */}
        <div className="mb-8 flex flex-wrap items-center justify-center gap-2">
          {filterTabs.map((tab) => (
            <Button
              key={tab}
              size="sm"
              variant={selectedFilter === tab ? "gold" : "outline"}
              onClick={() => {
                setSelectedFilter(tab);
                setLightboxIndex(null);
              }}
              className={cn(
                "rounded-full border-2 font-bold transition-all",
                selectedFilter === tab
                  ? "shadow-sm"
                  : "border-border bg-card text-foreground/80 hover:border-gold/60 hover:text-gold",
              )}
            >
              {tab}
            </Button>
          ))}
        </div>

        {/* Query State Handling */}
        {query.isPending ? (
          <div className="py-16 text-center" role="status">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-border border-t-gold" />
            <p className="mt-3 text-sm font-bold text-muted-foreground">Loading gallery media...</p>
          </div>
        ) : query.isError ? (
          <div className="rounded-2xl border-2 border-border bg-card p-8 text-center" role="alert">
            <p className="font-bold text-destructive">Unable to load the gallery.</p>
            <p className="mt-1 text-sm text-muted-foreground">{query.error.message}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => query.refetch()}
              className="mt-4 border-2"
            >
              Retry
            </Button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-2xl border-2 border-border bg-card p-8">
            <EmptyState
              title={
                selectedFilter === "All"
                  ? "No gallery items yet"
                  : `No items in ${selectedFilter}`
              }
              description={
                selectedFilter === "All"
                  ? "Official screenshots and showcase media will appear here once published."
                  : `No images currently published in the ${selectedFilter} category. Try selecting "All" to view other media.`
              }
            />
            {selectedFilter !== "All" && (
              <div className="mt-4 text-center">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedFilter("All")}
                  className="border-2"
                >
                  View All Media
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredItems.map((item, i) => (
              <div
                key={item.id}
                className="group flex flex-col overflow-hidden rounded-2xl border-2 border-border bg-card shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-gold/60 hover:shadow-md"
              >
                {/* Image card with click to open lightbox */}
                <button
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  className="relative aspect-video w-full overflow-hidden bg-background/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                  aria-label={`View larger preview of ${item.caption}`}
                >
                  <img
                    src={item.url}
                    alt={item.caption}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/0 transition-colors duration-200 group-hover:bg-black/10" />
                </button>

                {/* Card metadata */}
                <div className="flex flex-1 flex-col p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-2">
                    <Badge
                      variant="outline"
                      className="border-border bg-background text-xs font-bold text-muted-foreground"
                    >
                      {categoryDisplayNames[item.category] || item.category}
                    </Badge>
                  </div>

                  <h3 className="mt-2 font-display text-base font-bold text-foreground sm:text-lg">
                    {item.caption}
                  </h3>

                  {item.description ? (
                    <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                      {item.description}
                    </p>
                  ) : null}

                  <div className="mt-auto pt-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setLightboxIndex(i)}
                      className="h-8 px-2 text-xs font-bold text-gold hover:bg-gold/10 hover:text-gold"
                    >
                      Enlarge View →
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Lightbox Preview Modal */}
        <Lightbox
          items={lightboxItems}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      </div>
    </PublicLayout>
  );
}
