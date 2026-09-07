import propRocks from "@/assets/prop-rocks-cacti.png";
import propTools from "@/assets/prop-tools.png";
import chibiDuo from "@/assets/chibi-duo.png";
import chibiEngineer from "@/assets/chibi-engineer.png";

const art = {
  rocks: { src: propRocks, alt: "" },
  tools: { src: propTools, alt: "" },
  duo: { src: chibiDuo, alt: "" },
  engineer: { src: chibiEngineer, alt: "" },
} as const;

export type PropKind = keyof typeof art;

/**
 * Decorative low-poly game prop. Absolutely positioned by the caller,
 * hidden below `lg` so mobile keeps its readability, never interactive.
 */
export function GameProp({
  kind,
  className = "",
}: {
  kind: PropKind;
  className?: string;
}) {
  return (
    <img
      src={art[kind].src}
      alt=""
      aria-hidden="true"
      loading="lazy"
      className={`game-prop hidden select-none lg:block ${className}`}
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
  return (
    <img
      src={art[kind].src}
      alt={alt}
      loading="lazy"
      className={`select-none drop-shadow-xl ${className}`}
    />
  );
}
