import type { ReactNode } from "react";
import { Content } from "@radix-ui/react-dialog";
import { X, ZoomIn } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** A separate portaled dialog keeps the level popup mounted and restores trigger focus. */
export function IllustrationPreview({
  title,
  children,
  preview,
}: {
  title: string;
  children: ReactNode;
  preview: ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Enlarge ${title} illustration`}
          className="group relative block w-full cursor-zoom-in rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
        >
          {children}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-2 right-2 rounded-full border border-border bg-card/90 p-1.5 text-primary shadow-sm transition-transform group-hover:scale-110 group-focus-visible:scale-110"
          >
            <ZoomIn className="h-4 w-4" />
          </span>
        </button>
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay className="z-[100] bg-black/75" />
        <Content
          className="fixed left-1/2 top-1/2 z-[101] grid h-[min(85vh,max(20rem,50vw))] w-[90vw] max-w-[90vw] max-h-[85vh] grid-rows-[auto_minmax(0,1fr)] -translate-x-1/2 -translate-y-1/2 gap-2 overflow-hidden rounded-2xl border-2 border-border bg-card p-3 shadow-2xl focus:outline-none sm:p-4"
          onEscapeKeyDown={(event) => event.stopPropagation()}
        >
          <DialogTitle className="min-w-0 whitespace-normal pr-12 font-display text-base leading-snug [overflow-wrap:anywhere] sm:text-lg">
            {title} — enlarged illustration
          </DialogTitle>
          <DialogDescription className="sr-only">
            Full illustration preview. Press Escape, click outside, or use Close to return.
          </DialogDescription>
          <div className="flex min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-xl bg-secondary/40">
            {preview}
          </div>
          <DialogClose asChild>
            <button
              type="button"
              aria-label="Close illustration preview"
              className="absolute right-2 top-2 rounded-full border border-border bg-card p-2 text-primary shadow-md hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </DialogClose>
        </Content>
      </DialogPortal>
    </Dialog>
  );
}
