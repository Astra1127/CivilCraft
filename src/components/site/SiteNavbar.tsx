import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronDown, LayoutDashboard, LogIn, LogOut, Menu, Settings, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { BrandMark } from "./BrandMark";

const publicLinks = [
  { to: "/", label: "Home" },
  { to: "/about", label: "About" },
  { to: "/gallery", label: "Gallery" },
  { to: "/download", label: "Download" },
  { to: "/contact", label: "Contact" },
] as const;

function initials(name: string) {
  return (
    name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

export function SiteNavbar() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { isAuthenticated, isAdmin, adminReady, player, admin, logout } = useAuth();
  const hasAccount = adminReady && (isAuthenticated || isAdmin);
  const account = isAdmin ? admin : player;
  const dashboardTo = isAdmin ? "/admin" : "/dashboard";

  const signOut = async () => {
    try {
      await logout(isAdmin ? "admin" : "player");
      navigate({ to: isAdmin ? "/admin/login" : "/login", replace: true });
    } catch {
      toast.error("Sign-out failed. Please check your connection and try again.");
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b-2 border-border bg-card/95 backdrop-blur">
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-6"
      >
        <Link to="/" className="min-w-0 flex-1 xl:flex-none" aria-label="Civil Craft home">
          <BrandMark />
        </Link>

        <ul className="mx-auto hidden items-center gap-1 xl:flex">
          {publicLinks.map((l) => (
            <li key={l.to}>
              <Link
                to={l.to}
                activeOptions={{ exact: l.to === "/" }}
                activeProps={{
                  className: "text-gold after:scale-x-100",
                }}
                className="relative block px-4 py-2 text-sm font-bold text-foreground/80 transition-colors after:absolute after:inset-x-3 after:bottom-0.5 after:h-[3px] after:origin-left after:scale-x-0 after:rounded-full after:bg-gold after:transition-transform after:duration-200 hover:text-gold hover:after:scale-x-100"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex shrink-0 items-center gap-2 xl:ml-0">
          {hasAccount ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="flex h-10 items-center gap-2 rounded-full border-2 border-border bg-card px-2 text-sm sm:px-3 font-bold text-foreground hover:bg-accent"
                  aria-label="Account menu"
                >
                  <Avatar className="h-7 w-7 border border-border">
                    <AvatarFallback className="bg-gold/15 text-xs font-extrabold text-gold">
                      {initials(account?.displayName ?? "Account")}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-[8rem] truncate sm:inline">
                    {account?.displayName ?? "Account"}
                  </span>
                  <ChevronDown
                    className="hidden h-4 w-4 text-muted-foreground sm:block"
                    aria-hidden="true"
                  />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 border-2 border-border bg-card">
                <DropdownMenuItem asChild className="cursor-pointer">
                  <Link to={dashboardTo} className="flex items-center gap-2">
                    <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                    {isAdmin ? "Admin Dashboard" : "Player Dashboard"}
                  </Link>
                </DropdownMenuItem>
                {!isAdmin ? (
                  <DropdownMenuItem asChild className="cursor-pointer">
                    <Link to="/dashboard/profile" className="flex items-center gap-2">
                      <User className="h-4 w-4" aria-hidden="true" />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem asChild className="cursor-pointer">
                  <Link
                    to={isAdmin ? "/admin/settings" : "/dashboard/settings"}
                    className="flex items-center gap-2"
                  >
                    <Settings className="h-4 w-4" aria-hidden="true" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={signOut}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild size="sm" variant="gold">
              <Link to="/login">
                <LogIn className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Login
              </Link>
            </Button>
          )}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="xl:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 border-l-2 border-border bg-card">
              <SheetHeader className="space-y-0">
                <SheetTitle className="font-display">Menu</SheetTitle>
              </SheetHeader>
              <ul className="mt-4 space-y-1 px-4 pb-6">
                {publicLinks.map((l) => (
                  <li key={l.to}>
                    <Link
                      to={l.to}
                      onClick={() => setOpen(false)}
                      activeOptions={{ exact: l.to === "/" }}
                      activeProps={{ className: "bg-gold/15 text-gold border-gold/40" }}
                      className="block rounded-xl border-2 border-transparent px-3 py-2.5 text-base font-bold hover:bg-accent/60"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
                {hasAccount ? (
                  <>
                    <li>
                      <Link
                        to={dashboardTo}
                        onClick={() => setOpen(false)}
                        className="block rounded-xl border-2 border-transparent px-3 py-2.5 text-base font-bold hover:bg-accent/60"
                      >
                        {isAdmin ? "Admin Dashboard" : "Player Dashboard"}
                      </Link>
                    </li>
                    <li>
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          signOut();
                        }}
                        className="block w-full rounded-xl border-2 border-transparent px-3 py-2.5 text-left text-base font-bold text-destructive hover:bg-accent/60"
                      >
                        Sign Out
                      </button>
                    </li>
                  </>
                ) : (
                  <li>
                    <Link
                      to="/login"
                      onClick={() => setOpen(false)}
                      className="block rounded-xl border-2 border-transparent px-3 py-2.5 text-base font-bold hover:bg-accent/60"
                    >
                      Login
                    </Link>
                  </li>
                )}
              </ul>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}
