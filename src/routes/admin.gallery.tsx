import { createFileRoute } from "@tanstack/react-router";
import { Eye, EyeOff, Image as ImageIcon, Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AdminHeading, AdminPage, ConfirmDialog, FilterChips, Panel } from "@/components/admin/ui";
import { EmptyState } from "@/components/common/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { contentFetch, contentMutation, useContent, useRefreshContent } from "@/lib/cms/content";
import { galleryCategories, imageTypes, maxImageBytes } from "@/lib/cms/content-types";
import type { GalleryCategory, GalleryItem } from "@/lib/cms/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/gallery")({
  component: AdminGallery,
});

const categories = galleryCategories;
const filters = ["All", ...categories] as const;
type Filter = (typeof filters)[number];

function AdminGallery() {
  const query = useContent(true);
  const gallery = query.data?.gallery ?? [];
  const refresh = useRefreshContent();
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [published, setPublished] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const [caption, setCaption] = useState("");
  const [category, setCategory] = useState<GalleryCategory>("Gameplay");
  const [filter, setFilter] = useState<Filter>("All");
  const [dragOver, setDragOver] = useState(false);
  const [confirm, setConfirm] = useState<GalleryItem | null>(null);

  const visible = gallery.filter((g) => filter === "All" || g.category === filter);

  const choose = (next?: File) => {
    if (!next) return;
    if (
      !imageTypes.includes(next.type as (typeof imageTypes)[number]) ||
      !next.size ||
      next.size > maxImageBytes
    ) {
      toast.error("Choose a PNG, JPEG or WebP image up to 4 MB.");
      return;
    }
    setFile(next);
  };
  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await action();
      await refresh();
      toast.success(message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save gallery changes.");
    } finally {
      setBusy(false);
    }
  };
  const add = () => {
    if (!file || caption.trim().length < 3) {
      toast.error("Choose an image and enter a caption of at least 3 characters.");
      return;
    }
    void run(async () => {
      const body = new FormData();
      body.set("file", file);
      body.set("caption", caption.trim());
      body.set("category", category);
      body.set("visible", String(published));
      await contentFetch("/api/admin/content/upload", { method: "POST", body });
      setFile(null);
      setCaption("");
      if (picker.current) picker.current.value = "";
    }, "Gallery image uploaded");
  };
  const toggle = (item: GalleryItem) =>
    run(
      () =>
        contentMutation("gallery", { id: item.id, action: "visibility", visible: !item.visible }),
      "Visibility updated",
    );
  const remove = (item: GalleryItem) =>
    run(async () => {
      await contentMutation("gallery", { id: item.id, action: "delete" });
      setConfirm(null);
    }, "Gallery image deleted");
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!busy) choose(e.dataTransfer.files[0]);
  };

  return (
    <AdminPage>
      <AdminHeading title="Gallery" description="Manage the media shown on the public gallery." />

      <Panel title="Add media" icon={Upload} bodyClassName="p-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="caption">Caption</Label>
            <Input id="caption" value={caption} onChange={(e) => setCaption(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="published">Visibility</Label>
            <select
              id="published"
              value={String(published)}
              onChange={(e) => setPublished(e.target.value === "true")}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="false">Hidden</option>
              <option value="true">Published</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat">Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as GalleryCategory)}>
              <SelectTrigger id="cat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn(
            "mt-3 grid place-items-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
            dragOver ? "border-gold bg-gold/10" : "border-border bg-secondary/30",
          )}
        >
          <Upload className="h-5 w-5 text-taupe" aria-hidden="true" />
          <p className="text-sm font-bold">Drop an image here, or choose a file</p>
          <p className="text-xs text-muted-foreground">
            PNG, JPEG or WebP. Maximum 4 MB, 25 megapixels.
          </p>
        </div>
        <Input
          ref={picker}
          type="file"
          aria-label="Choose gallery image"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={(e) => choose(e.target.files?.[0])}
          className="mt-3"
        />
        {preview ? (
          <img
            src={preview}
            alt="Selected image preview"
            className="mt-4 max-h-64 rounded-xl object-contain"
          />
        ) : null}
        <Button variant="gold" size="sm" onClick={add} disabled={busy || !file} className="mt-3">
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
          {busy ? "Saving..." : "Upload image"}
        </Button>
      </Panel>

      <FilterChips options={filters} value={filter} onChange={setFilter} />

      {query.isPending ? (
        <p role="status">Loading gallery...</p>
      ) : query.isError ? (
        <div role="alert">
          <p>{query.error.message}</p>
          <Button onClick={() => query.refetch()}>Retry</Button>
        </div>
      ) : visible.length === 0 ? (
        <Panel title="Media" icon={ImageIcon}>
          <EmptyState title="No gallery items here" />
        </Panel>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((g) => (
            <li key={g.id} className="overflow-hidden rounded-xl border-2 border-border bg-card">
              <img
                src={g.url}
                alt={g.caption}
                loading="lazy"
                className="aspect-video w-full object-cover"
              />

              <div className="space-y-2 p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline">{g.category}</Badge>
                  {!g.visible ? <Badge variant="secondary">Hidden</Badge> : null}
                </div>
                <p className="truncate text-sm font-bold">{g.caption}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => toggle(g)}>
                    {g.visible ? (
                      <EyeOff className="mr-1 h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="mr-1 h-4 w-4" aria-hidden="true" />
                    )}
                    {g.visible ? "Hide" : "Show"}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => setConfirm(g)}
                  >
                    <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
                    Delete
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete media?"
        description={`"${confirm?.caption ?? ""}" will be removed from the public gallery.`}
        onConfirm={() => confirm && remove(confirm)}
      />
    </AdminPage>
  );
}
