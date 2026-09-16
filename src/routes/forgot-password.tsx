import { createFileRoute, Link } from "@tanstack/react-router";
import { KeyRound, MailCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { IntegrationNotice } from "@/components/common/DemoBadge";
import { PublicLayout } from "@/components/site/PublicLayout";
import { BrandMark } from "@/components/site/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import heroKeyart from "@/assets/hero-keyart.jpg";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Recover Your Account — Civil Craft: Bridge Edition" },
      {
        name: "description",
        content:
          "Send a Civil Craft account recovery email and set a new password for your engineer account.",
      },
      { property: "og:title", content: "Recover Your Account — Civil Craft" },
      { property: "og:description", content: "Reset the password for your Civil Craft account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ForgotPasswordPage,
});

const COOLDOWN_SECONDS = 45;
const schema = z.string().trim().email("Enter a valid email address").max(255);

function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cooldown > 0) return;
    const parsed = schema.safeParse(email);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid email address");
      return;
    }
    setError("");
    setPending(true);
    try {
      await requestPasswordReset(parsed.data);
      setSent(true);
      setCooldown(COOLDOWN_SECONDS);
      toast.success("Recovery request received");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the recovery email");
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
              src={heroKeyart}
              alt="Chibi engineers inspecting a wooden truss bridge in Civil Craft"
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </div>

          <div className="panel p-6 sm:p-8">
            <BrandMark />
            <h1 className="mt-6 text-3xl">Forgot Your Password?</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter the email address on your Civil Craft account and we'll send a recovery link.
            </p>

            {sent ? (
              <div className="mt-6 space-y-4">
                <div className="panel flex flex-col items-center gap-2 border-gold/60 px-5 py-8 text-center">
                  <MailCheck className="h-9 w-9 text-gold" aria-hidden="true" />
                  <h2 className="font-display text-xl">Recovery request received</h2>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    If an account exists for that email, password recovery instructions have been
                    sent.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={cooldown > 0 || pending}
                  onClick={submit}
                >
                  {cooldown > 0 ? `Resend available in ${cooldown}s` : "Resend recovery email"}
                </Button>
                <Button asChild variant="gold" size="lg" className="w-full">
                  <Link to="/login">Return to Login</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} noValidate className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="recovery-email">Email</Label>
                  <Input
                    id="recovery-email"
                    type="email"
                    autoComplete="email"
                    className="border-2"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  {error ? <p className="text-xs font-semibold text-destructive">{error}</p> : null}
                </div>
                <Button
                  type="submit"
                  variant="gold"
                  size="lg"
                  className="w-full"
                  disabled={pending}
                >
                  <KeyRound className="mr-2 h-5 w-5" aria-hidden="true" />
                  {pending ? "Sending…" : "Send Recovery Email"}
                </Button>
                <p className="text-center text-sm font-semibold">
                  Remembered it?{" "}
                  <Link to="/login" className="text-gold hover:underline">
                    Return to Login
                  </Link>
                </p>
              </form>
            )}

            <IntegrationNotice>
              Recovery emails are sent by the Civil Craft account service to the address on your
              game account.
            </IntegrationNotice>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
