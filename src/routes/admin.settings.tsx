import { createFileRoute } from "@tanstack/react-router";
import { Globe, Search, Share2, Building2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AdminHeading, AdminPage, Panel, StatusPill } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { logActivity, setCmsState, useCms } from "@/lib/cms/store";
import type { SiteSettings } from "@/lib/cms/types";

export const Route = createFileRoute("/admin/settings")({
  component: AdminSettings,
});

function AdminSettings() {
  const saved = useCms((s) => s.settings);
  const [form, setForm] = useState<SiteSettings>(saved);

  const set = (patch: Partial<SiteSettings>) => setForm((f) => ({ ...f, ...patch }));

  const save = () => {
    if (!form.siteName.trim() || !form.supportEmail.trim()) {
      toast.error("Site name and support email are required");
      return;
    }
    setCmsState((prev) => ({ ...prev, settings: form }));
    logActivity({ area: "Settings", action: "Website settings saved", target: form.siteName });
    toast.success("Settings saved");
  };

  return (
    <AdminPage>
      <AdminHeading
        title="Settings"
        description="Contact details, social links and site metadata."
        status={
          <StatusPill tone={form.maintenanceMode ? "warn" : "ok"}>
            {form.maintenanceMode ? "Maintenance notice on" : "Site live"}
          </StatusPill>
        }
        actions={
          <Button variant="gold" size="sm" onClick={save}>
            Save settings
          </Button>
        }
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Contact details" icon={Building2} bodyClassName="p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="siteName">Site name</Label>
              <Input
                id="siteName"
                value={form.siteName}
                onChange={(e) => set({ siteName: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supportEmail">Support email</Label>
              <Input
                id="supportEmail"
                type="email"
                value={form.supportEmail}
                onChange={(e) => set({ supportEmail: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => set({ phone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="officeHours">Office hours</Label>
              <Input
                id="officeHours"
                value={form.officeHours}
                onChange={(e) => set({ officeHours: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                rows={2}
                value={form.address}
                onChange={(e) => set({ address: e.target.value })}
              />
            </div>
          </div>
        </Panel>

        <Panel title="Social links" icon={Share2} bodyClassName="p-4">
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="facebook">Facebook</Label>
              <Input
                id="facebook"
                value={form.social.facebook}
                onChange={(e) => set({ social: { ...form.social, facebook: e.target.value } })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="youtube">YouTube</Label>
              <Input
                id="youtube"
                value={form.social.youtube}
                onChange={(e) => set({ social: { ...form.social, youtube: e.target.value } })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="discord">Discord</Label>
              <Input
                id="discord"
                value={form.social.discord}
                onChange={(e) => set({ social: { ...form.social, discord: e.target.value } })}
              />
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Search & visibility" icon={Search} bodyClassName="p-4">
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="metaTitle">Meta title</Label>
              <Input
                id="metaTitle"
                maxLength={60}
                value={form.metaTitle}
                onChange={(e) => set({ metaTitle: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">{form.metaTitle.length}/60 characters</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="metaDescription">Meta description</Label>
              <Textarea
                id="metaDescription"
                rows={3}
                maxLength={160}
                value={form.metaDescription}
                onChange={(e) => set({ metaDescription: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                {form.metaDescription.length}/160 characters
              </p>
            </div>
          </div>

          {/* Live search-result preview */}
          <div className="space-y-2">
            <Label>Search result preview</Label>
            <div className="rounded-xl border-2 border-dashed border-border bg-secondary/30 p-4">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                civilcraft.game
              </p>
              <p className="mt-1 truncate font-display text-base text-blueprint">
                {form.metaTitle || form.siteName || "Page title"}
              </p>
              <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                {form.metaDescription || "Add a meta description to control this snippet."}
              </p>
            </div>
            <label className="flex items-center gap-3 rounded-xl border-2 border-border bg-card p-3 text-sm font-bold">
              <Switch
                checked={form.maintenanceMode}
                onCheckedChange={(v) => set({ maintenanceMode: v })}
              />
              Show maintenance notice on the public site
            </label>
          </div>
        </div>
      </Panel>

      <Button variant="gold" size="lg" onClick={save}>
        Save settings
      </Button>
    </AdminPage>
  );
}
