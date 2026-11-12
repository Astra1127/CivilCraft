import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { getAccountSettings, updateContactEmail } from "@/lib/playfab/account-settings";
import { deletePlayerAccount, getDeletePreflight } from "@/lib/playfab/account-deletion";
import { requestPasswordReset } from "@/lib/playfab/auth";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState, LoadingState } from "@/components/common/States";
import { PlayerName } from "@/components/common/PlayerName";

export function AccountSettings({ includeDelete = false }: { includeDelete?: boolean }) {
  const { player } = useAuth();
  const account = useQuery({
    queryKey: ["account-settings", player?.playFabId],
    queryFn: getAccountSettings,
    retry: false,
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  if (account.isPending) return <LoadingState label="Loading account details…" rows={2} />;
  if (account.isError)
    return (
      <ErrorState
        description="Unable to load account details. Please retry."
        onRetry={account.refetch}
      />
    );
  const details = account.data;
  const contact = details.contacts[0];

  async function changeContact(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await updateContactEmail(email, password);
      setEmail("");
      setMessage(
        "Contact email saved. It is not verified until PlayFab confirms verification. Your login email is unchanged.",
      );
      await account.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update contact email.");
    } finally {
      setPassword("");
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!details.loginEmail) return;
    setBusy(true);
    setMessage("");
    try {
      await requestPasswordReset(details.loginEmail);
      setMessage(
        "If the account is eligible, password recovery instructions will be sent to its configured recovery address. Follow the email link to set a new password for both Unity and the website.",
      );
    } catch {
      setMessage("Unable to request a password reset. Please try again later.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="panel space-y-6 p-6">
        <section className="space-y-2">
          <h2 className="text-xl">Account username</h2>
          <p className="font-semibold">{details.username ?? "No username linked"}</p>
          <p className="text-sm text-muted-foreground">
            Your login username cannot be renamed through PlayFab&apos;s player API. It is separate
            from your character name and display name (
            <PlayerName name={details.displayName} fallback="not set" />
            ), which you manage in the game.
          </p>
        </section>

        <section className="space-y-3 border-t border-border pt-5">
          <h2 className="text-xl">Email</h2>
          <p className="text-sm">
            Login email: <strong>{details.loginEmail ?? "Not linked"}</strong>
          </p>
          <p className="text-sm">
            Contact email: <strong>{contact?.EmailAddress ?? "Not set"}</strong> —{" "}
            {contact?.VerificationStatus ?? "Verification status unavailable"}
          </p>
          <p className="text-sm text-muted-foreground">
            Changing your contact email does not change your login email. Contact email receives
            account communications, including recovery messages when configured by the game.
            Changing an existing login email is not supported by this player API.
          </p>
          <form onSubmit={changeContact} className="max-w-lg space-y-3">
            <div className="space-y-1">
              <Label htmlFor="account-contact-email">New contact email</Label>
              <Input
                id="account-contact-email"
                type="email"
                autoComplete="email"
                required
                maxLength={255}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="account-current-password">Current password</Label>
              <Input
                id="account-current-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
            </div>
            <Button
              type="submit"
              variant="gold"
              disabled={busy || (!details.username && !details.loginEmail)}
            >
              Save contact email
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">
            Email verification requires the game&apos;s PlayFab verification-email rule. Follow the
            verification email if received, then refresh the status. If none arrives, contact
            support; saving the address alone does not verify it.
          </p>
          <Button
            variant="outline"
            disabled={busy || account.isFetching}
            onClick={() => account.refetch()}
          >
            Refresh verification status
          </Button>
        </section>

        <section className="space-y-3 border-t border-border pt-5">
          <h2 className="text-xl">Password</h2>
          <p className="text-sm text-muted-foreground">
            Use a password-reset email to change your shared game and website password.
            PlayFab&apos;s player API does not support directly replacing it here.
          </p>
          <Button variant="outline" disabled={busy || !details.loginEmail} onClick={resetPassword}>
            Send password-reset email
          </Button>
          {!details.loginEmail && (
            <p className="text-sm text-muted-foreground">
              Use your linked sign-in provider to recover this account.
            </p>
          )}
        </section>

        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
      </div>

      {includeDelete && <DeleteAccountSection />}
    </>
  );
}

export function DeleteAccountSection() {
  const { player, logout } = useAuth();
  const navigate = useNavigate();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [password, setPassword] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleted, setIsDeleted] = useState(false);
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null);

  const account = useQuery({
    queryKey: ["account-settings", player?.playFabId],
    queryFn: getAccountSettings,
    retry: false,
  });

  const preflight = useQuery({
    queryKey: ["account-deletion-preflight", player?.playFabId],
    queryFn: getDeletePreflight,
    enabled: Boolean(player?.playFabId && showDeleteDialog),
    staleTime: 60_000,
  });

  const details = account.data;
  const accountIdentifier =
    details?.username ??
    details?.loginEmail ??
    player?.displayName ??
    player?.email ??
    "your account";

  const hasCredentials = Boolean(details?.username || details?.loginEmail);
  const canSubmit =
    confirmationText === "DELETE" && (!hasCredentials || password.length > 0) && !isDeleting;

  async function handleDeleteAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setIsDeleting(true);
    setError(null);

    try {
      const res = await deletePlayerAccount({
        confirmationText,
        confirm: true,
        password: password || undefined,
      });

      if (res.recoveryToken) {
        setRecoveryToken(res.recoveryToken);
      }
      setIsDeleted(true);
      // Clean up player session immediately
      void logout("player");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete account. Please try again.");
      setIsDeleting(false);
    }
  }

  function handleCloseDialog() {
    if (isDeleting) return;
    if (isDeleted) {
      void logout("player");
      void navigate({ to: "/" });
      return;
    }
    setShowDeleteDialog(false);
    setConfirmationText("");
    setPassword("");
    setError(null);
  }

  return (
    <section
      className="panel space-y-4 border border-destructive/20 p-6"
      aria-labelledby="delete-account-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
          <h2 id="delete-account-heading" className="font-display text-xl text-destructive">
            Delete Account
          </h2>
        </div>
        <span className="inline-flex items-center rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive">
          Permanent &amp; Irreversible
        </span>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed">
        Permanently delete your Civil Craft player account, gameplay progression, bridge saves, and
        website profile. This destructive action cannot be undone.
      </p>

      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-xs space-y-1.5 text-muted-foreground">
        <p className="font-semibold text-foreground">Self-Service Account Erasure</p>
        <p className="leading-relaxed">
          Requesting account deletion will permanently destroy your login credentials, cloud saves,
          unlocked cosmetics, and virtual currency balances. In accordance with Section 235 of the
          Philippine National Internal Revenue Code (as amended by Republic Act No. 11976 / Ease of
          Paying Taxes Act), financial records are preserved for five (5) years in an anonymized
          format stripped of personal identifiers.
        </p>
      </div>

      <div>
        <Button
          type="button"
          variant="outline"
          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => {
            setShowDeleteDialog(true);
            setError(null);
          }}
        >
          <AlertTriangle className="mr-2 h-4 w-4" aria-hidden="true" />
          Delete Account
        </Button>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={handleCloseDialog}>
        <AlertDialogContent className="panel max-w-lg border-2 border-border bg-card p-6 shadow-xl space-y-4">
          {!isDeleted ? (
            <>
              <AlertDialogHeader>
                <div className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                  <AlertDialogTitle className="font-display text-xl text-foreground">
                    Permanently Delete Civil Craft Account
                  </AlertDialogTitle>
                </div>
                <AlertDialogDescription className="text-sm text-muted-foreground">
                  You are initiating permanent deletion for account{" "}
                  <strong className="text-foreground">{accountIdentifier}</strong>
                  {details?.playFabId ? (
                    <>
                      {" "}
                      (PlayFab ID:{" "}
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">
                        {details.playFabId}
                      </code>
                      )
                    </>
                  ) : null}
                  . This action is final and cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <div className="space-y-3 text-xs text-muted-foreground">
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 space-y-2 text-foreground">
                  <p className="font-semibold text-destructive">
                    The following data will be permanently destroyed:
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-xs text-muted-foreground">
                    <li>Player account credentials, username, and login email</li>
                    <li>Bridge blueprints, construction saves, and campaign progression</li>
                    <li>Equipped and unlocked cosmetics, character avatar, and portraits</li>
                    <li>Virtual currency balances: Coins (CO) and Diamonds (DI)</li>
                    <li>Leaderboard rankings, statistics, and achievement milestones</li>
                    <li>Email notification preferences and support inquiries</li>
                  </ul>
                </div>

                {preflight.data?.affectedTitleIds && preflight.data.affectedTitleIds.length > 0 && (
                  <div className="rounded-lg border border-amber-600/30 bg-amber-500/10 p-3 space-y-1.5 text-xs text-foreground">
                    <p className="font-semibold text-amber-900 dark:text-amber-400">
                      Affected PlayFab Titles ({preflight.data.affectedTitleIds.length}):
                    </p>
                    <p className="text-muted-foreground leading-relaxed">
                      Master player account deletion permanently destroys player progress and data
                      across all titles under this studio/publisher:
                    </p>
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {preflight.data.affectedTitleIds.map((tid) => (
                        <code
                          key={tid}
                          className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground"
                        >
                          {tid}
                        </code>
                      ))}
                    </div>
                    {preflight.data.hasMultipleTitles && (
                      <p className="pt-1 text-[11px] font-medium text-destructive">
                        Warning: Multiple titles detected. Your player data across all listed titles
                        above will be completely erased.
                      </p>
                    )}
                  </div>
                )}

                <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1.5 text-xs">
                  <p className="font-semibold text-foreground">
                    Financial &amp; Legal Compliance Notice:
                  </p>
                  <p className="leading-relaxed text-muted-foreground">
                    Under Philippine tax law (Section 235 of the NIRC, as amended by Republic Act
                    No. 11976 / Ease of Paying Taxes Act), accounting source records and commercial
                    invoices must be preserved for five (5) years from the statutory return filing
                    date. Transaction totals, currency, order references, and payment timestamps are
                    retained in a pseudonymized format stripped of personal identifiers to fulfill
                    mandatory tax audit and PayMongo payment dispute settlement rules. PayMongo
                    independently maintains payment processing records under BSP regulations. This
                    technical data minimization implementation does not constitute legal
                    certification.
                  </p>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="rounded-lg border border-destructive/40 bg-destructive/15 p-3 text-xs text-destructive font-medium"
                  >
                    {error}
                  </div>
                )}

                <form onSubmit={handleDeleteAccount} className="space-y-3 pt-2">
                  <div className="space-y-1">
                    <Label htmlFor="delete-confirm-text" className="text-foreground font-semibold">
                      To confirm, type{" "}
                      <span className="text-destructive font-mono font-bold">DELETE</span> below:
                    </Label>
                    <Input
                      id="delete-confirm-text"
                      type="text"
                      required
                      autoComplete="off"
                      placeholder="DELETE"
                      value={confirmationText}
                      onChange={(e) => setConfirmationText(e.target.value)}
                      disabled={isDeleting}
                      className="border-destructive/30 focus-visible:ring-destructive font-mono"
                    />
                  </div>

                  {hasCredentials && (
                    <div className="space-y-1">
                      <Label
                        htmlFor="delete-confirm-password"
                        className="text-foreground font-semibold"
                      >
                        Confirm your account password:
                      </Label>
                      <Input
                        id="delete-confirm-password"
                        type="password"
                        required
                        autoComplete="current-password"
                        placeholder="Current password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isDeleting}
                        className="border-border"
                      />
                    </div>
                  )}

                  <AlertDialogFooter className="mt-5 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCloseDialog}
                      disabled={isDeleting}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="destructive"
                      disabled={!canSubmit}
                      className="gap-2"
                    >
                      {isDeleting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          Deleting Account...
                        </>
                      ) : (
                        "Permanently Delete My Account"
                      )}
                    </Button>
                  </AlertDialogFooter>
                </form>
              </div>
            </>
          ) : (
            <div className="py-4 space-y-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10 text-green-600">
                <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
              </div>
              <AlertDialogHeader className="text-center">
                <AlertDialogTitle className="font-display text-2xl text-foreground">
                  Account Deletion Initiated
                </AlertDialogTitle>
                <AlertDialogDescription className="text-sm text-muted-foreground pt-1">
                  Your Civil Craft player account has been queued for permanent deletion. All local
                  player data and progress have been purged from our active services.
                </AlertDialogDescription>
              </AlertDialogHeader>

              {recoveryToken && (
                <div className="rounded border border-primary/20 bg-primary/5 p-2.5 text-xs text-left space-y-1">
                  <span className="font-semibold text-foreground block">
                    Secure Deletion Status Tracking:
                  </span>
                  <p className="text-muted-foreground text-[11px]">
                    Your session has been terminated, but you can securely verify your deletion
                    lifecycle status at any time:
                  </p>
                  <a
                    href={`/api/player/account/delete/status?token=${encodeURIComponent(recoveryToken)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block text-[11px] font-mono text-primary underline hover:text-primary/80 break-all"
                  >
                    View Deletion Status Report &rarr;
                  </a>
                </div>
              )}

              <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground text-left space-y-1">
                <p className="font-semibold text-foreground">What happens next:</p>
                <p>• Your active session has been immediately invalidated and cleared.</p>
                <p>• Old credentials cannot be used to log in or access the game.</p>
                <p>• PlayFab background workers are executing deep master account erasure.</p>
                <p>
                  • Financial order records are pseudonymized for 5-year statutory tax compliance
                  (NIRC Sec. 235 / RA 11976).
                </p>
              </div>

              <AlertDialogFooter className="sm:justify-center pt-2">
                <Button
                  type="button"
                  variant="gold"
                  onClick={() => {
                    void logout("player");
                    void navigate({ to: "/" });
                  }}
                >
                  Return to Home Page
                </Button>
              </AlertDialogFooter>
            </div>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
