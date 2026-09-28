import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { CheckCircle2, Clock, AlertCircle, ArrowRight, Coins, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface OrderStatusResponse {
  orderId: string;
  productId: string;
  status: "pending" | "paid" | "fulfilled" | "failed" | "cancelled";
  expectedCoins: number;
  expectedAmount: number;
  currency: string;
  createdAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;
  error?: string;
}

export const Route = createFileRoute("/payment/success")({
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
  const { order_id: orderId } = useSearch({ from: "/payment/success" });
  const [order, setOrder] = useState<OrderStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pollCount, setPollCount] = useState(0);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }

    let active = true;

    async function checkStatus() {
      try {
        const res = await fetch(`/api/payments/paymongo/order?id=${encodeURIComponent(orderId)}`);
        if (!res.ok) {
          if (active) setLoading(false);
          return;
        }
        const data = (await res.json()) as OrderStatusResponse;
        if (active) {
          setOrder(data);
          setLoading(false);
        }
      } catch {
        if (active) setLoading(false);
      }
    }

    checkStatus();

    // Poll until order is fulfilled or failed, up to 20 attempts (40 seconds)
    const interval = setInterval(() => {
      setPollCount((prev) => {
        if (prev >= 20 || order?.status === "fulfilled" || order?.status === "failed") {
          clearInterval(interval);
          return prev;
        }
        checkStatus();
        return prev + 1;
      });
    }, 2500);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [orderId, order?.status]);

  const isFulfilled = order?.status === "fulfilled";
  const isFailed = order?.status === "failed";
  const isPending = !isFulfilled && !isFailed;

  return (
    <div className="min-h-screen bg-background py-16 px-4 sm:px-6">
      <div className="mx-auto max-w-xl">
        <div className="panel border-2 border-border bg-card p-6 sm:p-10 rounded-2xl shadow-sm text-center">
          {/* Header Icon */}
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full">
            {isFulfilled ? (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gold/15 text-gold">
                <CheckCircle2 className="h-10 w-10" />
              </div>
            ) : isFailed ? (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/15 text-destructive">
                <AlertCircle className="h-10 w-10" />
              </div>
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-muted-foreground animate-pulse">
                <Clock className="h-10 w-10" />
              </div>
            )}
          </div>

          {/* Heading and details */}
          {isFulfilled ? (
            <>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground">
                Coins Added to Your Account!
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Thank you for supporting Civil Craft: Bridge Edition. Your <strong>+{order?.expectedCoins ?? 500} Coins</strong> have been successfully verified and added to your in-game balance.
              </p>
            </>
          ) : isFailed ? (
            <>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground">
                Payment Verification Notice
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                We encountered an issue finalizing your order. Please check your transaction history or contact our support team.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground">
                Payment Received
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                We're confirming your purchase with PayMongo. Your coins will be added automatically once the webhook confirmation completes.
              </p>
            </>
          )}

          {/* Order Details Card */}
          {orderId ? (
            <div className="mt-8 rounded-xl border border-border/80 bg-secondary/40 p-4 text-left text-sm space-y-2">
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span>Order Reference</span>
                <span className="font-mono font-bold text-foreground">{orderId}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span>Package</span>
                <span className="font-semibold text-foreground">Civil Craft - 500 Coins</span>
              </div>
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span>Status</span>
                <span className="font-bold capitalize text-gold">
                  {isFulfilled ? "Fulfilled / Credited" : isFailed ? "Failed" : "Processing Webhook"}
                </span>
              </div>
              {order?.paidAt ? (
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <span>Confirmed At</span>
                  <span className="text-foreground">{new Date(order.paidAt).toLocaleTimeString()}</span>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Polling Indicator */}
          {isPending && (
            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-gold" />
              <span>Checking live confirmation status...</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild variant="gold" size="lg">
              <Link to="/dashboard">
                <Coins className="mr-2 h-4 w-4" /> Go to Dashboard
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/dashboard/transactions">
                View Transactions <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
