import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/cms/store";
import type { NewsArticle } from "@/lib/cms/types";

/** Shared by the public article and the private, unsaved Admin preview. */
export function UpdateArticle({
  article,
  preview = false,
}: {
  article: NewsArticle;
  preview?: boolean;
}) {
  const Title = preview ? "h2" : "h1";
  return (
    <article className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="secondary">{article.category}</Badge>
        <time dateTime={article.publishedAt} className="text-sm text-muted-foreground">
          {formatDate(article.publishedAt)}
        </time>
      </div>
      <Title className="mt-4 break-words text-3xl sm:text-5xl">
        {article.title || "Untitled update"}
      </Title>
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
  );
}
