import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { BrandedCover } from "@/components/common/BrandedCover";
import { useBridgeSnapshotState } from "./almanac/useBridgeSnapshot";
import type { AlmanacLevel } from "@/lib/playfab/types";

/** Uses the same authenticated album reader as the Almanac entry. */
export function RecentBuildPhoto({
  level,
  refreshKey = 0,
}: {
  level: AlmanacLevel;
  refreshKey?: number;
}) {
  const photo = useBridgeSnapshotState(level, refreshKey);
  const candidate = photo.url ?? level.completion?.completionScreenshotUrl;
  const imageKey = `${refreshKey}:${candidate ?? ""}`;
  const [failed, setFailed] = useState<string>();
  const [loaded, setLoaded] = useState<string>();
  const url = candidate && imageKey !== failed ? candidate : undefined;
  const loading = photo.status === "loading" || (!!url && loaded !== imageKey);
  const label = loading
    ? "Loading bridge photo…"
    : photo.status === "missing" && !candidate
      ? "Photo not synced from the game"
      : "Photo unavailable · Refresh to retry";

  return (
    <div className="relative aspect-video w-full overflow-hidden border-b-2 border-border bg-secondary/60">
      {url ? (
        <img
          key={imageKey}
          src={url}
          alt={`Completed bridge from ${level.levelName ?? "a Civil Craft level"}`}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(imageKey)}
          onError={() => setFailed(imageKey)}
          className="h-full w-full object-cover"
        />
      ) : (
        <BrandedCover label={label} />
      )}
      {!url || loading ? (
        <div
          role={loading ? "status" : undefined}
          className="absolute inset-x-2 bottom-2 flex items-center justify-center gap-1.5 rounded-lg bg-card/95 px-2 py-1 text-center text-xs text-muted-foreground"
        >
          {loading ? (
            <LoaderCircle
              className="h-3.5 w-3.5 shrink-0 motion-safe:animate-spin"
              aria-hidden="true"
            />
          ) : null}
          {label}
        </div>
      ) : null}
    </div>
  );
}
