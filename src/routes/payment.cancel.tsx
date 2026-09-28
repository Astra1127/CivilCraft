import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { XCircle, ArrowLeft, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/payment/cancel")({
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
  const { order_id: orderId } = useSearch({ from: "/payment/cancel" });

  return (
    <div className="min-h-screen bg-background py-16 px-4 sm:px-6">
      <div className="mx-auto max-w-lg">
        <div className="panel border-2 border-border bg-card p-6 sm:p-10 rounded-2xl shadow-sm text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <XCircle className="h-10 w-10 text-muted-foreground" />
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground">
            Payment Cancelled
          </h1>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Your payment session was cancelled. No funds were deducted, and no coins were added to your account.
          </p>

          {orderId ? (
            <p className="mt-4 text-xs font-mono text-muted-foreground/80">
              Reference: {orderId}
            </p>
          ) : null}

          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild variant="gold" size="lg">
              <Link to="/shop">
                <ShoppingBag className="mr-2 h-4 w-4" /> Return to Shop
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/dashboard">
                <ArrowLeft className="mr-2 h-4 w-4" /> Go to Dashboard
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
