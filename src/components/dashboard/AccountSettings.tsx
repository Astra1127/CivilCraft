import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { getAccountSettings, updateContactEmail } from "@/lib/playfab/account-settings";
import { requestPasswordReset } from "@/lib/playfab/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState, LoadingState } from "@/components/common/States";
import { PlayerName } from "@/components/common/PlayerName";

export function AccountSettings() {
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
    <div className="panel space-y-6 p-6">
      <section className="space-y-2">
        <h2 className="text-xl">Account username</h2>
        <p className="font-semibold">{details.username ?? "No username linked"}</p>
        <p className="text-sm text-muted-foreground">
          Your login username cannot be renamed through PlayFab's player API. It is separate from
          your character name and display name (
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
          Email verification requires the game's PlayFab verification-email rule. Follow the
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
          Use a password-reset email to change your shared game and website password. PlayFab's
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
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
