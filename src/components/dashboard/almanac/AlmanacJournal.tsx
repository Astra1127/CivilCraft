import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Cable,
  Check,
  CircleDot,
  Columns3,
  Compass,
  Layers,
  Lock,
  MapPin,
  Trees,
  Trophy,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import { DemoBadge } from "@/components/common/DemoBadge";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CompletionScreenshot,
  LevelEntryDialog,
} from "@/components/dashboard/almanac/LevelEntryDialog";
import { bridgeTypes, engineeringConcepts, getBridgeType, materials } from "@/lib/almanac/content";
import { useAuth } from "@/lib/auth";
import { almanacService, profileService, type AlmanacLevel } from "@/lib/playfab";
import { cn } from "@/lib/utils";

const materialIcons = {
  wood_beam: Trees,
  wood_road: Layers,
  wood_support: Columns3,
  rope: Cable,
  concrete_road: Layers,
  concrete_member: Columns3,
  concrete_support: Columns3,
  steel_beam: Wrench,
  steel_road: Layers,
  steel_support: Columns3,
  steel_cable: Cable,
};

const tabs = [
  { value: "journey", label: "My Journey" },
  { value: "bridges", label: "Bridge Types" },
  { value: "engineering", label: "Engineering" },
  { value: "materials", label: "Materials" },
];

