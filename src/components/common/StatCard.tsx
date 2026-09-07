import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  className,
}: {
  icon?: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("panel flex items-start gap-3 p-4", className)}>
      {Icon ? (
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gold/15 text-gold">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      ) : null}
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="font-display text-2xl leading-tight">{value}</p>
        {hint ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}
