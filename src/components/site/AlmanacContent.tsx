import { BookOpen, Compass, HardHat, Layers, Ruler, Weight } from "lucide-react";
import { PageHeader, SectionHeading } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { bridgeTypes, engineeringConcepts, materials } from "@/lib/almanac/content";
import chibiEngineer from "@/assets/chibi-engineer.png";
import buildMode from "@/assets/build-mode.jpg";

const bridges = bridgeTypes.map((b) => ({
  name: b.name,
  span: b.inGame,
  text: b.description,
  learn: b.howItWorks,
}));

const mechanics = [
  { icon: Weight, id: "load" },
  { icon: Layers, id: "tension" },
  { icon: Compass, id: "load-distribution" },
  { icon: Ruler, id: "stability" },
].map((m) => {
  const c = engineeringConcepts.find((x) => x.id === m.id)!;
  return { icon: m.icon, title: c.name, text: c.summary };
});

const terms = engineeringConcepts.map((c) => [c.name, c.summary] as const);

export function AlmanacContent() {
  return (
    <div>
      <PageHeader
        eyebrow="In-game reference"
        title="Bridge Almanac"
        description="The engineer's handbook from Civil Craft: Bridge Edition — every bridge type, material and term you use while building."
        actions={
          <Button asChild variant="gold">
            <a href="/download">Get the game</a>
          </Button>
        }
      />

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="panel relative overflow-hidden p-6 sm:p-8">
          <div className="blueprint pointer-events-none absolute inset-0 opacity-70" aria-hidden="true" />
          <div className="relative grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,220px)]">
            <div className="min-w-0">
              <Badge variant="outline" className="border-gold/60 bg-gold/10 text-gold">
                <BookOpen className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Chapter 1
              </Badge>
              <h2 className="mt-3 text-2xl sm:text-3xl">Four bridges, one canyon</h2>
              <p className="mt-3 max-w-xl text-muted-foreground">
                Civil Craft gives you four structural systems. Each one solves a different span,
                budget and terrain problem — learning when to use which is the whole game.
              </p>
            </div>
            <img
              src={chibiEngineer}
              alt="Chibi Civil Craft engineer holding a blueprint"
              loading="lazy"
              width={768}
              height={768}
              className="mx-auto w-40 drop-shadow-xl md:w-full"
            />
          </div>
        </div>

        <ul className="mt-8 grid gap-5 sm:grid-cols-2">
          {bridges.map((b) => (
            <li key={b.name} className="panel hover-lift p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-xl">{b.name}</h3>
                <Badge variant="secondary">{b.span}</Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{b.text}</p>
              <p className="mt-3 rounded-xl border-2 border-border bg-secondary/50 px-3 py-2 text-xs font-bold">
                You learn: {b.learn}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-y-2 border-border bg-card/60">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <SectionHeading
            title="Structural mechanics"
            description="The physics behind every load test in the game."
          />
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {mechanics.map((m) => (
              <li key={m.title} className="panel hover-lift p-5">
                <span className="grid h-12 w-12 place-items-center rounded-2xl border-2 border-border bg-gold/15 text-gold">
                  <m.icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <h3 className="mt-3 font-display text-lg">{m.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{m.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="min-w-0">
            <SectionHeading title="Materials" description="What you can spend your budget on." />
            <ul className="panel divide-y-2 divide-border overflow-hidden">
              {materials.map((m) => (
                <li key={m.name} className="px-4 py-3">
                  <p className="font-display text-base">{m.name}</p>
                  <p className="text-sm text-muted-foreground">{m.note}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="min-w-0">
            <SectionHeading title="Engineering terms" description="The vocabulary used in-game." />
            <ul className="panel divide-y-2 divide-border overflow-hidden">
              {terms.map(([term, def]) => (
                <li key={term} className="px-4 py-3">
                  <p className="font-display text-base">{term}</p>
                  <p className="text-sm text-muted-foreground">{def}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <div className="game-frame grid items-center gap-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <img
            src={buildMode}
            alt="Civil Craft blueprint building mode over a desert canyon"
            loading="lazy"
            width={1024}
            height={1280}
            className="h-full w-full object-cover"
          />
          <div className="p-6 sm:p-8">
            <span className="grid h-12 w-12 place-items-center rounded-2xl border-2 border-border bg-gold/15 text-gold">
              <HardHat className="h-6 w-6" aria-hidden="true" />
            </span>
            <h2 className="mt-3 text-2xl">Blueprint mode is the classroom</h2>
            <p className="mt-3 text-muted-foreground">
              Everything in this almanac shows up on the blueprint grid: pick a material, place a
              member, watch the load path, then run the test and read the stress colours.
            </p>
            <Button asChild variant="gold" className="mt-5">
              <a href="/download">Start building</a>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
