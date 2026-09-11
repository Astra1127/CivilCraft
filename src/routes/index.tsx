import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  Boxes,
  Download,
  Gauge,
  Hammer,
  Smartphone,
  Sparkles,
  Target,
  Wrench,
} from "lucide-react";
import { PublicLayout } from "@/components/site/PublicLayout";
import { SectionDivider } from "@/components/site/SectionDivider";
import { GameProp, GameArt } from "@/components/site/GameProp";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCms, formatDate } from "@/lib/cms/store";
import { useAuth } from "@/lib/auth";
import heroKeyart from "@/assets/hero-keyart.jpg";
import canyonPanorama from "@/assets/canyon-panorama.jpg";
import shotExplore from "@/assets/explore-world.jpg";
import shotBuild from "@/assets/build-mode.jpg";
import shotTest from "@/assets/load-test.jpg";
import worldBreak from "@/assets/world-break-strip.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Civil Craft: Bridge Edition — Build. Test. Learn." },
      {
        name: "description",
        content:
          "Explore a low-poly canyon world, build bridges, run physics load tests and learn engineering in Civil Craft: Bridge Edition, a 3D educational game for Android.",
      },
      { property: "og:title", content: "Civil Craft: Bridge Edition — Build. Test. Learn." },
      {
        property: "og:description",
        content:
          "Explore, build, test and learn. The official site of Civil Craft: Bridge Edition, a chibi low-poly bridge-building game.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

const gameStrip = [
  { icon: Boxes, label: "3D Game" },
  { icon: Hammer, label: "Bridge Building" },
  { icon: Gauge, label: "Physics Simulation" },
  { icon: BookOpen, label: "Engineering Learning" },
  { icon: Smartphone, label: "Mobile" },
];

const pillars = [
  {
    icon: Hammer,
    title: "Build",
    text: "Start with a design that answers the bridge challenge.",
  },
  {
    icon: Gauge,
    title: "Test",
    text: "Run the simulation and observe how your structure carries the load.",
  },
  {
    icon: BookOpen,
    title: "Learn",
    text: "Understand the result, then refine your next design.",
  },
];

const shots = [
  {
    id: "explore",
    label: "Explore",
    src: shotExplore,
    alt: "Chibi engineer walking through the low-poly canyon in Civil Craft",
  },
  {
    id: "build",
    label: "Build",
    src: shotBuild,
    alt: "Civil Craft blueprint build mode with beams placed on a grid",
  },
  {
    id: "test",
    label: "Test",
    src: shotTest,
    alt: "A completed wooden bridge crossing the canyon during a Civil Craft simulation",
  },
  {
    id: "learn",
    label: "Learn",
    src: shotTest,
    alt: "Bridge load test showing member stress and the load carried by the structure",
  },
] as const;

const journey = [
  { n: "01", title: "Explore", text: "Discover the environment and challenge." },
  { n: "02", title: "Plan", text: "Study the gap, loads and requirements." },
  { n: "03", title: "Build", text: "Construct your bridge." },
  { n: "04", title: "Test", text: "Run the simulation." },
  { n: "05", title: "Learn", text: "Observe the result and identify weak points." },
  { n: "06", title: "Improve", text: "Apply what you discovered to your next design." },
];

const features = [
  { icon: Hammer, title: "Bridge Building", text: "Beam, truss, arch and suspension systems." },
  { icon: Gauge, title: "Physics Simulation", text: "Real load paths, stress and failure." },
  {
    icon: BookOpen,
    title: "Engineering Learning",
    text: "Concepts taught by playing, not lecturing.",
  },
  { icon: Target, title: "Challenges", text: "Budgets, terrain and safety margins to beat." },
];

function Checks({ items }: { items: string[] }) {
  return (
    <ul className="mt-6 space-y-2.5">
      {items.map((t) => (
        <li key={t} className="flex items-baseline gap-3">
          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 border-gold bg-gold/20 text-[10px] font-extrabold text-gold">
            ✓
          </span>
          <span className="min-w-0 text-sm text-muted-foreground">{t}</span>
        </li>
      ))}
    </ul>
  );
}

function HomePage() {
  const { player } = useAuth();
  const [active, setActive] = useState<string>("explore");
  const news = useCms((s) =>
    s.news
      .filter((n) => n.status === "published")
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, 3),
  );
  const shot = shots.find((s) => s.id === active) ?? shots[0];
  const [lead, ...rest] = news;

  return (
    <PublicLayout>
      {/* ---------- HERO: enter the world ---------- */}
      <section className="relative overflow-hidden border-b-2 border-border bg-background">
        <div
          className="blueprint pointer-events-none absolute inset-0 opacity-70"
          aria-hidden="true"
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-8 px-4 pb-12 pt-12 sm:px-6 lg:min-h-[38rem] lg:grid-cols-[minmax(0,42fr)_minmax(0,58fr)] lg:gap-4 lg:pb-16 lg:pt-20">
          <div className="min-w-0">
            <Badge
              variant="outline"
              className="border-2 border-gold/60 bg-gold/10 text-[11px] font-extrabold uppercase tracking-[0.16em] text-gold"
            >
              Chibi low-poly engineering game
            </Badge>
            <h1 className="mt-4 text-4xl leading-[1.02] sm:text-5xl lg:text-6xl">
              Civil Craft:
              <span className="block text-gold">Bridge Edition</span>
            </h1>
            <p className="mt-3 font-display text-xl">Build. Test. Learn.</p>
            <p className="mt-4 max-w-lg text-muted-foreground">
              Step into a low-poly desert canyon, take an engineering contract, draft your bridge
              and send the truck across to find out whether your structure holds.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild size="lg" variant="gold">
                <Link to="/download">
                  <Download className="mr-2 h-5 w-5" aria-hidden="true" />
                  Download Now
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/about">
                  Learn more
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>

          {/* Key art dominates and spills past its frame */}
          <div className="relative lg:-mr-16 xl:-mr-24">
            <div className="game-frame relative overflow-visible p-2">
              <img
                src={heroKeyart}
                alt="Chibi Civil Craft engineers on a wooden truss bridge spanning a low-poly canyon"
                width={1280}
                height={800}
                className="w-full rounded-2xl"
              />
              <GameArt
                kind="engineer"
                alt=""
                className="pointer-events-none absolute -bottom-10 -left-12 w-28 sm:w-36 lg:-left-20 lg:w-44"
              />
              <GameProp kind="tools" className="-right-8 -top-12 w-36 opacity-95" />
            </div>
            <GameProp kind="rocks" className="-bottom-8 left-6 w-56 opacity-90" />
          </div>
        </div>
      </section>

      {/* ---------- THIN INFO STRIP ---------- */}
      <div className="border-b-2 border-border bg-card/70">
        <ul className="mx-auto flex max-w-6xl snap-x items-stretch overflow-x-auto px-4 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {gameStrip.map((g) => (
            <li
              key={g.label}
              className="flex shrink-0 snap-start items-center gap-2.5 border-r border-border/70 px-5 py-4 last:border-r-0 sm:flex-1 sm:justify-center"
            >
              <g.icon className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
              <span className="whitespace-nowrap text-[11px] font-extrabold uppercase tracking-[0.14em]">
                {g.label}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* ---------- CENTERED ABOUT: build / test / learn ---------- */}
      <section className="relative overflow-hidden bg-background py-12">
        <svg
          viewBox="0 0 1200 300"
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-1/3 h-64 w-full opacity-[0.07]"
        >
          <g fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M60 240h1080M120 240 240 120 360 240 480 120 600 240 720 120 840 240 960 120 1080 240" />
            <path d="M240 120h720" />
          </g>
        </svg>
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-gold">
              What is Civil Craft?
            </p>
            <h2 className="mt-3 text-3xl sm:text-4xl">Build. Test. Learn.</h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              Explore the canyon, build the bridge, run the simulation, learn from the result, and
              improve the next design. Each contract continues the same learning loop.
            </p>
          </div>

          <div className="mt-9 grid gap-10 md:grid-cols-3 md:gap-0">
            {pillars.map((p, i) => (
              <div
                key={p.title}
                className={`min-w-0 px-0 text-center md:px-8 ${
                  i > 0 ? "md:border-l md:border-border/70" : ""
                }`}
              >
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border-2 border-border gold-gradient text-gold-foreground shadow-[var(--shadow-soft)]">
                  <p.icon className="h-7 w-7" aria-hidden="true" />
                </span>
                <h3 className="mt-4 font-display text-2xl">{p.title}</h3>
                <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- STORY TEASER ---------- */}
      <section className="relative overflow-hidden border-y-2 border-border bg-card/60 py-12">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-gold">
              The world of Civil Craft
            </p>
            <h2 className="mt-3 text-3xl sm:text-4xl">A canyon waiting to be connected.</h2>
            <p className="mt-4 max-w-lg text-muted-foreground">
              Every bridge solves more than an engineering problem. Discover why your journey begins
              in the canyons and what you're rebuilding along the way.
            </p>
            <Button asChild variant="gold" className="mt-6">
              <Link to="/about" hash="story">
                Discover the Story
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
          <div className="game-frame min-w-0 p-2">
            <img
              src={canyonPanorama}
              alt="Low-poly Civil Craft canyon split by a deep gap"
              loading="lazy"
              className="w-full rounded-2xl"
            />
          </div>
        </div>
      </section>

      <SectionDivider variant="beam" />

      {/* ---------- FEATURED GAMEPLAY (contained game showcase panel) ---------- */}
      <section className="showcase-grid relative overflow-hidden border-y-2 border-border bg-card py-14">
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-gold">
              Featured gameplay
            </p>
            <h2 className="mt-3 text-3xl sm:text-4xl">See Civil Craft in Action</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Explore, build, test, learn from the result, and improve your next design.
            </p>
          </div>

          {/* showcase panel */}
          <div className="relative mt-9">
            <GameProp kind="rocks" className="-left-16 -bottom-8 z-20 w-32 opacity-80" />
            <GameProp kind="tools" className="-right-14 -bottom-6 z-20 w-28 opacity-80" />

            <div className="showcase-panel relative z-10 p-3 sm:p-5">
              {/* mini header */}
              <div className="mb-3 flex items-center justify-between gap-3 px-1">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
                  Gameplay preview
                </span>
                <span className="rounded-full border-2 border-gold/60 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-gold">
                  {shot.label}
                </span>
              </div>

              {/* main screenshot */}
              <div className="rounded-2xl border-2 border-primary/70 bg-card p-1.5 shadow-[inset_0_2px_10px_oklch(0.305_0.036_55/25%)]">
                <img
                  key={shot.id}
                  src={shot.src}
                  alt={shot.alt}
                  loading="lazy"
                  width={1280}
                  height={800}
                  className="aspect-[16/10] w-full rounded-xl object-cover"
                />
              </div>

              {/* tabs */}
              <div className="mt-4 border-t-2 border-border pt-4">
                <div className="flex snap-x gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {shots.map((s) => {
                    const isActive = active === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setActive(s.id)}
                        aria-pressed={isActive}
                        className={`group min-w-0 shrink-0 basis-44 snap-start overflow-hidden rounded-xl border-2 bg-card text-left transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.02] hover:border-gold sm:basis-0 sm:flex-1 ${
                          isActive
                            ? "-translate-y-0.5 border-gold shadow-[var(--shadow-lift)]"
                            : "border-primary/40 opacity-85 shadow-[var(--shadow-soft)]"
                        }`}
                      >
                        <img
                          src={s.src}
                          alt=""
                          aria-hidden="true"
                          loading="lazy"
                          className="aspect-[16/9] w-full object-cover"
                        />
                        <span
                          className={`block px-3 py-2 text-[11px] font-extrabold uppercase tracking-[0.16em] ${
                            isActive ? "text-gold" : "text-muted-foreground"
                          }`}
                        >
                          {s.label}
                        </span>
                        <span
                          aria-hidden="true"
                          className={`block h-1.5 w-full ${isActive ? "gold-gradient" : "bg-transparent"}`}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <SectionDivider variant="ridge" />

      {/* ---------- ENGINEERING JOURNEY (construction route, no cards) ---------- */}
      <section className="relative overflow-hidden bg-secondary/40 py-12">
        <GameProp kind="rocks" className="-left-28 bottom-2 w-44 opacity-60" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-gold">
              How Civil Craft works
            </p>
            <h2 className="mt-3 text-3xl sm:text-4xl">Your Engineering Journey</h2>
          </div>

          <div className="mt-9 space-y-8 md:space-y-0">
            {/* row 1: 01 → 02 → 03 */}
            <div className="flex flex-col items-stretch gap-8 md:flex-row md:items-start md:gap-0">
              {journey.slice(0, 3).map((s, i) => (
                <div key={s.n} className="flex min-w-0 flex-1 md:items-start">
                  {i > 0 ? <StepLink dir="right" /> : null}
                  <Step {...s} />
                </div>
              ))}
            </div>

            <StepLink dir="down" />

            {/* row 2: 06 ← 05 ← 04 */}
            <div className="flex flex-col items-stretch gap-8 md:flex-row-reverse md:items-start md:gap-0">
              {journey.slice(3).map((s, i) => (
                <div key={s.n} className="flex min-w-0 flex-1 md:items-start">
                  {i < 2 ? <StepLink dir="left" /> : null}
                  <Step {...s} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <SectionDivider variant="ridge" />

      {/* ---------- A. EXPLORE THE WORLD (image LEFT / text RIGHT) ---------- */}
      <section className="relative overflow-hidden border-y-2 border-border bg-card/60">
        <GameProp kind="rocks" className="-right-16 bottom-0 w-64 opacity-80" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 sm:px-6 sm:py-12 lg:grid-cols-2 lg:gap-10">
          <div className="game-frame min-w-0 p-2">
            <img
              src={shotExplore}
              alt="Chibi engineer exploring a low-poly canyon path lined with cacti and rope fences"
              loading="lazy"
              width={1280}
              height={800}
              className="w-full rounded-2xl"
            />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-gold">Explore</p>
            <h2 className="mt-3 text-3xl sm:text-4xl">Explore the World</h2>
            <p className="mt-4 max-w-lg text-muted-foreground">
              Walk through Civil Craft's stylized environments, meet characters and discover
              engineering challenges waiting at every canyon.
            </p>
            <Checks
              items={[
                "Explore low-poly environments",
                "Meet characters",
                "Discover bridge challenges",
              ]}
            />
          </div>
        </div>
      </section>

      {/* ---------- B. BUILD YOUR BRIDGE (text LEFT / image RIGHT) ---------- */}
      <section className="relative overflow-hidden bg-background">
        <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 sm:px-6 sm:py-12 lg:grid-cols-2 lg:gap-10">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-gold">Build</p>
            <h2 className="mt-3 text-3xl sm:text-4xl">Build Your Bridge</h2>
            <p className="mt-4 max-w-lg text-muted-foreground">
              Blueprint mode hands you the grid. Choose a structural system, place beams, cables and
              supports, and design a crossing that answers the contract.
            </p>
            <Checks
              items={[
                "Plan your structure",
                "Select available components and materials",
                "Work within challenge requirements",
              ]}
            />
          </div>
          <div className="game-frame relative min-w-0 p-2">
            <img
              src={shotBuild}
              alt="Civil Craft blueprint build mode showing a bridge drafted on a grid"
              loading="lazy"
              width={1920}
              height={886}
              className="w-full rounded-2xl"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-6 -right-6 hidden h-24 w-24 rounded-2xl border-2 border-dashed border-gold/50 lg:block"
            />
          </div>
        </div>
      </section>

      {/* ---------- C. TEST YOUR DESIGN (image LEFT / text RIGHT) ---------- */}
      <section className="relative overflow-hidden border-y-2 border-border bg-card/60">
        <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 sm:px-6 sm:py-12 lg:grid-cols-2 lg:gap-10">
          <div className="game-frame min-w-0 p-2">
            <img
              src={shotTest}
              alt="A truck crossing a player-built bridge while stress colours show member loads"
              loading="lazy"
              width={1280}
              height={800}
              className="w-full rounded-2xl"
            />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-gold">Test</p>
            <h2 className="mt-3 text-3xl sm:text-4xl">Put It to the Test</h2>
            <p className="mt-4 max-w-lg text-muted-foreground">
              Physics decides. Watch force travel through the structure, see which members glow as
              they approach failure, then go back and make it stronger.
            </p>
            <Checks
              items={[
                "Run bridge simulations",
                "Observe structural behavior",
                "Improve unsuccessful designs",
              ]}
            />
            <p className="mt-6 font-display text-sm uppercase tracking-[0.18em] text-gold">
              Build → Test → Learn → Improve
            </p>
          </div>
        </div>
      </section>

      {/* ---------- D. LEARN FROM THE RESULT (text LEFT / image RIGHT) ---------- */}
      <section className="relative overflow-hidden bg-background" aria-labelledby="learn-heading">
        <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 sm:px-6 sm:py-12 lg:grid-cols-2 lg:gap-10">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-gold">Learn</p>
            <h2 id="learn-heading" className="mt-3 text-3xl sm:text-4xl">
              Learn From the Result
            </h2>
            <p className="mt-4 max-w-lg text-muted-foreground">
              Every test shows more than whether a bridge passes or fails. Observe how loads affect
              the structure, identify weak points, and use what you discover to improve your next
              design.
            </p>
            <Checks
              items={[
                "Understand why a bridge succeeded or failed",
                "Observe structural forces and load behavior",
                "Apply what you learned to the next contract",
              ]}
            />
            <p className="mt-5 max-w-lg text-sm text-muted-foreground">
              Engineering concepts discovered throughout the game are recorded in your Bridge
              Almanac.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3 min-h-11">
              <Link to={player ? "/dashboard/almanac" : "/login"}>
                View Bridge Almanac
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
          <div className="game-frame min-w-0 p-2">
            <img
              src={shotTest}
              alt="Civil Craft load test showing stress colours on a bridge carrying a truck"
              loading="lazy"
              width={1280}
              height={800}
              className="h-auto w-full rounded-2xl"
            />
          </div>
        </div>
      </section>

      {/* ---------- FOUR GAME FEATURES (cards belong here) ---------- */}
      <section className="bg-secondary/40 py-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-3xl sm:text-4xl">Game Features</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div key={f.title} className="panel hover-lift p-5">
                <span className="grid h-12 w-12 place-items-center rounded-2xl border-2 border-border bg-secondary">
                  <f.icon className="h-6 w-6 text-gold" aria-hidden="true" />
                </span>
                <h3 className="mt-4 font-display text-lg">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- WORLD BREAK (purely visual) ---------- */}
      <div
        className="relative overflow-hidden border-y-2 border-border bg-background"
        aria-hidden="true"
      >
        <img
          src={worldBreak}
          alt=""
          loading="lazy"
          className="relative mx-auto block w-full max-w-6xl select-none"
        />
      </div>

      {/* ---------- WHAT'S HAPPENING (asymmetric updates) ---------- */}
      {lead ? (
        <section className="bg-background py-12">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-3xl sm:text-4xl">What's Happening in Civil Craft?</h2>
              <Button asChild variant="outline" size="sm">
                <Link to="/community/news">
                  See All in Community
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>

            <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]">
              <article className="min-w-0">
                <div className="overflow-hidden rounded-3xl border-2 border-border shadow-[var(--shadow-lift)]">
                  <img
                    src={heroKeyart}
                    alt={lead.coverAlt}
                    loading="lazy"
                    className="aspect-[16/9] w-full object-cover"
                  />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="border-2 border-border">
                    {lead.category}
                  </Badge>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {formatDate(lead.publishedAt)}
                  </span>
                </div>
                <h3 className="mt-2 font-display text-2xl sm:text-3xl">{lead.title}</h3>
                <p className="mt-2 max-w-xl text-muted-foreground">{lead.excerpt}</p>
                <Link
                  to="/community/news/$slug"
                  params={{ slug: lead.slug }}
                  className="mt-4 inline-flex items-center font-display text-sm text-gold hover:underline"
                >
                  Read Update
                  <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
                </Link>
              </article>

              <div className="min-w-0 space-y-6">
                {rest.map((n) => (
                  <article key={n.id} className="border-b-2 border-border pb-5 last:border-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-2 border-border text-xs">
                        {n.category}
                      </Badge>
                      <span className="text-xs font-semibold text-muted-foreground">
                        {formatDate(n.publishedAt)}
                      </span>
                    </div>
                    <h3 className="mt-2 font-display text-lg">{n.title}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{n.excerpt}</p>
                    <Link
                      to="/community/news/$slug"
                      params={{ slug: n.slug }}
                      className="mt-2 inline-flex items-center text-sm font-bold text-gold hover:underline"
                    >
                      Read Update
                      <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <SectionDivider variant="draft" />

      {/* ---------- COMMUNITY SCENE ---------- */}
      <section className="relative overflow-hidden border-y-2 border-border bg-card/60">
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-11 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div className="relative mx-auto w-full max-w-xs">
            {/* subtle grounding: blueprint pad + rock base under the duo */}
            <div
              aria-hidden="true"
              className="absolute inset-x-6 bottom-4 top-10 rounded-3xl border-2 border-dashed border-border blueprint opacity-70"
            />
            <GameArt
              kind="duo"
              alt="Two chibi Civil Craft engineers standing together"
              className="relative mx-auto w-36 sm:w-40"
            />
            <GameArt
              kind="rocks"
              alt=""
              className="relative mx-auto -mt-5 w-32 opacity-90 sm:w-36"
            />
          </div>

          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-gold">Community</p>
            <h2 className="mt-3 text-3xl sm:text-4xl">Build Together</h2>
            <p className="mt-4 max-w-lg text-muted-foreground">
              Civil Craft isn't only about building bridges — share progress, discover updates and
              see what other players are creating.
            </p>
            {lead ? (
              <div className="mt-6 flex items-start gap-3">
                <Sparkles className="mt-1 h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
                <p className="min-w-0 text-sm">
                  <span className="block text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
                    Latest community update
                  </span>
                  <span className="font-display">{lead.title}</span>
                </p>
              </div>
            ) : null}
            <Button asChild variant="gold" className="mt-7">
              <Link to="/community">
                Explore Community
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ---------- TEAM TEASER ---------- */}
      <section className="border-y-2 border-border bg-background py-11">
        <div className="mx-auto grid max-w-6xl items-center gap-6 px-4 sm:px-6 md:grid-cols-[minmax(0,auto)_minmax(0,1fr)_auto]">
          <GameArt
            kind="duo"
            alt="Small group of chibi Civil Craft student developers"
            className="mx-auto w-28 md:w-32"
          />
          <div className="min-w-0 text-center md:text-left">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-gold">
              Behind the game
            </p>
            <h2 className="mt-2 text-2xl sm:text-3xl">Built by student developers.</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Meet the team designing, developing and researching Civil Craft: Bridge Edition.
            </p>
          </div>
          <Button asChild variant="outline" className="mx-auto shrink-0">
            <Link to="/about" hash="team">
              Meet the Team
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </section>

      {/* ---------- DOWNLOAD: game start screen ---------- */}
      <section className="relative overflow-hidden border-t-2 border-border">
        <img
          src={canyonPanorama}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-background via-background/85 to-background/40"
          aria-hidden="true"
        />
        {/* decorative props frame the CTA — never over the content column */}
        <GameProp kind="rocks" className="bottom-0 left-0 w-40 opacity-85 xl:w-52" />
        <GameProp kind="tools" className="bottom-2 right-0 w-28 opacity-85 xl:w-36" />
        <div className="relative mx-auto max-w-3xl px-4 pb-12 pt-12 text-center sm:px-6">
          <GameArt
            kind="engineer"
            alt="Chibi Civil Craft engineer waving beside a finished bridge"
            className="mx-auto w-32 sm:w-40"
          />
          <h2 className="mt-4 text-3xl sm:text-4xl">Ready to start building?</h2>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            Put your engineering skills to the test.
          </p>
          <Button asChild size="lg" variant="gold" className="mt-6">
            <Link to="/download">
              <Download className="mr-2 h-5 w-5" aria-hidden="true" />
              Download Now
            </Link>
          </Button>
          <p className="mt-3 text-xs font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
            Android • Free
          </p>
        </div>
      </section>

      {/* ---------- QUIET CONTACT LINE ---------- */}
      <div className="bg-background py-8 text-center">
        <Link
          to="/contact"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground"
        >
          <Wrench className="h-4 w-4" aria-hidden="true" />
          Questions or feedback? Contact the Civil Craft Team
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </PublicLayout>
  );
}

function Step({ n, title, text }: { n: string; title: string; text: string }) {
  return (
    <div className="relative min-w-0 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full border-2 border-border gold-gradient font-display text-gold-foreground shadow-[var(--shadow-soft)]">
        {n}
      </span>
      <h3 className="mt-3 font-display text-lg">{title}</h3>
      <p className="mx-auto mt-1 max-w-[15rem] text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

/** Dashed construction connector between journey steps. */
function StepLink({ dir = "right" }: { dir?: "right" | "left" | "down" }) {
  if (dir === "down") {
    return (
      <div
        aria-hidden="true"
        className="mx-auto my-7 hidden h-12 border-l-2 border-dashed border-muted-foreground/45 md:block md:mr-[16%] md:ml-auto md:w-0"
      />
    );
  }
  return (
    <div aria-hidden="true" className="hidden shrink-0 items-center self-start pt-6 md:flex">
      <span className="block h-0 w-7 border-t-2 border-dashed border-muted-foreground/45" />
      <span className="ml-0.5 font-display text-sm text-muted-foreground/70">
        {dir === "right" ? "›" : "‹"}
      </span>
    </div>
  );
}
