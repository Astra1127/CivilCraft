import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/site/PublicLayout";
import { UpdateArticle } from "@/components/site/UpdateArticle";
import { Button } from "@/components/ui/button";
import { useContent } from "@/lib/cms/content";

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
          <UpdateArticle article={article} />
        )}
      </div>
    </PublicLayout>
  );
}
