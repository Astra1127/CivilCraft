import { useState } from "react";
import { Ban, ShieldCheck, UserRound } from "lucide-react";
import { DataRow, SectionLabel, StatusPill } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type { AdminPlayerDetail } from "@/lib/playfab/admin-types";
type AccountStatus = "active" | "banned" | null;

export function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function accountStatusTone(status: AccountStatus) {
  return status === "active" ? "ok" : "off";
}

export function AccountStatusBadge({ status }: { status: AccountStatus }) {
  return (
    <StatusPill
      tone={accountStatusTone(status)}
      className={
        status === "banned" ? "border-destructive/40 bg-destructive/10 text-destructive" : ""
      }
    >
      {status ?? "Not available"}
    </StatusPill>
  );
}

/** Compact read-only progression tile — game-owned data, never editable. */
function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border-2 border-border bg-background px-3 py-2">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="font-display text-lg leading-tight">{value}</p>
    </div>
  );
}

type PendingAction = { status: AccountStatus; requireReason: boolean } | null;

export function PlayerRecordModal({
  player,
  onOpenChange,
  onModerate,
  moderationEnabled,
}: {
  player: AdminPlayerDetail | null;
  onOpenChange: (open: boolean) => void;
  onModerate: (status: AccountStatus, reason: string, hours: number | null) => Promise<void>;
  moderationEnabled: boolean;
}) {
  const [pending, setPending] = useState<PendingAction>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [hours, setHours] = useState("permanent");
  const [error, setError] = useState<string | null>(null);

  const status: AccountStatus = player?.accountStatus ?? null;

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      await onModerate(pending.status, reason, hours === "permanent" ? null : Number(hours));
      setPending(null);
      setReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Moderation result could not be confirmed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open={!!player} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[84vh] gap-0 overflow-hidden border-2 border-border bg-card p-0 sm:max-w-[860px]">
          {player ? (
            <>
              <DialogHeader className="space-y-0 border-b-2 border-border px-5 py-4 text-left">
                <div className="flex flex-wrap items-start gap-4">
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border-2 border-border bg-gold/15 text-gold">
                    <UserRound className="h-7 w-7" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="font-display text-2xl leading-tight">
                      {player.displayName ?? player.username ?? "Player record"}
                    </DialogTitle>
                    <DialogDescription className="font-mono text-xs">
                      Player ID: {player.playFabId}
                    </DialogDescription>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <AccountStatusBadge status={status} />
                    </div>
                  </div>
                  <div className="pr-6 text-right">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
                      Last login
                    </p>
                    <p className="text-sm font-bold">{formatDate(player.lastActive)}</p>
                  </div>
                </div>
              </DialogHeader>

              <div className="max-h-[calc(84vh-9.5rem)] space-y-5 overflow-y-auto px-5 py-4">
                <section>
                  <SectionLabel>Account</SectionLabel>
                  <div className="mt-2 grid gap-x-6 sm:grid-cols-2">
                    <DataRow
                      label="Display name"
                      value={player.displayName ?? player.username ?? "Player record"}
                    />
                    <DataRow
                      label="Player ID"
                      value={<span className="font-mono text-xs">{player.playFabId}</span>}
                    />
                    <DataRow label="Member since" value={formatDate(player.createdAt)} />
                    <DataRow label="Last login" value={formatDate(player.lastActive)} />
                    <DataRow
                      label="Account status"
                      value={<AccountStatusBadge status={status} />}
                    />
                  </div>
                </section>

                <section>
                  <SectionLabel>Progression</SectionLabel>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Metric label="Level" value={player.level ?? "\u2014"} />
                    <Metric
                      label="XP"
                      value={`${player.xp ?? "\u2014"} / ${player.xpToNextLevel ?? "\u2014"}`}
                    />
                    <Metric
                      label="Engineering score"
                      value={player.totalScore?.toLocaleString() ?? "\u2014"}
                    />
                    <Metric label="Global rank" value={player.rank == null ? "Not available" : "#" + player.rank} />
                    <Metric label="Bridges" value={player.bridgesCompleted ?? "\u2014"} />
                    <Metric label="Challenges" value={player.challengesCompleted ?? "\u2014"} />
                    <Metric
                      label="Achievements"
                      value={`${player.achievementsUnlocked ?? "\u2014"} / ${player.achievementsTotal ?? "\u2014"}`}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Progression and cosmetics are owned by the game backend and are read-only here.
                  </p>
                </section>

                <section>
                  <SectionLabel>Game data</SectionLabel>
                  <DataRow label="Username" value={player.username ?? "Not available"} />
                  <DataRow label="Current region" value={player.currentRegion ?? "Not available"} />
                  {player.unavailable.length ? (
                    <p role="status" className="text-sm text-destructive">
                      Unavailable services: {player.unavailable.join(", ")}. Close and reopen to
                      retry.
                    </p>
                  ) : null}
                  <SectionLabel>Statistics</SectionLabel>
                  {player.statistics?.length ? (
                    player.statistics.map((s) => (
                      <DataRow key={s.name} label={s.name} value={s.value.toLocaleString()} />
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">Not available</p>
                  )}
                  <SectionLabel>Currencies</SectionLabel>
                  {player.currencies?.length ? (
                    player.currencies.map((c) => (
                      <DataRow key={c.code} label={c.code} value={c.balance.toLocaleString()} />
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {player.currencies ? "No currency balances returned." : "Not available"}
                    </p>
                  )}
                  <SectionLabel>Inventory</SectionLabel>
                  {player.inventory?.length ? (
                    player.inventory.map((i, n) => (
                      <DataRow
                        key={n}
                        label={i.name ?? i.itemId}
                        value={formatDate(i.purchasedAt)}
                      />
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {player.inventory ? "No inventory items returned." : "Not available"}
                    </p>
                  )}
                  <SectionLabel>Achievement records</SectionLabel>
                  {player.achievements?.length ? (
                    player.achievements.map((a, n) => (
                      <DataRow
                        key={n}
                        label={a.name ?? a.id}
                        value={a.unlocked === true ? "Unlocked" : (a.progress ?? "Not available")}
                      />
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {player.achievements ? "No achievement records returned." : "Not available"}
                    </p>
                  )}
                </section>

                {moderationEnabled ? (
                  <section className="rounded-xl border-2 border-border bg-background p-3">
                    <SectionLabel>Moderation</SectionLabel>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Account access only. Moderation never changes game progression.
                    </p>
                    {player.bans
                      ?.filter((b) => b.active)
                      .map((b, n) => (
                        <div key={n} className="mt-2 text-sm">
                          <p>{b.reason ?? "Reason not available"}</p>
                          <p className="text-xs text-muted-foreground">
                            {b.expiresAt
                              ? "Expires " + new Date(b.expiresAt).toLocaleString()
                              : "Permanent ban"}
                          </p>
                        </div>
                      ))}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {status === "active" ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setError(null);
                            setHours("permanent");
                            setPending({ status: "banned", requireReason: true });
                          }}
                        >
                          <Ban className="mr-1.5 h-4 w-4" />
                          Ban Account
                        </Button>
                      ) : status === "banned" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setError(null);
                            setPending({ status: "active", requireReason: false });
                          }}
                        >
                          <ShieldCheck className="mr-1.5 h-4 w-4" />
                          Revoke Bans
                        </Button>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Moderation requires verified ban status.
                        </p>
                      )}
                    </div>
                  </section>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Moderation actions are hidden until the game backend exposes a secure ban
                    endpoint.
                  </p>
                )}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!pending}
        onOpenChange={(o) => {
          if (!o && !busy) {
            setPending(null);
            setReason("");
          }
        }}
      >
        <DialogContent className="border-2 border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">
              {pending?.status === "banned"
                ? `Ban ${player?.displayName ?? player?.playFabId}?`
                : `Revoke all bans for ${player?.displayName ?? player?.playFabId}?`}
            </DialogTitle>
            <DialogDescription>
              {pending?.status === "banned"
                ? "This action restricts the player's account."
                : "All active bans on this player will be revoked."}
            </DialogDescription>
          </DialogHeader>
          {pending?.requireReason ? (
            <div className="space-y-1.5">
              <Label htmlFor="mod-reason">Reason (required, up to 140 characters)</Label>
              <Textarea
                id="mod-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={140}
                disabled={busy}
                rows={3}
                placeholder="Recorded with the moderation action."
              />
            </div>
          ) : null}
          {pending?.status === "banned" ? (
            <div className="space-y-2">
              <Label htmlFor="ban-duration">Duration</Label>
              <select
                id="ban-duration"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={hours}
                disabled={busy}
                onChange={(e) => setHours(e.target.value)}
              >
                <option value="permanent">Permanent</option>
                <option value="24">24 hours</option>
                <option value="168">7 days</option>
                <option value="720">30 days</option>
              </select>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              variant={pending?.status === "active" ? "default" : "destructive"}
              disabled={busy || (pending?.requireReason ? !reason.trim() : false)}
              onClick={confirm}
            >
              {pending?.status === "banned" ? "Ban Player" : "Revoke Bans"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
