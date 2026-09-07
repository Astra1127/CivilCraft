import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Hammer, Medal, Star, Trophy } from "lucide-react";
import { DemoBadge } from "@/components/common/DemoBadge";
import { CharacterPreview } from "@/components/dashboard/CharacterPreview";
import { SectionHeading } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/lib/auth";
import { BrandedCover } from "@/components/common/BrandedCover";
import {
  achievementsService,
  almanacService,
  profileService,
  progressService,
} from "@/lib/playfab";
import { getBridgeType } from "@/lib/almanac/content";

export const Route = createFileRoute("/dashboard/")({
  component: PlayerOverview,
});

function PlayerOverview() {
  const { player } = useAuth();
  const id = player?.playFabId ?? "";
  const profile = useQuery({
    queryKey: ["profile", id],
    queryFn: () => profileService.getProfile(id),
    enabled: !!id,
  });
  const progress = useQuery({ queryKey: ["progress", id], queryFn: progressService.getProgress });
  const achievements = useQuery({
    queryKey: ["achievements", id],
    queryFn: achievementsService.getAchievements,
  });
  const character = useQuery({
    queryKey: ["character", id],
    queryFn: profileService.getCharacter,
    enabled: !!id,
  });
  const journey = useQuery({
    queryKey: ["almanac-journey", id],
    queryFn: almanacService.getJourney,
  });

  if (profile.isPending) return <LoadingState label="Loading your dashboard…" rows={4} />;
  if (profile.isError)
    return <ErrorState description={(profile.error as Error).message} onRetry={profile.refetch} />;

  const p = profile.data;
  const xpPercent = Math.round((p.xp / Math.max(p.xpToNextLevel, 1)) * 100);

  return (
    <div className="space-y-8">
      <section className="panel flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
        <CharacterPreview
          character={character.data}
          displayName={p.displayName}
          className="w-28 shrink-0 sm:w-32"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">
                Welcome back
              </p>
              <h1 className="truncate text-2xl sm:text-3xl">{p.displayName}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Level {p.level} · {p.xp.toLocaleString()} / {p.xpToNextLevel.toLocaleString()} XP
              </p>
            </div>
            <DemoBadge />
          </div>
          <Progress value={xpPercent} className="mt-3 max-w-sm" />
          <p className="mt-2 text-xs text-muted-foreground">
            {Math.max(p.xpToNextLevel - p.xp, 0).toLocaleString()} XP to level {p.level + 1}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild variant="gold" size="sm">
              <Link to="/dashboard/almanac">Open Field Journal</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/dashboard/profile">View Profile</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Star} label="Total score" value={p.totalScore.toLocaleString()} />
        <StatCard icon={Trophy} label="Global rank" value={p.rank ? `#${p.rank}` : "Unranked"} />
        <StatCard icon={Hammer} label="Bridges completed" value={p.bridgesCompleted} />
        <StatCard
          icon={Medal}
          label="Achievements"
          value={`${p.achievementsUnlocked}/${p.achievementsTotal}`}
        />
      </section>

      <section>
        <SectionHeading
          title="Story progress"
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/dashboard/almanac">Open Almanac</Link>
            </Button>
          }
        />
        {progress.isPending ? (
          <LoadingState rows={2} />
        ) : progress.isError ? (
          <ErrorState onRetry={progress.refetch} />
        ) : (
          <div className="panel space-y-4 p-6">
            <div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Overall completion</span>
                <span className="font-semibold">{progress.data.overallPercent}%</span>
              </div>
              <Progress value={progress.data.overallPercent} className="mt-2" />
            </div>
            <p className="text-sm text-muted-foreground">
              Current region: {progress.data.currentRegion ?? "—"}
            </p>
          </div>
        )}
      </section>

      <section>
        <SectionHeading
          title="Recent achievements"
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/dashboard/achievements">View all</Link>
            </Button>
          }
        />
        {achievements.isPending ? (
          <LoadingState rows={2} />
        ) : (achievements.data ?? []).filter((a) => a.unlocked).length === 0 ? (
          <EmptyState
            title="No achievements yet"
            description="Complete levels in the game and your unlocked achievements will appear here."
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(achievements.data ?? [])
              .filter((a) => a.unlocked)
              .slice(0, 3)
              .map((a) => (
                <li key={a.id} className="panel p-4">
                  <p className="font-display">{a.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{a.description}</p>
                </li>
              ))}
          </ul>
        )}
      </section>

      <section>
        <SectionHeading
          title="Recent builds"
          description="Your latest successfully completed levels."
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/dashboard/almanac">Open Almanac</Link>
            </Button>
          }
        />
        {journey.isPending ? (
          <LoadingState rows={2} />
        ) : (journey.data?.regions ?? []).flatMap((r) => r.levels).filter((l) => l.completion)
            .length === 0 ? (
          <EmptyState
            title="No completed builds yet"
            description="Finish a level in Civil Craft and your successful bridge will be recorded here."
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(journey.data?.regions ?? [])
              .flatMap((r) => r.levels)
              .filter((l) => l.completion)
              .sort(
                (a, b) =>
                  new Date(b.completion!.completedAt).getTime() -
                  new Date(a.completion!.completedAt).getTime(),
              )
              .slice(0, 3)
              .map((l) => {
                const c = l.completion!;
                const bridge = getBridgeType(c.bridgeTypeId);
                return (
                  <li key={l.levelId} className="panel overflow-hidden">
                    {c.completionScreenshotUrl ? (
                      <img
                        src={c.completionScreenshotUrl}
                        alt={`Completed bridge from ${l.levelName ?? "a Civil Craft level"}`}
                        loading="lazy"
                        className="aspect-video w-full border-b-2 border-border object-cover"
                      />
                    ) : (
                      <BrandedCover label="Completion screenshot pending upload from the game" />
                    )}
                    <div className="space-y-1 p-4">
                      <p className="truncate font-display">{l.levelName}</p>
                      <p className="text-xs text-muted-foreground">
                        {bridge ? `${bridge.name} · ` : ""}
                        {new Date(c.completedAt).toLocaleDateString()}
                      </p>
                      <p className="font-display">{c.score.toLocaleString()}</p>
                      <Button asChild variant="outline" size="sm" className="mt-2">
                        <Link to="/dashboard/almanac" search={{ tab: "journey" }}>
                          View in Almanac →
                        </Link>
                      </Button>
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
      </section>
    </div>
  );
}
