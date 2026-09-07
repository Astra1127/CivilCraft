import { AlertTriangle, Inbox, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function LoadingState({ label = "Loading…", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {label}
      </p>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "panel flex flex-col items-center gap-2 px-6 py-12 text-center",
        className,
      )}
    >
      <Inbox className="h-8 w-8 text-taupe" aria-hidden="true" />
      <h3 className="font-display text-lg">{title}</h3>
      {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="panel flex flex-col items-center gap-3 px-6 py-10 text-center" role="alert">
      <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
      <h3 className="font-display text-lg">{title}</h3>
      {description ? <p className="max-w-lg text-sm text-muted-foreground">{description}</p> : null}
      {onRetry ? (
        <Button variant="outline" onClick={onRetry}>
          <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" />
          Retry
        </Button>
      ) : null}
    </div>
  );
}
