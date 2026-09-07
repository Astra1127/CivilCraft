import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { IntegrationNotice } from "@/components/common/DemoBadge";
import { BrandMark } from "@/components/site/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

/**
 * Administrator portal sign-in. Deliberately separate from the player login:
 * no registration, no guest access, no social sign-in and no password
 * recovery — administrator credentials are provisioned by the backend.
 */
export const Route = createFileRoute("/admin/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Administrator Sign In — Civil Craft: Bridge Edition" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "Restricted administrator access to the Civil Craft control centre." },
    ],
  }),
  component: AdminLoginPage,
});

const schema = z.object({
  email: z.string().trim().min(3, "Enter your administrator email or username").max(255),
  password: z.string().min(4, "Password must be at least 4 characters").max(128),
});

function AdminLoginPage() {
  const { loginAdmin, isAdmin, ready } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (ready && isAdmin) navigate({ to: "/admin", replace: true });
  }, [ready, isAdmin, navigate]);

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
      const identity = await loginAdmin(parsed.data);
      toast.success(`Signed in as ${identity.displayName}`);
      navigate({ to: "/admin", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Administrator sign in failed");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="blueprint grid min-h-dvh place-items-center bg-background px-4 py-12">
      <div className="panel w-full max-w-md p-6 sm:p-8">
        <BrandMark />
        <div className="mt-6 flex items-center gap-2 text-gold">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          <p className="text-xs font-extrabold uppercase tracking-[0.18em]">Restricted area</p>
        </div>
        <h1 className="mt-1 text-3xl">Administrator Sign In</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Staff access only. Player accounts cannot sign in here.
        </p>

        <form onSubmit={submit} noValidate className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="admin-email">Admin email / username</Label>
            <Input
              id="admin-email"
              type="text"
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
            <Label htmlFor="admin-password">Password</Label>
            <div className="relative">
              <Input
                id="admin-password"
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

          <Button type="submit" variant="gold" size="lg" className="w-full" disabled={pending}>
            {pending ? "Signing in…" : "Admin Login"}
          </Button>
        </form>

        <IntegrationNotice>
          Administrator access is verified on the Civil Craft server. Player accounts cannot sign
          in here.
        </IntegrationNotice>
      </div>
    </div>
  );
}
