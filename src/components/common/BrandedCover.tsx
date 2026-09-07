import { cn } from "@/lib/utils";

/**
 * Branded Civil Craft artwork fallback, used when a CMS entry has no cover
 * image. Presentation only: blueprint grid, bridge silhouette and the Civil
 * Craft emblem — never any developer placeholder wording.
 */
export function BrandedCover({
  className,
  ratio = "aspect-video",
  compact = false,
  label = "Civil Craft: Bridge Edition artwork",
}: {
  className?: string;
  ratio?: string;
  compact?: boolean;
  label?: string;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "blueprint relative w-full overflow-hidden bg-secondary/70",
        ratio,
        className,
      )}
    >
      <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full text-primary/25"
        preserveAspectRatio="none"
        viewBox="0 0 120 60"
      >
        <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4">
          <path d="M0 46h120" />
          <path d="M8 46 22 24 36 46 50 24 64 46 78 24 92 46 106 24 118 46" />
          <path d="M22 24h84" opacity="0.7" />
          <path d="M14 46v8M106 46v8" opacity="0.5" />
        </g>
      </svg>

      <div
        aria-hidden="true"
        className={cn(
          "absolute bottom-2 left-1/2 -translate-x-1/2 rounded-lg border-2 border-primary/25 bg-card/85 px-2 py-0.5 font-display font-extrabold uppercase tracking-[0.18em] text-primary/70",
          compact ? "text-[8px]" : "text-[10px]",
        )}
      >
        Civil Craft
      </div>
    </div>
  );
}
