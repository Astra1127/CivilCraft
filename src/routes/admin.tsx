import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import {
  Bug,
  Gauge,
  Image,
  Newspaper,
  HelpCircle,
  LayoutDashboard,
  Mail,
  Package,
  Receipt,
  Settings,
  Users,
  Trophy,
} from "lucide-react";
import { useEffect } from "react";
import { LoadingState } from "@/components/common/States";
import { DashboardShell, type DashboardNavItem } from "@/components/dashboard/DashboardShell";
import { useAuth } from "@/lib/auth";
import { getAdminSession } from "@/lib/admin-auth/functions";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const login = location.pathname.replace(/\/+$/, "") === "/admin/login";
    const session = await getAdminSession().catch(() => null);
    if (login) {
      if (session?.authenticated) throw redirect({ to: "/admin" });
      return;
    }
    if (!session?.authenticated) throw redirect({ to: "/admin/login" });
  },
  staleTime: 0,
  head: () => ({
    meta: [
      { title: "Admin Dashboard — Civil Craft: Bridge Edition" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "Manage website content, releases and player enquiries." },
    ],
  }),
  component: AdminLayout,
});

const items: DashboardNavItem[] = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, section: "Dashboard" },
  { to: "/admin/players", label: "Players", icon: Users, section: "Game" },
  { to: "/admin/leaderboard", label: "Leaderboard", icon: Trophy, section: "Game" },
  { to: "/admin/releases", label: "Game & Download", icon: Package, section: "Game" },
  { to: "/admin/transactions", label: "Transactions", icon: Receipt, section: "Game" },
  { to: "/admin/news", label: "Updates", icon: Newspaper, section: "Content" },
  { to: "/admin/gallery", label: "Gallery", icon: Image, section: "Content" },
  { to: "/admin/faq", label: "FAQ", icon: HelpCircle, section: "Content" },
  { to: "/admin/messages", label: "Messages", icon: Mail, section: "Communication" },
  { to: "/admin/bugs", label: "Bug Reports", icon: Bug, section: "Communication" },
  { to: "/admin/integration", label: "Integration", icon: Gauge, section: "System" },
  { to: "/admin/settings", label: "Settings", icon: Settings, section: "System" },
];

function AdminLayout() {
  const { adminReady: ready, isAdmin } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // The admin sign-in page is the one child that renders outside the guard.
  const isLoginRoute = pathname === "/admin/login" || pathname === "/admin/login/";

  useEffect(() => {
    if (!ready || isLoginRoute) return;
    if (!isAdmin) navigate({ to: "/admin/login", replace: true });
  }, [ready, isAdmin, isLoginRoute, navigate]);

  if (isLoginRoute) return <Outlet />;

  if (!ready || !isAdmin) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20">
        <LoadingState label="Checking administrator access…" rows={2} />
      </div>
    );
  }

  return (
    <DashboardShell items={items} title="Admin Dashboard" variant="admin">
      <Outlet />
    </DashboardShell>
  );
}
