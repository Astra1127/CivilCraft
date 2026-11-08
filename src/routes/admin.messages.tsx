import { MessageConversation } from "@/components/common/MessageConversation";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Inbox, Mail, Star, Trash2, X } from "lucide-react";
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
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate, logActivity } from "@/lib/cms/store";
import type { ContactMessage, MessageStatus, TestimonialStatus } from "@/lib/cms/types";
import { messageService, useMessages } from "@/lib/cms/messages";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/messages")({
  component: AdminMessages,
});

const statuses: MessageStatus[] = ["New", "In Progress", "Resolved"];
const filters = ["All", ...statuses, "Testimonials"] as const;
type Filter = (typeof filters)[number];

const pillTone = (s: MessageStatus) => (s === "New" ? "warn" : s === "Resolved" ? "ok" : "info");

function AdminMessages() {
  const queryClient = useQueryClient();
  const query = useMessages();
  const messages = query.data?.messages ?? [];
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<Filter>("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ContactMessage | null>(null);

  const visible =
    filter === "All"
      ? messages
      : filter === "Testimonials"
        ? messages.filter((m) => m.allowPublicTestimonial)
        : messages.filter((m) => m.status === filter);
  const selected = visible.find((m) => m.id === selectedId) ?? visible[0] ?? null;

  const setStatus = async (message: ContactMessage, status: MessageStatus) => {
    setSaving(true);
    try {
      await messageService.change({ action: "status", id: message.id, status });
      logActivity({ area: "Messages", action: `Marked ${status}`, target: message.subject });
      await query.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update message.");
    } finally {
      setSaving(false);
    }
  };

  const setTestimonialStatus = async (message: ContactMessage, status: TestimonialStatus) => {
    setSaving(true);
    try {
      await messageService.change({ action: "testimonial_status", id: message.id, status });
      logActivity({
        area: "Messages",
        action: `Marked testimonial as ${status}`,
        target: message.subject,
      });
      toast.success(
        status === "Approved"
          ? "Testimonial approved for homepage display"
          : "Testimonial removed from homepage",
      );
      await Promise.all([
        query.refetch(),
        queryClient.invalidateQueries({ queryKey: ["public-testimonials"] }),
      ]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update testimonial moderation status.",
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (message: ContactMessage) => {
    if (saving) return;
    setSaving(true);
    try {
      await messageService.change({ action: "delete", id: message.id });
      logActivity({ area: "Messages", action: "Message deleted", target: message.subject });
      setConfirm(null);
      setSelectedId(null);
      toast.success("Message deleted");
      await query.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete message.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminPage>
      <AdminHeading
        title="Messages"
        description="Contact inquiries, player feedback, and homepage testimonials."
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
          Testimonials: messages.filter((m) => m.allowPublicTestimonial).length,
        }}
      />

      {query.isPending ? (
        <LoadingState label="Loading messages..." />
      ) : query.isError ? (
        <ErrorState description={query.error.message} onRetry={() => query.refetch()} />
      ) : visible.length === 0 ? (
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
                    <div className="mt-1 flex items-center justify-between gap-1 text-xs text-muted-foreground">
                      <span className="truncate">
                        {m.name} · {formatDate(m.createdAt)}
                      </span>
                      {m.rating ? (
                        <span className="flex items-center text-gold">
                          <Star className="mr-0.5 h-3 w-3 fill-gold" />
                          {m.rating}
                        </span>
                      ) : null}
                    </div>
                    {m.allowPublicTestimonial ? (
                      <span className="mt-1 inline-block text-[10px] font-semibold text-gold">
                        Testimonial Consent:{" "}
                        {m.testimonialStatus === "Approved"
                          ? "Approved"
                          : m.testimonialStatus === "Rejected"
                            ? "Declined"
                            : "Pending"}
                      </span>
                    ) : null}
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold">{selected.name}</p>
                  {selected.rating ? (
                    <div className="flex items-center gap-1 text-gold">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`h-4 w-4 ${
                            star <= (selected.rating ?? 0)
                              ? "fill-gold text-gold"
                              : "text-muted-foreground/30"
                          }`}
                        />
                      ))}
                      <span className="ml-1 text-xs font-bold text-foreground">
                        {selected.rating} / 5
                      </span>
                    </div>
                  ) : null}
                </div>
                {selected.ownerId && (
                  <p className="break-all text-xs text-muted-foreground">
                    Player: {selected.ownerId}
                  </p>
                )}
                <p className="text-muted-foreground">{selected.email || "No email attached"}</p>
                <p className="text-xs text-muted-foreground">
                  {selected.inquiryType} · {formatDate(selected.createdAt)}
                </p>
              </div>

              {/* Homepage Testimonial Moderation Card */}
              <div className="rounded-lg border border-border/80 bg-secondary/30 p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Homepage Testimonial Moderation
                    </p>
                    <p className="text-sm">
                      {selected.allowPublicTestimonial ? (
                        selected.testimonialStatus === "Approved" ? (
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            Approved — Visible on Homepage
                          </span>
                        ) : selected.testimonialStatus === "Rejected" ? (
                          <span className="font-semibold text-muted-foreground">
                            Rejected / Hidden from Homepage
                          </span>
                        ) : (
                          <span className="font-semibold text-gold">
                            Pending Moderator Decision
                          </span>
                        )
                      ) : (
                        <span className="text-muted-foreground">
                          Player has not granted permission for public testimonial.
                        </span>
                      )}
                    </p>
                  </div>
                  {selected.allowPublicTestimonial ? (
                    <StatusPill
                      tone={
                        selected.testimonialStatus === "Approved"
                          ? "ok"
                          : selected.testimonialStatus === "Rejected"
                            ? "info"
                            : "warn"
                      }
                    >
                      {selected.testimonialStatus ?? "Pending"}
                    </StatusPill>
                  ) : null}
                </div>

                {selected.allowPublicTestimonial ? (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="gold"
                      disabled={saving || selected.testimonialStatus === "Approved"}
                      onClick={() => setTestimonialStatus(selected, "Approved")}
                    >
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                      Approve for Homepage
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saving || selected.testimonialStatus === "Rejected"}
                      onClick={() => setTestimonialStatus(selected, "Rejected")}
                    >
                      <X className="mr-1.5 h-3.5 w-3.5" />
                      Remove from Homepage
                    </Button>
                  </div>
                ) : null}
              </div>

              <MessageConversation
                key={selected.id}
                message={selected}
                admin
                onReply={async (text) => {
                  const result = await messageService.change({
                    action: "reply",
                    id: selected.id,
                    message: text,
                  });
                  toast.success(
                    result.notificationStatus === "sent"
                      ? "Reply saved and email notification sent"
                      : "Reply saved; email notification unavailable",
                  );
                  await query.refetch();
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  disabled={saving}
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
                {selected.email ? (
                  <Button asChild size="sm" variant="outline">
                    <a
                      href={`mailto:${selected.email}?subject=Re: ${encodeURIComponent(selected.subject)}`}
                    >
                      Reply by email
                    </a>
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={saving}
                  onClick={() => setConfirm(selected)}
                >
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
