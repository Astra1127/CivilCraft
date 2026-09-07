import { cn } from "@/lib/utils";

/**
 * Civil Craft themed placeholder for artwork that will later be replaced with
 * official assets. Keep the `label` descriptive so replacements are obvious.
 */
export function ArtPlaceholder({
  label,
  className,
  ratio = "aspect-video",
  compact = false,
}: {
  label: string;
  className?: string;
  ratio?: string;
  compact?: boolean;
}) {
  return (
    <div
      role="img"
      aria-label={`${label} — placeholder artwork`}
      className={cn(
        "blueprint relative flex w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-secondary/60",
        ratio,
        className,
      )}
    >
      <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full text-primary/15"
        preserveAspectRatio="none"
        viewBox="0 0 100 60"
      >
        <path d="M0 45 H100" stroke="currentColor" strokeWidth="1.2" />
        <path
          d="M0 45 L12 22 L24 45 L36 22 L48 45 L60 22 L72 45 L84 22 L96 45"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <path d="M12 22 H84" stroke="currentColor" strokeWidth="1.2" />
      </svg>
      <span
        className={cn(
          "relative z-10 max-w-[85%] text-center font-display text-muted-foreground",
          compact ? "text-xs" : "text-sm sm:text-base",
        )}
      >
        {label}
      </span>
    </div>
  );
}
