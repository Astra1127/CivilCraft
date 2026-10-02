import propRocks from "@/assets/prop-rocks-cacti.png";
import propTools from "@/assets/prop-tools.png";

const art = {
  rocks: { src: propRocks, alt: "" },
  tools: { src: propTools, alt: "" },
  duo: { src: "/images/decor/engineer-blueprint.png", alt: "" },
  engineer: { src: "/images/decor/engineer-blueprint.png", alt: "" },
  wrench: { src: "/images/decor/female-engineer-wrench.png", alt: "" },
} as const;

export type PropKind = keyof typeof art;

/**
 * Decorative low-poly game prop. Absolutely positioned by the caller,
 * hidden below `lg` so mobile keeps its readability, never interactive.
 */
export function GameProp({ kind, className = "" }: { kind: PropKind; className?: string }) {
  if (kind === "duo")
    return (
      <span
        aria-hidden="true"
        className={`game-prop hidden aspect-square select-none lg:block ${className}`}
      >
        <EngineerPair />
      </span>
    );
  return (
    <img
      src={art[kind].src}
      alt=""
      aria-hidden="true"
      loading="lazy"
      className={`game-prop hidden select-none lg:block ${kind === "engineer" || kind === "wrench" ? "aspect-square object-contain" : ""} ${className}`}
    />
  );
}

/** Same art, but as a normal in-flow illustration (visible on all sizes). */
export function GameArt({
  kind,
  className = "",
  alt,
}: {
  kind: PropKind;
  className?: string;
  alt: string;
}) {
  if (kind === "duo")
    return (
      <span
        role="img"
        aria-label={alt}
        className={`relative block aspect-square select-none drop-shadow-xl ${className}`}
      >
        <EngineerPair />
      </span>
    );
  return (
    <img
      src={art[kind].src}
      alt={alt}
      loading="lazy"
      className={`select-none drop-shadow-xl ${kind === "engineer" || kind === "wrench" ? "aspect-square object-contain" : ""} ${className}`}
    />
  );
}

function EngineerPair() {
  return (
    <>
      <img
        src="/images/decor/engineer-blueprint.png"
        alt=""
        loading="lazy"
        className="absolute left-0 top-0 h-full w-1/2 object-contain"
      />
      <img
        src="/images/decor/female-engineer-wrench.png"
        alt=""
        loading="lazy"
        className="absolute right-0 top-0 h-full w-1/2 object-contain"
      />
    </>
  );
}
