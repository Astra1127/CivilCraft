import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Coins, ShieldCheck, Sparkles, CheckCircle, ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { currentSessionTicket } from "@/lib/playfab/client";

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Civil Craft Shop — Bridge Edition" },
      {
        name: "description",
        content: "Purchase Civil Craft Coins to unlock cosmetic gear while supporting game development.",
      },
    ],
  }),
  component: ShopPage,
});

function ShopPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleBuyCoins = async () => {
    if (!isAuthenticated) {
      toast.info("Please sign in to purchase Coins.", {
        description: "You'll be redirected to sign in first.",
      });
      navigate({ to: "/login", search: { redirect: "/shop" } });
      return;
    }

    const ticket = currentSessionTicket();
    if (!ticket) {
      toast.error("Session expired. Please sign in again.");
      navigate({ to: "/login", search: { redirect: "/shop" } });
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/payments/paymongo/create-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ticket}`,
        },
        body: JSON.stringify({ productId: "coins_500" }),
      });

      const data = (await res.json()) as {
        success?: boolean;
        checkoutUrl?: string;
        orderId?: string;
        error?: string;
      };

      if (!res.ok || !data.checkoutUrl) {
        throw new Error(data.error || "Failed to initialize checkout session.");
      }

      // Redirect user to PayMongo Hosted Checkout
      window.location.href = data.checkoutUrl;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Payment initialization failed.";
      toast.error(msg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <PageHeader
        eyebrow="CIVIL CRAFT SHOP"
        title="Coins & Project Sustainability"
        description="Civil Craft: Bridge Edition is 100% free-to-play. Coin packages are optional sustainability contributions that reward you with in-game currency."
      />

      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <div className="grid gap-8 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] items-start">
          {/* Product Card */}
          <div className="panel relative flex flex-col justify-between overflow-hidden border-2 border-border bg-card p-6 sm:p-8 shadow-sm rounded-xl">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1 text-xs font-bold text-gold uppercase tracking-wider">
                  <Sparkles className="h-3.5 w-3.5" /> Initial Release
                </span>
                <span className="rounded-md border border-border/80 bg-secondary/50 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground uppercase">
                  PayMongo Test Mode
                </span>
              </div>

              <div>
                <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
                  500 COINS
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Instantly credited to your Civil Craft account upon verified payment.
                </p>
              </div>

              <div className="flex items-baseline gap-2 pt-2">
                <span className="text-4xl font-extrabold text-gold sm:text-5xl">₱50.00</span>
                <span className="text-sm font-semibold text-muted-foreground">/ one-time</span>
              </div>

              <ul className="space-y-3 pt-2 text-sm text-muted-foreground border-t border-border/70">
                <li className="flex items-center gap-3">
                  <CheckCircle className="h-4 w-4 shrink-0 text-gold" />
                  <span><strong>+500 Coins</strong> added to your virtual balance</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle className="h-4 w-4 shrink-0 text-gold" />
                  <span>Use in-game for cosmetics, hats, and builder outfits</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle className="h-4 w-4 shrink-0 text-gold" />
                  <span>Directly supports Civil Craft research & server hosting</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle className="h-4 w-4 shrink-0 text-gold" />
                  <span>Official PayMongo secure checkout (GCash, Maya, Cards)</span>
                </li>
              </ul>
            </div>

            <div className="mt-8 pt-6 border-t border-border">
              <Button
                variant="gold"
                size="lg"
                className="w-full text-base font-bold shadow-md hover:shadow-lg transition-all"
                onClick={handleBuyCoins}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Preparing Secure Checkout...
                  </>
                ) : (
                  <>
                    <Coins className="mr-2 h-5 w-5" />
                    Buy 500 Coins — ₱50
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Educational & Fair Play Philosophy */}
          <div className="space-y-6">
            <div className="panel border-2 border-border bg-card p-6 rounded-xl">
              <div className="flex items-center gap-2 text-gold">
                <ShieldCheck className="h-5 w-5" />
                <h3 className="font-bold text-foreground">Free-to-Play Promise</h3>
              </div>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                All bridge-engineering levels, structural simulations, physics sandbox tools, and core educational milestones remain 100% accessible to every student without any payment.
              </p>
            </div>

            <div className="panel border-2 border-border bg-card p-6 rounded-xl space-y-3">
              <h3 className="font-bold text-foreground text-sm uppercase tracking-wider text-muted-foreground">
                Payment Information
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                This shop uses <strong>PayMongo Test Mode</strong>. Transactions use test credentials and do not deduct real funds.
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Accepted test methods: GCash, Maya, GrabPay, BPI/UBP direct, and credit/debit test cards.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
