import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Hammer, Star, Target, Zap } from "lucide-react";
import { DemoBadge, IntegrationNotice } from "@/components/common/DemoBadge";
import { SectionHeading } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { ErrorState, LoadingState } from "@/components/common/States";
import {
  CharacterPreview,
  EquipmentSlot,
  SLOT_ORDER,
} from "@/components/dashboard/CharacterPreview";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/lib/auth";
import { profileService, progressService, statisticsService } from "@/lib/playfab";

export const Route = createFileRoute("/dashboard/profile")({
  head: () => ({
    meta: [
      { title: "Engineer Profile — Civil Craft: Bridge Edition" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content: "Your Civil Craft engineer: character, career statistics and equipped loadout.",
      },
    ],
  }),
  component: ProfilePage,
});

function statValue(stats: { name: string; value: number }[] | undefined, name: string) {
  const s = stats?.find((x) => x.name === name);
  return s ? s.value.toLocaleString() : "—";
}

function ProfilePage() {
  const { player } = useAuth();
  const id = player?.playFabId ?? "";
  const profile = useQuery({
    queryKey: ["profile", id],
    queryFn: () => profileService.getProfile(id),
    enabled: !!id,
  });
  const character = useQuery({ queryKey: ["character", id], queryFn: profileService.getCharacter });
  const stats = useQuery({ queryKey: ["stats", id], queryFn: statisticsService.getStatistics });
  const progress = useQuery({ queryKey: ["progress", id], queryFn: progressService.getProgress });

  if (profile.isPending) return <LoadingState label="Loading profile…" rows={4} />;
  if (profile.isError)
    return <ErrorState onRetry={profile.refetch} description={(profile.error as Error).message} />;

  const p = profile.data;
  const xpPercent =
    p.xp !== null && p.xpToNextLevel !== null
      ? Math.round((p.xp / Math.max(p.xpToNextLevel, 1)) * 100)
      : 0;
  const equippedBySlot = new Map((character.data?.equipped ?? []).map((i) => [i.slot, i]));

  return (
    <div className="space-y-4 md:space-y-10">
      <SectionHeading
        title="Civil Craft Engineer Profile"
        description="Your in-game character, career record and equipped gear."
        action={<DemoBadge />}
      />

      {/* ------------------------------------------------ engineer identity */}
      <section className="grid gap-3 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)] md:gap-6">
        <CharacterPreview
          character={character.data}
          displayName={p.displayName}
          className="max-md:h-[280px] max-md:[&>p]:shrink-0 max-md:[&>div:last-child]:min-h-0 max-md:[&>div:last-child]:flex-1 max-md:[&>div:last-child]:aspect-auto max-md:[&>div:last-child]:py-1"
        />

        <div className="panel flex flex-col gap-3 p-3 md:gap-4 md:p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">Engineer</p>
            <h2 className="truncate text-2xl sm:text-3xl">{p.displayName}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Level {p.level ?? "\u2014"}</p>
          </div>

          <div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-semibold">Experience</span>
              <span className="text-muted-foreground">
                {p.xp?.toLocaleString() ?? "\u2014"} /{" "}
                {p.xpToNextLevel?.toLocaleString() ?? "\u2014"} XP
              </span>
            </div>
            <Progress value={xpPercent} className="mt-2" />
          </div>

          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            {[
              ["Player ID", p.playFabId],
              ["Email", p.email ?? "—"],
              ["Current region", progress.data?.currentRegion ?? "—"],
              ["Member since", p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "—"],
              ["Last login", p.lastActive ? new Date(p.lastActive).toLocaleDateString() : "—"],
            ].map(([k, v]) => (
              <div
                key={k}
                className="flex items-center justify-between gap-3 border-b border-border pb-2"
              >
                <dt className="shrink-0 text-muted-foreground">{k}</dt>
                <dd className="min-w-0 truncate font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ---------------------------------------------- career statistics */}
      <section>
        <SectionHeading title="Career statistics" description="Recorded by the game backend." />
        {stats.isPending ? (
          <LoadingState rows={2} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={Star}
              label="Engineering score"
              value={p.totalScore?.toLocaleString() ?? "\u2014"}
            />
            <StatCard
              icon={Hammer}
              label="Bridges completed"
              value={p.bridgesCompleted?.toLocaleString() ?? "\u2014"}
            />
            <StatCard
              icon={Target}
              label="Challenges completed"
              value={p.challengesCompleted?.toLocaleString() ?? "\u2014"}
            />
            <StatCard
              icon={Zap}
              label="Best build score"
              value={statValue(stats.data, "BestSingleBuildScore")}
            />
          </div>
        )}
      </section>

      {/* ------------------------------------------------ equipped loadout */}
      <section>
        <SectionHeading
          title="Equipped loadout"
          description="Exactly what your engineer is wearing in Civil Craft."
        />
        {character.isPending ? (
          <LoadingState rows={2} />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SLOT_ORDER.map((slot) => {
              const item = equippedBySlot.get(slot);
              return item ? (
                <EquipmentSlot key={slot} slot={slot} item={item} />
              ) : (
                <EquipmentSlot key={slot} slot={slot} />
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-sm text-muted-foreground">
          Change your equipment inside Civil Craft. The website remains read-only for cosmetics.
        </p>
      </section>

      <IntegrationNotice>
        Your character and cosmetics are owned by the game backend. When you change your outfit in
        Civil Craft, this page updates after the next synchronisation.
      </IntegrationNotice>
    </div>
  );
}
