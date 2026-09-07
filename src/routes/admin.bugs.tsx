import { createFileRoute } from "@tanstack/react-router";
import { Bug } from "lucide-react";
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
  const bugs = useCms((s) => s.bugs);
  const [filter, setFilter] = useState<Filter>("All");
  const [confirm, setConfirm] = useState<BugReport | null>(null);

  const visible = filter === "All" ? bugs : bugs.filter((b) => b.status === filter);

  const setStatus = (bug: BugReport, status: BugStatus) => {
    setCmsState((prev) => ({
      ...prev,
      bugs: prev.bugs.map((b) => (b.id === bug.id ? { ...b, status } : b)),
    }));
    logActivity({ area: "Messages", action: `Bug marked ${status}`, target: bug.category });
  };

  const remove = (bug: BugReport) => {
    setCmsState((prev) => ({ ...prev, bugs: prev.bugs.filter((b) => b.id !== bug.id) }));
    logActivity({ area: "Messages", action: "Bug report deleted", target: bug.category });
    setConfirm(null);
    toast.success("Bug report deleted");
  };

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

      {visible.length === 0 ? (
        <EmptyState
          title="No bug reports"
          description="Reports submitted by players will land here."
        />
      ) : (
        <div className="space-y-3">
          {visible.map((b) => (
            <Panel key={b.id} title={b.category} icon={Bug}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm">{b.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {b.player} · v{b.gameVersion} · {b.device} · {formatDate(b.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <StatusPill tone={tone(b.status)}>{b.status}</StatusPill>
                  <Select value={b.status} onValueChange={(v) => setStatus(b, v as BugStatus)}>
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
                  <Button variant="outline" size="sm" onClick={() => setConfirm(b)}>
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
