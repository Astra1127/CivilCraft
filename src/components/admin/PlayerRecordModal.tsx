import { useState } from "react";
import { Ban, ShieldCheck, ShieldOff, UserRound } from "lucide-react";
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
import { getActivityStatus } from "@/lib/playfab";
import type { AccountStatus, PlayerProfile } from "@/lib/playfab/types";

export function formatDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function accountStatusTone(status: AccountStatus) {
  return status === "active" ? "ok" : status === "suspended" ? "warn" : "off";
}

export function AccountStatusBadge({ status }: { status: AccountStatus }) {
  return (
    <StatusPill
      tone={accountStatusTone(status)}
      className={status === "banned" ? "border-destructive/40 bg-destructive/10 text-destructive" : ""}
    >
      {status}
    </StatusPill>
  );
}

export function ActivityBadge({ lastActive }: { lastActive?: string | undefined }) {
  const activity = getActivityStatus(lastActive);
  if (!activity) return null;
  return (
    <StatusPill tone={activity === "recently_active" ? "info" : "off"}>
      {activity === "recently_active" ? "Recently active" : "Inactive"}
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
  player: PlayerProfile | null;
  onOpenChange: (open: boolean) => void;
  onModerate: (status: AccountStatus, reason: string) => Promise<void>;
  moderationEnabled: boolean;
}) {
  const [pending, setPending] = useState<PendingAction>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const status: AccountStatus = player?.accountStatus ?? "active";

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await onModerate(pending.status, reason);
      setPending(null);
      setReason("");
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
                      {player.displayName}
                    </DialogTitle>
                    <DialogDescription className="font-mono text-xs">
                      Player ID: {player.playFabId}
                    </DialogDescription>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <AccountStatusBadge status={status} />
                      <ActivityBadge lastActive={player.lastActive} />
                    </div>
                  </div>
                  <div className="pr-6 text-right">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
                      Last active
                    </p>
                    <p className="text-sm font-bold">{formatDate(player.lastActive)}</p>
                  </div>
                </div>
              </DialogHeader>

              <div className="max-h-[calc(84vh-9.5rem)] space-y-5 overflow-y-auto px-5 py-4">
                <section>
                  <SectionLabel>Account</SectionLabel>
                  <div className="mt-2 grid gap-x-6 sm:grid-cols-2">
                    <DataRow label="Display name" value={player.displayName} />
                    <DataRow
                      label="Player ID"
                      value={<span className="font-mono text-xs">{player.playFabId}</span>}
                    />
                    <DataRow label="Member since" value={formatDate(player.createdAt)} />
                    <DataRow label="Last active" value={formatDate(player.lastActive)} />
                    <DataRow
                      label="Account status"
                      value={<AccountStatusBadge status={status} />}
                    />
                    <DataRow
                      label="Activity"
                      value={<ActivityBadge lastActive={player.lastActive} />}
                    />
                  </div>
                </section>

                <section>
                  <SectionLabel>Progression</SectionLabel>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Metric label="Level" value={player.level} />
                    <Metric label="XP" value={`${player.xp} / ${player.xpToNextLevel}`} />
                    <Metric label="Total score" value={player.totalScore.toLocaleString()} />
                    <Metric label="Global rank" value={player.rank ? `#${player.rank}` : "—"} />
                    <Metric label="Bridges" value={player.bridgesCompleted} />
                    <Metric label="Challenges" value={player.challengesCompleted} />
                    <Metric
                      label="Achievements"
                      value={`${player.achievementsUnlocked} / ${player.achievementsTotal}`}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Progression and cosmetics are owned by the game backend and are read-only here.
                  </p>
                </section>

                {player.currentRegion ||
                player.storyPercent !== undefined ||
                player.lastChallenge ||
                player.mostUsedBridgeType ? (
                  <section>
                    <SectionLabel>Game summary</SectionLabel>
                    <div className="mt-2 grid gap-x-6 sm:grid-cols-2">
                      {player.currentRegion ? (
                        <DataRow label="Current story region" value={player.currentRegion} />
                      ) : null}
                      {player.storyPercent !== undefined ? (
                        <DataRow label="Story completion" value={`${player.storyPercent}%`} />
                      ) : null}
                      {player.lastChallenge ? (
                        <DataRow label="Last challenge" value={player.lastChallenge} />
                      ) : null}
                      {player.mostUsedBridgeType ? (
                        <DataRow label="Most used bridge type" value={player.mostUsedBridgeType} />
                      ) : null}
                    </div>
                  </section>
                ) : null}

                {moderationEnabled ? (
                  <section className="rounded-xl border-2 border-border bg-background p-3">
                    <SectionLabel>Moderation</SectionLabel>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Account access only. Moderation never changes game progression.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {status === "active" ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setPending({ status: "suspended", requireReason: false })}
                          >
                            <ShieldOff className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            Suspend Account
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setPending({ status: "banned", requireReason: true })}
                          >
                            <Ban className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            Ban Account
                          </Button>
                        </>
                      ) : status === "suspended" ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setPending({ status: "active", requireReason: false })}
                          >
                            <ShieldCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            Restore Account
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setPending({ status: "banned", requireReason: true })}
                          >
                            <Ban className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            Ban Account
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPending({ status: "active", requireReason: false })}
                        >
                          <ShieldCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />
                          Restore Account
                        </Button>
                      )}
                    </div>
                  </section>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Moderation actions are hidden until the game backend exposes a secure
                    suspend/ban endpoint.
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
          if (!o) {
            setPending(null);
            setReason("");
          }
        }}
      >
        <DialogContent className="border-2 border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">
              {pending?.status === "banned"
                ? `Ban ${player?.displayName}?`
                : pending?.status === "suspended"
                  ? `Suspend ${player?.displayName}?`
                  : `Restore ${player?.displayName}?`}
            </DialogTitle>
            <DialogDescription>
              {pending?.status === "banned"
                ? "This action restricts the player's account."
                : pending?.status === "suspended"
                  ? "This player will temporarily lose access to Civil Craft."
                  : "This player regains normal access to Civil Craft."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="mod-reason">
              Reason{pending?.requireReason ? "" : " (optional)"}
            </Label>
            <Textarea
              id="mod-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Recorded with the moderation action."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              variant={pending?.status === "active" ? "default" : "destructive"}
              disabled={busy || (pending?.requireReason ? !reason.trim() : false)}
              onClick={confirm}
            >
              {pending?.status === "banned"
                ? "Ban Player"
                : pending?.status === "suspended"
                  ? "Suspend Player"
                  : "Restore Player"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
