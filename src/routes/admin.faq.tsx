import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, ChevronUp, HelpCircle, Plus, Trash2 } from "lucide-react";
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
import { logActivity, setCmsState, uid, useCms } from "@/lib/cms/store";
import type { FaqEntry } from "@/lib/cms/types";

export const Route = createFileRoute("/admin/faq")({
  component: AdminFaq,
});

const categories: FaqEntry["category"][] = ["Download", "Gameplay", "Account", "General"];
const filters = ["All", ...categories] as const;
type Filter = (typeof filters)[number];

function AdminFaq() {
  const faq = useCms((s) => [...s.faq].sort((a, b) => a.order - b.order));
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [category, setCategory] = useState<FaqEntry["category"]>("General");
  const [filter, setFilter] = useState<Filter>("All");
  const [confirm, setConfirm] = useState<FaqEntry | null>(null);

  const visible = faq.filter((f) => filter === "All" || f.category === filter);

  const add = () => {
    if (question.trim().length < 5 || answer.trim().length < 5) {
      toast.error("Question and answer are required");
      return;
    }
    setCmsState((prev) => ({
      ...prev,
      faq: [
        ...prev.faq,
        {
          id: uid(),
          question: question.trim(),
          answer: answer.trim(),
          category,
          order: prev.faq.length + 1,
          published: true,
        },
      ],
    }));
    logActivity({ area: "FAQ", action: "Question added", target: question.trim() });
    setQuestion("");
    setAnswer("");
    toast.success("FAQ added");
  };

  const update = (id: string, patch: Partial<FaqEntry>) =>
    setCmsState((prev) => ({
      ...prev,
      faq: prev.faq.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }));

  const move = (entry: FaqEntry, direction: -1 | 1) => {
    const index = faq.findIndex((f) => f.id === entry.id);
    const swap = faq[index + direction];
    if (!swap) return;
    update(entry.id, { order: swap.order });
    update(swap.id, { order: entry.order });
  };

  const remove = (entry: FaqEntry) => {
    setCmsState((prev) => ({ ...prev, faq: prev.faq.filter((f) => f.id !== entry.id) }));
    logActivity({ area: "FAQ", action: "Question deleted", target: entry.question });
    setConfirm(null);
    toast.success("FAQ deleted");
  };

  return (
    <AdminPage>
      <AdminHeading
        title="FAQ"
        description="Questions shown on the Download and Contact pages."
      />

      <Panel title="Add a question" icon={Plus} bodyClassName="p-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
          <div className="space-y-1.5">
            <Label htmlFor="q">Question</Label>
            <Input id="q" value={question} onChange={(e) => setQuestion(e.target.value)} />
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
          <Textarea id="a" rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} />
        </div>
        <Button variant="gold" size="sm" onClick={add} className="mt-3">
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
          Add question
        </Button>
      </Panel>

      <FilterChips options={filters} value={filter} onChange={setFilter} />

      <Panel title="Questions" icon={HelpCircle} bodyClassName={visible.length ? "p-0" : "p-4"}>
        {visible.length === 0 ? (
          <EmptyState title="No FAQ entries here" />
        ) : (
          <Accordion type="multiple" className="divide-y-2 divide-dashed divide-border">
            {visible.map((f, i) => (
              <AccordionItem key={f.id} value={f.id} className="border-0 px-4">
                <div className="flex items-center gap-2">
                  <AccordionTrigger className="min-w-0 flex-1 py-3 text-left hover:no-underline">
                    <span className="flex min-w-0 items-center gap-2">
                      <Badge variant="outline">{f.category}</Badge>
                      <span className="truncate text-sm font-bold">{f.question}</span>
                    </span>
                  </AccordionTrigger>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Move up"
                      disabled={i === 0}
                      onClick={() => move(f, -1)}
                    >
                      <ChevronUp className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Move down"
                      disabled={i === visible.length - 1}
                      onClick={() => move(f, 1)}
                    >
                      <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
                <AccordionContent className="space-y-3 pb-4">
                  <Input
                    value={f.question}
                    onChange={(e) => update(f.id, { question: e.target.value })}
                    aria-label="Question"
                  />
                  <Textarea
                    rows={3}
                    value={f.answer}
                    onChange={(e) => update(f.id, { answer: e.target.value })}
                    aria-label="Answer"
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                      <Switch
                        checked={f.published}
                        onCheckedChange={(v) => update(f.id, { published: v })}
                      />
                      Published
                    </label>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="ml-auto"
                      onClick={() => setConfirm(f)}
                    >
                      <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
                      Delete
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>
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
