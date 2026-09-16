import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { AdminHeading, AdminPage, Panel, StatusPill } from "@/components/admin/ui";
import {
  AccountStatusBadge,
  PlayerRecordModal,
  formatDate,
} from "@/components/admin/PlayerRecordModal";
import { IntegrationNotice } from "@/components/common/DemoBadge";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminPlayerService } from "@/lib/playfab";
import type { AdminPlayerDetail, PlayerSearchKind } from "@/lib/playfab/admin-types";
import { logActivity } from "@/lib/cms/store";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/players")({
  component: AdminPlayers,
});

import {
  directorySorts,
  defaultDirectoryOptions,
  type DirectoryOptions,
} from "@/lib/playfab/directory-filters";

function AdminPlayers() {
  const [filters, setFilters] = useState<DirectoryOptions>(defaultDirectoryOptions);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AdminPlayerDetail | null>(null);
  const [submitted, setSubmitted] = useState("");
  const [kind, setKind] = useState<PlayerSearchKind>("PlayFabId");
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(20);
  useEffect(() => {
    try {
      const saved = Number(sessionStorage.getItem("civilcraft.admin.directory.rows"));
      if ([10, 20, 50].includes(saved)) setPageSize(saved);
    } catch {
      /* preference only */
    }
  }, []);
  const [generation, setGeneration] = useState(0);
  const [page, setPage] = useState(0);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const cursor = snapshot;
  const [pollCursor, setPollCursor] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["admin-players", submitted, kind, cursor, generation, page, pageSize, filters],
    queryFn: () =>
      adminPlayerService.searchPlayers(
        submitted,
        kind,
        pollCursor ?? cursor,
        pageSize,
        page + 1,
        filters,
      ),
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (result) => (result.state.data?.pending ? 5000 : false),
  });

  useEffect(() => {
    if (q.data?.pending) setPollCursor(q.data.nextCursor);
    if (q.data?.snapshotCursor && !snapshot) setSnapshot(q.data.snapshotCursor);
  }, [q.data, snapshot]);
  const resetPage = () => {
    setPage(0);
    setSnapshot(null);
    setPollCursor(null);
  };
  const openPlayer = async (id: string) => {
    setLoadingId(id);
    try {
      setSelected(await adminPlayerService.getPlayer(id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Player data is unavailable.");
    } finally {
      setLoadingId(null);
    }
  };
  return (
    <AdminPage>
      <AdminHeading
        title="Players"
        description="Read-only directory of player accounts from the game backend."
        status={
          <StatusPill tone={q.isSuccess && !q.data.pending ? "ok" : "warn"}>
            {q.isError
              ? "Unavailable"
              : q.data?.pending
                ? "Preparing snapshot"
                : q.isSuccess
                  ? "Live backend"
                  : "Checking backend"}
          </StatusPill>
        }
      />

      <Panel
        title="Player directory"
        icon={Users}
        bodyClassName="p-0"
        actions={
          q.data?.totalPlayers !== undefined ? (
            <span className="text-xs font-semibold text-muted-foreground">
              {q.data.totalPlayers.toLocaleString()}{" "}
              {q.data.totalPlayers === 1 ? "player" : "players"}
            </span>
          ) : null
        }
      >
        <div className="space-y-3 border-b border-border p-4">
          <form
            className="grid min-w-0 grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center"
            onSubmit={(e) => {
              e.preventDefault();
              resetPage();
              setSubmitted(query.trim());
            }}
          >
            <select
              aria-label="Search identifier"
              className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-sm"
              value={kind}
              onChange={(e) => {
                resetPage();
                setSubmitted("");
                setKind(e.target.value as PlayerSearchKind);
              }}
            >
              <option value="PlayFabId">PlayFab ID</option>
              <option value="TitleDisplayName">Display name</option>
              <option value="Username">Username</option>
            </select>
            <div className="relative min-w-0 sm:flex-1">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter exact identifier"
                aria-label="Search players"
                className="h-8 w-full min-w-0 pl-8 text-sm"
              />
            </div>
            <Button size="sm" type="submit">
              Search
            </Button>
            <Button
              size="sm"
              type="button"
              variant="outline"
              onClick={() => {
                setQuery("");
                setSubmitted("");
                resetPage();
                setGeneration((v) => v + 1);
              }}
            >
              Directory
            </Button>
          </form>
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <label className="min-w-0">
              <select
                aria-label="Sort by"
                className="h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm sm:w-auto"
                value={filters.sort}
                onChange={(e) => {
                  resetPage();
                  setFilters((v) => ({ ...v, sort: e.target.value as DirectoryOptions["sort"] }));
                }}
              >
                {Object.entries(directorySorts).map(([value, label]) => (
                  <option key={value} value={value}>
                    Sort: {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0">
              <select
                aria-label="Activity"
                className="h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm sm:w-auto"
                value={filters.activity}
                onChange={(e) => {
                  resetPage();
                  setFilters((v) => ({
                    ...v,
                    activity: e.target.value as DirectoryOptions["activity"],
                  }));
                }}
              >
                <option value="all">Activity: All</option>
                <option value="recent">Activity: Recently Active</option>
                <option value="inactive">Activity: Inactive</option>
              </select>
            </label>
            <label className="min-w-0">
              <select
                aria-label="Account status"
                className="h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm sm:w-auto"
                value={filters.status}
                onChange={(e) => {
                  resetPage();
                  setFilters((v) => ({
                    ...v,
                    status: e.target.value as DirectoryOptions["status"],
                  }));
                }}
              >
                <option value="all">Status: All</option>
                <option value="active">Status: Active</option>
                <option value="banned">Status: Banned</option>
              </select>
            </label>
            {(filters.sort !== defaultDirectoryOptions.sort ||
              filters.activity !== defaultDirectoryOptions.activity ||
              filters.status !== defaultDirectoryOptions.status) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  resetPage();
                  setFilters(defaultDirectoryOptions);
                }}
              >
                Reset filters
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Recently Active: last login within 7 days. Inactive: over 30 days ago or never logged
            in. Account status indicates bans, not presence.
          </p>
        </div>
        {q.isPending || q.data?.pending ? (
          <div className="p-4">
            <LoadingState label="Loading real players…" rows={4} />
          </div>
        ) : q.isError ? (
          <div className="p-4">
            <ErrorState onRetry={q.refetch} description={(q.error as Error).message} />
          </div>
        ) : q.data.players.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No players found" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead>Player ID</TableHead>
                  <TableHead className="text-right">Level</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead>Account status</TableHead>
                  <TableHead>Last login</TableHead>
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data.players.map((p) => (
                  <TableRow key={p.playFabId} className="text-sm">
                    <TableCell className="font-bold">
                      {p.displayName ?? p.username ?? "Not available"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {p.playFabId}
                    </TableCell>
                    <TableCell className="text-right">{p.level ?? "\u2014"}</TableCell>
                    <TableCell className="text-right font-display">
                      {p.totalScore?.toLocaleString() ?? "\u2014"}
                    </TableCell>
                    <TableCell>
                      <AccountStatusBadge status={p.accountStatus} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(p.lastActive)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={loadingId !== null}
                        onClick={() => void openPlayer(p.playFabId)}
                      >
                        {loadingId === p.playFabId ? "Loading..." : "View"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <label className="flex items-center gap-2">
          Rows per page
          <select
            aria-label="Rows per page"
            className="rounded-md border border-input bg-background p-2"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              try {
                sessionStorage.setItem("civilcraft.admin.directory.rows", e.target.value);
              } catch {
                /* preference only */
              }
              setPage(0);
              setPollCursor(null);
            }}
          >
            {[10, 20, 50].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        {!q.isPending && !q.data?.pending && !q.isError ? (
          <p>
            {q.data?.players.length
              ? "Showing " +
                (page * pageSize + 1) +
                "\u2013" +
                (page * pageSize + q.data.players.length)
              : "Showing 0"}
            {q.data?.totalPlayers !== undefined
              ? " of " + q.data.totalPlayers + " players"
              : " matching players"}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {q.data?.snapshotAt
            ? "Directory snapshot: " + new Date(q.data.snapshotAt).toLocaleString()
            : "Exact identifier search"}
        </p>
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 0 || q.isFetching}
            onClick={() => {
              setPollCursor(null);
              setPage(page - 1);
            }}
          >
            Previous
          </Button>
          <span>
            Page {page + 1}
            {q.data?.totalPlayers !== undefined
              ? " of " + Math.max(1, Math.ceil(q.data.totalPlayers / pageSize))
              : ""}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={!q.data?.nextCursor || q.data.pending || q.isFetching}
            onClick={() => {
              setPollCursor(null);

              setPage(page + 1);
            }}
          >
            Next
          </Button>
        </div>
      </div>
      <IntegrationNotice>
        Search requires an exact PlayFab ID, display name, or username. Display-name lookup may be
        unavailable when the title allows duplicate names. The directory uses a 15-minute snapshot;
        open a record for current progression and ban status. No demo players are substituted.
      </IntegrationNotice>

      <PlayerRecordModal
        player={selected}
        onOpenChange={(o) => !o && setSelected(null)}
        moderationEnabled
        onModerate={async (status, reason, hours) => {
          if (!selected || !status) return;
          await adminPlayerService.moderate(
            selected.playFabId,
            status === "banned" ? "ban" : "unban",
            reason,
            hours,
          );
          logActivity({
            area: "System",
            action: status === "banned" ? "Player banned" : "Player bans revoked",
            target: selected.playFabId,
          });
          toast.success("Moderation applied. Refreshing the player record.");
          const id = selected.playFabId;
          setSelected(null);
          await openPlayer(id);
          await q.refetch();
        }}
      />
    </AdminPage>
  );
}
