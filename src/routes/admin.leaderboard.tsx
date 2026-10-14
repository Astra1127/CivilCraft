import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminHeading, AdminPage, Panel } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { request } from "@/lib/playfab/admin-service";
import { LEADERBOARD_CONTRACTS, type LeaderboardContract } from "@/lib/playfab/leaderboard-shared";
import {
  parseLeaderboardVisibility,
  type LeaderboardVisibility,
} from "@/lib/playfab/leaderboard-visibility";

export const Route = createFileRoute("/admin/leaderboard")({
  component: AdminLeaderboardContracts,
});

export function AdminLeaderboardContracts() {
  const client = useQueryClient();
  const [draft, setDraft] = useState<LeaderboardContract[] | null>(null);
  const query = useQuery({
    queryKey: ["admin-leaderboard-contracts"],
    queryFn: async () => parseLeaderboardVisibility(await request("leaderboard-contracts")),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const selection = draft ?? query.data?.contractIds ?? [];
  const mutation = useMutation({
    mutationFn: async () =>
      parseLeaderboardVisibility(
        await request<LeaderboardVisibility>("leaderboard-contracts", {
          schemaVersion: 1,
          contractIds: selection,
        }),
      ),
    onSuccess: (data) => {
      client.setQueryData(["admin-leaderboard-contracts"], data);
      void client.invalidateQueries({ queryKey: ["leaderboard-contracts"] });
      void client.invalidateQueries({ queryKey: ["public-leaderboard"] });
      setDraft(null);
    },
  });
  const busy = query.isFetching || mutation.isPending;
  const dirty =
    !!query.data &&
    (selection.length !== query.data.contractIds.length ||
      selection.some((id) => !query.data.contractIds.includes(id)));
  return (
    <AdminPage>
      <AdminHeading
        title="Leaderboard Contracts"
        description="Choose which contracts appear in the website and in-game leaderboards."
      />
      <Panel title="Displayed contracts">
        <p className="mb-4 text-sm text-muted-foreground">
          Checked contracts appear in both ranking modes. Uncheck every contract to hide all
          contract rankings. Players see changes when they reopen or refresh leaderboards.
        </p>
        {query.isPending ? (
          <p role="status">Loading contracts…</p>
        ) : query.isError ? (
          <div role="alert" className="space-y-3">
            <p>Unable to load contract settings. Please try again.</p>
            <Button variant="outline" disabled={busy} onClick={() => void query.refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
              <legend className="sr-only">Show on leaderboard</legend>
              {LEADERBOARD_CONTRACTS.map((id) => (
                <label
                  key={id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-background p-4 text-sm font-bold"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={selection.includes(id)}
                    onChange={(event) => {
                      mutation.reset();
                      setDraft(
                        event.target.checked
                          ? [...selection, id]
                          : selection.filter((value) => value !== id),
                      );
                    }}
                  />
                  <span className="break-all">{id}</span>
                </label>
              ))}
            </fieldset>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted-foreground">
                {selection.length} of {LEADERBOARD_CONTRACTS.length} displayed
              </p>
              <Button variant="gold" disabled={busy || !dirty} onClick={() => mutation.mutate()}>
                {mutation.isPending ? "Saving…" : "Save contracts"}
              </Button>
              {mutation.isSuccess && !dirty && (
                <p role="status" className="text-sm">
                  Contract selection saved.
                </p>
              )}
            </div>
            {mutation.isError && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                Unable to save contract settings. Your selection is still here; please try again.
              </p>
            )}
          </>
        )}
      </Panel>
    </AdminPage>
  );
}
