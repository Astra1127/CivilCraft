import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { BarChart3, BookOpen, Medal, Receipt, Settings, Trophy, User, Mail } from "lucide-react";
import { useEffect } from "react";
import { DashboardShell, type DashboardNavItem } from "@/components/dashboard/DashboardShell";
import { LoadingState } from "@/components/common/States";
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
  { to: "/dashboard/leaderboards", label: "Leaderboard", icon: Trophy, section: "Overview" },
  { to: "/dashboard/achievements", label: "Achievements", icon: Medal, section: "Overview" },
  { to: "/dashboard/transactions", label: "Transactions", icon: Receipt, section: "Overview" },
  { to: "/dashboard/profile", label: "Profile", icon: User, section: "Account" },
  { to: "/dashboard/messages", label: "Messages", icon: Mail, section: "Account" },
  { to: "/dashboard/settings", label: "Settings", icon: Settings, section: "Account" },
];

function PlayerLayout() {
  const { ready, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Player sessions only: an administrator session grants no dashboard access.
  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated) navigate({ to: "/login", replace: true });
  }, [ready, isAuthenticated, navigate]);

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
