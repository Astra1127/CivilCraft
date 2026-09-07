import { Crown, Medal, Search, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { DemoBadge } from "@/components/common/DemoBadge";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { leaderboardService, type LeaderboardEntry, type LeaderboardWindow } from "@/lib/playfab";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

const podiumIcon = [Crown, Trophy, Medal];

export function useLeaderboard(window: LeaderboardWindow) {
  return useQuery({
    queryKey: ["leaderboard", window],
    queryFn: () => leaderboardService.getLeaderboard(window),
    staleTime: 60_000,
  });
}

export function Podium({
  entries,
  highlightId,
}: {
  entries: LeaderboardEntry[];
  highlightId?: string | undefined;
}) {
  return (
    <ol className="grid gap-3 sm:grid-cols-3">
      {entries.slice(0, 3).map((e, i) => {
        const Icon = podiumIcon[i] ?? Trophy;
        return (
          <li
            key={e.playFabId}
            className={cn(
              "panel flex items-center gap-3 p-4",
              i === 0 && "border-gold/70 bg-gold/10 sm:order-2",
              i === 1 && "sm:order-1",
              i === 2 && "sm:order-3",
              highlightId === e.playFabId && "ring-2 ring-gold",
            )}
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gold/20 text-gold">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-display text-base">{e.displayName}</p>
              <p className="text-xs text-muted-foreground">
                Rank #{e.rank} · Level {e.level}
              </p>
              <p className="font-display text-lg">{e.score.toLocaleString()}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function LeaderboardView({
  highlightId,
  showPodium = true,
  compact = false,
}: {
  highlightId?: string | undefined;
  showPodium?: boolean;
  compact?: boolean;
}) {
  const [window, setWindow] = useState<LeaderboardWindow>("global");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const { data, isPending, isError, error, refetch } = useLeaderboard(window);

  const filtered = useMemo(() => {
    const list = data ?? [];
    if (!query.trim()) return list;
    return list.filter((e) => e.displayName.toLowerCase().includes(query.trim().toLowerCase()));
  }, [data, query]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
        <Tabs
          value={window}
          onValueChange={(v) => {
            setWindow(v as LeaderboardWindow);
            setPage(1);
          }}
        >
          <TabsList>
            <TabsTrigger value="global">Global</TabsTrigger>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <DemoBadge />
          <div className="relative min-w-0 flex-1 sm:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search player"
              aria-label="Search players"
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {isPending ? <LoadingState label="Loading leaderboard from the game backend…" rows={5} /> : null}

      {isError ? (
        <ErrorState
          title="Leaderboard unavailable"
          description={(error as Error)?.message}
          onRetry={() => void refetch()}
        />
      ) : null}

      {!isPending && !isError ? (
        filtered.length === 0 ? (
          <EmptyState title="No players found" description="Try a different search term." />
        ) : (
          <>
            {showPodium && !query ? <Podium entries={filtered} highlightId={highlightId} /> : null}

            {/* Desktop table */}
            <div className="panel hidden overflow-hidden md:block">
              <table className="w-full text-sm">
                <caption className="sr-only">Leaderboard rankings</caption>
                <thead className="bg-secondary/70 text-left">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-display">Rank</th>
                    <th scope="col" className="px-4 py-3 font-display">Player</th>
                    <th scope="col" className="px-4 py-3 font-display">Level</th>
                    <th scope="col" className="px-4 py-3 text-right font-display">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr
                      key={e.playFabId}
                      className={cn(
                        "border-t border-border",
                        highlightId === e.playFabId && "bg-gold/15 font-semibold",
                      )}
                    >
                      <td className="px-4 py-3">#{e.rank}</td>
                      <td className="px-4 py-3">{e.displayName}</td>
                      <td className="px-4 py-3">{e.level}</td>
                      <td className="px-4 py-3 text-right">{e.score.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="space-y-2 md:hidden">
              {rows.map((e) => (
                <li
                  key={e.playFabId}
                  className={cn(
                    "panel flex items-center justify-between gap-3 p-3",
                    highlightId === e.playFabId && "ring-2 ring-gold",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary font-display text-sm">
                      #{e.rank}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{e.displayName}</p>
                      <p className="text-xs text-muted-foreground">Level {e.level}</p>
                    </div>
                  </div>
                  <p className="shrink-0 font-display">{e.score.toLocaleString()}</p>
                </li>
              ))}
            </ul>

            {!compact && pages > 1 ? (
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={current === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {current} of {pages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={current === pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            ) : null}
          </>
        )
      ) : null}
    </div>
  );
}
