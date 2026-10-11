import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { XCircle, AlertCircle, ArrowRight, Coins, Diamond } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { currentSessionTicket, playerFetch } from "@/lib/playfab/client";
import { useAuth } from "@/lib/auth";
import { currencyLabel, normalizeOrderReward } from "@/lib/payments/products";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/dashboard/payment/cancel")({
  validateSearch: (search: Record<string, unknown>) => ({
    order_id: typeof search["order_id"] === "string" ? search["order_id"] : "",
  }),
  head: () => ({
    meta: [
      { title: "Payment Cancelled — Civil Craft: Bridge Edition" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PaymentCancelPage,
});

function PaymentCancelPage() {
  const { order_id: orderId } = useSearch({ from: "/dashboard/payment/cancel" });
  const { player } = useAuth();
  const orderQuery = useQuery({
    queryKey: ["payment-order", player?.playFabId, orderId],
    enabled: Boolean(orderId && player?.playFabId),
    queryFn: async ({ signal }) => {
      const ticket = currentSessionTicket();
      if (!ticket) throw new Error("Please sign in again to view this order.");
      const response = await playerFetch(
        `/api/payments/paymongo/order?id=${encodeURIComponent(orderId)}`,
        {
          headers: { Authorization: `Bearer ${ticket}` },
          signal,
        },
      );
      if (!response.ok) throw new Error("This order is not available for your account.");
      const order = (await response.json()) as {
        orderId: string;
        status: string;
        expectedCoins: number;
        rewardCurrency?: "CO" | "DI";
        rewardAmount?: number;
        fulfillmentReviewRequired?: boolean;
      };
      if (signal.aborted || currentSessionTicket() !== ticket)
        throw new Error("Your account session changed. Please refresh this order.");
      if (order.orderId !== orderId)
        throw new Error("The payment response did not match this order.");
      return {
        ...normalizeOrderReward(order),
        status: order.status,
        fulfillmentReviewRequired: order.fulfillmentReviewRequired === true,
      };
    },
    retry: false,
  });
  // A failed recheck must not present an older cached response as a verified credit.
  const reward = orderQuery.isError ? undefined : orderQuery.data;
  const needsReview = reward?.fulfillmentReviewRequired === true;
  const isFulfilled = reward?.status === "fulfilled" && !needsReview;
  const RewardIcon = reward?.rewardCurrency === "DI" ? Diamond : Coins;

  return (
    <>
      <div className="relative min-h-[calc(100vh-16rem)] blueprint py-12 sm:py-20 px-4 sm:px-6 flex items-center justify-center">
        <div className="mx-auto max-w-lg w-full">
          <div className="panel border-2 border-border bg-card p-6 sm:p-10 rounded-2xl shadow-lift text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-muted-foreground border-2 border-border">
              {needsReview ? (
                <AlertCircle className="h-10 w-10 text-gold" />
              ) : (
                <XCircle className="h-10 w-10 text-muted-foreground" />
              )}
            </div>

            <span className="inline-block text-[11px] font-extrabold uppercase tracking-widest text-muted-foreground mb-1">
              {needsReview
                ? "MANUAL REVIEW"
                : isFulfilled
                  ? "PURCHASE COMPLETE"
                  : "CHECKOUT CLOSED"}
            </span>

            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-foreground">
              {needsReview
                ? "Purchase needs review"
                : isFulfilled
                  ? "Payment Received"
                  : "Checkout Closed"}
            </h1>

            <p
              role={needsReview ? "status" : undefined}
              className="mt-2 text-sm text-muted-foreground leading-relaxed"
            >
              {needsReview
                ? "We cannot yet confirm the currency credit for this purchase. Do not pay again. Contact support with the order reference below so we can check it safely."
                : isFulfilled
                  ? `${reward.rewardAmount.toLocaleString()} ${currencyLabel(reward.rewardCurrency)} were credited to your game account.`
                  : "Closing checkout does not confirm a payment or grant currency. If you completed a simulated payment, check Transactions for its verified status before trying again."}
            </p>

            {orderId ? (
              <p className="mt-4 break-all text-xs font-mono text-muted-foreground/80">
                Reference: {orderId}
              </p>
            ) : null}
            {reward && !isFulfilled ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Package: {reward.rewardAmount.toLocaleString()}{" "}
                {currencyLabel(reward.rewardCurrency)}
              </p>
            ) : null}
            {orderQuery.isError ? (
              <p role="alert" className="mt-3 text-sm text-destructive">
                Unable to verify this order. Check your transaction history.
              </p>
            ) : null}

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
                    <RewardIcon className="mr-2 h-4 w-4" /> Return to Shop
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
