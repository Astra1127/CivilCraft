import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/site/PublicLayout";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { UpdateCard } from "@/components/site/UpdateCard";
import { useContent } from "@/lib/cms/content";

export const Route = createFileRoute("/updates/")({
  head: () => ({ meta: [{ title: "Updates — Civil Craft" }] }),
  component: Updates,
});
function Updates() {
  const query = useContent();
  return (
    <PublicLayout>
      <PageHeader
        eyebrow="From the build site"
        title="Civil Craft Updates"
        description="Announcements, development news and release notes from Civil Craft."
      />
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {query.isPending ? (
          <p role="status">Loading updates…</p>
        ) : query.isError ? (
          <div role="alert">
            <p>Unable to load updates.</p>
            <Button variant="outline" onClick={() => query.refetch()}>
              Retry
            </Button>
          </div>
        ) : !query.data.updates.length ? (
          <EmptyState
            title="No updates yet."
            description="News and development updates from Civil Craft will appear here."
          />
        ) : (
          <div className="grid items-start gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {query.data.updates.map((article) => (
              <UpdateCard key={article.id} article={article} />
            ))}
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
