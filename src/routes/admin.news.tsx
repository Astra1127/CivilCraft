import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AdminHeading, AdminPage, Panel, ConfirmDialog } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { contentMutation, useContent, useRefreshContent } from "@/lib/cms/content";
import { updateCategories } from "@/lib/cms/content-types";
import type { NewsArticle } from "@/lib/cms/types";

export const Route = createFileRoute("/admin/news")({ component: AdminUpdates });
const blank = (): NewsArticle => ({
  id: "",
  slug: "",
  title: "",
  category: "Announcements",
  excerpt: "",
  content: "",
  coverUrl: "",
  coverAlt: "",
  status: "draft",
  publishedAt: new Date().toISOString(),
});
function AdminUpdates() {
  const query = useContent(true),
    refresh = useRefreshContent();
  const [form, setForm] = useState(blank),
    [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<NewsArticle | null>(null);
  const update = (key: keyof NewsArticle, value: string) =>
    setForm((old) => ({ ...old, [key]: value }));
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      await refresh();
      toast.success("Update saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save update.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <AdminPage>
      <AdminHeading
        title="Updates"
        description="Publish news and development articles on the public website."
      />
      <Panel title={form.id ? "Edit update" : "New update"} bodyClassName="p-5">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await contentMutation("updates", {
                ...form,
                id: form.id || undefined,
                action: "save",
              });
              setForm(blank());
            });
          }}
        >
          <fieldset disabled={busy} className="space-y-4">
            <div>
              <Label htmlFor="update-title">Title</Label>
              <Input
                id="update-title"
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                required
                minLength={3}
                maxLength={160}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="update-category">Category</Label>
                <select
                  id="update-category"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.category}
                  onChange={(e) => update("category", e.target.value)}
                >
                  {updateCategories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="update-status">Visibility</Label>
                <select
                  id="update-status"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.status}
                  onChange={(e) => update("status", e.target.value)}
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </div>
              <div>
                <Label htmlFor="update-date">Publication date (UTC)</Label>
                <Input
                  id="update-date"
                  type="date"
                  required
                  value={form.publishedAt.slice(0, 10)}
                  onChange={(e) =>
                    update("publishedAt", e.target.value ? e.target.value + "T00:00:00.000Z" : "")
                  }
                />
              </div>
            </div>
            <div>
              <Label htmlFor="update-excerpt">Short excerpt</Label>
              <Textarea
                id="update-excerpt"
                value={form.excerpt}
                onChange={(e) => update("excerpt", e.target.value)}
                required
                minLength={3}
                maxLength={500}
              />
            </div>
            <div>
              <Label htmlFor="update-content">Full article</Label>
              <Textarea
                id="update-content"
                rows={12}
                value={form.content}
                onChange={(e) => update("content", e.target.value)}
                required
                minLength={3}
                maxLength={5000}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="update-cover">Hero image URL (optional, HTTPS)</Label>
                <Input
                  id="update-cover"
                  type="url"
                  value={form.coverUrl ?? ""}
                  onChange={(e) => update("coverUrl", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="update-alt">Image description</Label>
                <Input
                  id="update-alt"
                  maxLength={200}
                  value={form.coverAlt}
                  onChange={(e) => update("coverAlt", e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="gold" type="submit">
                {busy ? "Saving..." : "Save update"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setForm(blank())}>
                Clear
              </Button>
            </div>
          </fieldset>
        </form>
      </Panel>
      {query.isPending ? (
        <p role="status">Loading updates...</p>
      ) : query.isError ? (
        <div role="alert">
          <p>{query.error.message}</p>
          <Button onClick={() => query.refetch()}>Retry</Button>
        </div>
      ) : !query.data.updates.length ? (
        <p className="text-muted-foreground">No updates yet.</p>
      ) : (
        <ul className="space-y-3">
          {query.data.updates.map((article) => (
            <li
              key={article.id}
              className="panel flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div>
                <h2 className="font-display">{article.title}</h2>
                <p className="text-xs capitalize text-muted-foreground">
                  {article.category} / {article.status}
                </p>
              </div>
              <div className="flex gap-2">
                {article.status === "published" ? (
                  <Button asChild size="sm" variant="outline">
                    <Link to="/updates/$slug" params={{ slug: article.slug }}>
                      View
                    </Link>
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setForm(article);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => setConfirm(article)}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Delete update?"
        description="This article will be removed from the public updates list."
        onConfirm={() =>
          confirm &&
          run(async () => {
            await contentMutation("updates", { action: "delete", id: confirm.id });
            if (form.id === confirm.id) setForm(blank());
            setConfirm(null);
          })
        }
      />
    </AdminPage>
  );
}
