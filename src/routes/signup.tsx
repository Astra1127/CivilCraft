import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Check, Eye, EyeOff, HardHat, MailCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { IntegrationNotice } from "@/components/common/DemoBadge";
import { PublicLayout } from "@/components/site/PublicLayout";
import { BrandMark } from "@/components/site/BrandMark";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION, passwordRules } from "@/lib/playfab";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Become an Engineer — Civil Craft: Bridge Edition" },
      {
        name: "description",
        content:
          "Create your Civil Craft engineer account to track progress and achievements alongside the game.",
      },
      { property: "og:title", content: "Become an Engineer — Civil Craft" },
      { property: "og:description", content: "Create your Civil Craft player account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SignupPage,
});

const schema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3, "Username must be at least 3 characters")
      .max(24)
      .regex(/^[a-zA-Z0-9_]+$/, "Use letters, numbers and underscores only"),
    email: z.string().trim().email("Enter a valid email address").max(255),
    password: z
      .string()
      .max(128)
      .refine((v) => passwordRules.every((r) => r.test(v)), {
        message: "Password does not meet all requirements",
      }),
    confirm: z.string().max(128),
    agreedToPolicies: z.literal(true, {
      errorMap: () => ({
        message: "You must agree to the Terms of Use and Privacy Policy to create an account",
      }),
    }),
    emailUpdates: z.boolean().default(false),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "Passwords do not match",
  });

