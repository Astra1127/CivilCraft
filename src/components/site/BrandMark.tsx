export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        aria-hidden="true"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border-2 border-primary/50 gold-gradient text-gold-foreground shadow-[var(--shadow-soft)]"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M2 18h20" />
          <path d="M4 18 8 8l4 10 4-10 4 10" />
          <path d="M8 8h8" />
        </svg>
      </span>
      {!compact ? (
        <span className="min-w-0 leading-tight">
          <span className="block truncate font-display text-base font-extrabold">
            Civil Craft
          </span>
          <span className="block truncate text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
            Bridge Edition
          </span>
        </span>
      ) : null}

    </span>
  );
}
