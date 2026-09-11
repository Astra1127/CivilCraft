import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Bell, LogOut, Menu } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BrandMark } from "@/components/site/BrandMark";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { ReportBugDialog } from "@/components/dashboard/ReportBugDialog";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatDate, useCms } from "@/lib/cms/store";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export interface DashboardNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Optional uppercase group label shown above the item in the sidebar. */
  section?: string;
}

function NavList({
  items,
  onNavigate,
  dense,
}: {
  items: DashboardNavItem[];
  onNavigate?: () => void;
  dense?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const sections: string[] = [];
  for (const i of items) {
    const s = i.section ?? "";
    if (!sections.includes(s)) sections.push(s);
  }

  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <div key={section || "_"}>
          {section ? (
            <p className="mb-1 px-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground/80">
              {section}
            </p>
          ) : null}
          <ul className={dense ? "space-y-0.5" : "space-y-1.5"}>
            {items
              .filter((i) => (i.section ?? "") === section)
              .map((item) => {
                const active = pathname === item.to || pathname === `${item.to}/`;
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border-2 text-sm font-bold transition-all",
                        dense ? "px-3 py-1.5" : "px-3 py-2.5",
                        active
                          ? "gold-gradient border-border text-gold-foreground shadow-[var(--shadow-soft)]"
                          : "border-transparent text-foreground/75 hover:-translate-y-0.5 hover:border-border hover:bg-card hover:text-foreground",
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function DashboardShell({
  items,
  title,
  variant = "player",
  children,
}: {
  items: DashboardNavItem[];
  title: string;
  /** "admin" renders a denser, more administrative control-centre chrome. */
  variant?: "player" | "admin";
  children: React.ReactNode;
}) {
  const { player, admin: adminUser, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const admin = variant === "admin";
  const notifications = useCms((s) => s.activity).slice(0, 6);

  const signOut = async () => {
    try {
      await logout(admin ? "admin" : "player");
      navigate({ to: admin ? "/admin/login" : "/login", replace: true });
    } catch {
      toast.error("Sign-out failed. Please check your connection and try again.");
    }
  };

  return (
    <div className={cn("min-h-dvh bg-background", admin ? "" : "blueprint")}>
      <header className="sticky top-0 z-40 border-b-2 border-border bg-card/95 backdrop-blur">
        <div className="mx-auto grid max-w-[1400px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                  <Menu className="h-5 w-5" aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 border-r-2 border-border bg-card p-0">
                <SheetHeader className="border-b-2 border-border p-4">
                  <SheetTitle className="text-left font-display">{title}</SheetTitle>
                </SheetHeader>
                <nav aria-label={title} className="p-3">
                  <NavList items={items} dense={admin} onNavigate={() => setOpen(false)} />
                </nav>
              </SheetContent>
            </Sheet>
            <Link to="/" className="min-w-0" aria-label="Civil Craft home">
              <BrandMark />
            </Link>
          </div>
          <p className="truncate text-center font-display text-sm sm:text-base">{title}</p>
          <div className="flex shrink-0 items-center gap-2">
            {admin ? null : <ReportBugDialog />}
            {admin ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative"
                    aria-label="Notifications"
                  >
                    <Bell className="h-5 w-5" aria-hidden="true" />
                    {notifications.length > 0 ? (
                      <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-gold" />
                    ) : null}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72 border-2 border-border bg-card">
                  <DropdownMenuLabel className="font-display">Recent activity</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {notifications.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-muted-foreground">
                      Nothing new right now.
                    </p>
                  ) : (
                    <ul className="max-h-72 space-y-1 overflow-y-auto p-1">
                      {notifications.map((n) => (
                        <li key={n.id} className="rounded-lg px-2 py-1.5">
                          <p className="text-sm font-bold">{n.action}</p>
                          <p className="text-xs text-muted-foreground">
                            {n.target ? `${n.target} · ` : ""}
                            {formatDate(n.at)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <NotificationBell />
            )}

            <span className="hidden max-w-[12rem] truncate text-sm font-bold text-muted-foreground sm:block">
              {(variant === "admin" ? adminUser : player)?.displayName}
            </span>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="mr-1 h-4 w-4" aria-hidden="true" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <div
        className={cn(
          "mx-auto grid max-w-[1400px] gap-6 px-4 py-6 sm:px-6",
          admin ? "lg:grid-cols-[224px_minmax(0,1fr)]" : "lg:grid-cols-[248px_minmax(0,1fr)]",
        )}
      >
        <nav aria-label={title} className="hidden lg:block">
          {admin ? (
            <div className="sticky top-24 rounded-xl border-2 border-border bg-card p-3">
              <p className="mb-2 px-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
                Control Center
              </p>
              <NavList items={items} dense />
            </div>
          ) : (
            /* Engineer's notebook: tabbed paper binder down the left */
            <div className="paper-panel sticky top-24 p-3 pl-4">
              <p className="mb-2 pl-10 text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
                Engineer Hub
              </p>
              <NavList items={items} />
            </div>
          )}
        </nav>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
