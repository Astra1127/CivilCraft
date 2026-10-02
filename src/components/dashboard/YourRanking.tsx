import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { getOwnStanding } from "@/lib/playfab/leaderboard";
import {
  DEFAULT_CONTRACT,
  DEFAULT_MODE,
  LEADERBOARD_CONTRACTS,
} from "@/lib/playfab/leaderboard-shared";
import type { LeaderboardContract, LeaderboardMode } from "@/lib/playfab/leaderboard-shared";
import { Button } from "@/components/ui/button";

export function YourRanking() {
  const { player, isAuthenticated } = useAuth();
  const [contract, setContract] = useState<LeaderboardContract>(DEFAULT_CONTRACT);
  const [mode, setMode] = useState<LeaderboardMode>(DEFAULT_MODE);
  const ranking = useQuery({
    queryKey: ["player-standing", player?.playFabId, contract, mode],
    queryFn: () => getOwnStanding(contract, mode),
    enabled: isAuthenticated && !!player?.playFabId,
    refetchOnMount: "always",
  });
  return (
    <section className="panel space-y-5 p-6" aria-labelledby="your-ranking-title">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="your-ranking-title" className="text-xl">
          Your Ranking
        </h2>
        <div className="flex max-w-full flex-wrap gap-3">
          <label className="flex min-w-0 flex-col gap-1 text-xs font-bold">
            Contract
            <select
              className="max-w-full rounded-md border-2 border-border bg-card p-2 text-sm"
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
          <label className="flex flex-col gap-1 text-xs font-bold">
            Ranking
            <select
              className="rounded-md border-2 border-border bg-card p-2 text-sm"
              value={mode}
              onChange={(e) => setMode(e.target.value as LeaderboardMode)}
            >
              <option value="efficient">Most efficient</option>
              <option value="strongest">Strongest</option>
            </select>
          </label>
        </div>
      </div>
      {ranking.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading ranking…
        </p>
      ) : ranking.isError ? (
        <div role="alert" className="space-y-3">
          <p className="text-sm text-muted-foreground">Ranking currently unavailable.</p>
          <Button variant="outline" size="sm" onClick={() => void ranking.refetch()}>
            Retry
          </Button>
        </div>
      ) : ranking.data === null ? (
        <div>
          <p className="font-bold">Not ranked yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            No leaderboard ranking is available for this player on the selected contract and ranking
            mode yet.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-3 sm:items-center">
          <div>
            <p className="font-display text-4xl text-gold">#{ranking.data.rank}</p>
            <p className="mt-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Rank across players
            </p>
          </div>
          <div>
            <p className="text-xs font-bold text-muted-foreground">Construction Cost</p>
            <p className="mt-1 font-display text-xl">₱{ranking.data.cost.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-muted-foreground">Peak Stress</p>
            <p className="mt-1 font-display text-xl">{ranking.data.peakStress.toFixed(1)}%</p>
          </div>
        </div>
      )}
      <Button asChild variant="outline" size="sm">
        <Link to="/leaderboard">View Full Leaderboard →</Link>
      </Button>
    </section>
  );
}
