import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { PlayerName } from "@/components/common/PlayerName";
import {
  DEFAULT_CONTRACT,
  DEFAULT_MODE,
  LEADERBOARD_CONTRACTS,
} from "@/lib/playfab/leaderboard-shared";
import type { LeaderboardContract, LeaderboardMode } from "@/lib/playfab/leaderboard-shared";
import { getPublicLeaderboard } from "@/lib/playfab/public-leaderboard";

export function PublicLeaderboard() {
  const [contract, setContract] = useState<LeaderboardContract>(DEFAULT_CONTRACT);
  const [mode, setMode] = useState<LeaderboardMode>(DEFAULT_MODE);
  return (
    <div className="space-y-6">
      <div className="panel flex flex-wrap gap-4 p-5">
        <label className="flex min-w-0 flex-col gap-2 text-sm font-bold">
          Contract
          <select
            className="max-w-full rounded-md border-2 border-border bg-card p-2"
            value={contract}
            onChange={(e) => setContract(e.target.value as LeaderboardContract)}
          >
            {LEADERBOARD_CONTRACTS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm font-bold">
          Ranking
          <select
            className="rounded-md border-2 border-border bg-card p-2"
            value={mode}
            onChange={(e) => setMode(e.target.value as LeaderboardMode)}
          >
            <option value="efficient">Most efficient</option>
            <option value="strongest">Strongest</option>
          </select>
        </label>
      </div>
      <Rankings key={`${contract}:${mode}`} contract={contract} mode={mode} />
    </div>
  );
}

function Rankings({ contract, mode }: { contract: LeaderboardContract; mode: LeaderboardMode }) {
  const [starts, setStarts] = useState([0]);
  const [version, setVersion] = useState<number>();
  const start = starts[starts.length - 1]!;
  const query = useQuery({
    queryKey: ["public-leaderboard", contract, mode, start, version],
    queryFn: () => getPublicLeaderboard(contract, mode, start, version),
  });
  return (
    <div className="panel min-w-0 p-5 sm:p-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl">All-time bridge rankings</h2>
        <Button
          variant="outline"
          disabled={query.isFetching}
          onClick={() => {
            if (start === 0 && version === undefined) void query.refetch();
            else {
              setStarts([0]);
              setVersion(undefined);
            }
          }}
        >
          Refresh
        </Button>
      </div>
      <p className="mb-5 text-sm text-muted-foreground">
        {mode === "efficient"
          ? "Ranked by lower construction cost, then lower peak stress."
          : "Ranked by lower peak stress, then lower construction cost."}
      </p>
      {query.isPending ? (
        <p role="status">Loading rankings…</p>
      ) : query.isError ? (
        <p role="alert">Unable to load the leaderboard. Please try Refresh.</p>
      ) : !query.data.entries.length ? (
        <p>No bridge rankings recorded for this contract yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b-2 border-border">
                {["Rank", "Player", "Construction cost", "Peak stress"].map((title) => (
                  <th key={title} scope="col" className="px-3 py-3">
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {query.data.entries.map((entry) => (
                <tr key={entry.rank} className="border-b border-border">
                  <td className="px-3 py-4 font-bold">{entry.rank}</td>
                  <td className="max-w-48 break-words px-3 py-4">
                    <PlayerName name={entry.displayName} />
                  </td>
                  <td className="px-3 py-4">{entry.cost.toLocaleString()}</td>
                  <td className="px-3 py-4">{entry.peakStress.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="outline"
          disabled={starts.length === 1 || query.isFetching}
          onClick={() => setStarts((pages) => pages.slice(0, -1))}
        >
          Previous
        </Button>
        <span className="text-sm">Page {starts.length}</span>
        <Button
          variant="outline"
          disabled={query.isFetching || query.isError || query.data?.nextStart == null}
          onClick={() => {
            if (query.data?.nextStart == null) return;
            const nextStart = query.data.nextStart;
            setVersion(query.data.version ?? undefined);
            setStarts((pages) => [...pages, nextStart]);
          }}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
