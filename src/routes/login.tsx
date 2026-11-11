import { playerReturnTo, SESSION_EXPIRED_MESSAGE } from "@/lib/playfab/session-errors";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, LogIn, Mail, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { DemoBadge, IntegrationNotice } from "@/components/common/DemoBadge";
import { PublicLayout } from "@/components/site/PublicLayout";
import { BrandMark } from "@/components/site/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { parsePlayerName } from "@/lib/player-name";
import { EmailVerificationRequiredError } from "@/lib/playfab";
import { cn } from "@/lib/utils";
import {
  COIN_LOGIN_MESSAGE,
  DIAMOND_LOGIN_MESSAGE,
  isDiamondShopDestination,
  isShopDestination,
} from "@/lib/payments/shop-display";

export const Route = createFileRoute("/login")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { redirect?: string; reason?: "expired"; verified?: boolean } => ({
    ...(typeof search["redirect"] === "string"
      ? { redirect: playerReturnTo(search["redirect"]) }
      : {}),
    ...(search["reason"] === "expired" ? { reason: "expired" as const } : {}),
    ...(search["verified"] === true || search["verified"] === "true" ? { verified: true } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Player Sign In — Civil Craft: Bridge Edition" },
      {
        name: "description",
        content:
          "Sign in with your Civil Craft game account to view your progress, stats and achievements.",
      },
      { property: "og:title", content: "Player Sign In — Civil Craft" },
      { property: "og:description", content: "Access your player dashboard." },
    ],
  }),
  component: LoginPage,
});

/** PlayFab accepts an email address or a username as the login identifier. */
const schema = z.object({
  email: z
    .string()
    .trim()
    .min(3, "Enter your email address or username")
    .max(255)
    .refine((v) => (v.includes("@") ? z.string().email().safeParse(v).success : v.length >= 3), {
      message: "Enter a valid email address or username",
    }),
  password: z.string().min(4, "Password must be at least 4 characters").max(128),
});

