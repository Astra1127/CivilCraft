import { useEffect, useState } from "react";
import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  Boxes,
  ClipboardList,
  Coins,
  Compass,
  Download,
  GitCompareArrows,
  GraduationCap,
  Hammer,
  Layers,
  PencilRuler,
  Puzzle,
  Ruler,
  ShieldCheck,
  Sparkles,
  Users,
  Weight,
} from "lucide-react";
import { PublicLayout } from "@/components/site/PublicLayout";
import { SectionDivider } from "@/components/site/SectionDivider";
import { GameProp, GameArt } from "@/components/site/GameProp";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCms } from "@/lib/cms/store";
import { useAuth } from "@/lib/auth";
import type { TeamMember } from "@/lib/cms/types";
import canyonPanorama from "@/assets/canyon-panorama.jpg";
import chibiEngineer from "@/assets/chibi-engineer.png";
import shotExplore from "@/assets/explore-world.jpg";
import shotBuild from "@/assets/build-mode.jpg";
import shotTest from "@/assets/load-test.jpg";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — Civil Craft: Bridge Edition" },
      {
        name: "description",
        content:
          "The story, gameplay loop, learning goals, game modes and student development team behind Civil Craft: Bridge Edition, an educational 3D bridge-building game.",
      },
      { property: "og:title", content: "About Civil Craft: Bridge Edition" },
      {
        property: "og:description",
        content:
          "Story and lore, the player's role, learning through gameplay, game modes and the student team building Civil Craft: Bridge Edition.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AboutPage,
});

const roleSteps = [
  {
    n: "01",
    icon: ClipboardList,
    title: "Receive the Contract",
    text: "Meet the contractor and review the project requirements, span, budget and expected load.",
  },
  {
    n: "02",
    icon: PencilRuler,
    title: "Plan the Structure",
    text: "Choose an appropriate bridge design and materials.",
  },
  {
    n: "03",
    icon: Hammer,
    title: "Build",
    text: "Construct and inspect your bridge while working within the contract requirements.",
  },
  {
    n: "04",
    icon: Weight,
    title: "Test",
    text: "Simulate the crossing, improve your design and complete the project. Record your progress in the Almanac.",
  },
];

const concepts = [
  {
    icon: GitCompareArrows,
    title: "Structural Forces",
    text: "How forces travel through bridge members.",
  },
  {
    icon: Layers,
    title: "Tension & Compression",
    text: "Which parts are pulled apart and which are pushed together.",
  },
  { icon: Ruler, title: "Load Distribution", text: "How weight spreads across the structure." },
  {
    icon: ShieldCheck,
    title: "Bridge Stability",
    text: "What keeps a structure standing under load.",
  },
  {
    icon: Boxes,
    title: "Material Properties",
    text: "What each available material can and cannot take.",
  },
  {
    icon: Sparkles,
    title: "Structural Failure",
    text: "Where and why a bridge gives way during the test.",
  },
  {
    icon: Coins,
    title: "Budget & Cost",
    text: "Building an adequate structure within the level's budget.",
  },
  {
    icon: Puzzle,
    title: "Problem Solving",
    text: "Reading a failed test and improving the design.",
  },
];

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-gold">{children}</p>
  );
}

/** Smoothly reveal the section named by the URL hash (#story, #team, …). */
function useHashScroll() {
  const hash = useRouterState({ select: (s) => s.location.hash });
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash.replace(/^#/, ""));
    if (el) {
      const t = window.setTimeout(
        () => el.scrollIntoView({ behavior: "smooth", block: "start" }),
        60,
      );
      return () => window.clearTimeout(t);
    }
    return;
  }, [hash]);
}

function MemberPortrait({ member }: { member: TeamMember }) {
  return (
    <div className="relative aspect-square w-full overflow-hidden border-b-2 border-border bg-secondary/50">
      {member.photoUrl ? (
        <img
          src={member.photoUrl}
          alt={`${member.fullName} — Civil Craft development team`}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="blueprint grid h-full w-full place-items-center">
          <img
            src={chibiEngineer}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="h-[78%] w-auto select-none object-contain drop-shadow-xl"
          />
        </div>
      )}
    </div>
  );
}

import { isRealText } from "@/lib/cms/content-types";

