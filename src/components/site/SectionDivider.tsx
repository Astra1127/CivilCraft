/**
 * Civil Craft section transitions.
 *
 * Presentation only — sits between major page sections so the site never falls
 * back to a plain beige gap. Variants borrow from the game world: wooden
 * construction beams, drafting lines, canyon rock ridges and truss silhouettes.
 */
export type DividerVariant = "beam" | "draft" | "ridge" | "truss";

export function SectionDivider({
  variant = "beam",
  className = "",
}: {
  variant?: DividerVariant;
  className?: string;
}) {
  if (variant === "draft") {
    return (
      <div className={`relative py-6 ${className}`} aria-hidden="true">
        <div className="draft-line mx-auto max-w-6xl" />
        <span className="absolute left-1/2 top-1/2 grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-lg border-2 border-border bg-card text-[10px] font-extrabold text-muted-foreground">
          ⌖
        </span>
      </div>
    );
  }

  if (variant === "beam") {
    return (
      <div className={`beam-texture h-5 w-full ${className}`} aria-hidden="true" />
    );
  }

  if (variant === "truss") {
    return (
      <div className={`w-full overflow-hidden bg-card/60 ${className}`} aria-hidden="true">
        <svg viewBox="0 0 1200 60" className="h-14 w-full" preserveAspectRatio="none">
          <g
            fill="none"
            stroke="oklch(0.305 0.036 55 / 40%)"
            strokeWidth="3"
            strokeLinecap="round"
          >
            <path d="M0 52h1200" />
            <path d="M60 52 120 18 180 52 240 18 300 52 360 18 420 52 480 18 540 52 600 18 660 52 720 18 780 52 840 18 900 52 960 18 1020 52 1080 18 1140 52" />
            <path d="M120 18h1000" opacity="0.55" />
          </g>
        </svg>
      </div>
    );
  }

  // ridge — low-poly canyon silhouette
  return (
    <div className={`w-full overflow-hidden ${className}`} aria-hidden="true">
      <svg viewBox="0 0 1200 70" className="h-16 w-full" preserveAspectRatio="none">
        <path
          d="M0 70 0 44 90 22 170 46 260 14 350 40 460 20 560 48 660 26 760 44 870 16 960 42 1060 24 1140 46 1200 30 1200 70Z"
          fill="oklch(0.305 0.036 55 / 12%)"
        />
        <path
          d="M0 70 0 56 110 40 210 58 320 36 430 54 540 40 660 58 770 42 880 56 1000 38 1110 56 1200 44 1200 70Z"
          fill="oklch(0.305 0.036 55 / 20%)"
        />
      </svg>
    </div>
  );
}
