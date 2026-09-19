import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Bug,
  CalendarDays,
  ChartColumn,
  Package,
  RefreshCw,
  Trophy,
  Users,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AdminHeading,
  AdminPage,
  DataRow,
  Panel,
  StatTile,
  StatusPill,
} from "@/components/admin/ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { formatDate, useCms } from "@/lib/cms/store";
import { request } from "@/lib/playfab/admin-service";
import type { AdminAnalytics, AnalyticsSection } from "@/lib/playfab/analytics-types";

export const Route = createFileRoute("/admin/")({ component: AdminOverview });

function Bars({
  data,
  label,
  dates = false,
}: {
  data: { label: string; count: number }[];
  label: string;
  dates?: boolean;
}) {
  return (
    <figure className="min-w-0" aria-label={label}>
      <div className="h-64 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart
            data={data}
            accessibilityLayer
            margin={{ top: 12, right: 12, left: -20, bottom: 12 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              minTickGap={12}
              tickFormatter={(value) => (dates ? String(value).slice(5) : String(value))}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: "var(--secondary)" }}
              contentStyle={{
                background: "var(--card)",
                borderColor: "var(--border)",
                borderRadius: 10,
              }}
            />
            <Bar
              name="Count"
              dataKey="count"
              fill="#a77b43"
              radius={[5, 5, 0, 0]}
              maxBarSize={40}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">{label}</figcaption>
      <table className="sr-only">
        <caption>{label} data</caption>
        <thead>
          <tr>
            <th>Period or status</th>
            <th>Count</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.label}>
              <th>{row.label}</th>
              <td>{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
function Module<T>({
  section,
  loading,
  error,
  retry,
  children,
}: {
  section: AnalyticsSection<T> | undefined;
  loading: boolean;
  error: boolean;
  retry: () => void;
  children: (data: T) => React.ReactNode;
}) {
  if (loading || section?.status === "pending")
    return <LoadingState label="Loading backend analytics…" rows={3} />;
  if (error || !section || section.status === "error" || section.data === null)
    return <ErrorState title="Unable to load analytics." onRetry={retry} />;
  return <>{children(section.data)}</>;
}
function AdminOverview() {
  const q = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: () => request<AdminAnalytics>("analytics"),
    retry: false,
    staleTime: 30_000,
    refetchInterval: (result) => (result.state.data?.players.status === "pending" ? 5000 : 60_000),
  });
  const localRelease = useCms((s) => s.releases.find((r) => r.status === "current"));
  const data = q.data,
    players = data?.players.data,
    bugs = data?.bugs.data;
  const retry = () => {
    void q.refetch();
  };
  const shared = { loading: q.isPending, error: q.isError, retry };
  const playerValue = (value: number | null | undefined) =>
    q.isPending || data?.players.status === "pending"
      ? "Loading…"
      : q.isError
        ? "Not available"
        : (value?.toLocaleString() ?? "Not available");
  return (
    <AdminPage>
      <AdminHeading
        title="Admin Overview"
        description="Civil Craft management and game analytics at a glance."
        actions={
          <Button variant="outline" size="sm" disabled={q.isFetching} onClick={retry}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        }
        status={
          <StatusPill tone={data?.backend === "Connected" && !q.isError ? "ok" : "warn"}>
            {q.isPending
              ? "Checking backend"
              : q.isError
                ? "Unavailable"
                : (data?.backend ?? "Unavailable")}
          </StatusPill>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={Users}
          label="Total players"
          value={playerValue(players?.total)}
          hint="Complete All Players snapshot"
          to="/admin/players"
          linkLabel="View players"
        />
        <StatTile
          icon={Activity}
          label="Recently active"
          value={playerValue(players?.recentlyActive)}
          hint="Last login within 7 days of snapshot; not online presence"
        />
        <StatTile
          icon={Bug}
          label="Open bug reports"
          value={
            q.isPending ? "Loading…" : q.isError ? "Not available" : (bugs?.open ?? "Not available")
          }
          hint="New + Investigating · PlayFab-backed"
          to="/admin/bugs"
          linkLabel="Review reports"
          tone="gold"
        />
        <StatTile
          icon={Package}
          label="Current build"
          value="Not available"
          hint="No central release configuration; local settings below"
          to="/admin/releases"
          linkLabel="Manage release"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {players
          ? `Player snapshot: ${new Date(players.snapshotAt).toLocaleString()}. Cached for up to 15 minutes.`
          : "Player totals and trends appear only after the complete PlayFab snapshot is available."}
      </p>
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title="Player registrations" icon={CalendarDays} className="min-w-0">
          <Module section={data?.players} {...shared}>
            {(p) => (
              <>
                <p className="mb-3 text-xs text-muted-foreground">
                  Last 30 days · account creation dates · UTC
                </p>
                {p.registrations.some((row) => row.count > 0) ? (
                  <Bars
                    data={p.registrations}
                    dates
                    label="Player registrations over the last 30 days"
                  />
                ) : (
                  <EmptyState title="Not enough player history to display this chart yet." />
                )}
                {p.registrationUnknown > 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Creation date unavailable for {p.registrationUnknown} players; excluded from
                    chart.
                  </p>
                ) : null}
              </>
            )}
          </Module>
        </Panel>
        <Panel title="Player activity" icon={Activity} className="min-w-0">
          <Module section={data?.players} {...shared}>
            {(p) => (
              <>
                <p className="mb-3 text-xs text-muted-foreground">
                  Each account's last login, relative to the snapshot. Buckets do not overlap.
                </p>
                {p.total ? (
                  <Bars data={p.activity} label="Players grouped by last login" />
                ) : (
                  <EmptyState title="Not enough data yet." />
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  This is last-login recency, not a daily usage trend or live presence.
                </p>
              </>
            )}
          </Module>
        </Panel>
      </div>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Panel title="Bug reports by status" icon={Bug} className="min-w-0">
          <Module section={data?.bugs} {...shared}>
            {(b) =>
              b.counts.some((row) => row.count > 0) ? (
                <Bars data={b.counts} label="Bug reports by status" />
              ) : (
                <EmptyState
                  title="No bug reports yet."
                  description="Reports submitted by Civil Craft players will appear here."
                />
              )
            }
          </Module>
        </Panel>
        <Panel
          title="Top engineers"
          icon={Trophy}
          className="min-w-0"
          actions={
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/leaderboard">View leaderboard →</Link>
            </Button>
          }
        >
          <Module section={data?.leaderboard} {...shared}>
            {(rows) =>
              rows.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Top five engineers ranked by TotalScore</caption>
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="py-3">Rank</th>
                        <th>Engineer</th>
                        <th className="text-right">Engineering score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.playFabId} className="border-b border-border/60">
                          <td className="py-4 font-display">#{row.rank}</td>
                          <td>
                            <p className="font-semibold">{row.displayName}</p>
                            <p className="font-mono text-xs text-muted-foreground">
                              {row.playFabId}
                            </p>
                          </td>
                          <td className="text-right font-display">{row.score.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  title="No leaderboard records yet."
                  description="Scores recorded by Civil Craft will appear here."
                />
              )
            }
          </Module>
        </Panel>
      </div>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Panel title="Game progress" icon={ChartColumn}>
          <Module section={data?.players} {...shared}>
            {(p) => (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {p.progression.map((metric) => (
                    <div
                      key={metric.label}
                      className="rounded-lg border border-border bg-secondary/25 p-4"
                    >
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        {metric.label}
                      </p>
                      <p className="mt-2 font-display text-xl">
                        {metric.value?.toLocaleString(undefined, { maximumFractionDigits: 1 }) ??
                          "Not available"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {metric.available} of {p.total} accounts with recorded values
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Only recorded export statistics contribute. Missing values are excluded, not
                  treated as zero. Level is unavailable when the export omits game user data.
                </p>
              </>
            )}
          </Module>
        </Panel>
        <Panel title="Backend status" icon={Activity} tone="blueprint">
          <Link
            to="/admin/settings"
            search={{ tab: "integrations" }}
            className="mb-3 inline-block text-sm underline underline-offset-4"
          >
            Settings &rarr; Integrations
          </Link>
          {q.isPending ? (
            <LoadingState rows={3} />
          ) : q.isError ? (
            <ErrorState title="Unable to load backend status." onRetry={retry} />
          ) : (
            <>
              <DataRow
                tone="blueprint"
                label="Connection"
                value={data?.backend ?? "Not available"}
              />
              <DataRow tone="blueprint" label="Mode" value="Live" />
              <DataRow
                tone="blueprint"
                label="PlayFab Title ID"
                value={data?.titleId ?? "Not available"}
              />
              <DataRow
                tone="blueprint"
                label="Last checked"
                value={
                  data?.checkedAt ? new Date(data.checkedAt).toLocaleString() : "Not available"
                }
              />
              <p className="mt-4 text-xs opacity-75">
                Connection is checked by the server. A configured Title ID alone does not prove
                backend access.
              </p>
            </>
          )}
        </Panel>
      </div>
      <Panel
        title="Latest bug reports"
        icon={Bug}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/bugs">View reports →</Link>
          </Button>
        }
      >
        <Module section={data?.bugs} {...shared}>
          {(b) =>
            b.latest.length ? (
              <ul className="divide-y divide-border">
                {b.latest.map((report) => (
                  <li
                    key={report.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {report.player}{" "}
                        <span className="text-sm font-normal text-muted-foreground">
                          · {report.category}
                        </span>
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">{report.playFabId}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusPill tone={report.status === "New" ? "warn" : "info"}>
                        {report.status}
                      </StatusPill>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(report.createdAt)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No bug reports yet."
                description="Reports submitted by Civil Craft players will appear here."
              />
            )
          }
        </Module>
      </Panel>
      <Panel title="Local website configuration" icon={Package}>
        <p className="mb-4 text-sm text-muted-foreground">
          Release settings and website content are stored in this browser. They are not global game
          analytics or a verified deployed build.
        </p>
        <div className="grid gap-x-8 md:grid-cols-2">
          <div>
            <DataRow label="Local version" value={localRelease?.version ?? "Not available"} />
            <DataRow label="Local build number" value={localRelease?.build ?? "Not available"} />
          </div>
          <div>
            <DataRow
              label="Local minimum Android"
              value={localRelease?.minAndroid ?? "Not available"}
            />
            <DataRow
              label="Local release date"
              value={localRelease ? formatDate(localRelease.releaseDate) : "Not available"}
            />
          </div>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          News, gallery, FAQ, website action history, releases, settings and About content remain
          browser-local. Their counters and sample records are excluded from this overview. Economy
          analytics are omitted because no global transaction ledger is implemented.
        </p>
      </Panel>
    </AdminPage>
  );
}
