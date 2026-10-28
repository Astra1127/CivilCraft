import { levelStageLabel } from "@/lib/playfab/level-records";
import { BookOpen, ChevronRight, Medal } from "lucide-react";
import { BrandedCover } from "@/components/common/BrandedCover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getBridgeType } from "@/lib/almanac/content";
import type { AlmanacLevel } from "@/lib/playfab";
import { useRef, useState } from "react";
import { useBridgeSnapshot } from "./useBridgeSnapshot";
import { bridgeLesson } from "@/lib/almanac/lesson-catalog";
import { levelLessonRows } from "@/lib/almanac/lesson-navigation";
import { LessonIllustration } from "./LessonIllustration";

export function CompletionScreenshot({
  level,
  className,
  compactPlaceholder = false,
}: {
  level: AlmanacLevel;
  className?: string;
  compactPlaceholder?: boolean;
}) {
  const privateUrl = useBridgeSnapshot(level);
  const candidate = privateUrl ?? level.completion?.completionScreenshotUrl;
  const [failed, setFailed] = useState<string>();
  const url = candidate && candidate !== failed ? candidate : undefined;
  return (
    <figure
      className={`relative overflow-hidden rounded-2xl border-4 border-primary bg-secondary/60 shadow-[var(--shadow-soft)] ${className ?? ""}`}
    >
      {/* taped-in scrapbook corner */}
      <span
        aria-hidden="true"
        className="absolute left-3 top-3 z-10 rounded-full border-2 border-primary/40 bg-card/90 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.18em] text-primary"
      >
        {url ? "Field photo" : "Photo unavailable · Placeholder"}
      </span>
      {url ? (
        <img
          src={url}
          alt={`Completed bridge built by the player in ${level.levelName ?? "this level"}`}
          loading="lazy"
          onError={() => setFailed(candidate)}
          referrerPolicy="no-referrer"
          className="aspect-video w-full object-cover"
        />
      ) : (
        <div className={compactPlaceholder ? "mx-auto w-full max-w-xs" : undefined}>
          <BrandedCover
            label="Completion screenshot unavailable or not synchronized"
            compact={compactPlaceholder}
          />
        </div>
      )}
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-t-4 border-primary bg-card px-3 py-2">
        <span className="font-display text-xs uppercase tracking-[0.16em] text-muted-foreground">
          {levelStageLabel(level)}
        </span>
        <span className="stamp text-[10px]">✓ Contract completed</span>
      </figcaption>
    </figure>
  );
}

export function LevelEntryDialog({
  level,
  open,
  onOpenChange,
  onLessonSelect,
}: {
  level: AlmanacLevel | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onLessonSelect?: (lessonId: string) => void;
}) {
  const navigatingToLesson = useRef(false);
  if (!level) return null;
  const c = level.completion;
  const bridge = getBridgeType(c?.bridgeTypeId);
  const lessonRows = levelLessonRows(level);
  const bridgeEducation = bridgeLesson(level);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92dvh] w-[calc(100%-1rem)] min-w-0 max-w-2xl overflow-x-hidden overflow-y-auto [overflow-wrap:anywhere] border-4 border-primary bg-card p-4 sm:p-6 [&>*]:min-w-0"
        onCloseAutoFocus={(event) => {
          if (navigatingToLesson.current) {
            event.preventDefault();
            navigatingToLesson.current = false;
          }
        }}
      >
        <DialogHeader className="min-w-0 px-6 sm:px-8">
          <DialogTitle className="whitespace-normal text-center font-display text-lg leading-snug uppercase tracking-[0.04em] sm:text-xl">
            {levelStageLabel(level)} — {level.levelName ?? "Unknown"}
          </DialogTitle>
          <DialogDescription className="text-center">
            Your Almanac entry for this challenge.
          </DialogDescription>
        </DialogHeader>

        <CompletionScreenshot level={level} compactPlaceholder />

        {c ? (
          <dl className="mt-2 grid gap-px overflow-hidden rounded-xl border-2 border-border bg-border text-sm">
            {bridge ? (
              <div className="grid grid-cols-2 gap-2 bg-card px-3 py-2">
                <dt className="text-muted-foreground">Bridge used</dt>
                <dd className="text-right font-bold">{bridge.name}</dd>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2 bg-card px-3 py-2">
              <dt className="text-muted-foreground">Score</dt>
              <dd className="text-right font-display">{c.score.toLocaleString()}</dd>
            </div>
            <div className="grid grid-cols-2 gap-2 bg-card px-3 py-2">
              <dt className="text-muted-foreground">Completed</dt>
              <dd className="text-right font-bold">
                {Number.isFinite(Date.parse(c.completedAt))
                  ? new Date(c.completedAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                  : "Date unavailable"}
              </dd>
            </div>
          </dl>
        ) : null}

        {c?.achievementId ? (
          <p className="flex items-center gap-2 rounded-xl border-2 border-gold/60 bg-gold/10 px-3 py-2 text-sm font-bold text-gold">
            <Medal className="h-4 w-4" aria-hidden="true" />
            Achievement earned on this build
          </p>
        ) : null}

        <section className="mt-2">
          <h3 className="font-display text-sm uppercase tracking-[0.16em] text-muted-foreground">
            What you encountered
          </h3>
          <ul className="mt-2 space-y-2">
            {lessonRows.map((row) => (
              <li key={row.key} className="min-w-0">
                {row.lessonId && onLessonSelect ? (
                  <button
                    type="button"
                    onClick={() => {
                      navigatingToLesson.current = true;
                      onLessonSelect(row.lessonId!);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-secondary/40 px-3 py-2 text-left hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={`Read ${row.title} in Engineering`}
                  >
                    <BookOpen className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-sm">{row.title}</span>
                      <span className="block whitespace-normal text-xs leading-relaxed text-muted-foreground">
                        {row.summary}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  </button>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/20 px-3 py-2">
                    <BookOpen
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="font-display text-sm">{row.title}</p>
                      <p className="whitespace-normal text-xs leading-relaxed text-muted-foreground">
                        {row.summary}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Engineering entry or introduction mapping pending
                      </p>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {!lessonRows.length ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Lesson mapping pending for this contract.
            </p>
          ) : null}
        </section>

        {bridge ? (
          <div className="rounded-xl border-2 border-border bg-secondary/40 p-3">
            {bridgeEducation ? (
              <LessonIllustration
                id={bridgeEducation.id ?? bridgeEducation.key}
                title={bridgeEducation.title}
                {...(bridgeEducation.image ? { image: bridgeEducation.image } : {})}
                compact
              />
            ) : null}
            <p className="flex items-center gap-2 font-display text-base">
              <BookOpen className="h-4 w-4 text-gold" aria-hidden="true" />
              {bridge.name}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{bridge.howItWorks}</p>
            <Badge variant="secondary" className="mt-2">
              Bridge information
            </Badge>
          </div>
        ) : null}

        <Button variant="outline" onClick={() => onOpenChange(false)} className="mt-2">
          Close entry
        </Button>
      </DialogContent>
    </Dialog>
  );
}
