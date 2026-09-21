import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, Eye, Globe } from "lucide-react";
import { SectionHeading } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { requireSessionTicket } from "@/lib/playfab/client";

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
  const { player } = useAuth();
  const [emailUpdates, setEmailUpdates] = useState(false);
  const [saving, setSaving] = useState(false);
  const preferences = useQuery({
    queryKey: ["email-preference", player?.playFabId],
    enabled: !!player,
    queryFn: () => emailPreference(),
    retry: false,
    staleTime: 0,
  });
  useEffect(() => {
    if (preferences.data) setEmailUpdates(preferences.data.emailUpdates);
  }, [preferences.data]);
  const [publicProfile, setPublicProfile] = useState(false);
  const [compactMode, setCompactMode] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await emailPreference(emailUpdates);
      await preferences.refetch();
      toast.success("Email preference saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save your preference.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Settings"
        description="Dashboard preferences for your Civil Craft account."
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
            <p className="text-sm text-muted-foreground">
              Receive email notifications about published updates.
            </p>
          </div>
          <Switch
            id="email-updates"
            checked={emailUpdates}
            disabled={preferences.isPending || preferences.isError || saving}
            onCheckedChange={setEmailUpdates}
          />
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-gold" aria-hidden="true" />
              <Label htmlFor="public-profile" className="font-display text-base">
                Public profile
              </Label>
            </div>
            <p className="text-sm text-muted-foreground">
              Preview only. This control does not change leaderboard visibility.
            </p>
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
            <p className="text-sm text-muted-foreground">
              Preview only. This control does not change dashboard spacing.
            </p>
          </div>
          <Switch id="compact-mode" checked={compactMode} onCheckedChange={setCompactMode} />
        </div>

        {preferences.isPending ? (
          <p role="status">Loading email preference...</p>
        ) : preferences.isError ? (
          <div role="alert">
            <p>Unable to load your email preference.</p>
            <Button variant="outline" onClick={() => preferences.refetch()}>
              Retry
            </Button>
          </div>
        ) : null}
        <Button
          variant="gold"
          disabled={preferences.isPending || preferences.isError || saving}
          onClick={save}
        >
          {saving ? "Saving..." : "Save email preference"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Password recovery and important account messages are sent independently of this
          preference.
        </p>
      </div>

      <p className="text-sm text-muted-foreground">
        Manage your display name and cosmetics in Civil Craft. To reset your shared account
        password, use Forgot Password on the Login page.
      </p>
    </div>
  );
}

async function emailPreference(emailUpdates?: boolean): Promise<{ emailUpdates: boolean }> {
  const response = await fetch("/api/player/email-preference", {
    method: emailUpdates === undefined ? "GET" : "POST",
    headers: {
      Authorization: "Bearer " + requireSessionTicket(),
      "Content-Type": "application/json",
    },
    ...(emailUpdates === undefined ? {} : { body: JSON.stringify({ emailUpdates }) }),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to save preference.");
  return result;
}
