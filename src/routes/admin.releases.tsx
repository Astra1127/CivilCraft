import { ReleasePosts } from "@/components/admin/ReleasePosts";
import { useAdminReleases } from "@/lib/cms/releases";
import { ErrorState, LoadingState } from "@/components/common/States";
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
  const localReleases = useCms((s) => s.releases);
  const query = useAdminReleases();
  const releases = query.data?.initialized ? query.data.releases : localReleases;
  const [patches, setPatches] = useState<Record<string, Partial<Release>>>({});
  const [busy, setBusy] = useState(false);
  const installSteps = useCms((s) => s.settings.installSteps);
  const [steps, setSteps] = useState(installSteps.join("\n"));
  const current = releases.find((r) => r.status === "current");

  const update = (id: string, patch: Partial<Release>) =>
    setPatches((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  const save = async (release: Release) => {
    await query.mutate({ action: "save", release });
  };
  const makeCurrent = async (release: Release) => {
    setBusy(true);
    try {
      await query.mutate({ action: "current", id: release.id });
      toast.success(`v${release.version} is now the public build`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not set current build.");
    } finally {
      setBusy(false);
    }
  };
  const saveBuild = async (release: Release) => {
    setBusy(true);
    try {
      await save(release);
      setPatches((prev) => {
        const next = { ...prev };
        delete next[release.id];
        return next;
      });
      toast.success("Build saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save build.");
    } finally {
      setBusy(false);
    }
  };
  const initialize = async () => {
    setBusy(true);
    try {
      await query.mutate({ action: "initialize", releases: localReleases });
      toast.success("Existing releases imported as draft updates");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import releases.");
    } finally {
      setBusy(false);
    }
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

  if (query.isPending) return <LoadingState label="Loading releases..." />;
  if (query.isError)
    return <ErrorState description={query.error.message} onRetry={() => query.refetch()} />;

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
          {query.data.initialized ? (
            <ReleasePosts releases={releases} save={save} />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Import the existing release records to manage shared update posts. APK details and
                the current build selection are preserved; notes start as drafts.
              </p>
              <Button variant="gold" disabled={busy} onClick={initialize}>
                Import existing releases
              </Button>
            </>
          )}
        </Panel>
      </section>

      <ul className="space-y-3">
        {releases.map((saved) => {
          const r = { ...saved, ...patches[saved.id] };
          return (
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
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || !query.data.initialized}
                      onClick={() => makeCurrent(r)}
                    >
                      Make current
                    </Button>
                  ) : null}
                </div>
              </div>

              <fieldset disabled={busy || !query.data.initialized} className="space-y-3 p-4">
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
                <Button
                  variant="gold"
                  size="sm"
                  disabled={!patches[r.id]}
                  onClick={() => saveBuild(r)}
                >
                  Save build
                </Button>
              </fieldset>
            </li>
          );
        })}
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
