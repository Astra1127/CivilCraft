import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getAccountSettings, updateContactEmail } from "@/lib/playfab/account-settings";
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
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const account = useQuery({
    queryKey: ["account-settings", player?.playFabId],
    queryFn: getAccountSettings,
    retry: false,
  });

  const details = account.data;
  const accountIdentifier =
    details?.username ??
    details?.loginEmail ??
    player?.displayName ??
    player?.email ??
    "your account";

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
        <span className="inline-flex items-center rounded-full border border-amber-600/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-900 dark:text-amber-400">
          Currently Unavailable
        </span>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed">
        Permanently delete your Civil Craft player account, gameplay progression, bridge saves, and
        website profile. This destructive action cannot be undone.
      </p>

      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-xs space-y-1.5 text-muted-foreground">
        <p className="font-semibold text-foreground">Self-Service Deletion Status: Unavailable</p>
        <p className="leading-relaxed">
          Automated account deletion is currently not available in the dashboard while backend
          data-erasure systems are being finalized. If you need your account closed or personal data
          removed, please contact the CivilCraft support team.
        </p>
      </div>

      <div>
        <Button
          type="button"
          variant="outline"
          className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setShowDeleteDialog(true)}
        >
          <AlertTriangle className="mr-2 h-4 w-4" aria-hidden="true" />
          Delete Account (Unavailable)
        </Button>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="panel max-w-lg border-2 border-border bg-card p-6 shadow-xl space-y-4">
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              <AlertDialogTitle className="font-display text-xl text-foreground">
                Account Deletion Unavailable
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              Automated self-service account deletion is currently not operational for account{" "}
              <strong className="text-foreground">{accountIdentifier}</strong>
              {details?.playFabId ? (
                <>
                  {" "}
                  (PlayFab ID:{" "}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">{details.playFabId}</code>)
                </>
              ) : null}
              .
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 text-xs text-muted-foreground">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-1.5 text-foreground">
              <p className="font-semibold text-amber-900 dark:text-amber-400">
                Current Backend Status: Offline
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                No deletion request has been submitted or processed. An automated self-service
                request pipeline is not yet operational on this backend.
              </p>
            </div>

            <p className="leading-relaxed">
              CivilCraft account progression, bridge designs, and game records are distributed
              across game and platform servers. Permanent deletion requires manual administrative
              processing to ensure complete and safe data removal.
            </p>

            <p className="leading-relaxed">
              If you wish to request account closure or personal data erasure in accordance with our
              Privacy Policy, please contact the CivilCraft administration team directly.
            </p>
          </div>

          <AlertDialogFooter className="mt-4 gap-2">
            <Button type="button" variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Close
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setShowDeleteDialog(false);
                void logout("player");
              }}
            >
              Sign Out
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