export function AlmanacJournal({ initialTab = "journey" }: { initialTab?: string }) {
  const { player } = useAuth();
  const id = player?.playFabId ?? "";
  const journey = useQuery({
    queryKey: ["almanac-journey", id],
    queryFn: almanacService.getJourney,
  });
  const profile = useQuery({
    queryKey: ["profile", id],
    queryFn: () => profileService.getProfile(id),
    enabled: !!id,
  });
  const [selected, setSelected] = useState<AlmanacLevel | null>(null);

  if (journey.isPending) return <LoadingState label="Opening your field journal…" rows={4} />;
  if (journey.isError)
    return <ErrorState description={(journey.error as Error).message} onRetry={journey.refetch} />;

  const j = journey.data;
  const p = profile.data;
  const completedRegions = j.regions.filter((region) => region.status === "completed").length;
  const regionPercent = j.regions.length
    ? Math.round((completedRegions / j.regions.length) * 100)
    : 0;
  const discoveredMaterials = materials.filter((material) =>
    (j.discoveredMaterials ?? []).includes(material.id),
  );
  const discoveredBridges = bridgeTypes.filter((b) =>
    j.discoveredBridgeTypeIds.includes(b.bridgeTypeId),
  );
  const discoveredConceptIds = new Set(
    j.regions.flatMap((region) =>
      region.levels
        .filter((level) => level.status === "completed" && level.completion)
        .flatMap((level) => level.engineeringConceptIds ?? []),
    ),
  );
  const discoveredConcepts = engineeringConcepts.filter((concept) =>
    discoveredConceptIds.has(concept.id),
  );

  return (
    <div className="space-y-8">
      {/* -------------------------------------------------- journal header */}
      <header className="paper-panel relative overflow-hidden p-6 pl-6 sm:p-8 sm:pl-14">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-gold">
              Engineer&apos;s field journal
            </p>
            <h1 className="mt-2 text-3xl sm:text-4xl">Bridge Almanac</h1>
            <p className="mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
              Your personal engineering record of projects, discoveries, lessons, materials and
              bridge types encountered throughout your Civil Craft journey.
            </p>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-4 rounded-2xl border-2 border-border bg-card/80 p-4">
            <Avatar className="h-14 w-14 border-2 border-primary">
              {p?.avatarUrl ? <AvatarImage src={p.avatarUrl} alt="" /> : null}
              <AvatarFallback className="font-display">
                {(p?.displayName ?? "?").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-display text-lg">{p?.displayName ?? "—"}</p>
              <p className="text-sm text-muted-foreground">{p ? `Level ${p.level}` : "—"}</p>
            </div>
            <dl className="grid w-full gap-1 text-sm sm:w-auto">
              <div className="flex justify-between gap-6">
                <dt className="text-muted-foreground">Projects completed</dt>
                <dd className="font-display">{j.levelsCompleted}</dd>
              </div>
              <div className="flex justify-between gap-6">
                <dt className="text-muted-foreground">Bridge types discovered</dt>
                <dd className="font-display">{discoveredBridges.length}</dd>
              </div>
              <div className="flex justify-between gap-6">
                <dt className="text-muted-foreground">Regions completed</dt>
                <dd className="font-display">
                  {completedRegions} / {j.regions.length}
                </dd>
              </div>
            </dl>
          </div>
        </div>
        <div className="mt-4">
          <DemoBadge />
        </div>
      </header>

      <Tabs defaultValue={initialTab}>
        <div className="-mx-1 min-w-0 max-w-full overflow-x-auto px-1 pb-1">
          <TabsList className="w-max">
            {tabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="whitespace-nowrap">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* ------------------------------------------------------- journey */}
        <TabsContent value="journey" className="mt-6 space-y-8">
          {j.regions.length === 0 ? (
            <EmptyState
              title="Your Almanac is waiting."
              description="Bridges, engineering concepts and materials you discover in Civil Craft will be recorded here."
            />
          ) : null}
          {j.regions.length === 0 ? null : (
            <section className="panel overflow-hidden p-6">
              <h2 className="text-xl sm:text-2xl">Your engineering journey</h2>
              <ol className="mt-5 flex gap-3 overflow-x-auto overflow-y-hidden pb-2 sm:grid sm:grid-flow-col sm:auto-cols-fr sm:overflow-hidden">
                {j.regions.map((r, index) => (
                  <li key={r.regionId} className="relative min-w-[9rem] text-center">
                    {index < j.regions.length - 1 ? (
                      <span
                        aria-hidden="true"
                        className="absolute left-1/2 top-5 -z-10 hidden h-1 w-full bg-border sm:block"
                      />
                    ) : null}
                    <span
                      className={cn(
                        "mx-auto grid h-10 w-10 place-items-center rounded-full border-2",
                        r.status === "completed"
                          ? "gold-gradient border-primary text-gold-foreground"
                          : r.status === "current"
                            ? "border-gold bg-gold/15 text-gold"
                            : "border-border bg-secondary text-muted-foreground",
                      )}
                    >
                      {r.status === "completed" ? (
                        <Check className="h-5 w-5" aria-hidden="true" />
                      ) : r.status === "current" ? (
                        <CircleDot className="h-5 w-5" aria-hidden="true" />
                      ) : (
                        <Lock className="h-4 w-4" aria-hidden="true" />
                      )}
                    </span>
                    <p className="mt-2 truncate font-display text-xs uppercase tracking-[0.14em]">
                      {r.name}
                    </p>
                    <p className="text-xs capitalize text-muted-foreground">{r.status}</p>
                  </li>
                ))}
              </ol>
              <div className="mt-6">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Recorded region completion</span>
                  <span className="font-display">{regionPercent}%</span>
                </div>
                <Progress value={regionPercent} className="mt-2" />
              </div>
            </section>
          )}

          {j.regions.map((r) => (
            <section key={r.regionId}>
              <h3 className="mb-3 flex items-center gap-2 font-display text-sm uppercase tracking-[0.18em] text-muted-foreground">
                <MapPin className="h-4 w-4" aria-hidden="true" />
                {r.name}
              </h3>
              <ul className="grid gap-4 [&>li]:min-w-0 md:grid-cols-2">
                {r.levels.map((l) => (
                  <li key={l.levelId}>
                    <LevelCard level={l} onOpen={() => setSelected(l)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </TabsContent>

        {/* -------------------------------------------------- bridge types */}
        <TabsContent value="bridges" className="mt-6">
          {discoveredBridges.length === 0 ? (
            <EmptyState
              title="Your Almanac is waiting."
              description="Complete contracts in Civil Craft to unlock bridge entries in your Almanac."
            />
          ) : (
            <ul className="grid gap-5 [&>li]:min-w-0 lg:grid-cols-2">
              {discoveredBridges.map((b) => {
                return (
                  <li key={b.bridgeTypeId} className="panel p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-display text-xl">{b.name}</h3>
                      <span className="stamp flex items-center gap-1 px-2 py-0.5 text-[10px]">
                        <Check className="h-3 w-3" aria-hidden="true" /> Discovered
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{b.description}</p>
                    <dl className="mt-3 space-y-2 text-sm">
                      <div>
                        <dt className="font-display">How it works</dt>
                        <dd className="text-muted-foreground">{b.howItWorks}</dd>
                      </div>
                      <div>
                        <dt className="font-display">Strengths</dt>
                        <dd className="text-muted-foreground">{b.strengths}</dd>
                      </div>
                      <div>
                        <dt className="font-display">In Civil Craft</dt>
                        <dd className="text-muted-foreground">{b.inGame}</dd>
                      </div>
                    </dl>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {b.conceptIds.map((cid) => (
                        <Badge key={cid} variant="outline" className="border-gold/50 text-gold">
                          {engineeringConcepts.find((c) => c.id === cid)?.name ?? cid}
                        </Badge>
                      ))}
                    </div>
                    {b.realWorld ? (
                      <div className="mt-4 rounded-xl border-2 border-border bg-secondary/40 p-3">
                        <p className="font-display text-xs uppercase tracking-[0.16em] text-muted-foreground">
                          In the real world
                        </p>
                        <p className="mt-1 font-display">{b.realWorld.name}</p>
                        <p className="text-xs text-muted-foreground">{b.realWorld.location}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{b.realWorld.why}</p>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        {/* --------------------------------------------------- engineering */}
        <TabsContent value="engineering" className="mt-6">
          {discoveredConcepts.length === 0 ? (
            <EmptyState
              title="Your Almanac is waiting."
              description="Engineering concepts recorded in your completed Civil Craft projects will appear here."
            />
          ) : (
            <ul className="grid gap-4 [&>li]:min-w-0 sm:grid-cols-2 lg:grid-cols-3">
              {discoveredConcepts.map((c) => (
                <li key={c.id} className="panel hover-lift p-5">
                  <span className="grid h-10 w-10 place-items-center rounded-2xl border-2 border-border bg-gold/15 text-gold">
                    <Compass className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-3 font-display text-lg">{c.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{c.summary}</p>
                  {c.diagram ? (
                    <pre className="blueprint mt-3 overflow-x-auto rounded-xl border-2 border-border p-2 font-mono text-[11px] text-primary/75">
                      {c.diagram}
                    </pre>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        {/* ----------------------------------------------------- materials */}
        <TabsContent value="materials" className="mt-6">
          {discoveredMaterials.length === 0 ? (
            <EmptyState
              title="Your Almanac is waiting."
              description="Materials you discover in Civil Craft will be recorded here."
            />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {discoveredMaterials.map((m) => {
                const Icon = materialIcons[m.id as keyof typeof materialIcons] ?? Layers;
                return (
                  <li key={m.id} className="panel min-w-0 overflow-hidden">
                    <div
                      className="blueprint relative flex h-28 items-center justify-center border-b-2 border-border bg-secondary/40"
                      aria-hidden="true"
                    >
                      <span className="grid h-16 w-16 place-items-center rounded-2xl border-2 border-gold/40 bg-card shadow-sm">
                        <Icon className="h-8 w-8 text-gold" strokeWidth={1.5} />
                      </span>
                    </div>
                    <div className="p-5">
                      <h3 className="font-display text-lg">{m.name}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{m.note}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <LevelEntryDialog
        level={selected}
        open={!!selected}
        onOpenChange={(v) => !v && setSelected(null)}
      />
    </div>
  );
}

function LevelCard({ level, onOpen }: { level: AlmanacLevel; onOpen: () => void }) {
  const label = `Level ${String(level.order).padStart(2, "0")}`;
  const bridge = getBridgeType(level.completion?.bridgeTypeId);

  if (level.status === "completed") {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="panel hover-lift w-full p-4 text-left"
        aria-label={`Open Almanac entry for ${label}`}
      >
        <CompletionScreenshot level={level} />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-display text-lg">
              {label} — {level.levelName}
            </p>
            <p className="text-xs text-muted-foreground">
              {bridge ? `${bridge.name} · ` : ""}
              {level.completion
                ? new Date(level.completion.completedAt).toLocaleDateString()
                : null}
            </p>
          </div>
          <div className="text-right">
            <p className="font-display">{level.completion?.score.toLocaleString()}</p>
            {level.completion?.achievementId ? (
              <p className="flex items-center gap-1 text-xs text-gold">
                <Trophy className="h-3 w-3" aria-hidden="true" /> Achievement
              </p>
            ) : null}
          </div>
        </div>
      </button>
    );
  }

  if (level.status === "current") {
    return (
      <div className="panel border-gold/70 bg-gold/5 p-5">
        <p className="font-display text-lg">
          {label} — {level.levelName}
        </p>
        <p className="mt-1 flex items-center gap-2 text-sm font-bold text-gold">
          <CircleDot className="h-4 w-4" aria-hidden="true" /> Current challenge
        </p>
        <p className="mt-2 text-sm text-muted-foreground">Ready to build — continue in the game.</p>
      </div>
    );
  }

  return (
    <div className="panel bg-secondary/40 p-5 opacity-80">
      <p className="font-display text-lg">{label} — ???</p>
      <p className="mt-1 flex items-center gap-2 text-sm font-bold text-muted-foreground">
        <Lock className="h-4 w-4" aria-hidden="true" /> Not completed
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Complete the previous challenge to continue your journey.
      </p>
      <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
        <BookOpen className="h-3 w-3" aria-hidden="true" />
        Your entry unlocks once you finish the build.
      </p>
    </div>
  );
}