function AboutPage() {
  useHashScroll();
  const { isAuthenticated } = useAuth();
  const about = useCms((s) => s.about);
  const team = [...(about?.team ?? [])]
    .filter(
      (m) =>
        m.published &&
        isRealText(m.fullName) &&
        m.roles.some(isRealText) &&
        isRealText(m.responsibilities),
    )
    .map((m) => ({
      ...m,
      roles: m.roles.filter(isRealText),
      contribution: isRealText(m.contribution) ? m.contribution : "",
    }))
    .sort((a, b) => a.order - b.order);
  const story = about?.story;
  const academic = about?.academic;
  const [active, setActive] = useState<TeamMember | null>(null);

  // Player-only reference: send guests to login first, admins to their own area.
  const almanacTo = isAuthenticated ? "/dashboard/almanac" : "/login";
  const almanacLabel = isAuthenticated
    ? "Explore the Bridge Almanac"
    : "Log in to open the Almanac";

  return (
    <PublicLayout>
      {/* ── 01 · ABOUT CIVIL CRAFT ───────────────────────── */}
      <section className="relative overflow-hidden border-b-2 border-border">
        <img
          src={canyonPanorama}
          alt="Low-poly Civil Craft canyon with a wooden bridge"
          width={1920}
          height={720}
          className="absolute inset-0 h-full w-full object-cover opacity-55"
        />
        <div
          className="absolute inset-0 bg-gradient-to-r from-background via-background/88 to-background/35"
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
          <Label>About Civil Craft</Label>
          <h1 className="mt-2 max-w-2xl text-3xl sm:text-4xl lg:text-5xl">
            Building bridges. Inspiring future engineers.
          </h1>
          <p className="mt-4 max-w-xl text-sm text-muted-foreground sm:text-base">
            Civil Craft: Bridge Edition is a 3D educational bridge-construction game centered on
            learning through practical engineering challenges. Step into Arcadia as an aspiring
            civil engineer and build new connections.
          </p>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
            Review construction contracts, build bridges and test your designs as structural and
            environmental conditions become more demanding.
          </p>
          <nav aria-label="On this page" className="mt-6 flex flex-wrap gap-2">
            {[
              ["#story", "Story"],
              ["#learning", "Learning"],
              ["#modes", "Game Modes"],
              ["#team", "Team"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="rounded-full border-2 border-border bg-card px-3.5 py-1.5 text-xs font-extrabold uppercase tracking-[0.14em] text-foreground/80 transition-colors hover:border-gold hover:text-gold"
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
      </section>

      {/* wide game visual, keeps the intro feeling like a game */}
      <section className="relative overflow-hidden bg-background py-10 sm:py-14">
        <GameProp kind="rocks" className="-left-20 bottom-0 w-52 opacity-80" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <div className="game-frame p-2">
            <img
              src={shotExplore}
              alt="Civil Craft gameplay: a chibi engineer surveying a canyon crossing"
              loading="lazy"
              width={1920}
              height={886}
              className="w-full rounded-2xl"
            />
          </div>
          <ul className="mt-6 grid gap-6 sm:grid-cols-3 sm:divide-x-2 sm:divide-dashed sm:divide-border">
            {[
              {
                icon: Hammer,
                title: "Build",
                text: "Design and construct bridges for each crossing.",
              },
              {
                icon: Weight,
                title: "Test",
                text: "Run load simulations and watch how the bridge behaves.",
              },
              {
                icon: GraduationCap,
                title: "Learn",
                text: "Understand the engineering behind your design.",
              },
            ].map((p) => (
              <li key={p.title} className="min-w-0 sm:px-6 sm:first:pl-0 sm:last:pr-0">
                <p.icon className="h-7 w-7 text-gold" aria-hidden="true" />
                <h2 className="mt-2 font-display text-lg">{p.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{p.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <SectionDivider variant="beam" />

      {/* ── 02 · STORY & LORE ────────────────────────────── */}
      <section id="story" className="scroll-mt-20 bg-card/60 py-14 sm:py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <Label>The story</Label>
            <h2 className="mt-2 text-3xl sm:text-4xl">
              {story?.heading ?? "One canyon at a time."}
            </h2>
            {(story?.fullStory ?? "").split("\n\n").map((para) => (
              <p key={para.slice(0, 24)} className="mt-3 text-muted-foreground">
                {para}
              </p>
            ))}
            <div className="mt-6 flex flex-wrap items-center gap-2 font-display text-sm">
              {["Meet & review", "Build & inspect", "Test & complete", "Record progress"].map(
                (s, i) => (
                  <span key={s} className="flex items-center gap-2">
                    {i > 0 ? <ArrowRight className="h-4 w-4 text-gold" aria-hidden="true" /> : null}
                    <span className="rounded-full border-2 border-border bg-card px-3 py-1">
                      {s}
                    </span>
                  </span>
                ),
              )}
            </div>
          </div>

          <div className="relative">
            <div className="game-frame p-2">
              <img
                src={story?.imageUrl || canyonPanorama}
                alt="Civil Craft canyon region awaiting a new crossing"
                loading="lazy"
                className="w-full rounded-2xl"
              />
            </div>
            <span
              aria-hidden="true"
              className="absolute -left-3 top-6 hidden rotate-[-90deg] text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground lg:block"
            >
              span ↔ canyon
            </span>
            <div className="draft-line mt-3" aria-hidden="true" />
          </div>
        </div>
      </section>

      {/* ── 03 · THE PLAYER'S ROLE ───────────────────────── */}
      <section className="relative overflow-hidden border-y-2 border-border bg-background py-14 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:items-start lg:gap-12">
            <div className="min-w-0">
              <Label>Your role</Label>
              <h2 className="mt-2 text-3xl sm:text-4xl">Become the engineer.</h2>
              <p className="mt-3 text-muted-foreground">
                Every crossing is handed over as an engineering contract. This is the loop you
                repeat in every region.
              </p>
              <GameArt
                kind="engineer"
                alt="Chibi Civil Craft engineer holding a clipboard"
                className="mt-6 hidden w-44 lg:block"
              />
            </div>

            <ol className="grid gap-x-6 gap-y-6 sm:grid-cols-2">
              {roleSteps.map((s) => (
                <li
                  key={s.n}
                  className="min-w-0 rounded-2xl border-2 border-border bg-card p-5 shadow-[var(--shadow-soft)]"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl gold-gradient text-gold-foreground">
                      <s.icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="font-display text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      {s.n}
                    </span>
                  </div>
                  <h3 className="mt-3 font-display text-lg">{s.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ── 04 · LEARNING THROUGH GAMEPLAY ───────────────── */}
      <section id="learning" className="scroll-mt-20 bg-card/60 py-14 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-center">
            <div className="game-frame p-2">
              <img
                src={shotTest}
                alt="A Civil Craft bridge deforming under a load simulation"
                loading="lazy"
                width={1920}
                height={886}
                className="w-full rounded-2xl"
              />
            </div>
            <div className="min-w-0">
              <Label>Engineering through play</Label>
              <h2 className="mt-2 text-3xl sm:text-4xl">The physics is the teacher.</h2>
              <p className="mt-3 text-muted-foreground">
                Civil Craft introduces basic structural mechanics through construction and
                simulation. Observe loads, materials and structural behavior, then apply what you
                learn to the next bridge-building challenge.
              </p>
            </div>
          </div>

          <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {concepts.map((c) => (
              <li key={c.title} className="min-w-0 border-t-2 border-dashed border-border pt-3">
                <c.icon className="h-6 w-6 text-gold" aria-hidden="true" />
                <h3 className="mt-2 font-display text-base">{c.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{c.text}</p>
              </li>
            ))}
          </ul>

          {/* Almanac callout */}
          <div className="mt-10 grid gap-5 rounded-3xl border-2 border-border bg-background p-6 shadow-[var(--shadow-soft)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-7">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-gold" aria-hidden="true" />
                <h3 className="font-display text-xl">Revisit what you discovered in the game</h3>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Your Bridge Almanac is your personal engineering record: projects, discoveries,
                engineering lessons, materials, bridge types and progress throughout your journey.
              </p>
            </div>
            <Button asChild variant="gold" className="shrink-0">
              <Link to={almanacTo}>
                {almanacLabel}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <SectionDivider variant="ridge" />

      {/* ── 05 · GAME MODES ──────────────────────────────── */}
      <section id="modes" className="scroll-mt-20 bg-background py-14 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-xl">
            <Label>Story Mode</Label>
            <h2 className="mt-2 text-3xl sm:text-4xl">How you play.</h2>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <article className="min-w-0 overflow-hidden rounded-3xl border-2 border-border bg-card shadow-[var(--shadow-soft)]">
              <img
                src={shotBuild}
                alt="Civil Craft story mode build screen over a canyon contract"
                loading="lazy"
                width={1920}
                height={886}
                className="h-44 w-full border-b-2 border-border object-cover sm:h-56"
              />
              <div className="p-6">
                <div className="flex items-center gap-3">
                  <Compass className="h-6 w-6 text-gold" aria-hidden="true" />
                  <h3 className="font-display text-2xl">Story</h3>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  Play through Civil Craft's regions and engineering contracts while progressing
                  through the game's main experience.
                </p>
              </div>
            </article>

            <article className="blueprint min-w-0 overflow-hidden rounded-3xl border-2 border-dashed border-border bg-card/50">
              <div className="grid h-44 place-items-center border-b-2 border-dashed border-border sm:h-56">
                <Users className="h-14 w-14 text-muted-foreground/60" aria-hidden="true" />
              </div>
              <div className="p-6">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="font-display text-2xl">Construction contracts</h3>
                  <span className="rounded-full border-2 border-border bg-secondary px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
                    Across Arcadia
                  </span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  Professor Bhan guides your early projects. As you gain experience, regional
                  contractors provide new construction projects while Bhan remains your mentor.
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* ── 06 · MEET THE DEVELOPMENT TEAM ───────────────── */}
      <section
        id="team"
        className="scroll-mt-20 border-y-2 border-border bg-card/60 py-14 sm:py-20"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <Label>Behind Civil Craft</Label>
            <h2 className="mt-2 text-3xl sm:text-4xl">Meet the team.</h2>
            <p className="mt-3 text-muted-foreground">
              Civil Craft: Bridge Edition is being developed as an academic thesis/capstone project
              by a student development team.
            </p>
          </div>

          {team.length ? (
            <ul className="mt-9 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {team.map((m) => (
                <li key={m.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => setActive(m)}
                    className="hover-lift block w-full overflow-hidden rounded-3xl border-2 border-border bg-card text-left shadow-[var(--shadow-soft)] transition-colors hover:border-gold"
                  >
                    <MemberPortrait member={m} />
                    <div className="p-4">
                      <h3 className="font-display text-lg leading-tight">{m.fullName}</h3>
                      <p className="mt-1 text-xs font-extrabold uppercase tracking-[0.14em] text-gold">
                        {m.roles.join(" • ")}
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">{m.responsibilities}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-8 text-sm text-muted-foreground">
              Development team information will be published here.
            </p>
          )}
        </div>
      </section>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-lg border-2 border-border bg-card">
          {active ? (
            <>
              <DialogHeader>
                <div className="mx-auto w-40 overflow-hidden rounded-2xl border-2 border-border">
                  <MemberPortrait member={active} />
                </div>
                <DialogTitle className="mt-3 text-center font-display text-2xl">
                  {active.fullName}
                </DialogTitle>
                <DialogDescription className="text-center text-xs font-extrabold uppercase tracking-[0.14em] text-gold">
                  {active.roles.join(" • ")}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
                    Responsibilities
                  </p>
                  <p className="mt-1 text-muted-foreground">{active.responsibilities}</p>
                </div>
                {active.contribution ? (
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
                      Project contribution
                    </p>
                    <p className="mt-1 text-muted-foreground">{active.contribution}</p>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ── 07 · ACADEMIC PROJECT ────────────────────────── */}
      <section className="bg-background py-12 sm:py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <Label>Academic project</Label>
          <h2 className="mt-2 text-2xl sm:text-3xl">Built for learning.</h2>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            Civil Craft: Bridge Edition is developed as an academic thesis/capstone project. The
            game is the practical output of that research: an interactive way to present
            introductory structural engineering concepts.
          </p>
          <dl className="mt-7 grid gap-x-8 gap-y-5 border-t-2 border-dashed border-border pt-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Institution", academic?.institution],
              ["Department", academic?.department],
              ["Program", academic?.program],
              ["Academic Year", academic?.academicYear],
              ["Project Adviser", academic?.adviser],
            ].map(([k, v]) =>
              isRealText(v) ? (
                <div key={k} className="min-w-0">
                  <dt className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
                    {k}
                  </dt>
                  <dd className="mt-1 font-display text-sm">{v}</dd>
                </div>
              ) : null,
            )}
          </dl>
        </div>
      </section>

      <SectionDivider variant="truss" />

      {/* ── 08 · FINAL CTA ───────────────────────────────── */}
      <section className="relative overflow-hidden border-t-2 border-border bg-background">
        <div className="mx-auto grid max-w-5xl items-center gap-6 px-4 py-12 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
          <div className="min-w-0">
            <Label>Ready to build?</Label>
            <h2 className="mt-2 text-3xl">Put the theory on a canyon.</h2>
            <p className="mt-3 max-w-lg text-muted-foreground">
              Take on your first bridge-building challenge and start learning through play.
            </p>
            <Button asChild size="lg" variant="gold" className="mt-5">
              <Link to="/download">
                <Download className="mr-2 h-5 w-5" aria-hidden="true" />
                Download for Android
              </Link>
            </Button>
          </div>
          <div className="relative">
            <GameArt
              kind="duo"
              alt="Male and female chibi Civil Craft engineers ready to build"
              className="mx-auto w-44 md:w-full"
            />
            <GameProp kind="rocks" className="-left-16 bottom-0 w-32 opacity-80" />
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
