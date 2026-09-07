import { createFileRoute } from "@tanstack/react-router";
import { Inbox, Mail, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AdminHeading,
  AdminPage,
  ConfirmDialog,
  FilterChips,
  Panel,
  StatusPill,
} from "@/components/admin/ui";
import { EmptyState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate, logActivity, setCmsState, useCms } from "@/lib/cms/store";
import type { ContactMessage, MessageStatus } from "@/lib/cms/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/messages")({
  component: AdminMessages,
});

const statuses: MessageStatus[] = ["New", "In Progress", "Resolved"];
const filters = ["All", ...statuses] as const;
type Filter = (typeof filters)[number];

const pillTone = (s: MessageStatus) =>
  s === "New" ? "warn" : s === "Resolved" ? "ok" : "info";

function AdminMessages() {
  const messages = useCms((s) => s.messages);
  const [filter, setFilter] = useState<Filter>("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ContactMessage | null>(null);

  const visible = filter === "All" ? messages : messages.filter((m) => m.status === filter);
  const selected = visible.find((m) => m.id === selectedId) ?? visible[0] ?? null;

  const setStatus = (message: ContactMessage, status: MessageStatus) => {
    setCmsState((prev) => ({
      ...prev,
      messages: prev.messages.map((m) => (m.id === message.id ? { ...m, status } : m)),
    }));
    logActivity({ area: "Messages", action: `Marked ${status}`, target: message.subject });
  };

  const remove = (message: ContactMessage) => {
    setCmsState((prev) => ({
      ...prev,
      messages: prev.messages.filter((m) => m.id !== message.id),
    }));
    logActivity({ area: "Messages", action: "Message deleted", target: message.subject });
    setConfirm(null);
    setSelectedId(null);
    toast.success("Message deleted");
  };

  return (
    <AdminPage>
      <AdminHeading
        title="Messages"
        description="Inquiries submitted through the public contact form."
        status={
          <StatusPill tone={messages.some((m) => m.status === "New") ? "warn" : "ok"}>
            {messages.filter((m) => m.status === "New").length} new
          </StatusPill>
        }
      />

      <FilterChips
        options={filters}
        value={filter}
        onChange={setFilter}
        counts={{
          All: messages.length,
          New: messages.filter((m) => m.status === "New").length,
          "In Progress": messages.filter((m) => m.status === "In Progress").length,
          Resolved: messages.filter((m) => m.status === "Resolved").length,
        }}
      />

      {visible.length === 0 ? (
        <Panel title="Inbox" icon={Inbox}>
          <EmptyState title="No messages" description="Nothing to review right now." />
        </Panel>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <Panel title="Inbox" icon={Inbox} bodyClassName="p-0">
            <ul className="max-h-[32rem] divide-y divide-dashed divide-border overflow-y-auto">
              {visible.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(m.id)}
                    aria-current={selected?.id === m.id}
                    className={cn(
                      "w-full px-4 py-2.5 text-left transition-colors",
                      selected?.id === m.id ? "bg-gold/15" : "hover:bg-secondary/50",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-bold">{m.subject}</p>
                      <StatusPill tone={pillTone(m.status)}>{m.status}</StatusPill>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.name} · {formatDate(m.createdAt)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>

          {selected ? (
            <Panel
              title={selected.subject}
              icon={Mail}
              bodyClassName="p-4 space-y-4"
              actions={<StatusPill tone={pillTone(selected.status)}>{selected.status}</StatusPill>}
            >
              <div className="grid gap-1 text-sm">
                <p className="font-bold">{selected.name}</p>
                <p className="text-muted-foreground">{selected.email}</p>
                <p className="text-xs text-muted-foreground">
                  {selected.inquiryType} · {formatDate(selected.createdAt)}
                </p>
              </div>
              <p className="whitespace-pre-wrap rounded-xl border-2 border-dashed border-border bg-secondary/30 p-3 text-sm">
                {selected.message}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={selected.status}
                  onValueChange={(v) => setStatus(selected, v as MessageStatus)}
                >
                  <SelectTrigger className="h-9 w-44" aria-label="Update status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statuses.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button asChild size="sm" variant="outline">
                  <a
                    href={`mailto:${selected.email}?subject=Re: ${encodeURIComponent(selected.subject)}`}
                  >
                    Reply by email
                  </a>
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setConfirm(selected)}>
                  <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
                  Delete
                </Button>
              </div>
            </Panel>
          ) : null}
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete message?"
        description={`"${confirm?.subject ?? ""}" will be permanently removed from the inbox.`}
        onConfirm={() => confirm && remove(confirm)}
      />
    </AdminPage>
  );
}
