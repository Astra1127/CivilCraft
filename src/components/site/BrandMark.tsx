import { cn } from "@/lib/utils";

export type BrandMarkSize = "nav" | "footer" | "auth" | "compact";

export interface BrandMarkProps {
  className?: string;
  imageClassName?: string;
  compact?: boolean;
  size?: BrandMarkSize;
}

export function BrandMark({
  className,
  imageClassName,
  compact = false,
  size = compact ? "compact" : "nav",
}: BrandMarkProps = {}) {
  const isNav = size === "nav";

  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center",
        isNav ? "justify-center overflow-visible" : "",
        className,
      )}
    >
      <img
        src="/images/branding/main_logo.png"
        alt="Civil Craft"
        width={1536}
        height={1024}
        className={cn(
          isNav
            ? "h-auto w-[110px] sm:w-[124px] md:w-[132px] lg:w-[136px] max-w-none select-none object-contain -my-2 sm:-my-2.5 md:-my-3 translate-y-[2px]"
            : "h-10 w-auto max-w-[160px] object-contain sm:h-12 sm:max-w-[200px]",
          imageClassName,
        )}
        loading="eager"
        decoding="async"
      />
    </span>
  );
}
