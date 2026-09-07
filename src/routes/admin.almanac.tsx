import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Hammer, Layers } from "lucide-react";
import { AdminHeading, AdminPage, Panel, SectionLabel } from "@/components/admin/ui";
import { bridgeTypes, engineeringConcepts, materials } from "@/lib/almanac/content";

export const Route = createFileRoute("/admin/almanac")({
  component: AdminAlmanac,
});

/**
 * Almanac educational content review.
 *
 * This is website/CMS-owned content (bridge explanations, concepts, materials);
 * player progress and screenshots stay with the game backend. Editing is wired
 * up once the content backend is connected.
 */
function AdminAlmanac() {
  return (
    <AdminPage>
      <AdminHeading
        title="Almanac Content"
        description="Educational reference shown in the Bridge Almanac. Player completions and screenshots come from the game and are not editable here."
      />

      <Panel title="Bridge types" icon={BookOpen}>
        <ul className="grid gap-3 md:grid-cols-2">
          {bridgeTypes.map((b) => (
            <li key={b.bridgeTypeId} className="rounded-xl border-2 border-border bg-card p-3">
              <SectionLabel>{b.bridgeTypeId}</SectionLabel>
              <p className="font-display text-lg">{b.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">{b.description}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                <span className="font-extrabold text-foreground">In game: </span>
                {b.inGame}
              </p>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Engineering concepts" icon={Layers}>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {engineeringConcepts.map((c) => (
            <li key={c.id} className="rounded-xl border-2 border-border bg-card p-3">
              <p className="font-display">{c.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">{c.summary}</p>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Materials" icon={Hammer}>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {materials.map((m) => (
            <li key={m.id} className="rounded-xl border-2 border-border bg-card p-3">
              <p className="font-display">{m.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">{m.note}</p>
            </li>
          ))}
        </ul>
      </Panel>
    </AdminPage>
  );
}
