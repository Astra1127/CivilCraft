export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="blueprint bg-background border-b border-border">
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-end gap-4 px-4 py-10 sm:flex sm:flex-wrap sm:justify-between sm:px-6 sm:py-14">
        <div className="min-w-0 max-w-2xl">
          {eyebrow ? (
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">{eyebrow}</p>
          ) : null}
          <h1 className="mt-2 text-3xl sm:text-4xl">{title}</h1>
          {description ? (
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 sm:flex sm:flex-wrap sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-2xl sm:text-3xl">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
