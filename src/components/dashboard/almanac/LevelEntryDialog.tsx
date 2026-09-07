import { BookOpen, Medal } from "lucide-react";
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
import { getBridgeType, getConcepts } from "@/lib/almanac/content";
import type { AlmanacLevel } from "@/lib/playfab";

export function CompletionScreenshot({
  level,
  className,
}: {
  level: AlmanacLevel;
  className?: string;
}) {
  const url = level.completion?.completionScreenshotUrl;
  return (
    <figure
      className={`relative overflow-hidden rounded-2xl border-4 border-primary bg-secondary/60 shadow-[var(--shadow-soft)] ${className ?? ""}`}
    >
      {/* taped-in scrapbook corner */}
      <span
        aria-hidden="true"
        className="absolute left-3 top-3 z-10 rounded-full border-2 border-primary/40 bg-card/90 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.18em] text-primary"
      >
        Field photo
      </span>
      {url ? (
        <img
          src={url}
          alt={`Completed bridge built by the player in ${level.levelName ?? "this level"}`}
          loading="lazy"
          className="aspect-video w-full object-cover"
        />
      ) : (
        <BrandedCover label="Completion screenshot pending upload from the game" />
      )}
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-t-4 border-primary bg-card px-3 py-2">
        <span className="font-display text-xs uppercase tracking-[0.16em] text-muted-foreground">
          Level {String(level.order).padStart(2, "0")}
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
}: {
  level: AlmanacLevel | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  if (!level) return null;
  const c = level.completion;
  const bridge = getBridgeType(c?.bridgeTypeId);
  const concepts = getConcepts(level.engineeringConceptIds);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto border-4 border-primary bg-card">
        <DialogHeader>
          <DialogTitle className="text-center font-display text-xl uppercase tracking-[0.08em]">
            Level {String(level.order).padStart(2, "0")} — {level.levelName ?? "Unknown"}
          </DialogTitle>
          <DialogDescription className="text-center">
            Your Almanac entry for this challenge.
          </DialogDescription>
        </DialogHeader>

        <CompletionScreenshot level={level} />

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
                {new Date(c.completedAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
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
            {concepts.map((concept) => (
              <li key={concept.id} className="rounded-xl border-2 border-border bg-secondary/40 px-3 py-2">
                <p className="font-display text-base">{concept.name}</p>
                <p className="text-sm text-muted-foreground">{concept.summary}</p>
                {concept.diagram ? (
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-primary/70">
                    {concept.diagram}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        {bridge ? (
          <div className="rounded-xl border-2 border-border bg-secondary/40 p-3">
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