function LoginPage() {
  const { login, isAuthenticated, sessionExpired } = useAuth();
  const search = Route.useSearch();
  const destination = playerReturnTo(search.redirect);
  const navigate = useNavigate();
  const [values, setValues] = useState({ email: "", password: "" });
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Email verification enforcement state
  const [unverifiedAccount, setUnverifiedAccount] = useState<{
    maskedEmail: string;
    identifier: string;
    sessionTicket?: string;
  } | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (isAuthenticated) navigate({ to: destination, replace: true });
  }, [isAuthenticated, navigate, destination]);

  const handleResendVerification = async () => {
    if (!unverifiedAccount || cooldown > 0 || resending) return;
    setResending(true);
    try {
      const res = await fetch("/api/player/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: unverifiedAccount.identifier,
          ...(unverifiedAccount.sessionTicket
            ? { sessionTicket: unverifiedAccount.sessionTicket }
            : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Unable to resend verification email.");
      }
      if (data.alreadyVerified) {
        toast.success("Your email is already verified! You can now sign in.");
        setUnverifiedAccount(null);
      } else {
        toast.success(data.message || "Verification email sent. Please check your inbox.");
        setCooldown(data.cooldownSeconds ?? 60);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to resend verification link.");
    } finally {
      setResending(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const identity = await login(parsed.data);
      toast.success(`Welcome back, ${parsePlayerName(identity.displayName).text}`);
      navigate({ to: destination, replace: true });
    } catch (err) {
      if (err instanceof EmailVerificationRequiredError) {
        setUnverifiedAccount({
          maskedEmail: err.maskedEmail,
          identifier: err.identifier,
          sessionTicket: err.sessionTicket,
        });
        toast.error("Please verify your email address to sign in.");
      } else {
        toast.error(err instanceof Error ? err.message : "Sign in failed");
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <PublicLayout>
      <div className="blueprint bg-background px-4 py-12 sm:px-6">
        <div className="mx-auto grid max-w-6xl items-stretch gap-8 lg:grid-cols-2">
          <div className="game-frame hidden lg:block">
            <img
              src="/images/gameplay/about-gameplay.png"
              alt="Civil Craft gameplay showing the player and constructed bridge"
              loading="lazy"
              className="h-full w-full object-cover object-center"
            />
          </div>

          <div className="panel p-6 sm:p-8">
            <div className="flex items-start justify-between gap-3">
              <BrandMark size="auth" />
              <DemoBadge />
            </div>

            {search.verified ? (
              <div
                role="status"
                className="mt-6 flex items-start gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200"
              >
                <CheckCircle2
                  className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                <div>
                  <h3 className="font-semibold text-sm">Email Verified Successfully!</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Your email address has been verified. You can now sign in with your Civil Craft
                    credentials.
                  </p>
                </div>
              </div>
            ) : null}

            {unverifiedAccount ? (
              <div className="mt-6 space-y-5">
                <div className="panel flex flex-col items-center gap-3 border-gold/60 p-6 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold/15 text-gold">
                    <Mail className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <h2 className="font-display text-2xl">Verify Your Email First!</h2>
                  <p className="max-w-md text-sm text-muted-foreground">
                    Your Civil Craft account has been created, but your email address has not yet
                    been verified.
                  </p>
                  <p className="max-w-md text-sm text-muted-foreground">
                    Please check your inbox and click the verification link we sent you. Once
                    verified, you can return here and log in.
                  </p>
                  <div className="rounded-lg border border-gold/40 bg-gold/10 px-3.5 py-1.5 font-mono text-sm font-semibold text-foreground">
                    {unverifiedAccount.maskedEmail}
                  </div>
                  <p className="max-w-md text-xs text-muted-foreground">
                    Please check your inbox (and spam folder) for the verification message.
                  </p>
                </div>

                <div className="space-y-3">
                  <Button
                    type="button"
                    variant="gold"
                    size="lg"
                    className="w-full"
                    onClick={handleResendVerification}
                    disabled={resending || cooldown > 0}
                  >
                    <RefreshCw
                      className={cn("mr-2 h-4 w-4", resending && "animate-spin")}
                      aria-hidden="true"
                    />
                    {resending
                      ? "Sending Link…"
                      : cooldown > 0
                        ? `Resend in ${cooldown}s`
                        : "Resend Verification Email"}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="w-full"
                    onClick={() => setUnverifiedAccount(null)}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                    Back to Sign In
                  </Button>
                </div>

                <p className="text-center text-xs text-muted-foreground">
                  Already verified? Click "Back to Sign In" and enter your credentials.
                </p>
              </div>
            ) : (
              <>
                <h1 className="mt-6 text-3xl">Welcome Back, Engineer!</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Sign in with the same account you use in the game.
                </p>
                {isShopDestination(destination) ? (
                  <p
                    role="note"
                    className="mt-4 rounded-lg border border-gold/40 bg-gold/10 p-3 text-sm font-semibold"
                  >
                    {isDiamondShopDestination(destination)
                      ? DIAMOND_LOGIN_MESSAGE
                      : COIN_LOGIN_MESSAGE}
                    {destination.includes("gameLink=")
                      ? " We will check that this website account matches the account that opened the shop in the game."
                      : ""}
                  </p>
                ) : null}

                {search.reason === "expired" || sessionExpired ? (
                  <p role="alert" className="mt-4 text-sm text-destructive">
                    {SESSION_EXPIRED_MESSAGE}
                  </p>
                ) : null}
                <form onSubmit={submit} noValidate className="mt-6 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email / Username</Label>
                    <Input
                      id="email"
                      type="text"
                      inputMode="email"
                      autoComplete="username"
                      className="border-2"
                      value={values.email}
                      onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
                    />
                    {errors["email"] ? (
                      <p className="text-xs font-semibold text-destructive">{errors["email"]}</p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        className="border-2 pr-11"
                        value={values.password}
                        onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                    {errors["password"] ? (
                      <p className="text-xs font-semibold text-destructive">{errors["password"]}</p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                        className="h-4 w-4 rounded border-2 border-input accent-[var(--gold)]"
                      />
                      Remember Me
                    </label>
                    <Link
                      to="/forgot-password"
                      className="text-sm font-semibold text-gold hover:underline"
                    >
                      Forgot Password?
                    </Link>
                  </div>

                  <Button
                    type="submit"
                    variant="gold"
                    size="lg"
                    className="w-full"
                    disabled={pending}
                  >
                    <LogIn className="mr-2 h-5 w-5" aria-hidden="true" />
                    {pending ? "Signing in…" : "Player Login"}
                  </Button>
                </form>

                <IntegrationNotice>
                  Use the same Civil Craft account you play with — the website signs in to the same
                  game servers. Administrator accounts use the separate admin portal.
                </IntegrationNotice>

                <p className="mt-4 text-center text-sm font-semibold">
                  Don't have an account?{" "}
                  <Link to="/signup" className="text-gold hover:underline">
                    Create Account
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
