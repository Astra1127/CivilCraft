import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill } from "./ui";
import type { Release } from "@/lib/cms/types";
import { formatDate } from "@/lib/cms/store";

export function ReleasePosts({
  releases,
  save,
}: {
  releases: Release[];
  save: (release: Release) => Promise<void>;
}) {
  const [editing, setEditing] = useState<Release | null>(null);
  const [busy, setBusy] = useState(false);
  const create = () =>
    setEditing({
      id: crypto.randomUUID(),
      title: "",
      version: "",
      build: "",
      releaseDate: new Date().toISOString().slice(0, 10),
      notes: "",
      published: false,
      status: "draft",
      platform: "Android",
      fileName: null,
      fileSizeBytes: null,
      fileUrl: null,
      minAndroid: "",
      minRequirements: [],
      recommendedRequirements: [],
      downloads: 0,
    });
  const submit = async (published: boolean) => {
    if (!editing || busy) return;
    if (
      !editing.title?.trim() ||
      !editing.version.trim() ||
      !editing.build.trim() ||
      !editing.releaseDate ||
      !editing.notes.trim()
    ) {
      toast.error("Enter a title, version, build, date and release notes.");
      return;
    }
    setBusy(true);
    try {
      // Only post fields are edited here; retain the latest APK settings for this release.
      const existing = releases.find((r) => r.id === editing.id) ?? editing;
      await save({
        ...existing,
        title: editing.title,
        version: editing.version,
        build: editing.build,
        releaseDate: editing.releaseDate,
        notes: editing.notes,
        published,
      });
      setEditing(null);
      toast.success(published ? "Update published" : "Draft saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save update.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <Button variant="gold" size="sm" onClick={create} disabled={busy || !!editing}>
        Create update
      </Button>
      {editing ? (
        <form
          className="space-y-3 rounded-xl border-2 border-border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(false);
          }}
        >
          <fieldset disabled={busy} className="space-y-3">
            <div>
              <Label htmlFor="update-title">Title</Label>
              <Input
                id="update-title"
                value={editing.title ?? ""}
                maxLength={160}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="update-version">Version</Label>
                <Input
                  id="update-version"
                  value={editing.version}
                  maxLength={40}
                  onChange={(e) => setEditing({ ...editing, version: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="update-build">Build number</Label>
                <Input
                  id="update-build"
                  value={editing.build}
                  maxLength={40}
                  onChange={(e) => setEditing({ ...editing, build: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="update-date">Date</Label>
                <Input
                  id="update-date"
                  type="date"
                  value={editing.releaseDate}
                  onChange={(e) => setEditing({ ...editing, releaseDate: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="update-notes">Release notes</Label>
              <Textarea
                id="update-notes"
                rows={6}
                maxLength={5000}
                value={editing.notes}
                onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="outline">
                Save draft
              </Button>
              <Button type="button" variant="gold" onClick={() => submit(true)}>
                Publish update
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
            {editing.published ? (
              <p className="text-xs text-muted-foreground">
                Saving as a draft removes this update from the public page.
              </p>
            ) : null}
          </fieldset>
        </form>
      ) : null}
      <ul className="space-y-3">
        {[...releases]
          .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate) || b.id.localeCompare(a.id))
          .map((release) => (
            <li
              key={release.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-border p-3"
            >
              <div className="min-w-0">
                <p className="break-words font-display">{release.title || "Untitled update"}</p>
                <p className="text-sm text-muted-foreground">
                  v{release.version} / build {release.build} / {formatDate(release.releaseDate)}
                </p>
                <StatusPill tone={release.published ? "ok" : "warn"}>
                  {release.published ? "Published" : "Draft"}
                </StatusPill>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !!editing}
                onClick={() => setEditing({ ...release })}
              >
                Edit update
              </Button>
            </li>
          ))}
      </ul>
    </div>
  );
}
