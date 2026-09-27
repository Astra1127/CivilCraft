import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, HelpCircle, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/common/States";
import { PublicLayout } from "@/components/site/PublicLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFaq } from "@/lib/cms/faq";
import type { FaqEntry } from "@/lib/cms/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "Frequently Asked Questions — Civil Craft: Bridge Edition" },
      {
        name: "description",
        content:
          "Find answers about Civil Craft: Bridge Edition, gameplay, structural mechanics learning, and downloading the game for Android.",
      },
      { property: "og:title", content: "FAQ — Civil Craft: Bridge Edition" },
      {
        property: "og:description",
        content:
          "Official FAQ for Civil Craft: Bridge Edition — installation, gameplay, educational features and account progress.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FaqPage,
});

const categoryList = ["All", "General", "Gameplay", "Account", "Download"] as const;
type CategoryFilter = (typeof categoryList)[number];

function FaqPage() {
  const query = useFaq();
  const faqList = query.data ?? [];
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});

  const toggleItem = (id: string) => {
    setOpenIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const filteredItems = useMemo(() => {
    return faqList
      .filter((f) => {
        const matchesCategory =
          selectedCategory === "All" || f.category.toLowerCase() === selectedCategory.toLowerCase();
        const matchesSearch =
          !searchQuery.trim() ||
          f.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
          f.answer.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
      })
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  }, [faqList, selectedCategory, searchQuery]);

  return (
    <PublicLayout>
      {/* Page Hero Header */}
      <section className="relative border-b-2 border-border bg-card/60 py-12 sm:py-16">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <div className="inline-flex items-center gap-1.5 rounded-full border-2 border-border bg-card px-3 py-1 text-xs font-extrabold uppercase tracking-widest text-gold shadow-sm">
            <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Field Knowledge Base
          </div>

          <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl md:text-5xl">
            Frequently Asked Questions
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Find answers about Civil Craft: Bridge Edition, gameplay, learning features, and
            downloading the game.
          </p>

          {/* Search bar */}
          <div className="mx-auto mt-8 max-w-md">
            <div className="relative">
              <Search
                className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                placeholder="Search questions or keywords..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-11 rounded-xl border-2 border-border bg-card pl-10 pr-4 text-sm font-medium shadow-sm transition-colors focus-visible:border-gold"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Main FAQ Content */}
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
        {/* Category Filters */}
        <div className="mb-8 flex flex-wrap items-center justify-center gap-2">
          {categoryList.map((cat) => (
            <Button
              key={cat}
              size="sm"
              variant={selectedCategory === cat ? "gold" : "outline"}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "rounded-full border-2 font-bold transition-all",
                selectedCategory === cat
                  ? "shadow-sm"
                  : "border-border bg-card text-foreground/80 hover:border-gold/60 hover:text-gold",
              )}
            >
              {cat}
            </Button>
          ))}
        </div>

        {/* Content States */}
        {query.isPending ? (
          <div className="py-12 text-center" role="status">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-border border-t-gold" />
            <p className="mt-3 text-sm font-bold text-muted-foreground">Loading questions...</p>
          </div>
        ) : query.isError ? (
          <div className="rounded-2xl border-2 border-border bg-card p-8 text-center" role="alert">
            <p className="font-bold text-destructive">Unable to load FAQ.</p>
            <p className="mt-1 text-sm text-muted-foreground">{query.error.message}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => query.refetch()}
              className="mt-4 border-2"
            >
              Try Again
            </Button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-2xl border-2 border-border bg-card p-8">
            <EmptyState
              title={searchQuery ? "No matching questions" : "No questions found"}
              description={
                searchQuery
                  ? `No questions found matching "${searchQuery}". Try a different search term or category.`
                  : "Frequently asked questions will appear here once published."
              }
            />
            {searchQuery && (
              <div className="mt-4 text-center">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSearchQuery("")}
                  className="border-2"
                >
                  Clear Search
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => {
              const isOpen = Boolean(openIds[item.id]);
              return (
                <div
                  key={item.id}
                  className={cn(
                    "overflow-hidden rounded-2xl border-2 border-border bg-card shadow-sm transition-all duration-200",
                    isOpen ? "border-gold/50 shadow-md ring-1 ring-gold/20" : "hover:border-gold/30",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleItem(item.id)}
                    aria-expanded={isOpen}
                    aria-controls={`faq-answer-${item.id}`}
                    id={`faq-btn-${item.id}`}
                    className="flex w-full items-center justify-between gap-4 p-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2 text-sm font-extrabold transition-colors duration-200",
                          isOpen
                            ? "border-gold bg-gold text-white"
                            : "border-border bg-background text-muted-foreground",
                        )}
                        aria-hidden="true"
                      >
                        {isOpen ? "−" : "+"}
                      </span>

                      <span className="font-display text-base font-bold text-foreground sm:text-lg">
                        {item.question}
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Badge
                        variant="outline"
                        className="hidden border-border bg-background text-xs font-semibold text-muted-foreground sm:inline-flex"
                      >
                        {item.category}
                      </Badge>
                      <ChevronDown
                        className={cn(
                          "h-5 w-5 text-muted-foreground transition-transform duration-200",
                          isOpen && "rotate-180 text-gold",
                        )}
                        aria-hidden="true"
                      />
                    </div>
                  </button>

                  {isOpen && (
                    <div
                      id={`faq-answer-${item.id}`}
                      role="region"
                      aria-labelledby={`faq-btn-${item.id}`}
                      className="border-t-2 border-dashed border-border/80 bg-background/50 px-5 py-4 sm:px-6"
                    >
                      <div className="prose prose-sm max-w-none text-foreground/90 whitespace-pre-line leading-relaxed sm:text-base">
                        {item.answer}
                      </div>

                      <div className="mt-3 sm:hidden">
                        <Badge
                          variant="outline"
                          className="border-border bg-card text-[11px] font-semibold text-muted-foreground"
                        >
                          {item.category}
                        </Badge>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Still have questions CTA card */}
        <div className="mt-12 rounded-2xl border-2 border-border bg-card p-6 text-center sm:p-8">
          <h3 className="font-display text-lg font-bold text-foreground sm:text-xl">
            Still have questions?
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Can&apos;t find what you are looking for? Send us a message and our development team
            will get back to you.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Button asChild variant="gold" size="sm" className="font-bold">
              <a href="/contact">Contact Support →</a>
            </Button>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
