import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/site/PublicLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useContent } from "@/lib/cms/content";
import { formatDate } from "@/lib/cms/store";

export const Route = createFileRoute("/updates/$slug")({
  head: () => ({ meta: [{ title: "Civil Craft Update" }] }),
  component: Update,
});
function Update() {
  const { slug } = Route.useParams();
  const query = useContent();
  const article = query.data?.updates.find((n) => n.slug === slug);
  return (
    <PublicLayout>
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <Link to="/updates" className="font-bold text-gold hover:underline">
          ← Back to Updates
        </Link>
        {query.isPending ? (
          <p className="mt-8" role="status">
            Loading update…
          </p>
        ) : query.isError ? (
          <div className="mt-8" role="alert">
            <p>Unable to load this update.</p>
            <Button onClick={() => query.refetch()}>Retry</Button>
          </div>
        ) : !article ? (
          <h1 className="mt-8 text-3xl">Update not found.</h1>
        ) : (
          <article className="mt-8">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="secondary">{article.category}</Badge>
              <time dateTime={article.publishedAt} className="text-sm text-muted-foreground">
                {formatDate(article.publishedAt)}
              </time>
            </div>
            <h1 className="mt-4 text-3xl sm:text-5xl">{article.title}</h1>
            {article.coverUrl ? (
              <img
                src={article.coverUrl}
                alt={article.coverAlt || article.title}
                className="mt-8 max-h-[32rem] w-full rounded-2xl border-2 border-border object-cover"
              />
            ) : null}
            <div className="mt-8 whitespace-pre-wrap break-words text-base leading-8">
              {article.content}
            </div>
          </article>
        )}
      </div>
    </PublicLayout>
  );
}
