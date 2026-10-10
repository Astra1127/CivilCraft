import { ReleasePosts } from "@/components/admin/ReleasePosts";
import { ApkUpload } from "@/components/admin/ApkUpload";
import { useAdminReleases, type ReleaseNotificationResult } from "@/lib/cms/releases";
import { ErrorState, LoadingState } from "@/components/common/States";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronRight, ListChecks, Mail, Package, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AdminHeading,
  AdminPage,
  ConfirmDialog,
  DataRow,
  Panel,
  StatusPill,
} from "@/components/admin/ui";
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
  const [draftVersion, setDraftVersion] = useState("");
  const [draftBuild, setDraftBuild] = useState("");
  const [expandedBuilds, setExpandedBuilds] = useState<Record<string, boolean>>({});
  const [deleteTarget, setDeleteTarget] = useState<Release | null>(null);
  const [currentTarget, setCurrentTarget] = useState<Release | null>(null);
  const [emailResult, setEmailResult] = useState<ReleaseNotificationResult | null>(null);
  const installSteps = useCms((s) => s.settings.installSteps);
  const [steps, setSteps] = useState(installSteps.join("\n"));
  const current = releases.find((r) => r.status === "current");
  const byDate = (a: Release, b: Release) =>
    b.releaseDate.localeCompare(a.releaseDate) || b.id.localeCompare(a.id);
  const groups = [
    {
      id: "current",
      title: "Active build",
      description: "The build available on the public Download page.",
      releases: current ? [current] : [],
    },
    {
      id: "archived",
      title: "Backups",
      description: "Previous downloads kept for reference or rollback.",
      releases: releases.filter((r) => r.status === "archived").sort(byDate),
    },
    {
      id: "draft",
      title: "Drafts",
      description: "Prepare the APK and build details before making a draft current.",
      releases: releases.filter((r) => r.status === "draft").sort(byDate),
    },
  ].filter((group) => group.releases.length);

  const update = (id: string, patch: Partial<Release>) =>
    setPatches((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  const save = async (release: Release) => {
    const result = await query.mutate({ action: "save", release });
    if (result?.notification) setEmailResult(result.notification);
  };
  const clearPatch = (id: string) => {
    setPatches((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };
  const ensureInitialized = async () => {
    if (!query.data?.initialized)
      await query.mutate({ action: "initialize", releases: localReleases });
  };
  const savePost = async (release: Release) => {
    setBusy(true);
    try {
      await save(release);
    } finally {
      setBusy(false);
    }
  };
  const makeCurrent = async (release: Release) => {
    if (busy || !release.fileUrl || release.id === current?.id) return;
    setBusy(true);
    try {
      if (patches[release.id]) {
        await save(release);
        clearPatch(release.id);
      }
      const result = await query.mutate({ action: "current", id: release.id });
      if (result?.notification) setEmailResult(result.notification);
      setCurrentTarget(null);
      toast.success(`v${release.version} is now the public build`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not set current build.");
    } finally {
      setBusy(false);
    }
  };
  const requestDelete = (release: Release) => {
    if (!busy && release.status !== "current" && query.data?.initialized) setDeleteTarget(release);
  };
  const deleteBuild = async () => {
    const release = deleteTarget;
    if (!release || busy || release.id === current?.id) return;
    setBusy(true);
    try {
      await query.mutate({ action: "delete", id: release.id });
      clearPatch(release.id);
      setExpandedBuilds((prev) => {
        const next = { ...prev };
        delete next[release.id];
        return next;
      });
      setDeleteTarget(null);
      toast.success(`v${release.version} build ${release.build} deleted`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete build.");
    } finally {
      setBusy(false);
    }
  };
  const saveBuild = async (release: Release) => {
    setBusy(true);
    try {
      await save(release);
      clearPatch(release.id);
      toast.success("Build saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save build.");
    } finally {
      setBusy(false);
    }
  };
  const uploadApk = async (
    release: Release,
    file: File,
    onProgress: (percentage: number) => void,
  ) => {
    setBusy(true);
    try {
      await ensureInitialized();
      const patch = patches[release.id];
      if (patch) {
        // Preserve the saved attachment until the server verifies its replacement.
        const { fileName, fileUrl, fileSizeBytes, apkHosted, ...metadata } = patch;
        if (Object.keys(metadata).length) await save({ ...release, ...metadata });
      }
      await query.uploadApk(release.id, file, onProgress);
      clearPatch(release.id);
      toast.success("APK uploaded and attached to the build");
    } finally {
      setBusy(false);
    }
  };
  const createDraft = async () => {
    const version = draftVersion.trim();
    const build = draftBuild.trim();
    if (busy) return;
    if (!version || !build) {
      toast.error("Enter a version and build number.");
      return;
    }
    setBusy(true);
    try {
      await ensureInitialized();
      const today = new Date();
      const releaseDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const id = crypto.randomUUID();
      await save({
        id,
        version,
        build,
        title: "",
        platform: "Android",
        minAndroid: current?.minAndroid ?? "",
        minRequirements: [...(current?.minRequirements ?? [])],
        recommendedRequirements: [...(current?.recommendedRequirements ?? [])],
        releaseDate,
        notes: "",
        published: false,
        status: "draft",
        fileName: null,
        fileSizeBytes: null,
        fileUrl: null,
        downloads: 0,
      });
      setExpandedBuilds((prev) => ({ ...prev, [id]: true }));
      setDraftVersion("");
      setDraftBuild("");
      toast.success("Draft build created. Upload its APK below.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create draft build.");
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

      <Panel title="Active download" icon={Package} tone="blueprint" bodyClassName="p-3">
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

      <Panel title="Version update emails" icon={Mail} bodyClassName="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm">
              Activating a different version or saving a changed active version queues an update for
              players who opted in and confirmed their contact email.
            </p>
            <p className="text-xs text-muted-foreground">
              {query.data.emailNotifications?.message ?? "Email delivery status is unavailable."}
            </p>
          </div>
          <StatusPill
            tone={
              query.data.emailNotifications
                ? query.data.emailNotifications.configured
                  ? "ok"
                  : "warn"
                : "off"
            }
          >
            {query.data.emailNotifications
              ? query.data.emailNotifications.configured
                ? "Ready to queue"
                : "Not configured"
              : "Status unavailable"}
          </StatusPill>
        </div>
        {emailResult ? (
          <div
            role="status"
            aria-live="polite"
            data-testid="release-email-result"
            className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm"
          >
            <p className="font-bold">
              {emailResult.status === "queued"
                ? "Version update queued"
                : emailResult.status === "not-configured"
                  ? "Build saved · email not queued"
                  : "No new version email"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{emailResult.message}</p>
          </div>
        ) : null}
      </Panel>

      <Panel title="Create draft build" icon={Package} bodyClassName="p-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          Create a build record, then upload its APK. Use Make current when it is ready for the
          public Download page. Release notes are managed in What's New.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void createDraft();
          }}
        >
          <fieldset
            disabled={busy}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] lg:items-end"
          >
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="draft-build-version">Version</Label>
              <Input
                id="draft-build-version"
                value={draftVersion}
                placeholder="e.g. 1.2.0"
                maxLength={40}
                required
                onChange={(event) => setDraftVersion(event.target.value)}
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="draft-build-number">Build number</Label>
              <Input
                id="draft-build-number"
                value={draftBuild}
                placeholder="e.g. 12"
                maxLength={40}
                required
                onChange={(event) => setDraftBuild(event.target.value)}
              />
            </div>
            <Button type="submit" variant="gold" className="sm:col-span-2 lg:col-span-1">
              Create draft build
            </Button>
          </fieldset>
        </form>
      </Panel>

      <ul className="space-y-3">
        {groups.flatMap((group) => [
          <li key={`group-${group.id}`} data-build-group={group.id} className="pt-2">
            <h2 className="flex items-center gap-2 font-display text-base">
              {group.title}
              <span className="rounded-full bg-secondary px-2 py-0.5 font-sans text-xs text-muted-foreground">
                {group.releases.length}
              </span>
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{group.description}</p>
          </li>,
          ...group.releases.map((saved) => {
            const r = { ...saved, ...patches[saved.id] };
            const isCurrent = saved.status === "current";
            const expanded = isCurrent || expandedBuilds[saved.id] === true;
            const detailsId = `build-details-${r.id}`;
            const summary = (
              <span className="block min-w-0">
                <span id={`build-heading-${r.id}`} className="block font-display text-base">
                  v{r.version} · build {r.build}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {r.platform} · {saved.fileName ?? "No APK attached"} ·{" "}
                  {formatBytes(saved.fileSizeBytes)}
                  {saved.releaseDate ? ` · ${formatDate(saved.releaseDate)}` : ""}
                </span>
              </span>
            );
            return (
              <li
                key={r.id}
                data-release-id={r.id}
                className={`overflow-hidden rounded-xl border-2 bg-card ${isCurrent ? "border-gold/60" : "border-border"}`}
              >
                <div
                  className={`flex flex-wrap items-center justify-between gap-3 bg-secondary/40 px-4 py-3 ${expanded ? "border-b-2 border-border" : ""}`}
                >
                  {isCurrent ? (
                    <div className="min-w-0 flex-1">{summary}</div>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      aria-expanded={expanded}
                      aria-controls={detailsId}
                      aria-label={`${expanded ? "Collapse" : "Expand"} v${r.version} build ${r.build}`}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      onClick={() => setExpandedBuilds((prev) => ({ ...prev, [r.id]: !expanded }))}
                    >
                      <ChevronRight
                        className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
                        aria-hidden="true"
                      />
                      {summary}
                    </button>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone={isCurrent ? "ok" : r.status === "draft" ? "warn" : "off"}>
                      {isCurrent ? "Active" : r.status === "draft" ? "Draft" : "Backup"}
                    </StatusPill>
                    {r.published ? <StatusPill tone="info">Notes published</StatusPill> : null}
                    {patches[r.id] ? (
                      <span className="text-xs font-bold text-warning">Unsaved</span>
                    ) : null}
                    {!isCurrent ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy || !query.data.initialized || !r.fileUrl}
                          title={
                            !r.fileUrl ? "Upload an APK or save a download URL first" : undefined
                          }
                          onClick={() => setCurrentTarget(r)}
                        >
                          Make current
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          disabled={busy || !query.data.initialized}
                          aria-label={`Delete v${r.version} build ${r.build}`}
                          onClick={() => requestDelete(r)}
                        >
                          <Trash2 aria-hidden="true" />
                          Delete
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>

                <div id={detailsId} hidden={!expanded} aria-labelledby={`build-heading-${r.id}`}>
                  {isCurrent ? (
                    <p className="border-b border-border bg-gold/5 px-4 py-3 text-xs text-muted-foreground">
                      Changing the active version can queue update emails. For a new APK, create a
                      draft, upload and verify its file, then make that build current.
                    </p>
                  ) : null}
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
                          readOnly={r.apkHosted}
                          onChange={(e) => update(r.id, { fileName: e.target.value || null })}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor={`u-${r.id}`}>
                        {r.apkHosted
                          ? "Uploaded APK URL"
                          : "Manual download URL (optional legacy link)"}
                      </Label>
                      <Input
                        id={`u-${r.id}`}
                        value={r.fileUrl ?? ""}
                        placeholder="https://"
                        readOnly={r.apkHosted}
                        onChange={(e) => update(r.id, { fileUrl: e.target.value || null })}
                      />
                      <p className="text-xs text-muted-foreground">
                        {r.apkHosted
                          ? "File name, size and URL are set by the verified upload. Upload another APK to replace it."
                          : "Existing external download links are supported. Upload an APK to host the file for this build."}
                      </p>
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
                        <Label htmlFor={`rec-${r.id}`}>
                          Recommended requirements (one per line)
                        </Label>
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
                  <div className="px-4 pb-4">
                    <ApkUpload
                      release={saved}
                      disabled={busy}
                      onUpload={(file, onProgress) => uploadApk(saved, file, onProgress)}
                    />
                  </div>
                </div>
              </li>
            );
          }),
        ])}
      </ul>

      <section id="whats-new" className="scroll-mt-24">
        <Panel title="What's New" icon={ListChecks} bodyClassName="p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Publish release notes for the public Download page. Notes can stay in draft while the
            corresponding build is active.
          </p>
          {query.data.initialized ? (
            <fieldset disabled={busy}>
              <ReleasePosts
                releases={releases}
                save={savePost}
                disabled={busy}
                onDelete={requestDelete}
              />
            </fieldset>
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

      <Panel title="Installation guide" icon={ListChecks} bodyClassName="p-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          Shown as numbered steps on the public Download page. One step per line.
        </p>
        <Textarea
          rows={6}
          value={steps}
          disabled={busy}
          onChange={(e) => setSteps(e.target.value)}
        />
        <Button variant="gold" size="sm" disabled={busy} onClick={saveSteps}>
          Save guide
        </Button>
      </Panel>
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={
          deleteTarget
            ? `Delete v${deleteTarget.version} build ${deleteTarget.build}?`
            : "Delete build?"
        }
        description={`The build record and its ${deleteTarget?.published ? "published " : ""}release notes will be removed${deleteTarget?.published ? " from What's New" : ""}. Any uploaded APK file is retained in storage. The active download stays available.`}
        confirmLabel="Delete build"
        onConfirm={() => void deleteBuild()}
      />
      <ConfirmDialog
        open={currentTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCurrentTarget(null);
        }}
        title={
          currentTarget
            ? `Make v${currentTarget.version} build ${currentTarget.build} current?`
            : "Make build current?"
        }
        description={`This replaces the active download with the selected build.${currentTarget && current?.version.trim() !== currentTarget.version.trim() ? " Players who opted in and confirmed their contact email will be queued for a version update when email delivery is configured." : " The version is unchanged, so no new version email is queued."}`}
        confirmLabel="Make current"
        destructive={false}
        onConfirm={() => {
          if (currentTarget) void makeCurrent(currentTarget);
        }}
      />
    </AdminPage>
  );
}