function SignupPage() {
  const { register, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState({
    username: "",
    email: "",
    password: "",
    confirm: "",
    agreedToPolicies: false,
    emailUpdates: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) navigate({ to: "/dashboard", replace: true });
  }, [isAuthenticated, navigate]);

  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

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
      // Registration NEVER signs the player in — the backend owns verification.
      const result = await register({
        username: parsed.data.username,
        email: parsed.data.email,
        password: parsed.data.password,
        emailUpdates: parsed.data.emailUpdates,
        termsAccepted: true,
        termsVersion: CURRENT_TERMS_VERSION,
        privacyVersion: CURRENT_PRIVACY_VERSION,
        policyAcceptedAt: new Date().toISOString(),
      });
      setRegisteredEmail(result.email);
      toast.success("Account created — check your email to verify it");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create account");
    } finally {
      setPending(false);
    }
  };

  const field = (id: keyof typeof values, label: string, type = "text", autoComplete?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        autoComplete={autoComplete}
        value={values[id] as string}
        onChange={set(id)}
        className="border-2"
      />
      {errors[id] ? <p className="text-xs font-semibold text-destructive">{errors[id]}</p> : null}
    </div>
  );

  const passwordField = (id: "password" | "confirm", label: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          value={values[id]}
          onChange={set(id)}
          className="border-2 pr-11"
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
      {errors[id] ? <p className="text-xs font-semibold text-destructive">{errors[id]}</p> : null}
    </div>
  );

  return (
    <PublicLayout>
      <div className="blueprint bg-background px-4 py-12 sm:px-6">
        <div className="mx-auto grid max-w-6xl items-stretch gap-8 lg:grid-cols-2">
          <div className="game-frame relative order-2 hidden lg:block">
            <img
              src="/images/gameplay/about-gameplay.png"
              alt="Civil Craft gameplay showing the player and constructed bridge"
              loading="lazy"
              className="h-full w-full object-cover object-center"
            />
          </div>

          <div className="panel order-1 p-6 sm:p-8">
            <BrandMark />

            {registeredEmail ? (
              <div className="mt-6 space-y-5">
                <div className="panel flex flex-col items-center gap-2 border-gold/60 px-5 py-10 text-center">
                  <MailCheck className="h-10 w-10 text-gold" aria-hidden="true" />
                  <h1 className="font-display text-2xl">Verify your email</h1>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    We sent a verification link to <strong>{registeredEmail}</strong>. Confirm your
                    address, then sign in to open your engineer dashboard.
                  </p>
                </div>
                <Button asChild variant="gold" size="lg" className="w-full">
                  <Link to="/login">Go to Login</Link>
                </Button>
              </div>
            ) : (
              <>
                <h1 className="mt-6 text-3xl">Become an Engineer</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Create your Civil Craft account to track progress and achievements.
                </p>

                <form onSubmit={submit} noValidate className="mt-6 space-y-4">
                  {field("username", "Username", "text", "username")}
                  {field("email", "Email", "email", "email")}
                  {passwordField("password", "Password")}
                  <ul className="grid gap-1 rounded-xl border-2 border-dashed border-border/70 p-3 sm:grid-cols-2">
                    {passwordRules.map((rule) => {
                      const ok = rule.test(values.password);
                      return (
                        <li
                          key={rule.id}
                          className={cn(
                            "flex items-center gap-2 text-xs font-semibold",
                            ok ? "text-gold" : "text-muted-foreground",
                          )}
                        >
                          {ok ? (
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          {rule.label}
                        </li>
                      );
                    })}
                  </ul>
                  {passwordField("confirm", "Confirm Password")}

                  {/* Required User Agreement */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-start gap-2.5">
                      <Checkbox
                        id="agreedToPolicies"
                        checked={values.agreedToPolicies}
                        onCheckedChange={(checked) => {
                          setValues((v) => ({ ...v, agreedToPolicies: checked === true }));
                          if (checked) {
                            setErrors((e) => {
                              const { agreedToPolicies: _, ...rest } = e;
                              return rest;
                            });
                          }
                        }}
                        className="mt-0.5 border-2 border-border"
                        aria-invalid={!!errors["agreedToPolicies"]}
                        aria-describedby={
                          errors["agreedToPolicies"] ? "agreedToPolicies-error" : undefined
                        }
                      />
                      <Label
                        htmlFor="agreedToPolicies"
                        className="cursor-pointer text-xs leading-relaxed text-foreground select-none"
                      >
                        I have read and agree to the{" "}
                        <Link
                          to="/terms"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-gold underline underline-offset-2 hover:text-gold/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          Terms of Use
                        </Link>{" "}
                        and{" "}
                        <Link
                          to="/privacy"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-gold underline underline-offset-2 hover:text-gold/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          Privacy Policy
                        </Link>
                        .{" "}
                        <span className="text-destructive" aria-hidden="true">
                          *
                        </span>
                      </Label>
                    </div>
                    {errors["agreedToPolicies"] ? (
                      <p
                        id="agreedToPolicies-error"
                        className="text-xs font-semibold text-destructive"
                      >
                        {errors["agreedToPolicies"]}
                      </p>
                    ) : null}
                  </div>

                  {/* Optional Email Updates Consent */}
                  <div className="space-y-1 pb-1">
                    <div className="flex items-start gap-2.5">
                      <Checkbox
                        id="emailUpdates"
                        checked={values.emailUpdates}
                        onCheckedChange={(checked) =>
                          setValues((v) => ({ ...v, emailUpdates: checked === true }))
                        }
                        className="mt-0.5 border-2 border-border"
                      />
                      <Label
                        htmlFor="emailUpdates"
                        className="cursor-pointer text-xs leading-relaxed text-muted-foreground select-none"
                      >
                        (Optional) Send me email updates about Civil Craft releases, announcements,
                        and features.
                      </Label>
                    </div>
                    <p className="pl-6.5 text-[11px] text-muted-foreground/80">
                      You can change this anytime in Player Settings. Password recovery and
                      essential account messages are sent independently of this preference.
                    </p>
                  </div>

                  <Button
                    type="submit"
                    variant="gold"
                    size="lg"
                    className="w-full"
                    disabled={pending}
                  >
                    <HardHat className="mr-2 h-5 w-5" aria-hidden="true" />
                    {pending ? "Creating account…" : "Create Account"}
                  </Button>
                </form>

                <IntegrationNotice>
                  Your account is created on the Civil Craft game servers, so you can use it to play
                  the game as well as sign in here.
                </IntegrationNotice>

                <p className="mt-4 text-center text-sm font-semibold">
                  Already have an account?{" "}
                  <Link to="/login" className="text-gold hover:underline">
                    Login
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
