import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { XCircle, ArrowRight, Coins } from "lucide-react";
import { PublicLayout } from "@/components/site/PublicLayout";
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
    <PublicLayout>
      <div className="relative min-h-[calc(100vh-16rem)] blueprint py-12 sm:py-20 px-4 sm:px-6 flex items-center justify-center">
        <div className="mx-auto max-w-lg w-full">
          <div className="panel border-2 border-border bg-card p-6 sm:p-10 rounded-2xl shadow-lift text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-muted-foreground border-2 border-border">
              <XCircle className="h-10 w-10 text-muted-foreground" />
            </div>

            <span className="inline-block text-[11px] font-extrabold uppercase tracking-widest text-muted-foreground mb-1">
              PURCHASE CANCELLED
            </span>

            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-foreground">
              Payment Cancelled
            </h1>

            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              No coins were added to your account and no funds were deducted.
            </p>

            {orderId ? (
              <p className="mt-4 text-xs font-mono text-muted-foreground/80">
                Reference: {orderId}
              </p>
            ) : null}

            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Button asChild variant="gold" size="lg" className="font-bold shadow-md">
                <Link to="/shop">
                  <Coins className="mr-2 h-4 w-4" /> Return to Coin Shop
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="font-bold border-2 border-border">
                <Link to="/dashboard">
                  Go to Dashboard <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
