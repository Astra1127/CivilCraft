import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { notificationDestination } from "@/lib/playfab/notification-navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Medal, Package, Megaphone, Shirt, Trophy } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { notificationService, type NotificationKind } from "@/lib/playfab";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<NotificationKind, LucideIcon> = {
  achievement: Medal,
  level: Trophy,
  cosmetic: Shirt,
  release: Package,
  announcement: Megaphone,
};

function timeAgo(iso: string) {
  if (!Number.isFinite(Date.parse(iso))) return "Date unavailable";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Player notification bell. Entries come from real backend events only; an
 * account with no events shows a proper empty state rather than filler.
 */
export function NotificationBell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { player } = useAuth();
  const playerId = player?.playFabId;
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const navigating = useRef(false);
  const q = useQuery({
    queryKey: ["notifications", playerId],
    enabled: !!playerId,
    queryFn: notificationService.getNotifications,
  });
  const items = q.data ?? [];
  const unread = items.filter((n) => !n.read);

  const mark = useMutation({
    mutationFn: (ids: string[]) => notificationService.markRead(ids, playerId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", playerId] }),
  });

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unread.length ? `Notifications, ${unread.length} unread` : "Notifications"}
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          {unread.length > 0 ? (
            <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full border-2 border-card bg-gold px-1 text-[10px] font-extrabold leading-none text-gold-foreground">
              {unread.length > 9 ? "9+" : unread.length}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        onCloseAutoFocus={(event) => {
          if (navigating.current) event.preventDefault();
          navigating.current = false;
        }}
        align="end"
        className="w-80 max-w-[calc(100vw-1rem)] border-2 border-border bg-card"
      >
        <div className="flex items-center justify-between gap-2 pr-1">
          <DropdownMenuLabel className="font-display">Notifications</DropdownMenuLabel>
          {unread.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              disabled={mark.isPending}
              onClick={() => mark.mutate(unread.map((n) => n.id))}
            >
              <CheckCheck className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Mark all read
            </Button>
          ) : null}
        </div>
        <DropdownMenuSeparator />
        {notice ? (
          <p role="status" className="px-3 py-2 text-sm">
            {notice}
          </p>
        ) : null}
        {q.isPending ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">Loading notifications…</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-1 px-4 py-6 text-center">
            <Bell className="h-7 w-7 text-taupe" aria-hidden="true" />
            <p className="font-display text-sm">No notifications</p>
            <p className="text-xs text-muted-foreground">
              Achievements, completed levels and new builds will show up here.
            </p>
          </div>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto p-1">
            {items.map((n) => {
              const Icon = KIND_ICON[n.kind];
              return (
                <li key={n.id}>
                  <DropdownMenuItem asChild onSelect={(event) => event.preventDefault()}>
                    <button
                      type="button"
                      onClick={() => {
                        const destination = notificationDestination(n);
                        if (!destination) {
                          setNotice("This notification has no available destination.");
                          return;
                        }
                        setNotice("");
                        navigating.current = true;
                        setOpen(false);
                        void navigate(destination);
                      }}
                      className={cn(
                        "flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold",
                        n.read ? "opacity-70" : "bg-gold/10",
                      )}
                    >
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2 border-border bg-card text-gold">
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-bold">{n.title}</span>
                          {!n.read ? (
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold"
                              aria-hidden="true"
                            />
                          ) : null}
                        </span>
                        {n.description ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {n.description}
                          </span>
                        ) : null}
                        <span className="block text-[11px] text-muted-foreground">
                          {timeAgo(n.createdAt)}
                          {n.read ? " · Read" : ""}
                        </span>
                      </span>
                    </button>
                  </DropdownMenuItem>
                </li>
              );
            })}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
