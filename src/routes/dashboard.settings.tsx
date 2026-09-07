import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bell, Eye, Globe } from "lucide-react";
import { SectionHeading } from "@/components/common/PageHeader";
import { DemoBadge } from "@/components/common/DemoBadge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Player Dashboard" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "Manage your Civil Craft dashboard preferences." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const [emailUpdates, setEmailUpdates] = useState(true);
  const [publicProfile, setPublicProfile] = useState(false);
  const [compactMode, setCompactMode] = useState(false);

  const save = () => {
    toast.success("Settings saved (demo mode)");
  };

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Settings"
        description="Dashboard preferences for your Civil Craft account."
        action={<DemoBadge />}
      />

      <div className="panel space-y-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-gold" aria-hidden="true" />
              <Label htmlFor="email-updates" className="font-display text-base">
                Email updates
              </Label>
            </div>
            <p className="text-sm text-muted-foreground">Receive news and patch-note summaries.</p>
          </div>
          <Switch id="email-updates" checked={emailUpdates} onCheckedChange={setEmailUpdates} />
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-gold" aria-hidden="true" />
              <Label htmlFor="public-profile" className="font-display text-base">
                Public profile
              </Label>
            </div>
            <p className="text-sm text-muted-foreground">Show your display name on public leaderboards.</p>
          </div>
          <Switch id="public-profile" checked={publicProfile} onCheckedChange={setPublicProfile} />
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-gold" aria-hidden="true" />
              <Label htmlFor="compact-mode" className="font-display text-base">
                Compact dashboard
              </Label>
            </div>
            <p className="text-sm text-muted-foreground">Use denser spacing for tables and lists.</p>
          </div>
          <Switch id="compact-mode" checked={compactMode} onCheckedChange={setCompactMode} />
        </div>

        <Button variant="gold" onClick={save}>
          Save preferences
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Account details like display name, password and cosmetics are managed in the game and synced
        back to this dashboard.
      </p>
    </div>
  );
}
