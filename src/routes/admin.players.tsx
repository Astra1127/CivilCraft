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

function AdminPlayers() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AdminPlayerDetail | null>(null);
  const [submitted, setSubmitted] = useState("");
  const [kind, setKind] = useState<PlayerSearchKind>("PlayFabId");
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [page, setPage] = useState(0);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const cursor = cursors[page] ?? null;
  const [pollCursor, setPollCursor] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["admin-players", submitted, kind, cursor],
    queryFn: () => adminPlayerService.searchPlayers(submitted, kind, pollCursor ?? cursor),
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (result) => (result.state.data?.pending ? 5000 : false),
  });

  useEffect(() => {
    if (q.data?.pending) setPollCursor(q.data.nextCursor);
  }, [q.data]);
  const resetPage = () => {
    setPage(0);
    setCursors([null]);
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
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              resetPage();
              setSubmitted(query.trim());
            }}
          >
            <select
              aria-label="Search identifier"
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
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
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter exact identifier"
                aria-label="Search players"
                className="h-8 w-56 pl-8 text-sm"
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
                void q.refetch();
              }}
            >
              Directory
            </Button>
          </form>
        }
      >
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
                  <TableHead>Last active</TableHead>
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
          <span>Page {page + 1}</span>
          <Button
            size="sm"
            variant="outline"
            disabled={!q.data?.nextCursor || q.data.pending || q.isFetching}
            onClick={() => {
              setPollCursor(null);
              setCursors([...cursors.slice(0, page + 1), q.data!.nextCursor]);
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
