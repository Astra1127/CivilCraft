import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Eye, EyeOff, LogIn } from "lucide-react";
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
import heroKeyart from "@/assets/hero-keyart.jpg";



export const Route = createFileRoute("/login")({
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
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState({ email: "", password: "" });
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);


  useEffect(() => {
    if (isAuthenticated) navigate({ to: "/dashboard", replace: true });
  }, [isAuthenticated, navigate]);

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
      toast.success(`Welcome back, ${identity.displayName}`);
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
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
              alt="Chibi engineers on a wooden truss bridge in the Civil Craft desert canyon"
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </div>

          <div className="panel p-6 sm:p-8">
            <div className="flex items-start justify-between gap-3">
              <BrandMark />
              <DemoBadge />
            </div>
            <h1 className="mt-6 text-3xl">Welcome Back, Engineer!</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in with the same account you use in the game.
            </p>

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
                {errors['email'] ? (
                  <p className="text-xs font-semibold text-destructive">{errors['email']}</p>
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
                {errors['password'] ? (
                  <p className="text-xs font-semibold text-destructive">{errors['password']}</p>
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
                <Link to="/forgot-password" className="text-sm font-semibold text-gold hover:underline">
                  Forgot Password?
                </Link>
              </div>

              <Button type="submit" variant="gold" size="lg" className="w-full" disabled={pending}>
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
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}

