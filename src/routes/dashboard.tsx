import { playerReturnTo } from "@/lib/playfab/session-errors";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  BookOpen,
  Coins,
  Mail,
  Medal,
  Receipt,
  Settings,
  Trophy,
  User,
} from "lucide-react";
import { useEffect } from "react";
import { DashboardShell, type DashboardNavItem } from "@/components/dashboard/DashboardShell";
import { ErrorState, LoadingState } from "@/components/common/States";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Player Dashboard — Civil Craft: Bridge Edition" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content: "Your Civil Craft progress, statistics, achievements and engineering journal.",
      },
    ],
  }),
  component: PlayerLayout,
});

const items: DashboardNavItem[] = [
  { to: "/dashboard", label: "Overview", icon: BarChart3, section: "Overview" },
  { to: "/dashboard/almanac", label: "Bridge Almanac", icon: BookOpen, section: "Overview" },
  { to: "/dashboard/leaderboards", label: "Leaderboards", icon: Trophy, section: "Overview" },
  { to: "/dashboard/achievements", label: "Achievements", icon: Medal, section: "Overview" },
  { to: "/dashboard/transactions", label: "Transactions", icon: Receipt, section: "Overview" },
  { to: "/dashboard/shop", label: "Coin & Diamond Shop", icon: Coins, section: "Account" },
  { to: "/dashboard/profile", label: "Profile", icon: User, section: "Account" },
  { to: "/dashboard/messages", label: "Messages", icon: Mail, section: "Account" },
  { to: "/dashboard/settings", label: "Settings", icon: Settings, section: "Account" },
];

function PlayerLayout() {
  const { ready, isAuthenticated, sessionExpired, playerSessionError, retryPlayerSession } =
    useAuth();
  const navigate = useNavigate();

  // Player sessions only: an administrator session grants no dashboard access.
  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated)
      navigate({
        to: "/login",
        search: {
          redirect: playerReturnTo(
            typeof window === "undefined"
              ? "/dashboard"
              : window.location.pathname + window.location.search + window.location.hash,
          ),
          ...(sessionExpired ? { reason: "expired" as const } : {}),
        },
        replace: true,
      });
  }, [ready, isAuthenticated, sessionExpired, navigate]);

  if (!ready && playerSessionError)
    return (
      <div className="mx-auto max-w-3xl px-4 py-20">
        <ErrorState
          title="Unable to verify your session."
          description="Please check your connection and try again. Your saved session has not been removed."
          onRetry={retryPlayerSession}
        />
      </div>
    );

  if (!ready || !isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20">
        <LoadingState label="Checking your session…" rows={2} />
      </div>
    );
  }

  return (
    <DashboardShell items={items} title="Player Dashboard">
      <Outlet />
    </DashboardShell>
  );
}
