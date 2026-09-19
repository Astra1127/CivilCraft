import { createFileRoute } from "@tanstack/react-router";
import { ListChecks, Package } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AdminHeading, AdminPage, DataRow, Panel, StatusPill } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatBytes, formatDate, logActivity, setCmsState, useCms } from "@/lib/cms/store";
import type { Release } from "@/lib/cms/types";

export const Route = createFileRoute("/admin/releases")({
  component: AdminReleases,
});

function AdminReleases() {
  const releases = useCms((s) => s.releases);
  const installSteps = useCms((s) => s.settings.installSteps);
  const [steps, setSteps] = useState(installSteps.join("\n"));
  const current = releases.find((r) => r.status === "current");

  const update = (id: string, patch: Partial<Release>) =>
    setCmsState((prev) => ({
      ...prev,
      releases: prev.releases.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));

  const makeCurrent = (release: Release) => {
    setCmsState((prev) => ({
      ...prev,
      releases: prev.releases.map((r) => ({
        ...r,
        status: r.id === release.id ? "current" : r.status === "current" ? "archived" : r.status,
      })),
    }));
    logActivity({
      area: "Releases",
      action: "Build set as current",
      target: `v${release.version} (build ${release.build})`,
    });
    toast.success(`v${release.version} is now the public build`);
  };

  const saveSteps = () => {
    const parsed = steps
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    setCmsState((prev) => ({
      ...prev,
      settings: { ...prev.settings, installSteps: parsed },
    }));
    logActivity({
      area: "Releases",
      action: "Installation guide updated",
      target: "Download page",
    });
    toast.success("Installation guide updated");
  };

  return (
    <AdminPage>
      <AdminHeading
        title="Game & Download"
        description="Control the build shown on the public Download page."
        status={
          <StatusPill tone={current ? "ok" : "warn"}>
            {current ? `Live: v${current.version}` : "No current build"}
          </StatusPill>
        }
      />

      <Panel title="Current build" icon={Package} tone="blueprint" bodyClassName="p-3">
        <div className="grid gap-x-6 sm:grid-cols-2">
          <DataRow tone="blueprint" label="Version" value={current?.version ?? "—"} />
          <DataRow tone="blueprint" label="Build" value={current?.build ?? "—"} />
          <DataRow tone="blueprint" label="Platform" value={current?.platform ?? "—"} />
          <DataRow tone="blueprint" label="Minimum Android" value={current?.minAndroid ?? "—"} />
          <DataRow tone="blueprint" label="File" value={current?.fileName ?? "No file"} />
          <DataRow
            tone="blueprint"
            label="Size"
            value={formatBytes(current?.fileSizeBytes ?? null)}
          />
          <DataRow
            tone="blueprint"
            label="Released"
            value={current ? formatDate(current.releaseDate) : "—"}
          />
          <DataRow
            tone="blueprint"
            label="Downloads"
            value={(current?.downloads ?? 0).toLocaleString()}
          />
        </div>
      </Panel>

      <section id="whats-new" className="scroll-mt-24">
        <Panel title="What's New" icon={ListChecks} bodyClassName="p-4 space-y-3">
          {current ? (
            <>
              <Label htmlFor="current-release-notes">
                Release notes for v{current.version} · build {current.build}
              </Label>
              <Textarea
                id="current-release-notes"
                rows={6}
                value={current.notes}
                placeholder="No release notes yet."
                onChange={(e) => update(current.id, { notes: e.target.value })}
              />
              <p className="text-sm text-muted-foreground">
                Shown under the current build information on the public Download page.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Set a build as current to edit its release notes.
            </p>
          )}
        </Panel>
      </section>

      <ul className="space-y-3">
        {releases.map((r) => (
          <li key={r.id} className="overflow-hidden rounded-xl border-2 border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-border bg-secondary/40 px-4 py-2.5">
              <div className="min-w-0">
                <p className="font-display text-base">
                  v{r.version} · build {r.build}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.platform} · {r.fileName ?? "No file"} · {formatBytes(r.fileSizeBytes)} ·{" "}
                  {r.downloads.toLocaleString()} downloads
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusPill
                  tone={r.status === "current" ? "ok" : r.status === "draft" ? "warn" : "off"}
                >
                  {r.status}
                </StatusPill>
                {r.status !== "current" ? (
                  <Button size="sm" variant="outline" onClick={() => makeCurrent(r)}>
                    Make current
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="space-y-3 p-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor={`v-${r.id}`}>Version</Label>
                  <Input
                    id={`v-${r.id}`}
                    value={r.version}
                    onChange={(e) => update(r.id, { version: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`b-${r.id}`}>Build</Label>
                  <Input
                    id={`b-${r.id}`}
                    value={r.build}
                    onChange={(e) => update(r.id, { build: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`a-${r.id}`}>Minimum Android</Label>
                  <Input
                    id={`a-${r.id}`}
                    value={r.minAndroid}
                    onChange={(e) => update(r.id, { minAndroid: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`f-${r.id}`}>APK file name</Label>
                  <Input
                    id={`f-${r.id}`}
                    value={r.fileName ?? ""}
                    placeholder="civilcraft.apk"
                    onChange={(e) => update(r.id, { fileName: e.target.value || null })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`u-${r.id}`}>Download URL</Label>
                <Input
                  id={`u-${r.id}`}
                  value={r.fileUrl ?? ""}
                  placeholder="https://"
                  onChange={(e) => update(r.id, { fileUrl: e.target.value || null })}
                />
              </div>

              {r.status !== "current" ? (
                <div className="space-y-1.5">
                  <Label htmlFor={`n-${r.id}`}>Release notes</Label>
                  <Textarea
                    id={`n-${r.id}`}
                    rows={3}
                    value={r.notes}
                    onChange={(e) => update(r.id, { notes: e.target.value })}
                  />
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`min-${r.id}`}>Minimum requirements (one per line)</Label>
                  <Textarea
                    id={`min-${r.id}`}
                    rows={4}
                    value={r.minRequirements.join("\n")}
                    onChange={(e) =>
                      update(r.id, {
                        minRequirements: e.target.value.split("\n").filter(Boolean),
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`rec-${r.id}`}>Recommended requirements (one per line)</Label>
                  <Textarea
                    id={`rec-${r.id}`}
                    rows={4}
                    value={r.recommendedRequirements.join("\n")}
                    onChange={(e) =>
                      update(r.id, {
                        recommendedRequirements: e.target.value.split("\n").filter(Boolean),
                      })
                    }
                  />
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <Panel title="Installation guide" icon={ListChecks} bodyClassName="p-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          Shown as numbered steps on the public Download page. One step per line.
        </p>
        <Textarea rows={6} value={steps} onChange={(e) => setSteps(e.target.value)} />
        <Button variant="gold" size="sm" onClick={saveSteps}>
          Save guide
        </Button>
      </Panel>
    </AdminPage>
  );
}
