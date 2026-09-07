import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  HelpCircle,
  Image,
  Inbox,
  Mail,
  Newspaper,
  Package,
  Plus,
  Upload,
} from "lucide-react";
import {
  AdminHeading,
  AdminPage,
  DataRow,
  Panel,
  SectionLabel,
  StatTile,
  StatusPill,
} from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { formatDate, useCms } from "@/lib/cms/store";
import { getPlayFabStatus } from "@/lib/playfab";

export const Route = createFileRoute("/admin/")({
  component: AdminOverview,
});

function AdminOverview() {
  const cms = useCms((s) => s);
  const backend = getPlayFabStatus();

  const published = cms.news.filter((n) => n.status === "published").length;
  const drafts = cms.news.filter((n) => n.status === "draft").length;
  const unread = cms.messages.filter((m) => m.status === "New").length;
  const current = cms.releases.find((r) => r.status === "current");
  const activity = cms.activity ?? [];

  return (
    <AdminPage>
      <AdminHeading
        title="Admin Overview"
        description="Civil Craft management status at a glance."
        status={<StatusPill tone="ok">Website online</StatusPill>}
      />

      {/* Quick actions — compact, not giant cards */}
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="gold">
          <Link to="/admin/news">
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            New article
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/admin/gallery">
            <Image className="mr-1 h-4 w-4" aria-hidden="true" />
            Add gallery item
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/admin/faq">
            <HelpCircle className="mr-1 h-4 w-4" aria-hidden="true" />
            Add FAQ
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/admin/releases">
            <Upload className="mr-1 h-4 w-4" aria-hidden="true" />
            Manage build
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={Newspaper}
          label="News"
          value={`${published} published`}
          hint={`${drafts} draft${drafts === 1 ? "" : "s"}`}
          to="/admin/news"
        />
        <StatTile
          icon={Image}
          label="Gallery"
          value={cms.gallery.length}
          hint={`${cms.gallery.filter((g) => g.visible).length} visible publicly`}
          to="/admin/gallery"
        />
        <StatTile
          icon={Mail}
          label="Messages"
          value={`${unread} new`}
          hint={`${cms.messages.length} total`}
          to="/admin/messages"
          tone={unread > 0 ? "gold" : "cream"}
        />
        <StatTile
          icon={Package}
          label="Current build"
          value={current ? `v${current.version}` : "—"}
          hint={current ? `Build ${current.build} · Android ${current.minAndroid}+` : "No current release"}
          to="/admin/releases"
        />
      </div>

      {/* Website management status */}
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        <Panel title="Content" icon={Newspaper} bodyClassName="p-3">
          <DataRow label="Published news" value={published} />
          <DataRow label="Draft articles" value={drafts} />
          <DataRow label="Gallery items" value={cms.gallery.length} />
          <DataRow label="FAQ entries" value={cms.faq.length} />
        </Panel>

        <Panel title="Communication" icon={Mail} bodyClassName="p-3">
          <DataRow label="Unread messages" value={unread} />
          <DataRow
            label="In progress"
            value={cms.messages.filter((m) => m.status === "In Progress").length}
          />
          <DataRow
            label="Resolved"
            value={cms.messages.filter((m) => m.status === "Resolved").length}
          />
          <DataRow label="Total messages" value={cms.messages.length} />
        </Panel>

        <Panel title="Game" icon={Package} tone="blueprint" bodyClassName="p-3">
          <DataRow tone="blueprint" label="Current version" value={current?.version ?? "—"} />
          <DataRow tone="blueprint" label="Build number" value={current?.build ?? "—"} />
          <DataRow tone="blueprint" label="Minimum Android" value={current?.minAndroid ?? "—"} />
          <DataRow
            tone="blueprint"
            label="Release date"
            value={current ? formatDate(current.releaseDate) : "—"}
          />
        </Panel>

        <Panel title="Backend" icon={Activity} tone="blueprint" bodyClassName="p-3">
          <div className="pb-2">
            <StatusPill tone={backend.configured ? "ok" : "warn"}>
              {backend.configured ? "Connected" : "Not configured"}
            </StatusPill>
          </div>
          <DataRow
            tone="blueprint"
            label="Mode"
            value={backend.mode === "live" ? "Live" : "Demo data"}
          />
          <DataRow tone="blueprint" label="Title ID" value={backend.titleIdMasked ?? "Not set"} />
          <DataRow
            tone="blueprint"
            label="Last checked"
            value={backend.lastCheckedAt ? formatDate(backend.lastCheckedAt) : "—"}
          />
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel
          title="Recent activity"
          icon={Activity}
          bodyClassName={activity.length ? "p-0" : "p-4"}
        >
          {activity.length === 0 ? (
            <div className="flex flex-col items-center gap-1 py-8 text-center">
              <Activity className="h-6 w-6 text-taupe" aria-hidden="true" />
              <p className="font-display text-base">No activity recorded yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Publishing an article, uploading media or updating a build will be listed here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-dashed divide-border">
              {activity.slice(0, 6).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{a.action}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {a.area} · {a.target}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDate(a.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Inbox"
          icon={Inbox}
          bodyClassName={cms.messages.length ? "p-0" : "p-4"}
          actions={
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/messages">View inbox →</Link>
            </Button>
          }
        >
          {cms.messages.length === 0 ? (
            <div className="flex flex-col items-center gap-1 py-8 text-center">
              <Inbox className="h-6 w-6 text-taupe" aria-hidden="true" />
              <p className="font-display text-base">No new messages</p>
              <p className="text-sm text-muted-foreground">Your support inbox is clear.</p>
            </div>
          ) : (
            <ul className="divide-y divide-dashed divide-border">
              {cms.messages.slice(0, 3).map((m) => (
                <li key={m.id} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-bold">{m.subject}</p>
                    <StatusPill
                      tone={m.status === "New" ? "warn" : m.status === "Resolved" ? "ok" : "info"}
                    >
                      {m.status}
                    </StatusPill>
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span className="truncate">{m.name}</span>
                    <span aria-hidden="true">·</span>
                    <span>{m.inquiryType}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatDate(m.createdAt)}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <SectionLabel>
        Website content is stored for this browser until a database is connected.
      </SectionLabel>
    </AdminPage>
  );
}
