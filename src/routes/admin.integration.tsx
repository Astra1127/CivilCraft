import { createFileRoute } from "@tanstack/react-router";
import { Database, Gamepad2, Globe, RefreshCw, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AdminHeading,
  AdminPage,
  ConfirmDialog,
  DataRow,
  Panel,
  StatusPill,
} from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { formatDate, logActivity, resetCms } from "@/lib/cms/store";
import { getPlayFabStatus } from "@/lib/playfab";

export const Route = createFileRoute("/admin/integration")({
  component: AdminIntegration,
});

function AdminIntegration() {
  const [status, setStatus] = useState(getPlayFabStatus);
  const [probe, setProbe] = useState<{
    reachable: boolean;
    checkedAt: string;
    secretConfigured: boolean;
  } | null>(null);
  const [testing, setTesting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const runTest = async () => {
    setTesting(true);
    try {
      const { testPlayFabConnection } = await import("@/lib/playfab/admin.functions");
      const result = await testPlayFabConnection();
      setProbe({
        reachable: result.reachable,
        checkedAt: result.checkedAt,
        secretConfigured: result.secretConfigured,
      });
      setStatus(getPlayFabStatus());
      toast[result.reachable ? "success" : "error"](
        result.reachable ? "Game backend reachable" : "Game backend unreachable",
      );
    } catch {
      setProbe({ reachable: false, checkedAt: new Date().toISOString(), secretConfigured: false });
      toast.error("Unable to connect to Civil Craft services.");
    } finally {
      setTesting(false);
    }
  };

  const connectionLabel = probe ? (probe.reachable ? "Connected" : "Unreachable") : "Not tested";

  return (
    <AdminPage>
      <AdminHeading
        title="Integration"
        description="Connection status between the website and the game backend."
        status={
          <StatusPill tone={probe && !probe.reachable ? "warn" : "ok"}>
            {probe ? (probe.reachable ? "Backend connected" : "Backend unreachable") : "Backend configured"}
          </StatusPill>
        }
        actions={
          <Button size="sm" variant="outline" onClick={runTest} disabled={testing}>
            <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" />
            {testing ? "Testing…" : "Test connection"}
          </Button>
        }
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Game backend (read-only)" icon={Gamepad2} tone="blueprint" bodyClassName="p-3">
          <DataRow tone="blueprint" label="Provider" value="PlayFab" />
          <DataRow tone="blueprint" label="Title ID" value={status.titleIdMasked ?? "—"} />
          <DataRow
            tone="blueprint"
            label="Mode"
            value={status.mode === "live" ? "Live" : "Demo data"}
          />
          <DataRow tone="blueprint" label="Connection" value={connectionLabel} />
          <DataRow tone="blueprint" label="Environment" value="Development" />
          <DataRow
            tone="blueprint"
            label="Last checked"
            value={probe ? formatDate(probe.checkedAt) : "—"}
          />
          <p className="pt-3 text-xs text-white/75">
            Player accounts, progress, achievements and leaderboards are owned by the game and are
            read-only here. The website signs players in to the same game accounts used in Civil
            Craft.
          </p>
        </Panel>

        <Panel title="Configuration" icon={Database} bodyClassName="p-4">
          <ul className="space-y-2 text-sm">
            <li>
              <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">
                VITE_PLAYFAB_TITLE_ID
              </code>{" "}
              — optional; the Civil Craft Title ID is built in, so the site connects even without
              an environment file.
            </li>
            <li>
              <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">PLAYFAB_SECRET_KEY</code>{" "}
              — server-side only (<code className="text-xs">.env.local</code>), required for
              administrator sign-in and the player directory.{" "}
              {probe ? (probe.secretConfigured ? "Configured." : "Not configured.") : ""}
            </li>
          </ul>
          <p className="mt-3 flex items-start gap-2 rounded-xl border-2 border-dashed border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Secret keys are never stored in the website content, never sent to the browser and
            never shown in this interface.
          </p>
        </Panel>
      </div>


      <Panel title="Website content" icon={Globe} bodyClassName="p-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          News, gallery, FAQ, messages, releases and settings are stored for this browser.
          Resetting restores the original sample content and does not touch any game data.
        </p>
        <Button variant="destructive" size="sm" onClick={() => setConfirmReset(true)}>
          Reset website content
        </Button>
      </Panel>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset website content?"
        description="All news, gallery, FAQ, messages, releases and settings changes made in this browser will be replaced with the original sample content. Game data is unaffected."
        confirmLabel="Reset content"
        onConfirm={() => {
          resetCms();
          logActivity({ area: "System", action: "Website content reset", target: "All CMS data" });
          setConfirmReset(false);
          toast.success("Website content reset");
        }}
      />
    </AdminPage>
  );
}
