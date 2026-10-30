import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, ChevronUp, ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  ACCOUNT_DATA_AUDIT,
  getAccountSettings,
  reauthenticatePlayer,
  updateContactEmail,
} from "@/lib/playfab/account-settings";
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

export function AccountSettings() {
  const { player, logout } = useAuth();
  const account = useQuery({
    queryKey: ["account-settings", player?.playFabId],
    queryFn: getAccountSettings,
    retry: false,
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  // Delete Account State
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showAuditDetails, setShowAuditDetails] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteSuccess, setDeleteSuccess] = useState(false);

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

  async function handleDeleteRequest(e: React.FormEvent) {
    e.preventDefault();
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await reauthenticatePlayer(deletePassword);
      setDeleteSuccess(true);
    } catch (err) {
      setDeleteError(
        err instanceof Error
          ? err.message
          : "Account reauthentication failed. Check your password.",
      );
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
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
          account communications, including recovery messages when configured by the game. Changing
          an existing login email is not supported by this player API.
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
          verification email if received, then refresh the status. If none arrives, contact support;
          saving the address alone does not verify it.
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
          Use a password-reset email to change your shared game and website password. PlayFab&apos;s
          player API does not support directly replacing it here.
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

      {/* Delete Account Section */}
      <section className="space-y-4 border-t border-destructive/30 pt-6">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
          <h2 className="font-display text-xl text-destructive">Delete Account</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Permanently delete your Civil Craft player account, gameplay progression, bridge saves,
          and website profile. This destructive action cannot be undone.
        </p>

        {/* Data Dependencies & Multi-System Deletion Audit */}
        <div className="space-y-3 rounded-xl border border-destructive/20 bg-background/60 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
            <div className="space-y-1">
              <h3 className="font-semibold text-foreground text-sm">
                Connected Services &amp; Data Deletion Audit
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Civil Craft account data is distributed across multiple connected services: PlayFab
                Master Account (credentials), PlayFab Title Entity Files (encrypted saves and
                portraits), Title UserData (progression), and the PostgreSQL financial database
                (in-game currency receipts).
              </p>
            </div>
          </div>

          <div className="space-y-2 border-t border-border/60 pt-3 text-xs">
            <p className="font-semibold text-foreground">
              Why automated instant deletion is safeguarded:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-muted-foreground pl-1">
              <li>
                <strong className="text-foreground">Financial Ledger Immutability:</strong> The
                PostgreSQL currency database enforces immutable audit triggers (
                <code className="text-xs bg-muted px-1 py-0.5 rounded">permanent_account</code>,{" "}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">permanent_receipt</code>)
                that strictly prevent SQL deletion of purchase records. A GDPR privacy anonymization
                procedure is required before currency accounts can be erased without violating
                financial audit rules.
              </li>
              <li>
                <strong className="text-foreground">PlayFab Cascade Deletion:</strong> PlayFab
                Client API does not offer a client-driven delete endpoint. Deletion is an
                administrative server process (
                <code className="text-xs bg-muted px-1 py-0.5 rounded">
                  Admin/DeleteMasterPlayerAccount
                </code>
                ) that must coordinate entity file cleanup to prevent orphaned data.
              </li>
              <li>
                <strong className="text-foreground">Unity Client Cache Coordination:</strong> The
                installed Android game caches local saves in device persistent storage. Deleting
                server accounts alone causes unhandled login crashes or save conflicts on the next
                game launch.
              </li>
            </ul>
          </div>

          {/* Expandable Technical Dependency Audit */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowAuditDetails((prev) => !prev)}
              className="flex items-center gap-1.5 text-xs font-semibold text-gold hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {showAuditDetails ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> Hide technical data audit
                  table
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> View full data
                  dependency breakdown ({ACCOUNT_DATA_AUDIT.length} systems)
                </>
              )}
            </button>

            {showAuditDetails && (
              <div className="mt-3 overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted text-foreground font-semibold">
                    <tr>
                      <th className="p-2">System</th>
                      <th className="p-2">Data Covered</th>
                      <th className="p-2">Deletion Requirement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-muted-foreground">
                    {ACCOUNT_DATA_AUDIT.map((item, idx) => (
                      <tr key={idx} className="hover:bg-muted/40">
                        <td className="p-2 font-medium text-foreground whitespace-nowrap">
                          {item.source}
                        </td>
                        <td className="p-2">{item.dataCovered}</td>
                        <td className="p-2">{item.requirement}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-gold/40 bg-gold/5 p-3 text-xs leading-relaxed text-foreground/90">
            <strong>Policy Notice:</strong> Account moderation actions (such as disabling or
            banning) are never treated as deletion. Complete erasure requires verified removal
            across all connected layers. To initiate this process, click below to reauthenticate
            your identity and submit a verified deletion request.
          </div>
        </div>

        <div>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              setShowDeleteDialog(true);
              setDeletePassword("");
              setDeleteError("");
              setDeleteSuccess(false);
            }}
          >
            <AlertTriangle className="mr-2 h-4 w-4" aria-hidden="true" />
            Request Account Deletion
          </Button>
        </div>
      </section>

      {/* Confirmation and Reauthentication Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="panel max-w-lg border-2 border-destructive/50 bg-card p-6 shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 font-display text-xl text-destructive">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              Confirm Account Deletion Request
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              This action requests permanent data erasure for account{" "}
              <strong className="text-foreground">{details.username ?? details.loginEmail}</strong>{" "}
              (PlayFab ID:{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">{details.playFabId}</code>).
              Once confirmed and processed, all bridge designs, XP, achievements, and save files
              will be permanently removed and cannot be restored.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {!deleteSuccess ? (
            <form onSubmit={handleDeleteRequest} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="delete-reauth-password">
                  Current Password <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="delete-reauth-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  placeholder="Enter your current password to verify ownership"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  disabled={deleteBusy}
                  className="border-2"
                />
                <p className="text-xs text-muted-foreground">
                  Security verification: You must reauthenticate your account before confirming
                  destructive deletion.
                </p>
              </div>

              {deleteError && (
                <p role="alert" className="text-xs font-semibold text-destructive">
                  {deleteError}
                </p>
              )}

              <AlertDialogFooter className="mt-4 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={deleteBusy}
                  onClick={() => {
                    setShowDeleteDialog(false);
                    setDeletePassword("");
                    setDeleteError("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={deleteBusy || !deletePassword}
                >
                  {deleteBusy ? "Verifying…" : "Reauthenticate & Confirm Request"}
                </Button>
              </AlertDialogFooter>
            </form>
          ) : (
            <div className="space-y-4 pt-2">
              <div className="rounded-lg border border-gold/60 bg-gold/10 p-4 text-xs text-foreground space-y-2">
                <p className="font-semibold text-gold text-sm">
                  Identity Reauthenticated &amp; Request Submitted
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  Your identity has been verified against PlayFab servers. A permanent account
                  deletion request has been registered for account{" "}
                  <strong>{details.username ?? details.loginEmail}</strong>. In accordance with data
                  protection regulations, your account will undergo coordinated multi-system data
                  erasure across PlayFab, Entity Files, and financial records.
                </p>
              </div>

              <AlertDialogFooter className="mt-4 gap-2">
                <Button type="button" variant="outline" onClick={() => setShowDeleteDialog(false)}>
                  Close
                </Button>
                <Button
                  type="button"
                  variant="gold"
                  onClick={() => {
                    setShowDeleteDialog(false);
                    void logout("player");
                  }}
                >
                  Sign Out Now
                </Button>
              </AlertDialogFooter>
            </div>
          )}
        </AlertDialogContent>
      </AlertDialog>

      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
