import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Coins, Diamond, Gift, PackageOpen, Receipt, RotateCcw, Star } from "lucide-react";
import { DemoBadge } from "@/components/common/DemoBadge";
import { SectionHeading } from "@/components/common/PageHeader";
import { ErrorState, LoadingState } from "@/components/common/States";
import { SLOT_META } from "@/components/dashboard/CharacterPreview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import chibiEngineer from "@/assets/chibi-engineer.png";
import { useAuth } from "@/lib/auth";
import { transactionService, type Transaction } from "@/lib/playfab";
import { cn } from "@/lib/utils";
import { currencyLabel } from "@/lib/payments/products";

export const Route = createFileRoute("/dashboard/transactions")({
  head: () => ({
    meta: [
      { title: "Purchase History — Civil Craft: Bridge Edition" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content: "Items and game content acquired through your Civil Craft account.",
      },
    ],
  }),
  component: TransactionsPage,
});

const TYPE_META: Record<Transaction["type"], { label: string; icon: typeof Gift }> = {
  purchase: { label: "Purchase", icon: Receipt },
  reward: { label: "Reward", icon: Gift },
  refund: { label: "Refunded", icon: RotateCcw },
};

function formatAmount(tx: Transaction) {
  if (tx.type === "reward" || tx.amount === 0) return "Reward";
  const currency = tx.currency.trim().toLowerCase();
  if (currency === "gold" || currency === "coins") return `${tx.amount.toLocaleString()} Coins`;
  if (currency === "exp" || currency === "xp") return `${tx.amount.toLocaleString()} XP`;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: tx.currency }).format(
      tx.amount,
    );
  } catch {
    return `${tx.currency} ${tx.amount.toFixed(2)}`;
  }
}

function ItemImage({ tx, className }: { tx: Transaction; className?: string }) {
  const Icon =
    tx.rewardCurrency === "DI"
      ? Diamond
      : tx.rewardCurrency === "CO"
        ? Coins
        : tx.itemSlot
          ? SLOT_META[tx.itemSlot].icon
          : PackageOpen;
  return (
    <div
      className={cn(
        "blueprint relative flex h-24 w-full shrink-0 items-center justify-center overflow-hidden border-b-2 border-border bg-secondary/60 sm:h-28",
        className,
      )}
    >
      {tx.itemImageUrl ? (
        <img src={tx.itemImageUrl} alt={tx.itemName} className="h-full w-full object-contain p-3" />
      ) : (
        <Icon className="h-10 w-10 text-taupe" aria-hidden="true" />
      )}
    </div>
  );
}

function TransactionsPage() {
  const { player } = useAuth();
  const id = player?.playFabId ?? "";
  const q = useQuery({
    queryKey: ["transactions", id],
    queryFn: transactionService.getTransactions,
  });
  const [filter, setFilter] = useState<"all" | Transaction["type"]>("all");
  const [selected, setSelected] = useState<Transaction | null>(null);

  const rows = useMemo(() => q.data ?? [], [q.data]);
  const availableTypes = useMemo(
    () => (["purchase", "reward", "refund"] as const).filter((t) => rows.some((r) => r.type === t)),
    [rows],
  );
  const visible = filter === "all" ? rows : rows.filter((r) => r.type === filter);

  return (
    <div className="min-w-0 space-y-6">
      <SectionHeading
        title="Purchase History"
        description="View the items and game content acquired through your Civil Craft account."
        action={<DemoBadge />}
      />

      {q.isPending ? (
        <LoadingState label="Loading purchases…" rows={3} />
      ) : q.isError ? (
        <ErrorState description={(q.error as Error).message} onRetry={q.refetch} />
      ) : rows.length === 0 ? (
        <div className="panel flex flex-col items-center gap-3 px-6 py-12 text-center">
          <img src={chibiEngineer} alt="" className="h-32 w-auto opacity-90" aria-hidden="true" />
          <h3 className="font-display text-lg">No purchases yet</h3>
          <p className="max-w-md text-sm text-muted-foreground">
            Items and rewards acquired through Civil Craft will appear here.
          </p>
        </div>
      ) : (
        <>
          {availableTypes.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {(["all", ...availableTypes] as const).map((t) => (
                <Button
                  key={t}
                  size="sm"
                  variant={filter === t ? "gold" : "outline"}
                  onClick={() => setFilter(t)}
                >
                  {t === "all" ? "All" : TYPE_META[t].label}
                </Button>
              ))}
            </div>
          ) : null}

          <ul className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((tx) => {
              const TypeIcon = TYPE_META[tx.type].icon;
              return (
                <li key={tx.transactionId} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => setSelected(tx)}
                    className="panel hover-lift flex h-full w-full min-w-0 flex-col overflow-hidden p-0 text-left"
                  >
                    <ItemImage tx={tx} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1 p-4">
                      <h3 className="min-h-10 whitespace-normal break-words font-display text-base leading-tight">
                        {tx.itemName}
                      </h3>
                      <p className="break-words text-xs uppercase tracking-wide text-muted-foreground">
                        {tx.itemCategory}
                        {tx.itemSlot ? ` • ${SLOT_META[tx.itemSlot].label}` : ""}
                      </p>
                      <p className="mt-2 whitespace-normal break-words font-display text-lg">
                        {formatAmount(tx)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {TYPE_META[tx.type].label} · {new Date(tx.createdAt).toLocaleDateString()}
                      </p>
                      <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
                        <Badge variant="secondary" className="capitalize">
                          <TypeIcon className="mr-1 h-3 w-3" aria-hidden="true" />
                          {tx.status}
                        </Badge>
                        {tx.owned ? <Badge variant="outline">✓ Owned</Badge> : null}
                        {tx.equipped ? (
                          <Badge variant="outline" className="border-gold/60 text-gold">
                            <Star className="mr-1 h-3 w-3" aria-hidden="true" />
                            Equipped
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] min-w-0 grid-cols-[minmax(0,1fr)] overflow-y-auto rounded-2xl p-4 sm:p-6">
          {selected ? (
            <>
              <DialogHeader className="min-w-0">
                <DialogTitle className="min-w-0 break-words pr-8 leading-snug">
                  {selected.itemName}
                </DialogTitle>
                <DialogDescription>Item details — read-only.</DialogDescription>
              </DialogHeader>
              <ItemImage tx={selected} className="h-32 rounded-xl border-2 sm:h-40" />
              <dl className="grid min-w-0 gap-3 text-sm">
                {[
                  ["Category", selected.itemCategory],
                  ["Amount", formatAmount(selected)],
                  ...(selected.rewardCurrency && selected.rewardAmount
                    ? [
                        [
                          "Currency package",
                          `${selected.rewardAmount.toLocaleString()} ${currencyLabel(selected.rewardCurrency)}`,
                        ],
                      ]
                    : []),
                  ["Purchased", new Date(selected.createdAt).toLocaleString()],
                  ["Transaction ID", selected.transactionId],
                  ["Status", selected.status],
                  ...(selected.paymentMethod ? [["Payment method", selected.paymentMethod]] : []),
                ].map(([k, v]) => (
                  <div
                    key={k}
                    className="grid min-w-0 gap-1 border-b border-border pb-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-3"
                  >
                    <dt className="min-w-0 break-words text-muted-foreground">{k}</dt>
                    <dd
                      className={cn(
                        "min-w-0 whitespace-normal font-semibold [overflow-wrap:anywhere] sm:text-right",
                        k === "Transaction ID" ? "font-mono text-xs" : "capitalize",
                      )}
                    >
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelected(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
