import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Mail,
  Plus,
  RefreshCw,
  Send,
  Shield,
  Trash2,
} from "lucide-react";
import { AdminHeading, Panel, StatusPill } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PolicyRecord, PolicySection } from "@/lib/cms/policy-types";
import type { PolicyNotificationJob } from "@/lib/email/policy-notifications.server";
import { cn } from "@/lib/utils";

interface PoliciesApiResponse {
  policies: {
    privacy: PolicyRecord;
    terms: PolicyRecord;
  };
  jobs: {
    privacy: PolicyNotificationJob | null;
    terms: PolicyNotificationJob | null;
  };
}

export function AdminPolicies() {
  const [loading, setLoading] = useState(true);
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [retryingJob, setRetryingJob] = useState(false);

  const [activeTab, setActiveTab] = useState<"privacy" | "terms">("privacy");
  const [data, setData] = useState<PoliciesApiResponse | null>(null);

  // Form states for active policy
  const [sections, setSections] = useState<PolicySection[]>([]);
  const [changeSummary, setChangeSummary] = useState("");

  // Dialog states
  const [previewOpen, setPreviewOpen] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);

  const activePolicy: PolicyRecord | undefined = data?.policies[activeTab];
  const activeJob: PolicyNotificationJob | null | undefined = data?.jobs[activeTab];

  const fetchPolicies = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/policies", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load policy configurations.");
      const json = (await res.json()) as PoliciesApiResponse;
      setData(json);

      // Load initial sections for activeTab
      const current = json.policies[activeTab];
      if (current) {
        const initialSections = current.draft?.sections?.length
          ? current.draft.sections
          : current.sections;
        setSections(JSON.parse(JSON.stringify(initialSections)) as PolicySection[]);
        setChangeSummary(current.draft?.changeSummary || "");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error loading policies");
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    void fetchPolicies();
  }, [fetchPolicies]);

  // When switching policy tabs, load corresponding sections
  const handleSwitchTab = (tab: "privacy" | "terms") => {
    setActiveTab(tab);
    if (!data) return;
    const policy = data.policies[tab];
    const initialSections = policy.draft?.sections?.length
      ? policy.draft.sections
      : policy.sections;
    setSections(JSON.parse(JSON.stringify(initialSections)) as PolicySection[]);
    setChangeSummary(policy.draft?.changeSummary || "");
  };

  // Section manipulation helpers
  const handleUpdateSection = (index: number, patch: Partial<PolicySection>) => {
    setSections((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index]!, ...patch };
      return copy;
    });
  };

  const handleMoveSection = (index: number, direction: "up" | "down") => {
    setSections((prev) => {
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[index]!;
      copy[index] = copy[targetIndex]!;
      copy[targetIndex] = temp;
      return copy;
    });
  };

  const handleDeleteSection = (index: number) => {
    if (sections.length <= 1) {
      toast.error("A policy must have at least one section.");
      return;
    }
    setSections((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddSection = () => {
    const newId = `section-${Date.now()}`;
    setSections((prev) => [
      ...prev,
      {
        id: newId,
        title: "New Policy Section",
        content: "Enter section content here...",
      },
    ]);
  };

  // Save Draft handler
  const handleSaveDraft = async () => {
    if (savingDraft) return;
    setSavingDraft(true);
    try {
      const res = await fetch("/api/admin/policies/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policyId: activeTab,
          sections,
          changeSummary,
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || "Failed to save draft.");

      toast.success("Policy draft saved successfully.");
      await fetchPolicies();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save draft.");
    } finally {
      setSavingDraft(false);
    }
  };

  // Publish Policy handler
  const handlePublish = async () => {
    const summary = changeSummary.trim();
    if (summary.length < 5) {
      toast.error("Please provide a brief change summary of at least 5 characters.");
      return;
    }

    setPublishing(true);
    try {
      const res = await fetch("/api/admin/policies/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policyId: activeTab,
          sections,
          changeSummary: summary,
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || "Failed to publish policy.");

      toast.success("Policy published! Automatic player notifications initiated.");
      setPublishDialogOpen(false);
      await fetchPolicies();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to publish policy.");
    } finally {
      setPublishing(false);
    }
  };

  // Retry Notifications handler
  const handleRetryNotifications = async () => {
    if (!activePolicy || retryingJob) return;
    setRetryingJob(true);
    try {
      const res = await fetch("/api/admin/policies/notifications/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policyId: activeTab,
          version: activePolicy.version,
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || "Failed to retry notifications.");

      toast.success("Retried notifications for failed recipients.");
      await fetchPolicies();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to retry notifications.");
    } finally {
      setRetryingJob(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center" role="status">
        <RefreshCw className="mx-auto h-6 w-6 animate-spin text-gold" aria-hidden="true" />
        <p className="mt-2 text-sm text-muted-foreground">Loading policy management...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-3">
      {/* Policy Selector Switch */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex rounded-xl border border-border bg-card p-1 shadow-sm">
          <button
            type="button"
            onClick={() => handleSwitchTab("privacy")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
              activeTab === "privacy"
                ? "bg-gold text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Shield className="h-4 w-4" aria-hidden="true" />
            Privacy Policy
          </button>
          <button
            type="button"
            onClick={() => handleSwitchTab("terms")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
              activeTab === "terms"
                ? "bg-gold text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            Terms of Service
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
            <Eye className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Preview
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleSaveDraft}
            disabled={savingDraft}
          >
            {savingDraft ? "Saving…" : "Save Draft"}
          </Button>
          <Button
            type="button"
            variant="gold"
            size="sm"
            onClick={() => setPublishDialogOpen(true)}
            disabled={publishing}
          >
            <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Publish Policy…
          </Button>
        </div>
      </div>

      {/* Published Policy Status Card */}
      {activePolicy ? (
        <Panel
          title={`${activePolicy.title} — Status`}
          icon={activeTab === "privacy" ? Shield : FileText}
          bodyClassName="p-4 space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Published Version</p>
              <p className="mt-1 font-mono text-sm font-bold text-foreground">
                {activePolicy.version}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Effective Date</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {activePolicy.lastUpdated}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Published By</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {activePolicy.publishedBy || "System"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Draft Status</p>
              <div className="mt-1">
                {activePolicy.draft ? (
                  <StatusPill tone="warn">Unpublished draft saved</StatusPill>
                ) : (
                  <StatusPill tone="ok">Up to date</StatusPill>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
            <span className="font-semibold text-foreground">Current Change Summary: </span>
            <span className="text-muted-foreground">
              {activePolicy.changeSummary || "Initial audited release"}
            </span>
          </div>

          {activePolicy.draft ? (
            <div className="flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
              <div className="flex items-center gap-2">
                <Clock
                  className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                  aria-hidden="true"
                />
                <span>
                  Draft saved on {new Date(activePolicy.draft.savedAt).toLocaleString()} by{" "}
                  {activePolicy.draft.savedBy}. Draft changes are not visible publicly until
                  published.
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setSections(JSON.parse(JSON.stringify(activePolicy.sections)) as PolicySection[]);
                  setChangeSummary("");
                  toast.info("Reset editor to published version.");
                }}
              >
                Reset to Published
              </Button>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {/* Automatic Notification Status Card */}
      {activeJob ? (
        <Panel title="Player Notification Status" icon={Mail} bodyClassName="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Job Status:</span>
              <StatusPill
                tone={
                  activeJob.status === "completed"
                    ? "ok"
                    : activeJob.status === "processing" || activeJob.status === "pending"
                      ? "info"
                      : "warn"
                }
              >
                {activeJob.status.toUpperCase()}
              </StatusPill>
              <span className="text-xs text-muted-foreground">({activeJob.statusMessage})</span>
            </div>

            {activeJob.failedCount > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRetryNotifications}
                disabled={retryingJob}
              >
                <RefreshCw
                  className={cn("mr-1.5 h-3.5 w-3.5", retryingJob && "animate-spin")}
                  aria-hidden="true"
                />
                Retry Failed ({activeJob.failedCount})
              </Button>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-2.5 text-center">
              <p className="text-xs text-muted-foreground">Total Eligible</p>
              <p className="text-lg font-bold text-foreground">{activeJob.totalEligible}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-2.5 text-center">
              <p className="text-xs text-emerald-600 dark:text-emerald-400">Emails Sent</p>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {activeJob.sentCount}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-2.5 text-center">
              <p className="text-xs text-destructive">Failed</p>
              <p className="text-lg font-bold text-destructive">{activeJob.failedCount}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-2.5 text-center">
              <p className="text-xs text-muted-foreground">Skipped (Unverified)</p>
              <p className="text-lg font-bold text-muted-foreground">{activeJob.skippedCount}</p>
            </div>
          </div>

          {activeJob.status === "unconfigured" ? (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Note: Email sending requires configured Gmail SMTP credentials (GMAIL_SMTP_USER,
              GMAIL_SMTP_APP_PASSWORD) or a PlayFab email template. Unsent notifications can be
              retried once credentials are configured.
            </p>
          ) : null}
        </Panel>
      ) : null}

      {/* Policy Section Editor */}
      <Panel
        title={`Sections Editor (${sections.length} sections)`}
        icon={FileText}
        bodyClassName="p-4 space-y-6"
      >
        <div className="space-y-4">
          {sections.map((section, index) => (
            <div
              key={section.id}
              className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gold/15 font-mono text-xs font-bold text-gold">
                    {index + 1}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">ID: {section.id}</span>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={index === 0}
                    onClick={() => handleMoveSection(index, "up")}
                    aria-label="Move section up"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={index === sections.length - 1}
                    onClick={() => handleMoveSection(index, "down")}
                    aria-label="Move section down"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => handleDeleteSection(index)}
                    aria-label="Delete section"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`title-${section.id}`} className="text-xs font-semibold">
                  Section Title
                </Label>
                <Input
                  id={`title-${section.id}`}
                  value={section.title}
                  onChange={(e) => handleUpdateSection(index, { title: e.target.value })}
                  className="font-medium text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`content-${section.id}`} className="text-xs font-semibold">
                  Section Content (Markdown & Text)
                </Label>
                <Textarea
                  id={`content-${section.id}`}
                  rows={4}
                  value={section.content}
                  onChange={(e) => handleUpdateSection(index, { content: e.target.value })}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={handleAddSection}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Add New Section
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleSaveDraft}
              disabled={savingDraft}
            >
              {savingDraft ? "Saving…" : "Save Draft"}
            </Button>
            <Button
              type="button"
              variant="gold"
              size="sm"
              onClick={() => setPublishDialogOpen(true)}
              disabled={publishing}
            >
              <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Publish Policy…
            </Button>
          </div>
        </div>
      </Panel>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-foreground">
              Preview: {activePolicy?.title}
            </DialogTitle>
            <DialogDescription>
              This is how the policy will appear to public visitors on the website.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-6 rounded-xl border border-border/60 bg-card p-6">
            <div className="border-b border-border/60 pb-4">
              <h1 className="font-display text-2xl text-foreground">{activePolicy?.title}</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Effective Date: {activePolicy?.lastUpdated} • Version: {activePolicy?.version}
              </p>
            </div>

            <div className="space-y-6 text-sm text-foreground">
              {sections.map((sec, idx) => (
                <div key={sec.id} className="space-y-2">
                  <h3 className="font-display text-lg text-foreground">
                    {idx + 1}. {sec.title}
                  </h3>
                  <div className="whitespace-pre-wrap text-muted-foreground leading-relaxed">
                    {sec.content}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPreviewOpen(false)}>
              Close Preview
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Publish Dialog */}
      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-foreground">
              Publish Updated {activePolicy?.title}
            </DialogTitle>
            <DialogDescription>
              Publishing will update the public website and initiate an automatic email notification
              to all registered players with verified contact emails.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-gold/40 bg-gold/10 p-3 text-xs text-foreground">
              <p className="font-semibold">Important Notes:</p>
              <ul className="mt-1 list-inside list-disc space-y-1 text-muted-foreground">
                <li>Public visitors will immediately see the updated sections.</li>
                <li>An automated email batch job will notify verified players.</li>
                <li>Unverified accounts and guests will be safely skipped.</li>
              </ul>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="publish-change-summary" className="text-xs font-semibold">
                Change Summary (Required, minimum 5 characters)
              </Label>
              <Textarea
                id="publish-change-summary"
                rows={3}
                placeholder="Briefly explain what was revised in this policy update..."
                value={changeSummary}
                onChange={(e) => setChangeSummary(e.target.value)}
                className="text-xs"
              />
              <p className="text-xs text-muted-foreground">
                This summary will be included in the player notification emails and revision
                history.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPublishDialogOpen(false)}
              disabled={publishing}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="gold"
              onClick={handlePublish}
              disabled={publishing || changeSummary.trim().length < 5}
            >
              <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {publishing ? "Publishing…" : "Confirm & Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
