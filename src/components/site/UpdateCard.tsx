import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/cms/store";
import type { NewsArticle } from "@/lib/cms/types";

export function UpdateCard({ article }: { article: NewsArticle }) {
  return (
    <article className="overflow-hidden rounded-2xl border-2 border-border bg-card">
      {article.coverUrl ? (
        <img
          src={article.coverUrl}
          alt={article.coverAlt || article.title}
          loading="lazy"
          className="aspect-video w-full object-cover"
        />
      ) : null}
      <div className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{article.category}</Badge>
          <time dateTime={article.publishedAt} className="text-xs text-muted-foreground">
            {formatDate(article.publishedAt)}
          </time>
        </div>
        <h3 className="font-display text-xl">{article.title}</h3>
        <p className="text-sm text-muted-foreground">{article.excerpt}</p>
        <Button asChild variant="outline" size="sm">
          <Link to="/updates/$slug" params={{ slug: article.slug }}>
            Read Update
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </article>
  );
}
