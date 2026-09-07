import { createFileRoute } from "@tanstack/react-router";
import { Eye, EyeOff, Image as ImageIcon, Plus, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AdminHeading,
  AdminPage,
  ConfirmDialog,
  FilterChips,
  Panel,
} from "@/components/admin/ui";
import { ArtPlaceholder } from "@/components/common/ArtPlaceholder";
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
import { logActivity, setCmsState, uid, useCms } from "@/lib/cms/store";
import type { GalleryCategory, GalleryItem } from "@/lib/cms/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/gallery")({
  component: AdminGallery,
});

const categories: GalleryCategory[] = ["Gameplay", "Maps", "Bridges", "Characters", "UI", "Videos"];
const filters = ["All", ...categories] as const;
type Filter = (typeof filters)[number];

function AdminGallery() {
  const gallery = useCms((s) => s.gallery);
  const [caption, setCaption] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<GalleryCategory>("Gameplay");
  const [filter, setFilter] = useState<Filter>("All");
  const [dragOver, setDragOver] = useState(false);
  const [confirm, setConfirm] = useState<GalleryItem | null>(null);

  const visible = gallery.filter((g) => filter === "All" || g.category === filter);

  const addItem = (nextCaption: string, nextUrl?: string) => {
    setCmsState((prev) => ({
      ...prev,
      gallery: [
        {
          id: uid(),
          caption: nextCaption,
          category,
          url: nextUrl || undefined,
          visible: true,
          createdAt: new Date().toISOString(),
        },
        ...prev.gallery,
      ],
    }));
    logActivity({ area: "Gallery", action: "Media added", target: nextCaption });
    toast.success("Gallery item added");
  };

  const add = () => {
    if (caption.trim().length < 3) {
      toast.error("Caption must be at least 3 characters");
      return;
    }
    addItem(caption.trim(), url.trim());
    setCaption("");
    setUrl("");
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
    if (!dropped.trim()) {
      toast.error("Drop an image link, or paste a URL in the form above");
      return;
    }
    addItem(caption.trim() || "Untitled media", dropped.trim());
    setCaption("");
  };

  const toggle = (item: GalleryItem) => {
    setCmsState((prev) => ({
      ...prev,
      gallery: prev.gallery.map((g) => (g.id === item.id ? { ...g, visible: !g.visible } : g)),
    }));
    logActivity({
      area: "Gallery",
      action: item.visible ? "Media hidden" : "Media shown",
      target: item.caption,
    });
  };

  const remove = (item: GalleryItem) => {
    setCmsState((prev) => ({ ...prev, gallery: prev.gallery.filter((g) => g.id !== item.id) }));
    logActivity({ area: "Gallery", action: "Media deleted", target: item.caption });
    setConfirm(null);
    toast.success("Gallery item deleted");
  };

  return (
    <AdminPage>
      <AdminHeading
        title="Gallery"
        description="Manage the media shown on the public gallery."
      />

      <Panel title="Add media" icon={Upload} bodyClassName="p-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="caption">Caption</Label>
            <Input id="caption" value={caption} onChange={(e) => setCaption(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="url">Image URL (optional)</Label>
            <Input
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://"
            />
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
          <p className="text-sm font-bold">Drag an image link here</p>
          <p className="text-xs text-muted-foreground">
            It is added to the selected category using the caption above.
          </p>
        </div>
        <Button variant="gold" size="sm" onClick={add} className="mt-3">
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
          Add item
        </Button>
      </Panel>

      <FilterChips options={filters} value={filter} onChange={setFilter} />

      {visible.length === 0 ? (
        <Panel title="Media" icon={ImageIcon}>
          <EmptyState title="No gallery items here" />
        </Panel>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((g) => (
            <li key={g.id} className="overflow-hidden rounded-xl border-2 border-border bg-card">
              {g.url ? (
                <img
                  src={g.url}
                  alt={g.caption}
                  loading="lazy"
                  className="aspect-video w-full object-cover"
                />
              ) : (
                <ArtPlaceholder label={g.caption} compact className="rounded-none border-0" />
              )}
              <div className="space-y-2 p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline">{g.category}</Badge>
                  {!g.visible ? <Badge variant="secondary">Hidden</Badge> : null}
                </div>
                <p className="truncate text-sm font-bold">{g.caption}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => toggle(g)}>
                    {g.visible ? (
                      <EyeOff className="mr-1 h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="mr-1 h-4 w-4" aria-hidden="true" />
                    )}
                    {g.visible ? "Hide" : "Show"}
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => setConfirm(g)}>
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
