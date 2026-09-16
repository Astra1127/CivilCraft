import { Database, Gamepad2, Globe, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AdminPage, ConfirmDialog, DataRow, Panel } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { logActivity, resetCms } from "@/lib/cms/store";
import { useAuth } from "@/lib/auth";
import { adminPlayerService } from "@/lib/playfab";
import { useQuery } from "@tanstack/react-query";

export function AdminIntegrations() {
  const check = useQuery({
    queryKey: ["admin-integration"],
    queryFn: () => adminPlayerService.getStatus(),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const status = check.data;
  const { adminConfigured } = useAuth();
  const [confirmReset, setConfirmReset] = useState(false);
  const connectionLabel = check.isError ? "Unavailable" : (status?.connection ?? "Checking");

  return (
    <AdminPage>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel
          title="Game backend (read-only)"
          icon={Gamepad2}
          tone="blueprint"
          bodyClassName="p-3"
        >
          <DataRow tone="blueprint" label="Provider" value="PlayFab" />
          <DataRow tone="blueprint" label="Title ID" value={status?.titleId ?? "—"} />
          <DataRow tone="blueprint" label="Mode" value={status?.mode ?? "Live"} />
          <DataRow tone="blueprint" label="Connection" value={connectionLabel} />
          <DataRow tone="blueprint" label="Admin API" value={status?.adminApi ?? "Unavailable"} />
          <DataRow
            tone="blueprint"
            label="Last checked"
            value={status ? new Date(status.checkedAt).toLocaleString() : "Not available"}
          />
          <p role="status" className="pt-3 text-xs text-white/75">
            {check.isError ? (check.error as Error).message : status?.message}
          </p>
          <Button
            className="mt-3"
            size="sm"
            variant="outline"
            disabled={check.isFetching}
            onClick={() => void check.refetch()}
          >
            {check.isFetching ? "Checking..." : "Check connection"}
          </Button>
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
              — optional; the Civil Craft Title ID is built in, so the site connects even without an
              environment file.
            </li>
            <li>
              Civil Craft staff sign-in — {adminConfigured ? "Configured." : "Not configured."}{" "}
              Administrative access is verified by the server on every request.
            </li>
          </ul>
          <p className="mt-3 flex items-start gap-2 rounded-xl border-2 border-dashed border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Secret keys are never stored in the website content, never sent to the browser and never
            shown in this interface.
          </p>
        </Panel>
      </div>

      <Panel title="Image storage" icon={Database}>
        <DataRow label="Provider" value="Vercel Blob (private)" />
        <DataRow label="Configuration" value={status?.services.imageStorage ?? "Unavailable"} />
        <p className="mt-3 text-xs text-muted-foreground">
          Configure private image storage in the hosting environment, then redeploy. Credentials are
          managed outside this interface.
        </p>
      </Panel>
      <Panel title="Email" icon={Globe}>
        <DataRow label="Provider" value="PlayFab SMTP / email templates" />
        <DataRow
          label="Recovery template override"
          value={status?.services.recoveryTemplate ?? "Unavailable"}
        />
        <DataRow
          label="Update template"
          value={status?.services.releaseTemplate ?? "Unavailable"}
        />
        <DataRow
          label="Worker authentication"
          value={status?.services.emailWorker ?? "Unavailable"}
        />
        <p className="mt-3 text-xs text-muted-foreground">
          SMTP is managed in PlayFab. These statuses reflect website configuration only; SMTP
          delivery and the external worker schedule are not verified here. Recovery can use the
          default PlayFab template when no override is configured.
        </p>
      </Panel>
      <Panel title="Website content" icon={Globe} bodyClassName="p-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          The remaining browser-local CMS content and settings can be reset to their defaults.
          Centrally stored Updates, Gallery and game data are unaffected.
        </p>
        <Button variant="destructive" size="sm" onClick={() => setConfirmReset(true)}>
          Reset website content
        </Button>
      </Panel>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset website content?"
        description="Browser-local CMS content and settings will return to their defaults. Centrally stored Updates, Gallery and game data are unaffected."
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
