import { cn } from "@/lib/utils";

export interface BrandMarkProps {
  className?: string;
  imageClassName?: string;
  compact?: boolean;
}

export function BrandMark({ className, imageClassName }: BrandMarkProps = {}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center", className)}>
      <img
        src="/images/branding/main_logo.png"
        alt="Civil Craft"
        width={1536}
        height={1024}
        className={cn(
          "h-10 w-auto max-w-[160px] object-contain sm:h-12 sm:max-w-[200px]",
          imageClassName,
        )}
        loading="eager"
        decoding="async"
      />
    </span>
  );
}
