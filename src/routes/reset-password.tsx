import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Eye, EyeOff, KeyRound } from "lucide-react";
import { useRef, useState } from "react";
import { PublicLayout } from "@/components/site/PublicLayout";
import { BrandMark } from "@/components/site/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  invalidResetLink,
  resetFailure,
  resetFormSchema,
  resetTokenSchema,
} from "@/lib/playfab/reset-password";
import heroKeyart from "@/assets/hero-keyart.jpg";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): { token?: string | undefined } => ({
    token: resetTokenSchema.safeParse(search["token"]).success
      ? String(search["token"])
      : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Reset Your Password — Civil Craft: Bridge Edition" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token } = Route.useSearch();
  return <ResetPasswordForm key={token ?? "missing"} token={token} />;
}

function ResetPasswordForm({ token }: { token?: string | undefined }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState({ password: false, confirm: false });
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current || success) return;
    const parsed = resetFormSchema.safeParse({ token, password, confirm });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? resetFailure);
      return;
    }
    submitting.current = true;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: parsed.data.token, password: parsed.data.password }),
      });
      if (!response.ok || (await response.json()).success !== true) throw new Error();
      setPassword("");
      setConfirm("");
      setSuccess(true);
      // Remove the used token from this history entry without persisting it elsewhere.
      window.history.replaceState(window.history.state, "", window.location.pathname);
    } catch {
      setError(resetFailure);
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };
  return (
    <PublicLayout>
      <div className="blueprint bg-background px-4 py-12 sm:px-6">
        <div className="mx-auto grid max-w-6xl items-stretch gap-8 lg:grid-cols-2">
          <div className="game-frame hidden lg:block">
            <img
              src={heroKeyart}
              alt="Engineers building a Civil Craft bridge"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="panel p-6 sm:p-8">
            <BrandMark />
            <h1 className="mt-6 text-3xl">Reset Your Password</h1>
            {success ? (
              <div role="status" className="mt-6 space-y-4">
                <div className="panel flex flex-col items-center gap-2 border-gold/60 px-5 py-8 text-center">
                  <CheckCircle2 className="h-9 w-9 text-gold" aria-hidden="true" />
                  <h2 className="font-display text-xl">Password updated</h2>
                  <p className="text-sm text-muted-foreground">
                    Your Civil Craft password has been reset successfully.
                  </p>
                </div>
                <Button asChild variant="gold" className="w-full">
                  <Link to="/login">Return to Login</Link>
                </Button>
              </div>
            ) : !token ? (
              <div className="mt-6 space-y-4">
                <p role="alert">{invalidResetLink}</p>
                <Button asChild variant="gold" className="w-full">
                  <Link to="/forgot-password">Request a new recovery email</Link>
                </Button>
                <Link to="/login" className="block text-center text-sm text-gold hover:underline">
                  Return to Login
                </Link>
              </div>
            ) : (
              <form onSubmit={submit} noValidate className="mt-6 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Choose a new password for your Civil Craft account.
                </p>
                <p id="password-help" className="text-xs text-muted-foreground">
                  Use 8–128 characters, including uppercase, lowercase and a number.
                </p>
                {(["password", "confirm"] as const).map((field) => (
                  <div key={field} className="space-y-1.5">
                    <Label htmlFor={`reset-${field}`}>
                      {field === "password" ? "New Password" : "Confirm New Password"}
                    </Label>
                    <div className="relative">
                      <Input
                        id={`reset-${field}`}
                        type={visible[field] ? "text" : "password"}
                        autoComplete="new-password"
                        required
                        maxLength={128}
                        disabled={pending}
                        value={field === "password" ? password : confirm}
                        aria-describedby={error ? "password-help reset-error" : "password-help"}
                        onChange={(e) =>
                          field === "password"
                            ? setPassword(e.target.value)
                            : setConfirm(e.target.value)
                        }
                        className="border-2 pr-12"
                      />
                      <button
                        type="button"
                        aria-label={`${visible[field] ? "Hide" : "Show"} ${field === "password" ? "new password" : "password confirmation"}`}
                        aria-pressed={visible[field]}
                        onClick={() => setVisible((v) => ({ ...v, [field]: !v[field] }))}
                        className="absolute inset-y-0 right-0 px-3 text-muted-foreground"
                      >
                        {visible[field] ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
                {error && (
                  <p id="reset-error" role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
                <Button
                  type="submit"
                  variant="gold"
                  size="lg"
                  className="w-full"
                  disabled={pending}
                >
                  <KeyRound className="mr-2 h-5 w-5" aria-hidden="true" />
                  {pending ? "Resetting…" : "Reset Password"}
                </Button>
                {error && (
                  <Link
                    to="/forgot-password"
                    className="block text-center text-sm text-gold hover:underline"
                  >
                    Request a new recovery email
                  </Link>
                )}
                <Link to="/login" className="block text-center text-sm text-gold hover:underline">
                  Return to Login
                </Link>
              </form>
            )}
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
