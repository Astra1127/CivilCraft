import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Lightbox } from "@/components/common/Lightbox";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/States";
import { PublicLayout } from "@/components/site/PublicLayout";
import { Button } from "@/components/ui/button";
import { useContent } from "@/lib/cms/content";
import type { GalleryCategory } from "@/lib/cms/types";

export const Route = createFileRoute("/gallery")({
  head: () => ({
    meta: [
      { title: "Gallery — Civil Craft: Bridge Edition" },
      {
        name: "description",
        content:
          "Screenshots from Civil Craft: Bridge Edition — gameplay, bridges, environments and characters from the low-poly bridge building game.",
      },
      { property: "og:title", content: "Gallery — Civil Craft: Bridge Edition" },
      {
        property: "og:description",
        content: "Gameplay, bridge, environment and character screenshots from Civil Craft.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GalleryPage,
});

/** Public-facing label for each stored category. */
const label: Record<GalleryCategory, string> = {
  Gameplay: "Gameplay",
  Bridges: "Bridges",
  Maps: "Environment",
  Characters: "Characters",
  UI: "Interface",
  Videos: "Videos",
};

const order: GalleryCategory[] = ["Gameplay", "Bridges", "Maps", "Characters", "UI"];

/**
 * Asymmetric rhythm: each entry is the span/height treatment for the item at
 * that position, repeating so the gallery never reads as an equal card grid.
 */
const rhythm = [
  "lg:col-span-4 aspect-[16/9]",
  "lg:col-span-2 aspect-[3/4]",
  "lg:col-span-2 aspect-[4/3]",
  "lg:col-span-4 aspect-[16/9]",
  "lg:col-span-2 aspect-[4/3]",
  "lg:col-span-2 aspect-[4/3]",
  "lg:col-span-2 aspect-[4/3]",
];

function GalleryPage() {
  const query = useContent();
  const gallery = query.data?.gallery ?? [];
  const [category, setCategory] = useState<GalleryCategory | "All">("All");
  const [visible, setVisible] = useState(9);
  const [index, setIndex] = useState<number | null>(null);

  // Only offer categories that actually contain images.
  const categories = useMemo(
    () => order.filter((c) => gallery.some((g) => g.category === c)),
    [gallery],
  );

  const items = useMemo(
    () => gallery.filter((g) => category === "All" || g.category === category),
    [gallery, category],
  );

  return (
    <PublicLayout>
      <PageHeader
        eyebrow="Field Photos"
        title="Civil Craft Gallery"
        description="Official Civil Craft screenshots and media: bridge designs, gameplay and the world of Arcadia."
      />

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="mb-6 flex flex-wrap gap-2">
          {(["All", ...categories] as const).map((c) => (
            <Button
              key={c}
              size="sm"
              variant={c === category ? "default" : "outline"}
              onClick={() => {
                setCategory(c as GalleryCategory | "All");
                setVisible(9);
                setIndex(null);
              }}
            >
              {c === "All" ? "All" : label[c as GalleryCategory]}
            </Button>
          ))}
        </div>

        {query.isPending ? (
          <p role="status">Loading gallery...</p>
        ) : query.isError ? (
          <div role="alert">
            <p>Unable to load the gallery.</p>
            <Button variant="outline" onClick={() => query.refetch()}>
              Retry
            </Button>
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="No gallery items yet."
            description="Official Civil Craft screenshots and media will appear here."
          />
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
              {items.slice(0, visible).map((item, i) => {
                const shape = rhythm[i % rhythm.length]!;
                return (
                  <li key={item.id} className={shape.split(" ")[0]}>
                    <button
                      type="button"
                      onClick={() => setIndex(i)}
                      className="group block w-full text-left"
                      aria-label={`Open ${item.caption}`}
                    >
                      <span className="block overflow-hidden rounded-xl border-2 border-border bg-card">
                        <img
                          src={item.url}
                          alt={item.caption}
                          loading="lazy"
                          className={`w-full object-cover transition-transform duration-200 group-hover:scale-[1.03] ${shape.split(" ")[1]}`}
                        />
                      </span>
                      <span className="mt-2 block text-sm font-bold">{item.caption}</span>
                      <span className="block text-xs text-muted-foreground">
                        {label[item.category]}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {visible < items.length ? (
              <div className="mt-8 text-center">
                <Button variant="outline" onClick={() => setVisible((v) => v + 9)}>
                  Load More
                </Button>
              </div>
            ) : null}
          </>
        )}

        <Lightbox
          items={items.map((i) => ({
            id: i.id,
            caption: i.caption,
            url: i.url,
            category: label[i.category],
          }))}
          index={index}
          onIndexChange={setIndex}
          onClose={() => setIndex(null)}
        />
      </div>
    </PublicLayout>
  );
}
