import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Lock, Medal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DemoBadge } from "@/components/common/DemoBadge";
import { SectionHeading } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { achievementsService, type Achievement } from "@/lib/playfab";
import { AchievementDetailsDialog } from "@/components/dashboard/AchievementDetailsDialog";

import { useAuth } from "@/lib/auth";
import { useNotificationRead } from "@/components/dashboard/useNotificationRead";
import { findNotificationAchievement, targetSearch } from "@/lib/playfab/notification-navigation";

export const Route = createFileRoute("/dashboard/achievements")({
  validateSearch: (search: Record<string, unknown>): { achievementId?: string } => {
    const achievementId = targetSearch(search, "achievementId");
    return achievementId ? { achievementId } : {};
  },
  component: AchievementsPage,
});

const filters = ["All", "Unlocked", "Locked"] as const;

function AchievementsPage() {
  const { player } = useAuth();
  const { achievementId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const q = useQuery({
    queryKey: ["achievements", player?.playFabId],
    queryFn: achievementsService.getAchievements,
    enabled: !!player,
  });
  const target = findNotificationAchievement(q.data ?? [], achievementId);
  const targetRef = useRef<HTMLLIElement>(null);
  const restoreFocusRef = useRef<HTMLButtonElement | null>(null);
  const [localSelection, setLocalSelection] = useState<Achievement>();
  const selected = localSelection && q.data?.includes(localSelection) ? localSelection : target;
  useEffect(() => {
    setLocalSelection(undefined);
  }, [achievementId, player?.playFabId]);
  useNotificationRead(target ? `ach-${target.id}` : undefined);
  useEffect(() => {
    if (target) {
      setFilter("All");
      targetRef.current?.scrollIntoView({ block: "center" });
    }
  }, [target, achievementId]);
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");

  if (q.isPending) return <LoadingState label="Loading achievements…" rows={4} />;
  if (q.isError) return <ErrorState onRetry={q.refetch} description={(q.error as Error).message} />;

  const list = q.data.filter((a) =>
    a === target || filter === "All" ? true : filter === "Unlocked" ? a.unlocked : !a.unlocked,
  );

  return (
    <div className="space-y-6">
      {achievementId && !target ? (
        <p role="status">This achievement is unavailable in your synced progress.</p>
      ) : null}
      <SectionHeading
        title="Achievements"
        description={
          q.data.length
            ? `${q.data.filter((a) => a.unlocked).length} of ${q.data.length} unlocked`
            : "Sync your game to view unlocked achievements"
        }
        action={<DemoBadge />}
      />
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <Button
            key={f}
            size="sm"
            variant={f === filter ? "default" : "outline"}
            onClick={() => setFilter(f)}
          >
            {f}
          </Button>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState
          title={
            q.data.length === 0 ? "No achievements synced yet" : "No achievements match this filter"
          }
          description={
            q.data.length === 0
              ? "Complete challenges and build bridges in Civil Craft to unlock achievements."
              : "Try selecting another filter."
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((a) => (
            <li
              key={a.id}
              ref={a === target ? targetRef : undefined}
              tabIndex={a === target ? -1 : undefined}
              className={`panel scroll-mt-24 ${a === target ? "ring-2 ring-gold" : ""} ${a.unlocked ? "border-gold/60" : "opacity-80"}`}
            >
              <button
                type="button"
                disabled={!a.unlocked}
                aria-label={`View achievement: ${a.name}`}
                aria-haspopup="dialog"
                ref={(node) => {
                  if (node && a === selected) restoreFocusRef.current = node;
                }}
                className="h-full w-full rounded-lg p-5 text-left enabled:hover:bg-gold/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
                onClick={(event) => {
                  restoreFocusRef.current = event.currentTarget;
                  if (findNotificationAchievement(q.data, a.id) === a)
                    void navigate({ search: { achievementId: a.id } });
                  else setLocalSelection(a);
                }}
              >
                <span
                  className={`grid h-10 w-10 place-items-center rounded-xl ${
                    a.unlocked ? "bg-gold/20 text-gold" : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {a.unlocked ? (
                    <Medal className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <Lock className="h-5 w-5" aria-hidden="true" />
                  )}
                </span>
                <h3 className="mt-3 font-display text-lg">{a.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{a.description}</p>
                {!a.unlocked &&
                typeof a.progress === "number" &&
                Number.isFinite(a.progress) &&
                typeof a.progressTarget === "number" &&
                Number.isFinite(a.progressTarget) &&
                a.progressTarget > 0 ? (
                  <>
                    <Progress
                      value={Math.round((a.progress / a.progressTarget) * 100)}
                      className="mt-3"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {a.progress} / {a.progressTarget}
                    </p>
                  </>
                ) : null}
                {a.unlocked && a.unlockedAt ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Unlocked{" "}
                    {Number.isFinite(Date.parse(a.unlockedAt))
                      ? new Date(a.unlockedAt).toLocaleDateString()
                      : "— date unavailable"}
                  </p>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      <AchievementDetailsDialog
        achievement={selected}
        onClose={() => {
          setLocalSelection(undefined);
          if (achievementId) void navigate({ search: {} });
        }}
        onRestoreFocus={() => {
          restoreFocusRef.current?.focus({ preventScroll: true });
        }}
      />
    </div>
  );
}
