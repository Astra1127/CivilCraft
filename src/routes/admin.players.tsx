import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, Users } from "lucide-react";
import { useState } from "react";
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
import { adminPlayerService, getPlayFabStatus } from "@/lib/playfab";
import type { AccountStatus } from "@/lib/playfab/types";
import type { PlayerProfile } from "@/lib/playfab/types";

export const Route = createFileRoute("/admin/players")({
  component: AdminPlayers,
});

function AdminPlayers() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PlayerProfile | null>(null);
  const backend = getPlayFabStatus();

  const q = useQuery({
    queryKey: ["admin-players", query],
    queryFn: () => adminPlayerService.searchPlayers(query),
  });

  return (
    <AdminPage>
      <AdminHeading
        title="Players"
        description="Read-only directory of player accounts from the game backend."
        status={
          <StatusPill tone={backend.mode === "live" ? "ok" : "warn"}>
            {backend.mode === "live" ? "Live backend" : "Demo data"}
          </StatusPill>
        }
      />

      <Panel
        title="Player directory"
        icon={Users}
        bodyClassName="p-0"
        actions={
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or player ID"
              aria-label="Search players"
              className="h-8 w-56 pl-8 text-sm"
            />
          </div>
        }
      >
        {q.isPending ? (
          <div className="p-4">
            <LoadingState label="Searching players…" rows={4} />
          </div>
        ) : q.isError ? (
          <div className="p-4">
            <ErrorState onRetry={q.refetch} description={(q.error as Error).message} />
          </div>
        ) : q.data.length === 0 ? (
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
                  <TableHead className="text-right">Rank</TableHead>
                  <TableHead>Account status</TableHead>
                  <TableHead>Last active</TableHead>
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data.map((p) => (
                  <TableRow key={p.playFabId} className="text-sm">
                    <TableCell className="font-bold">{p.displayName}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {p.playFabId}
                    </TableCell>
                    <TableCell className="text-right">{p.level}</TableCell>
                    <TableCell className="text-right font-display">
                      {p.totalScore.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">{p.rank ? `#${p.rank}` : "—"}</TableCell>
                    <TableCell>
                      <AccountStatusBadge status={p.accountStatus ?? "active"} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(p.lastActive)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setSelected(p)}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      <IntegrationNotice>
        Player accounts live in the game backend. The website never creates, edits or deletes them.
      </IntegrationNotice>

      <PlayerRecordModal
        player={selected}
        onOpenChange={(o) => !o && setSelected(null)}
        moderationEnabled
        onModerate={async (status: AccountStatus, reason: string) => {
          if (!selected) return;
          await adminPlayerService.setAccountStatus(selected.playFabId, status, reason);
          setSelected({ ...selected, accountStatus: status });
          await q.refetch();
        }}
      />
    </AdminPage>
  );
}
