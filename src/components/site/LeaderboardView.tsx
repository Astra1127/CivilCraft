import { Crown, Medal, Search, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useQuery } from "@tanstack/react-query";
import { leaderboardService, type LeaderboardEntry } from "@/lib/playfab";
import { cn } from "@/lib/utils";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LeaderboardPeriod } from "@/lib/playfab/leaderboard-shared";
import { LEADERBOARD_PAGE_SIZE, LEADERBOARD_VIEWS } from "@/lib/playfab/leaderboard-shared";

const podiumIcon = [Crown, Trophy, Medal];

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
                Rank #{e.rank} · Level {e.level ?? "\u2014"}
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
  admin = false,
}: {
  highlightId?: string | undefined;
  showPodium?: boolean;
  compact?: boolean;
  admin?: boolean;
}) {
  const [period, setPeriod] = useState<LeaderboardPeriod>("weekly");
  const [pageSize, setPageSize] = useState(LEADERBOARD_PAGE_SIZE);
  const [version, setVersion] = useState<number | undefined>();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: [
      "canonical-leaderboard",
      admin ? "admin" : highlightId,
      page,
      version,
      refreshKey,
      period,
      pageSize,
    ],
    queryFn: () =>
      leaderboardService.getLeaderboard((page - 1) * pageSize, version, admin, period, pageSize),
    staleTime: 0,
  });
  useEffect(() => {
    if (data && data.version !== null && version === undefined) setVersion(data.version);
  }, [data, version]);
  const mine = useQuery({
    queryKey: ["canonical-leaderboard-rank", highlightId, version, refreshKey, period],
    queryFn: () => leaderboardService.getPlayerRank(highlightId!, version, period),
    enabled: !admin && !!highlightId && period === "all-time" && version !== undefined,
    staleTime: 0,
  });

  const filtered = useMemo(() => {
    const list = data?.entries ?? [];
    if (!query.trim()) return list;
    return list.filter((e) => e.displayName.toLowerCase().includes(query.trim().toLowerCase()));
  }, [data, query]);

  const current = page;
  const rows = filtered;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
        <Tabs
          value={period}
          onValueChange={(value) => {
            setPeriod(value as LeaderboardPeriod);
            setPage(1);
            setVersion(undefined);
            setQuery("");
          }}
        >
          <TabsList>
            {LEADERBOARD_VIEWS.map((view) => (
              <TabsTrigger key={view.id} value={view.id}>
                {view.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={isFetching}
            onClick={() => {
              setPage(1);
              setVersion(undefined);
              setRefreshKey((v) => v + 1);
            }}
          >
            Refresh
          </Button>
          <div className="relative min-w-0 flex-1 sm:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
              placeholder="Filter this page"
              aria-label="Filter players on this page"
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {!admin && highlightId ? (
        <p className="text-sm">
          {period === "weekly" ? "Weekly Rank" : "All-Time Rank"}:{" "}
          {isPending || mine.isFetching
            ? "Loading..."
            : !mine.isError && mine.data
              ? "#" + mine.data.rank
              : "Not available"}
        </p>
      ) : null}
      {isPending ? (
        <LoadingState label="Loading leaderboard from the game backend…" rows={5} />
      ) : null}

      {isError ? (
        <ErrorState
          title="Unable to load the leaderboard."
          description={(error as Error)?.message}
          onRetry={() => void refetch()}
        />
      ) : null}

      {!isPending && !isError ? (
        filtered.length === 0 ? (
          <EmptyState
            title={
              query
                ? "No matching players on this page."
                : period === "weekly"
                  ? "Weekly rankings are unavailable."
                  : "No all-time leaderboard records yet."
            }
            description={
              query
                ? "Try another filter."
                : period === "weekly"
                  ? "Choose All-Time to view recorded engineering scores."
                  : "Engineering scores recorded by Civil Craft will appear here."
            }
          />
        ) : (
          <>
            {showPodium && current === 1 && !query ? (
              <Podium entries={filtered} highlightId={highlightId} />
            ) : null}

            {/* Desktop table */}
            <div className="panel hidden overflow-hidden md:block">
              <table className="w-full text-sm">
                <caption className="sr-only">Leaderboard rankings</caption>
                <thead className="bg-secondary/70 text-left">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-display">
                      Rank
                    </th>
                    <th scope="col" className="px-4 py-3 font-display">
                      Engineer
                    </th>
                    <th scope="col" className="px-4 py-3 font-display">
                      Level
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-display">
                      Engineering Score
                    </th>
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
                      <td className="px-4 py-3">
                        {e.displayName}
                        <span className="block font-mono text-xs text-muted-foreground">
                          {e.playFabId}
                        </span>
                      </td>
                      <td className="px-4 py-3">{e.level ?? "\u2014"}</td>
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
                      <p className="text-xs text-muted-foreground">Level {e.level ?? "\u2014"}</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {e.playFabId}
                      </p>
                    </div>
                  </div>
                  <p className="shrink-0 font-display">{e.score.toLocaleString()}</p>
                </li>
              ))}
            </ul>
          </>
        )
      ) : null}
      {!compact && !isPending && !isError ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            Entries per page
            <select
              aria-label="Entries per page"
              className="rounded-md border border-input bg-background p-2"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {[10, 20, 50].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          {data?.entries.length ? (
            <span className="text-sm text-muted-foreground">
              Showing {(page - 1) * pageSize + 1} - {(page - 1) * pageSize + data.entries.length}
            </span>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            disabled={current === 1 || isFetching}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {current}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={!data?.nextStart || isFetching}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
