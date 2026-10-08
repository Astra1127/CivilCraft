import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowRight,
  Coins,
  Diamond,
  RefreshCw,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { currentSessionTicket, playerFetch } from "@/lib/playfab/client";
import { currencyLabel, normalizeOrderReward } from "@/lib/payments/products";

import { Button } from "@/components/ui/button";

interface OrderStatusResponse {
  orderId: string;
  productId: string;
  status: "pending" | "paid" | "fulfilled" | "failed" | "cancelled";
  expectedCoins: number;
  rewardCurrency?: "CO" | "DI";
  rewardAmount?: number;
  expectedAmount: number;
  currency: string;
  createdAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;
  fulfillmentReviewRequired?: boolean;
  error?: string;
}

export const Route = createFileRoute("/dashboard/payment/success")({
  validateSearch: (search: Record<string, unknown>) => ({
    order_id: typeof search["order_id"] === "string" ? search["order_id"] : "",
  }),
  head: () => ({
    meta: [
      { title: "Payment Confirmation — Civil Craft: Bridge Edition" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PaymentSuccessPage,
});

function PaymentSuccessPage() {
  const { order_id: orderId } = useSearch({ from: "/dashboard/payment/success" });
  const { player } = useAuth();
  const queryClient = useQueryClient();
  const [order, setOrder] = useState<OrderStatusResponse | null>(null);
  const [polling, setPolling] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);

  useEffect(() => {
    setOrder(null);
    setPollError(null);
    if (!orderId) {
      setPolling(false);
      return;
    }

    let active = true;
    let attempts = 0;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    setPolling(true);

    async function checkStatus() {
      attempts += 1;
      let terminal = false;
      try {
        const ticket = currentSessionTicket();
        if (!ticket) {
          terminal = true;
          throw new Error("Please sign in again to view this order.");
        }
        const res = await playerFetch(
          `/api/payments/paymongo/order?id=${encodeURIComponent(orderId)}`,
          {
            headers: { Authorization: `Bearer ${ticket}` },
            signal: controller.signal,
          },
        );
        if (!res.ok) {
          terminal = [401, 403, 404].includes(res.status);
          throw new Error(
            terminal
              ? "This order is not available for your account."
              : "Unable to check the payment status. Please check your transaction history.",
          );
        }
        const data = (await res.json()) as OrderStatusResponse;
        if (data.orderId !== orderId)
          throw new Error("The payment response did not match this order.");
        normalizeOrderReward(data);
        terminal =
          data.fulfillmentReviewRequired === true ||
          ["fulfilled", "failed", "cancelled"].includes(data.status);
        if (active) {
          setOrder(data);
          setPollError(null);
          if (data.status === "fulfilled" && data.fulfillmentReviewRequired !== true) {
            void queryClient.invalidateQueries({
              queryKey: ["player-currencies", player?.playFabId],
            });
            void queryClient.invalidateQueries({ queryKey: ["player-balance", player?.playFabId] });
            void queryClient.invalidateQueries({ queryKey: ["transactions", player?.playFabId] });
          }
        }
      } catch (error) {
        if (!active) return;
        if (
          error instanceof Error &&
          error.name === "PlayFabError" &&
          "kind" in error &&
          error.kind === "session_expired"
        )
          terminal = true;
        setPollError(
          error instanceof Error ? error.message : "Unable to check the payment status.",
        );
      }
      if (active) {
        if (terminal || attempts >= 20) {
          setPolling(false);
        } else {
          timeout = setTimeout(checkStatus, 2500);
        }
      }
    }

    // Sequential, bounded checks avoid stale closures and overlapping requests.
    void checkStatus();

    return () => {
      active = false;
      if (timeout) clearTimeout(timeout);
      controller.abort();
    };
  }, [orderId, queryClient, player?.playFabId]);

  const needsReview = order?.fulfillmentReviewRequired === true;
  const isFulfilled = order?.status === "fulfilled" && !needsReview;
  const isFailed = (order?.status === "failed" || order?.status === "cancelled") && !needsReview;
  const isPending = !isFulfilled && !isFailed && !needsReview;
  const reward = order ? normalizeOrderReward(order) : null;
  const rewardLabel = reward ? currencyLabel(reward.rewardCurrency) : "currency";
  const RewardIcon = reward?.rewardCurrency === "DI" ? Diamond : Coins;

  return (
    <>
      <div className="relative min-h-[calc(100vh-16rem)] blueprint py-12 sm:py-20 px-4 sm:px-6 flex items-center justify-center">
        <div className="mx-auto max-w-xl w-full">
          <div className="panel border-2 border-border bg-card p-6 sm:p-10 rounded-2xl shadow-lift text-center">
            {/* Header Icon */}
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full">
              {needsReview ? (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gold/15 text-gold border-2 border-gold/40">
                  <AlertCircle className="h-10 w-10" />
                </div>
              ) : isFulfilled ? (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gold/15 text-gold border-2 border-gold/40">
                  <CheckCircle2 className="h-10 w-10" />
                </div>
              ) : isFailed ? (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/15 text-destructive border-2 border-destructive/40">
                  <AlertCircle className="h-10 w-10" />
                </div>
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-muted-foreground border-2 border-border animate-pulse">
                  <Clock className="h-10 w-10" />
                </div>
              )}
            </div>

            {/* Heading and details */}
            {needsReview ? (
              <>
                <span className="inline-block text-[11px] font-extrabold uppercase tracking-widest text-gold mb-1">
                  MANUAL REVIEW
                </span>
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-foreground">
                  Purchase needs review
                </h1>
                <p role="status" className="mt-2 text-sm text-muted-foreground">
                  We cannot yet confirm the currency credit for this purchase. Do not pay again.
                  Contact support with the order reference below so we can check it safely.
                </p>
              </>
            ) : isFulfilled ? (
              <>
                <span className="inline-block text-[11px] font-extrabold uppercase tracking-widest text-gold mb-1">
                  PURCHASE COMPLETE
                </span>
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-foreground">
                  +{reward?.rewardAmount.toLocaleString()} Civil Craft {rewardLabel}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Your {rewardLabel.toLowerCase()} have been added to your game account.
                  {reward?.rewardCurrency === "DI"
                    ? " Unity’s Diamond display will be connected in the next phase."
                    : " They are ready to use in-game."}
                </p>
              </>
            ) : isFailed ? (
              <>
                <span className="inline-block text-[11px] font-extrabold uppercase tracking-widest text-destructive mb-1">
                  ORDER FAILED
                </span>
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-foreground">
                  Payment Verification Notice
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  We encountered an issue finalizing your order. Please check your transaction
                  history or contact support.
                </p>
              </>
            ) : (
              <>
                <span className="inline-block text-[11px] font-extrabold uppercase tracking-widest text-muted-foreground mb-1">
                  ORDER CONFIRMATION
                </span>
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-foreground">
                  Confirming Payment
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Your currency is credited only after the server verifies the PayMongo payment.
                  Opening this page does not grant currency.
                </p>
              </>
            )}

            {/* Order Details Card */}
            {orderId ? (
              <div className="mt-6 rounded-xl border border-border/80 bg-secondary/40 p-4 text-left text-sm space-y-2">
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <span>Order Reference</span>
                  <span className="min-w-0 break-all text-right font-mono font-bold text-foreground">
                    {orderId}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <span>{isFulfilled ? "Currency Credited" : "Purchased Package"}</span>
                  <span className="font-semibold text-foreground">
                    {reward
                      ? `${reward.rewardAmount.toLocaleString()} ${rewardLabel}`
                      : "Awaiting order verification"}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <span>Status</span>
                  <span className="font-bold capitalize text-gold">
                    {needsReview
                      ? "Needs review"
                      : isFulfilled
                        ? "Fulfilled / Credited"
                        : isFailed
                          ? "Failed"
                          : "Verifying Webhook..."}
                  </span>
                </div>
                {order?.paidAt ? (
                  <div className="flex justify-between items-center text-xs text-muted-foreground">
                    <span>Confirmed At</span>
                    <span className="text-foreground">
                      {new Date(order.paidAt).toLocaleTimeString()}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Polling Indicator */}
            {isPending && polling && (
              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-gold" />
                <span>Checking live confirmation status...</span>
              </div>
            )}
            {pollError ? (
              <p role="alert" className="mt-4 text-sm text-destructive">
                {pollError}
              </p>
            ) : null}
            {isPending && !polling && !pollError ? (
              <p role="status" className="mt-4 text-sm text-muted-foreground">
                {orderId
                  ? "Confirmation is still pending. Check Transactions later; do not repeat the purchase."
                  : "No order reference was provided. Check your transaction history."}
              </p>
            ) : null}

            {/* Action buttons */}
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Button asChild variant="gold" size="lg" className="font-bold shadow-md">
                {needsReview ? (
                  <Link to="/contact">
                    <AlertCircle className="mr-2 h-4 w-4" /> Contact Support
                  </Link>
                ) : (
                  <Link
                    to="/dashboard/shop"
                    search={{ currency: reward?.rewardCurrency === "DI" ? "diamonds" : "coins" }}
                  >
                    <RewardIcon className="mr-2 h-4 w-4" /> Back to Shop
                  </Link>
                )}
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="font-bold border-2 border-border"
              >
                <Link to="/dashboard/transactions">
                  Transactions <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
