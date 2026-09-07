import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { usingMockData } from "@/lib/playfab";
import { cn } from "@/lib/utils";

/**
 * Honest labelling: any surface backed by placeholder data instead of live
 * PlayFab data must render this badge.
 */
export function DemoBadge({ className, label = "Demo data" }: { className?: string; label?: string }) {
  if (!usingMockData) return null;
  return (
    <Badge
      variant="outline"
      className={cn("border-gold/60 bg-gold/10 text-xs font-semibold text-gold", className)}
    >
      <Info className="mr-1 h-3 w-3" aria-hidden="true" />
      {label}
    </Badge>
  );
}

export function IntegrationNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-gold/60 bg-gold/10 px-3 py-2 text-xs text-foreground/80">
      {children}
    </p>
  );
}
