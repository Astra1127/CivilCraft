import { useQuery } from "@tanstack/react-query";
import { PlayerName } from "@/components/common/PlayerName";
import { Button } from "@/components/ui/button";
import { getPublicMultiplayerLeaderboard } from "@/lib/playfab/public-leaderboard";

export function MultiplayerLeaderboard() {
  const query = useQuery({
    queryKey: ["public-multiplayer-leaderboard"],
    queryFn: getPublicMultiplayerLeaderboard,
  });
  return (
    <div className="panel min-w-0 p-5 sm:p-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl">Top 15 multiplayer engineers</h2>
        <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
          Refresh
        </Button>
      </div>
      <p className="mb-5 text-sm text-muted-foreground">
        Ranked by total wins, matching the in-game multiplayer leaderboard. Win rate excludes draws.
      </p>
      {query.isPending ? (
        <p role="status">Loading multiplayer rankings…</p>
      ) : query.isError ? (
        <p role="alert">Unable to load multiplayer rankings. Please try Refresh.</p>
      ) : !query.data.entries.length ? (
        <p>No multiplayer results recorded yet. Complete a multiplayer match in Civil Craft.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b-2 border-border">
                {["Rank", "Player", "Wins", "Losses", "Draws", "Win rate"].map((title) => (
                  <th key={title} scope="col" className="px-3 py-3">
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {query.data.entries.map((entry) => {
                const decided = entry.wins + entry.losses;
                return (
                  <tr key={entry.rank} className="border-b border-border">
                    <td className="px-3 py-4 font-bold">{entry.rank}</td>
                    <td className="max-w-48 break-words px-3 py-4">
                      <PlayerName name={entry.displayName} />
                    </td>
                    <td className="px-3 py-4">{entry.wins.toLocaleString()}</td>
                    <td className="px-3 py-4">{entry.losses.toLocaleString()}</td>
                    <td className="px-3 py-4">{entry.draws.toLocaleString()}</td>
                    <td className="px-3 py-4">
                      {decided ? `${((entry.wins / decided) * 100).toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
