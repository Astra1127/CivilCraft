import { Medal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Achievement } from "@/lib/playfab";

export function AchievementDetailsDialog({
  achievement,
  onClose,
  onRestoreFocus,
}: {
  achievement: Achievement | undefined;
  onClose: () => void;
  onRestoreFocus: () => void;
}) {
  if (!achievement) return null;
  const date =
    achievement.unlockedAt && Number.isFinite(Date.parse(achievement.unlockedAt))
      ? new Date(achievement.unlockedAt).toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : null;
  const hasProgress =
    typeof achievement.progress === "number" &&
    Number.isFinite(achievement.progress) &&
    typeof achievement.progressTarget === "number" &&
    Number.isFinite(achievement.progressTarget) &&
    achievement.progressTarget > 0;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto break-words rounded-xl border-4 border-primary bg-card"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestoreFocus();
        }}
      >
        <DialogHeader className="pr-6">
          <Medal className="mb-2 h-10 w-10 text-gold" aria-hidden="true" />
          <DialogTitle className="font-display text-xl text-primary">
            {achievement.name}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-wrap">
            {achievement.description || "No description has been synced for this achievement."}
          </DialogDescription>
        </DialogHeader>
        <dl className="space-y-3 rounded-xl border-2 border-gold/60 bg-gold/10 p-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Status</dt>
            <dd className="font-bold">{achievement.unlocked ? "Unlocked" : "Locked"}</dd>
          </div>
          {achievement.unlocked ? (
            <div>
              <dt className="text-muted-foreground">Unlocked on</dt>
              <dd>{date ?? "Unlock date unavailable"}</dd>
            </div>
          ) : null}
          {hasProgress ? (
            <div>
              <dt className="text-muted-foreground">Progress</dt>
              <dd>
                {achievement.progress} / {achievement.progressTarget}
              </dd>
            </div>
          ) : null}
        </dl>
        <Button variant="outline" onClick={onClose}>
          Close achievement
        </Button>
      </DialogContent>
    </Dialog>
  );
}
