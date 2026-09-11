import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Receipt } from "lucide-react";
import { useState } from "react";
import { AdminHeading, AdminPage, FilterChips, Panel, StatusPill } from "@/components/admin/ui";
import { ErrorState, LoadingState } from "@/components/common/States";
import { EmptyState } from "@/components/common/States";
import { formatDate } from "@/lib/cms/store";
import { adminPlayerService, type Transaction } from "@/lib/playfab";

export const Route = createFileRoute("/admin/transactions")({
  component: AdminTransactions,
});

const filters = ["All", "purchase", "reward", "refund"] as const;
type Filter = (typeof filters)[number];

const tone = (s: Transaction["status"]) =>
  s === "completed" ? "ok" : s === "pending" ? "warn" : "off";

function amount(tx: Transaction) {
  if (tx.type === "reward" || tx.amount === 0) return "Reward";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: tx.currency }).format(
      tx.amount,
    );
  } catch {
    return `${tx.currency} ${tx.amount.toFixed(2)}`;
  }
}

function AdminTransactions() {
  const [filter, setFilter] = useState<Filter>("All");
  const query = useQuery({
    queryKey: ["admin", "transactions"],
    queryFn: () => adminPlayerService.getTransactions(),
  });

  const rows = (query.data ?? []).filter((t) => filter === "All" || t.type === filter);

  return (
    <AdminPage>
      <AdminHeading
        title="Transactions"
        description="Purchases and granted rewards recorded by the game backend. Read-only — the website never grants items or currency."
      />

      <FilterChips options={filters} value={filter} onChange={setFilter} />

      {query.isPending ? (
        <LoadingState rows={3} />
      ) : query.isError ? (
        <ErrorState
          description="Transaction history is unavailable until the game backend is connected."
          onRetry={() => query.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No transactions"
          description="Player purchases and rewards will appear here."
        />
      ) : (
        <Panel title="Recent activity" icon={Receipt} bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b-2 border-border bg-secondary/40 text-left">
                <tr className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="px-4 py-2">Item</th>
                  <th className="px-4 py-2">Player</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Amount</th>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.transactionId} className="border-b border-border/70 last:border-0">
                    <td className="px-4 py-2 font-bold">{t.itemName}</td>
                    <td className="px-4 py-2 text-muted-foreground">{t.playerId}</td>
                    <td className="px-4 py-2 capitalize text-muted-foreground">{t.type}</td>
                    <td className="px-4 py-2">{amount(t)}</td>
                    <td className="px-4 py-2 text-muted-foreground">{formatDate(t.createdAt)}</td>
                    <td className="px-4 py-2">
                      <StatusPill tone={tone(t.status)}>{t.status}</StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </AdminPage>
  );
}
