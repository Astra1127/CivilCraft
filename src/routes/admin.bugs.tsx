import { createFileRoute } from "@tanstack/react-router";
import { Bug } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { request } from "@/lib/playfab/admin-service";
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
import { formatDate } from "@/lib/cms/store";
import type { BugReport, BugStatus } from "@/lib/cms/types";

export const Route = createFileRoute("/admin/bugs")({
  component: AdminBugs,
});

const statuses: BugStatus[] = ["New", "Investigating", "Resolved", "Closed"];
const filters = ["All", ...statuses] as const;
type Filter = (typeof filters)[number];

const tone = (s: BugStatus) =>
  s === "New" ? "warn" : s === "Resolved" ? "ok" : s === "Closed" ? "off" : "info";

function AdminBugs() {
  const q = useQuery({
    queryKey: ["admin-bug-reports"],
    queryFn: () => request<BugReport[]>("bug-reports"),
    refetchInterval: 15000,
  });
  const bugs = q.data ?? [];
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>("All");
  const [confirm, setConfirm] = useState<BugReport | null>(null);

  const visible = filter === "All" ? bugs : bugs.filter((b) => b.status === filter);

  const mutate = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await request("bug-reports", body);
      setConfirm(null);
      toast.success("Saved. PlayFab updates may take up to a minute to appear.");
      await q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  };
  const setStatus = (bug: BugReport, status: BugStatus) => mutate({ id: bug.id, status });
  const remove = (bug: BugReport) => mutate({ id: bug.id, action: "delete" });

  return (
    <AdminPage>
      <AdminHeading
        title="Bug Reports"
        description="Issues submitted by players from the game and the player dashboard."
        status={
          <StatusPill tone={bugs.some((b) => b.status === "New") ? "warn" : "ok"}>
            {bugs.filter((b) => b.status === "New").length} new
          </StatusPill>
        }
      />

      <Button variant="outline" onClick={() => void q.refetch()}>
        Refresh
      </Button>
      <p className="text-xs text-muted-foreground">
        PlayFab updates may take up to a minute to appear.
      </p>
      <FilterChips
        options={filters}
        value={filter}
        onChange={setFilter}
        counts={Object.fromEntries(
          filters.map((f) => [
            f,
            f === "All" ? bugs.length : bugs.filter((b) => b.status === f).length,
          ]),
        )}
      />

      {q.isPending ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState onRetry={q.refetch} description={q.error.message} />
      ) : visible.length === 0 ? (
        <EmptyState
          title="No bug reports yet."
          description="Reports submitted by Civil Craft players will appear here."
        />
      ) : (
        <div className="space-y-3">
          {visible.map((b) => (
            <Panel key={b.id} title={b.category} icon={Bug}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-xs font-mono">Report ID: {b.id}</p>
                  <p className="text-sm">{b.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {b.player} · v{b.gameVersion} · {b.device} · {formatDate(b.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <StatusPill tone={tone(b.status)}>{b.status}</StatusPill>
                  <Select
                    disabled={busy}
                    value={b.status}
                    onValueChange={(v) => setStatus(b, v as BugStatus)}
                  >
                    <SelectTrigger className="h-8 w-[150px] text-xs">
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
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirm(b)}>
                    Delete
                  </Button>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete bug report?"
        description="This removes the report from the admin inbox."
        onConfirm={() => confirm && remove(confirm)}
      />
    </AdminPage>
  );
}
