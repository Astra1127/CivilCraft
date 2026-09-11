import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/site/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { ADMIN_AUTH_MESSAGES, type AdminAuthError } from "@/lib/admin-auth/types";

export const Route = createFileRoute("/admin/login")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { error?: AdminAuthError } => {
    const error = search["error"];
    return typeof error === "string" && Object.hasOwn(ADMIN_AUTH_MESSAGES, error)
      ? { error: error as AdminAuthError }
      : {};
  },
  head: () => ({
    meta: [
      { title: "Administrator Sign In — Civil Craft: Bridge Edition" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const { loginAdmin, isAdmin, ready, adminReady, adminConfigured, adminSessionError } = useAuth();
  const { error } = Route.useSearch();
  const navigate = useNavigate();
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && isAdmin) void navigate({ to: "/admin", replace: true });
  }, [ready, isAdmin, navigate]);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const message =
    loginError ??
    (offline
      ? ADMIN_AUTH_MESSAGES.offline
      : adminSessionError
        ? ADMIN_AUTH_MESSAGES.failed
        : adminReady && !adminConfigured
          ? "Administrator authentication is not configured."
          : error
            ? ADMIN_AUTH_MESSAGES[error]
            : null);

  return (
    <div className="blueprint grid min-h-dvh place-items-center bg-background px-4 py-12">
      <div className="panel w-full min-w-0 max-w-md p-6 sm:p-8">
        <BrandMark />
        <div className="mt-6 flex items-center gap-2 text-gold">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          <p className="text-xs font-extrabold uppercase tracking-[0.18em]">Restricted area</p>
        </div>
        <h1 className="mt-1 text-3xl">Administrator Sign In</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Staff access only. Player accounts cannot sign in here.
        </p>
        <form
          method="post"
          action="/api/auth/admin/login"
          className="mt-6 space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (pending) return;
            setLoginError(null);
            setPending(true);
            try {
              await loginAdmin({ email, password });
            } catch (error) {
              setLoginError(error instanceof Error ? error.message : ADMIN_AUTH_MESSAGES.failed);
            } finally {
              setPassword("");
              setPending(false);
            }
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="admin-email">Admin Email</Label>
            <Input
              id="admin-email"
              name="email"
              type="email"
              autoComplete="username"
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={pending}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-password">Password</Label>
            <Input
              id="admin-password"
              name="password"
              type="password"
              autoComplete="current-password"
              maxLength={1024}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={pending}
              required
            />
          </div>
          <Button
            type="submit"
            variant="gold"
            size="lg"
            className="w-full min-h-12"
            disabled={!adminReady || !adminConfigured || pending || offline}
          >
            {pending ? "Signing in..." : "Admin Login"}
          </Button>
        </form>
        {message ? (
          <p role="alert" className="mt-4 text-sm font-semibold text-destructive">
            {message}
          </p>
        ) : null}
        <p className="mt-5 text-sm text-muted-foreground">
          Administrator credentials are verified securely by the Civil Craft server.
        </p>
      </div>
    </div>
  );
}
