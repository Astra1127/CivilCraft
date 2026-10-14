import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RefreshCw, Receipt, Info } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { AdminHeading, AdminPage, Panel, StatusPill } from "@/components/admin/ui";
import { ErrorState, LoadingState, EmptyState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { adminPlayerService } from "@/lib/playfab";
import {
  filterTransactions,
  transactionCharts,
  simulatedRevenue,
} from "@/lib/payments/admin-transactions";

export const Route = createFileRoute("/admin/transactions")({ component: AdminTransactions });
const colors = ["#54845d", "#c78a40", "#a19b90", "#bd652d"];
const tone = (s: string) =>
  s === "Credited" || s === "Completed"
    ? "ok"
    : s === "Pending" || s === "Needs review"
      ? "warn"
      : "off";
const date = (value: string | null) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString(undefined, { timeZone: "UTC" }) + " UTC"
    : "—";
function price(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value}`;
  }
}

function AdminTransactions() {
  const [search, setSearch] = useState("");
  const [currency, setCurrency] = useState("All");
  const [status, setStatus] = useState("All");
  const [days, setDays] = useState(30);
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ["admin", "transactions", "simulation"],
    queryFn: () => adminPlayerService.getTransactions(),
  });
  const rows = filterTransactions(query.data?.records ?? [], search, currency, status, days);
  const charts = transactionCharts(rows);
  const revenue = simulatedRevenue(rows);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(rows.length / 20) - 1));
  const selectClass = "rounded-xl border-2 border-border bg-card px-3 py-2 text-sm";
  const totals = [
    ["Total orders", rows.length],
    ["Credited", rows.filter((r) => r.delivery === "Credited").length],
    ["Pending checkout", rows.filter((r) => r.checkout === "Pending").length],
    ["Needs review", rows.filter((r) => r.delivery === "Needs review").length],
  ];
  return (
    <AdminPage>
      <AdminHeading
        title="Simulated Transactions"
        description="Track simulated checkouts and delivery of game currency."
        actions={
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        }
      />
      <div className="flex items-center gap-3 rounded-xl border border-gold/50 bg-gold/10 p-3 text-sm">
        <Info className="h-5 w-5 shrink-0" />
        <span>
          <strong>Simulation only — no real money is charged.</strong> Read-only purchase records;
          this page cannot grant currency.
        </span>
      </div>
      {query.isPending ? (
        <LoadingState label="Loading simulated transactions…" rows={3} />
      ) : query.isError ? (
        <ErrorState
          title="Unable to load transactions"
          description="Purchase records could not be retrieved. Totals are unavailable, not zero."
          onRetry={() => void query.refetch()}
        />
      ) : !query.data.configured ? (
        <ErrorState title="Administrative access is not configured." />
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <input
              className={`${selectClass} min-w-0 flex-1`}
              aria-label="Search transactions"
              placeholder="Search PlayFab ID, order or reference"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
            <select
              className={selectClass}
              aria-label="Currency"
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value);
                setPage(0);
              }}
            >
              <option value="All">All currencies</option>
              <option value="CO">Coins</option>
              <option value="DI">Diamonds</option>
            </select>
            <select
              className={selectClass}
              aria-label="Transaction status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(0);
              }}
            >
              {[
                "All",
                "Completed",
                "Pending",
                "Failed",
                "Cancelled",
                "Credited",
                "Not credited",
                "Needs review",
              ].map((s) => (
                <option key={s} value={s}>
                  {s === "All" ? "All statuses" : s}
                </option>
              ))}
            </select>
            <select
              className={selectClass}
              aria-label="Date range"
              value={days}
              onChange={(e) => {
                setDays(Number(e.target.value));
                setPage(0);
              }}
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={0}>All time</option>
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            Filters use order creation dates in UTC. Charts summarize matching orders. Players are
            identified by their recorded PlayFab ID.
          </p>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {totals.map(([label, count]) => (
              <Panel key={label} bodyClassName="p-4">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-1 font-display text-3xl">{count}</p>
              </Panel>
            ))}
          </div>
          <Panel bodyClassName="p-4 sm:p-5">
            <p className="text-sm font-semibold text-muted-foreground">Total simulated revenue</p>
            <p className="mt-1 break-words font-display text-3xl" aria-live="polite">
              {revenue === null
                ? "Unavailable"
                : revenue.length
                  ? revenue.map((total) => price(total.amount, total.currency)).join(" · ")
                  : price(0, "PHP")}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Test money only — no real income. Gross value of completed checkouts matching the
              filters, including paid orders awaiting delivery. Unpaid checkouts are excluded.
              Select All time and clear other filters for the full history.
            </p>
          </Panel>
          {rows.length === 0 ? (
            <EmptyState
              title="No matching transactions"
              description="Try another date range or clear the filters. Only recorded website purchases appear here."
            />
          ) : (
            <>
              <div className="grid gap-4 xl:grid-cols-3">
                <Panel title="Completed checkouts by day">
                  <p className="mb-2 text-xs text-muted-foreground">
                    Payment date (UTC); count, not revenue.
                  </p>
                  <div
                    className="h-48"
                    role="img"
                    aria-label={
                      charts.daily.map((d) => `${d.date}: ${d.orders}`).join("; ") ||
                      "No completed checkouts"
                    }
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={charts.daily}>
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis allowDecimals={false} width={25} />
                        <Tooltip />
                        <Line
                          type="linear"
                          dataKey="orders"
                          stroke="#b67b37"
                          strokeWidth={3}
                          dot={{ r: 4 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>
                <Panel title="Coins vs Diamonds">
                  <p className="mb-2 text-xs text-muted-foreground">
                    Completed package purchases, not currency units.
                  </p>
                  <div
                    className="h-48"
                    role="img"
                    aria-label={charts.packages.map((d) => `${d.name}: ${d.orders}`).join("; ")}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={charts.packages}>
                        <XAxis dataKey="name" />
                        <YAxis allowDecimals={false} width={25} />
                        <Tooltip />
                        <Bar dataKey="orders" fill="#c78a40" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>
                <Panel title="Delivery status">
                  <div
                    className="h-36"
                    role="img"
                    aria-label={charts.delivery.map((d) => `${d.name}: ${d.orders}`).join("; ")}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={charts.delivery}
                          dataKey="orders"
                          nameKey="name"
                          innerRadius={35}
                          outerRadius={60}
                        >
                          {charts.delivery.map((d, i) => (
                            <Cell key={d.name} fill={colors[i]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {charts.delivery.map((d, i) => (
                      <span key={d.name}>
                        <span style={{ color: colors[i] }}>●</span> {d.name}: {d.orders}
                      </span>
                    ))}
                  </div>
                </Panel>
              </div>
              <Panel title="Purchase records" icon={Receipt} bodyClassName="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[950px] text-left text-sm">
                    <thead className="border-b bg-secondary/40 text-xs uppercase">
                      <tr>
                        {[
                          "Player / order",
                          "Package",
                          "Simulated price",
                          "Checkout",
                          "Delivery",
                          "Created",
                          "Details",
                        ].map((h) => (
                          <th key={h} className="p-3">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(currentPage * 20, currentPage * 20 + 20).map((r) => (
                        <tr key={r.orderId} className="border-b border-border/60 align-top">
                          <td className="p-3">
                            <div className="font-mono text-xs">{r.playerId}</div>
                            <div className="mt-1 max-w-48 break-all text-xs text-muted-foreground">
                              {r.orderId}
                            </div>
                          </td>
                          <td className="p-3 font-bold">
                            {r.rewardAmount.toLocaleString()}{" "}
                            {r.rewardCurrency === "DI" ? "Diamonds" : "Coins"}
                          </td>
                          <td className="p-3">{price(r.price, r.currency)}</td>
                          <td className="p-3">
                            <StatusPill tone={tone(r.checkout)}>{r.checkout}</StatusPill>
                          </td>
                          <td className="p-3">
                            <StatusPill tone={tone(r.delivery)}>{r.delivery}</StatusPill>
                          </td>
                          <td className="p-3 text-xs">{date(r.createdAt)}</td>
                          <td className="p-3">
                            <details className="max-w-60">
                              <summary className="cursor-pointer font-bold">View</summary>
                              <dl className="mt-2 space-y-2 break-all text-xs">
                                <dt>Reference</dt>
                                <dd>{r.reference || "—"}</dd>
                                <dt>Product</dt>
                                <dd>{r.productId}</dd>
                                <dt>Payment completed</dt>
                                <dd>{date(r.paidAt)}</dd>
                                <dt>Delivery recorded</dt>
                                <dd>{date(r.fulfilledAt)}</dd>
                              </dl>
                              {r.issue && <p className="mt-2 text-xs">{r.issue}</p>}
                            </details>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between gap-2 p-3 text-xs">
                  <span>
                    Showing {currentPage * 20 + 1}–{Math.min((currentPage + 1) * 20, rows.length)}{" "}
                    of {rows.length}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      disabled={currentPage === 0}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      disabled={(currentPage + 1) * 20 >= rows.length}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </Panel>
            </>
          )}
          <p className="text-xs text-muted-foreground">
            Delivery statuses reflect stored order records, not a new wallet audit. Cancelled or
            failed checkout is not a refund. No manual credit, deletion or payment controls are
            available here.
          </p>
        </>
      )}
    </AdminPage>
  );
}
