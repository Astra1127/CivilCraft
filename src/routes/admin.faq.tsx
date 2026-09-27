import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, ChevronUp, HelpCircle, Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AdminHeading, AdminPage, ConfirmDialog, FilterChips, Panel } from "@/components/admin/ui";
import { EmptyState } from "@/components/common/States";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { faqMutation, useFaq, useRefreshFaq } from "@/lib/cms/faq";
import type { FaqEntry } from "@/lib/cms/types";

export const Route = createFileRoute("/admin/faq")({
  component: AdminFaq,
});

const categories: FaqEntry["category"][] = ["Download", "Gameplay", "Account", "General"];
const filters = ["All", ...categories] as const;
type Filter = (typeof filters)[number];

function FaqRowItem({
  item,
  index,
  total,
  busy,
  onSave,
  onTogglePublish,
  onMove,
  onDelete,
}: {
  item: FaqEntry;
  index: number;
  total: number;
  busy: boolean;
  onSave: (updated: FaqEntry) => Promise<void>;
  onTogglePublish: (item: FaqEntry) => Promise<void>;
  onMove: (item: FaqEntry, direction: -1 | 1) => Promise<void>;
  onDelete: (item: FaqEntry) => void;
}) {
  const [q, setQ] = useState(item.question);
  const [a, setA] = useState(item.answer);
  const [cat, setCat] = useState<FaqEntry["category"]>(item.category);
  const [isSaving, setIsSaving] = useState(false);

  const isDirty = q !== item.question || a !== item.answer || cat !== item.category;

  const handleSave = async () => {
    if (q.trim().length < 3 || a.trim().length < 3) {
      toast.error("Question and answer are required.");
      return;
    }
    setIsSaving(true);
    try {
      await onSave({
        ...item,
        question: q.trim(),
        answer: a.trim(),
        category: cat,
      });
      toast.success("FAQ updated");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AccordionItem key={item.id} value={item.id} className="border-0 px-4">
      <div className="flex items-center gap-2">
        <AccordionTrigger className="min-w-0 flex-1 py-3 text-left hover:no-underline">
          <span className="flex min-w-0 items-center gap-2">
            <Badge variant="outline">{item.category}</Badge>
            {!item.published && <Badge variant="secondary">Draft</Badge>}
            <span className="truncate text-sm font-bold">{item.question}</span>
          </span>
        </AccordionTrigger>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Move up"
            disabled={busy || index === 0}
            onClick={() => onMove(item, -1)}
          >
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Move down"
            disabled={busy || index === total - 1}
            onClick={() => onMove(item, 1)}
          >
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <AccordionContent className="space-y-3 pb-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
          <div className="space-y-1">
            <Label htmlFor={`q-${item.id}`} className="text-xs">
              Question
            </Label>
            <Input
              id={`q-${item.id}`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Question"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`cat-${item.id}`} className="text-xs">
              Category
            </Label>
            <Select value={cat} onValueChange={(v) => setCat(v as FaqEntry["category"])}>
              <SelectTrigger id={`cat-${item.id}`}>
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
        <div className="space-y-1">
          <Label htmlFor={`a-${item.id}`} className="text-xs">
            Answer
          </Label>
          <Textarea
            id={`a-${item.id}`}
            rows={3}
            value={a}
            onChange={(e) => setA(e.target.value)}
            aria-label="Answer"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
            <Switch
              checked={item.published}
              disabled={busy}
              onCheckedChange={() => onTogglePublish(item)}
            />
            Published
          </label>

          <Button
            size="sm"
            variant="gold"
            disabled={busy || isSaving || !isDirty}
            onClick={handleSave}
            className="ml-auto"
          >
            <Save className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            {isSaving ? "Saving..." : "Save changes"}
          </Button>

          <Button
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() => onDelete(item)}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Delete
          </Button>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function AdminFaq() {
  const query = useFaq(true);
  const faq = query.data ?? [];
  const refresh = useRefreshFaq();

  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [category, setCategory] = useState<FaqEntry["category"]>("General");
  const [filter, setFilter] = useState<Filter>("All");
  const [confirm, setConfirm] = useState<FaqEntry | null>(null);

  const sortedFaq = [...faq].sort((a, b) => a.order - b.order);
  const visible = sortedFaq.filter((f) => filter === "All" || f.category === filter);

  const add = async () => {
    if (question.trim().length < 3 || answer.trim().length < 3) {
      toast.error("Question and answer are required.");
      return;
    }
    setBusy(true);
    try {
      const newEntry: FaqEntry = {
        id: "faq-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        question: question.trim(),
        answer: answer.trim(),
        category,
        order: faq.length + 1,
        published: true,
      };
      await faqMutation({ action: "save", entry: newEntry });
      await refresh();
      setQuestion("");
      setAnswer("");
      toast.success("FAQ added");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add question.");
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async (updated: FaqEntry) => {
    setBusy(true);
    try {
      await faqMutation({ action: "save", entry: updated });
      await refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save question.");
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const handleTogglePublish = async (item: FaqEntry) => {
    setBusy(true);
    try {
      await faqMutation({
        action: "save",
        entry: { ...item, published: !item.published },
      });
      await refresh();
      toast.success(item.published ? "FAQ unpublished" : "FAQ published");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to change visibility.");
    } finally {
      setBusy(false);
    }
  };

  const move = async (entry: FaqEntry, direction: -1 | 1) => {
    const index = sortedFaq.findIndex((f) => f.id === entry.id);
    const swap = sortedFaq[index + direction];
    if (!swap) return;
    setBusy(true);
    try {
      await faqMutation({
        action: "reorder",
        orders: [
          { id: entry.id, order: swap.order },
          { id: swap.id, order: entry.order },
        ],
      });
      await refresh();
      toast.success("FAQ reordered");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to reorder.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (entry: FaqEntry) => {
    setBusy(true);
    try {
      await faqMutation({ action: "delete", id: entry.id });
      await refresh();
      setConfirm(null);
      toast.success("FAQ deleted");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete FAQ.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminPage>
      <AdminHeading
        title="FAQ"
        description="Frequently Asked Questions shown on the public FAQ page, Download, and Contact pages."
      />

      <Panel title="Add a question" icon={Plus} bodyClassName="p-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
          <div className="space-y-1.5">
            <Label htmlFor="q">Question</Label>
            <Input
              id="q"
              placeholder="e.g. Does Civil Craft support offline play?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c">Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as FaqEntry["category"])}>
              <SelectTrigger id="c">
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
        <div className="mt-3 space-y-1.5">
          <Label htmlFor="a">Answer</Label>
          <Textarea
            id="a"
            rows={3}
            placeholder="Detailed answer for players and students..."
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
        </div>
        <Button variant="gold" size="sm" onClick={add} disabled={busy} className="mt-3">
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
          {busy ? "Saving..." : "Add question"}
        </Button>
      </Panel>

      <FilterChips options={filters} value={filter} onChange={setFilter} />

      <Panel title="Questions" icon={HelpCircle} bodyClassName={visible.length ? "p-0" : "p-4"}>
        {query.isPending ? (
          <p className="p-4" role="status">
            Loading FAQ...
          </p>
        ) : query.isError ? (
          <div className="p-4" role="alert">
            <p className="text-sm text-destructive">{query.error.message}</p>
            <Button size="sm" variant="outline" onClick={() => query.refetch()} className="mt-2">
              Retry
            </Button>
          </div>
        ) : visible.length === 0 ? (
          <EmptyState title="No FAQ entries here" />
        ) : (
          <Accordion type="multiple" className="divide-y-2 divide-dashed divide-border">
            {visible.map((f, i) => (
              <FaqRowItem
                key={f.id}
                item={f}
                index={i}
                total={visible.length}
                busy={busy}
                onSave={handleSave}
                onTogglePublish={handleTogglePublish}
                onMove={move}
                onDelete={setConfirm}
              />
            ))}
          </Accordion>
        )}
      </Panel>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete question?"
        description={`"${confirm?.question ?? ""}" will be removed from the public FAQ.`}
        onConfirm={() => confirm && remove(confirm)}
      />
    </AdminPage>
  );
}
