import type { LucideIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

/**
 * Admin control-centre primitives.
 *
 * Denser and more administrative than the player dashboard: compact panels,
 * table-first layouts, blueprint blue reserved for technical/system data.
 */

export function AdminPage({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-5 pb-4", className)}>{children}</div>;
}

export function AdminHeading({
  title,
  description,
  actions,
  status,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  status?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-border pb-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl leading-tight sm:text-[1.75rem]">{title}</h1>
          {status}
        </div>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string | undefined;
}) {
  return (
    <p
      className={cn(
        "text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}

/** Compact bordered container. `tone="blueprint"` for technical/system data. */
export function Panel({
  title,
  icon: Icon,
  actions,
  tone = "cream",
  bodyClassName,
  className,
  children,
}: {
  title?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  tone?: "cream" | "blueprint";
  bodyClassName?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const blueprint = tone === "blueprint";
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border-2",
        blueprint ? "blueprint-page border-transparent" : "border-border bg-card",
        className,
      )}
    >
      {title ? (
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-2 border-b-2 px-4 py-2.5",
            blueprint ? "border-white/15" : "border-border bg-secondary/40",
          )}
        >
          <h2 className="flex min-w-0 items-center gap-2 truncate font-display text-sm uppercase tracking-[0.12em]">
            {Icon ? <Icon className="h-4 w-4 shrink-0 opacity-70" aria-hidden="true" /> : null}
            {title}
          </h2>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  to,
  linkLabel = "Manage",
  tone = "cream",
}: {
  icon?: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: string;
  to?: string;
  linkLabel?: string;
  tone?: "cream" | "gold" | "blueprint";
}) {
  const blueprint = tone === "blueprint";
  return (
    <div
      className={cn(
        "flex flex-col justify-between gap-2 rounded-xl border-2 px-4 py-3",
        blueprint
          ? "blueprint-page border-transparent"
          : tone === "gold"
            ? "border-gold/60 bg-gold/12"
            : "border-border bg-card",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <SectionLabel className={blueprint ? "text-white/70" : undefined}>{label}</SectionLabel>
          <p className="mt-0.5 font-display text-2xl leading-none">{value}</p>
          {hint ? (
            <p
              className={cn(
                "mt-1 truncate text-xs",
                blueprint ? "text-white/70" : "text-muted-foreground",
              )}
            >
              {hint}
            </p>
          ) : null}
        </div>
        {Icon ? (
          <span
            className={cn(
              "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
              blueprint ? "bg-white/10 text-white" : "bg-gold/15 text-gold",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      {to ? (
        <Link
          to={to}
          className={cn(
            "text-xs font-extrabold hover:underline",
            blueprint ? "text-gold" : "text-gold",
          )}
        >
          {linkLabel} →
        </Link>
      ) : null}
    </div>
  );
}

export type StatusTone = "ok" | "warn" | "off" | "info";

const toneClass: Record<StatusTone, string> = {
  ok: "border-success/50 bg-success/12 text-success",
  warn: "border-warning/50 bg-warning/15 text-warning",
  off: "border-border bg-secondary text-muted-foreground",
  info: "border-blueprint/40 bg-blueprint/10 text-blueprint",
};

const dotClass: Record<StatusTone, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  off: "bg-muted-foreground/60",
  info: "bg-blueprint",
};

export function StatusPill({
  tone = "ok",
  children,
  className,
}: {
  tone?: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.1em]",
        toneClass[tone],
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dotClass[tone])} aria-hidden="true" />
      {children}
    </span>
  );
}

/** Small definition row used in status panels. */
export function DataRow({
  label,
  value,
  tone = "cream",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "cream" | "blueprint";
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-dashed py-1.5 text-sm last:border-b-0",
        tone === "blueprint" ? "border-white/20" : "border-border",
      )}
    >
      <span className={tone === "blueprint" ? "text-white/70" : "text-muted-foreground"}>
        {label}
      </span>
      <span className="min-w-0 truncate font-bold">{value}</span>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  destructive = true,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display">{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={
              destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : undefined
            }
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  counts,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  counts?: Partial<Record<T, number>>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          aria-pressed={value === o}
          className={cn(
            "rounded-lg border-2 px-2.5 py-1 text-xs font-extrabold transition-colors",
            value === o
              ? "border-border bg-gold/20 text-foreground"
              : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          {o}
          {counts && counts[o] !== undefined ? (
            <span className="ml-1.5 opacity-70">{counts[o]}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
