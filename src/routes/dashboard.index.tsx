import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock, Hammer, Medal, RefreshCw, Star, Target, Zap } from "lucide-react";
import { useState } from "react";
import { DemoBadge } from "@/components/common/DemoBadge";
import { CharacterPreview } from "@/components/dashboard/CharacterPreview";
import { YourRanking } from "@/components/dashboard/YourRanking";
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/")({
  component: PlayerOverview,
});

function PlayerOverview() {
  const { player } = useAuth();
  const id = player?.playFabId ?? "";
  const [refreshing, setRefreshing] = useState(false);

  const profile = useQuery({
    queryKey: ["profile", id],
    queryFn: () => profileService.getProfile(id),
    enabled: !!id,
    refetchOnMount: "always",
  });
  const progress = useQuery({
    queryKey: ["progress", id],
    queryFn: progressService.getProgress,
    refetchOnMount: "always",
  });
  const achievements = useQuery({
    queryKey: ["achievements", id],
    queryFn: achievementsService.getAchievements,
    refetchOnMount: "always",
  });
  const character = useQuery({
    queryKey: ["character", id],
    queryFn: profileService.getCharacter,
    enabled: !!id,
    refetchOnMount: "always",
  });
  const journey = useQuery({
    queryKey: ["almanac-journey", id],
    queryFn: almanacService.getJourney,
    refetchOnMount: "always",
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        profile.refetch(),
        progress.refetch(),
        achievements.refetch(),
        character.refetch(),
        journey.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  if (profile.isPending) return <LoadingState label="Loading your dashboard…" rows={4} />;
  if (profile.isError)
    return (
      <ErrorState
        title="Failed to load dashboard data"
        description={(profile.error as Error).message}
        onRetry={profile.refetch}
      />
    );

  const p = profile.data;
  const isAwaitingSync = !p.characterSyncedAt;
  const xpPercent =
    p.xp !== null && p.xpToNextLevel !== null
      ? Math.round((p.xp / Math.max(p.xpToNextLevel, 1)) * 100)
      : 0;

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------ character & overview */}
      <section className="panel flex flex-col items-center gap-3 p-3 sm:flex-row sm:gap-5 sm:p-6">
        <CharacterPreview
          character={character.data}
          displayName={p.displayName}
          className="w-36 max-w-full shrink-0 sm:w-32"
        />
        <div className="min-w-0 w-full flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">
                Welcome back
              </p>
              <h1 className="truncate text-2xl sm:text-3xl">{p.displayName}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <span>
                  Level {p.level ?? "\u2014"} · {p.xp?.toLocaleString() ?? "\u2014"} /{" "}
                  {p.xpToNextLevel?.toLocaleString() ?? "\u2014"} XP
                </span>
                <span>•</span>
                {p.characterSyncedAt ? (
                  <span className="inline-flex items-center gap-1 text-xs text-gold">
                    <Clock className="h-3.5 w-3.5" />
                    Last game sync: {new Date(p.characterSyncedAt).toLocaleString()}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground/80">Awaiting game sync</span>
                )}
              </div>
            </div>
            <DemoBadge />
          </div>
          {p.xp !== null && p.xpToNextLevel !== null && (
            <Progress value={xpPercent} className="mt-3 max-w-sm" />
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {p.xpToNextLevel !== null && p.xp !== null
              ? Math.max(p.xpToNextLevel - p.xp, 0).toLocaleString()
              : "\u2014"}{" "}
            XP to level {p.level === null ? "\u2014" : p.level + 1}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button asChild variant="gold" size="sm">
              <Link to="/dashboard/almanac">Open Field Journal</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/dashboard/profile">View Profile</Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="gap-1.5"
              title="Refresh game data from PlayFab"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
              {refreshing ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ first sync notification */}
      {isAwaitingSync ? (
        <div className="rounded-xl border border-dashed border-gold/40 bg-gold/5 p-4 text-sm text-foreground/80 flex items-start gap-3">
          <Clock className="h-5 w-5 text-gold shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-foreground">Awaiting game sync</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              No dashboard snapshot has been published for this player. Progress will appear after
              the game integration successfully publishes it.
            </p>
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------ 4 core statistics */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Star}
          label="Total Score"
          value={p.totalScore !== null ? p.totalScore.toLocaleString() : "\u2014"}
          hint="Leaderboard score"
        />
        <StatCard
          icon={Hammer}
          label="Bridges Completed"
          value={p.bridgesCompleted !== null ? p.bridgesCompleted.toLocaleString() : "\u2014"}
          hint="Successful crossings"
        />
        <StatCard
          icon={Target}
          label="Challenges Completed"
          value={p.challengesCompleted !== null ? p.challengesCompleted.toLocaleString() : "\u2014"}
          hint="Engineering trials"
        />
        <StatCard
          icon={Zap}
          label="Best Build Score"
          value={
            p.bestSingleBuildScore !== null && p.bestSingleBuildScore !== undefined
              ? p.bestSingleBuildScore.toLocaleString()
              : "\u2014"
          }
          hint="Highest single bridge"
        />
      </section>

      {/* ------------------------------------------------ story progress */}
      <YourRanking />

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
          <ErrorState description="Unable to load story progress." onRetry={progress.refetch} />
        ) : isAwaitingSync ? (
          <p className="panel p-4 text-muted-foreground">Awaiting game sync</p>
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
              Current region: {progress.data.currentRegion ?? "Not available"}
            </p>
          </div>
        )}
      </section>

      {/* ------------------------------------------------ achievements */}
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
        ) : achievements.isError ? (
          <ErrorState description="Unable to load achievements." onRetry={achievements.refetch} />
        ) : isAwaitingSync ? (
          <p className="panel p-4 text-muted-foreground">Awaiting game sync</p>
        ) : (achievements.data ?? []).filter((a) => a.unlocked).length === 0 ? (
          <EmptyState
            title="No achievements yet"
            description="Complete projects in Civil Craft and your unlocked achievements will appear here."
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

      {/* ------------------------------------------------ recent builds */}
      <section>
        <SectionHeading
          title="Recent builds"
          description="Your latest successfully completed projects."
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/dashboard/almanac">Open Almanac</Link>
            </Button>
          }
        />
        {journey.isPending ? (
          <LoadingState rows={2} />
        ) : journey.isError ? (
          <ErrorState description="Unable to load build history." onRetry={journey.refetch} />
        ) : isAwaitingSync ? (
          <p className="panel p-4 text-muted-foreground">Awaiting game sync</p>
        ) : (journey.data?.regions ?? []).flatMap((r) => r.levels).filter((l) => l.completion)
            .length === 0 ? (
          <EmptyState
            title="No completed builds yet"
            description="Complete a project in Civil Craft and your successful bridge will be recorded here."
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
