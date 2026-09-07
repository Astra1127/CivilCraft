import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect } from "react";
import { ArtPlaceholder } from "@/components/common/ArtPlaceholder";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export interface LightboxItem {
  id: string;
  caption: string;
  url?: string | undefined;
  category?: string | undefined;
}

export function Lightbox({
  items,
  index,
  onIndexChange,
  onClose,
}: {
  items: LightboxItem[];
  index: number | null;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const open = index !== null;
  const item = open ? items[index] : undefined;

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") onIndexChange((index + 1) % items.length);
      if (e.key === "ArrowLeft") onIndexChange((index - 1 + items.length) % items.length);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, index, items.length, onIndexChange]);

  if (!item || index === null) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl bg-card">
        <DialogTitle className="font-display text-lg">{item.caption}</DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground">
          {item.category ? `${item.category} · ` : ""}Image {index + 1} of {items.length}
        </DialogDescription>
        {item.url ? (
          <img src={item.url} alt={item.caption} className="w-full rounded-xl" loading="lazy" />
        ) : (
          <ArtPlaceholder label={item.caption} />
        )}
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            onClick={() => onIndexChange((index - 1 + items.length) % items.length)}
          >
            <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
            Previous
          </Button>
          <Button variant="outline" onClick={() => onIndexChange((index + 1) % items.length)}>
            Next
            <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
