import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Lock, Medal } from "lucide-react";
import { useState } from "react";
import { DemoBadge } from "@/components/common/DemoBadge";
import { SectionHeading } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { achievementsService } from "@/lib/playfab";

export const Route = createFileRoute("/dashboard/achievements")({
  component: AchievementsPage,
});

const filters = ["All", "Unlocked", "Locked"] as const;

function AchievementsPage() {
  const q = useQuery({ queryKey: ["achievements"], queryFn: achievementsService.getAchievements });
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");

  if (q.isPending) return <LoadingState label="Loading achievements…" rows={4} />;
  if (q.isError) return <ErrorState onRetry={q.refetch} description={(q.error as Error).message} />;

  const list = q.data.filter((a) =>
    filter === "All" ? true : filter === "Unlocked" ? a.unlocked : !a.unlocked,
  );

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Achievements"
        description={`${q.data.filter((a) => a.unlocked).length} of ${q.data.length} unlocked`}
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
        <EmptyState title="Nothing here yet" description="Keep playing to unlock achievements." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((a) => (
            <li key={a.id} className={`panel p-5 ${a.unlocked ? "border-gold/60" : "opacity-80"}`}>
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
              {!a.unlocked && a.progressTarget ? (
                <>
                  <Progress
                    value={Math.round(((a.progress ?? 0) / a.progressTarget) * 100)}
                    className="mt-3"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {a.progress ?? 0} / {a.progressTarget}
                  </p>
                </>
              ) : null}
              {a.unlocked && a.unlockedAt ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Unlocked {new Date(a.unlockedAt).toLocaleDateString()}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
