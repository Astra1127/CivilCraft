import { playerReturnTo } from "@/lib/playfab/session-errors";
import { playerFetch } from "@/lib/playfab/client";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  Coins,
  Hammer,
  Loader2,
  Lock,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorState, LoadingState } from "@/components/common/States";
import { toast } from "sonner";
import { PublicLayout } from "@/components/site/PublicLayout";
import { SectionDivider } from "@/components/site/SectionDivider";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { currentSessionTicket } from "@/lib/playfab/client";
import { getVirtualCurrency } from "@/lib/playfab/inventory";
import { DEFAULT_PRODUCTS, formatProductPrice, type PaymentProduct } from "@/lib/payments/products";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/shop")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Coin Shop — Civil Craft: Bridge Edition" },
      {
        name: "description",
        content:
          "Customize your builder with Civil Craft Coins. Optional cosmetic coin packages for hats, outfits, and builder gear.",
      },
      { property: "og:title", content: "Coin Shop — Civil Craft: Bridge Edition" },
      {
        property: "og:description",
        content:
          "Customize your builder and support continued Civil Craft development. Core bridge-engineering gameplay is 100% free.",
      },
    ],
  }),
  component: ShopPage,
});

function ShopPage() {
  const { ready, isAuthenticated, sessionExpired, playerSessionError, retryPlayerSession } =
    useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && !isAuthenticated)
      void navigate({
        to: "/login",
        search: {
          redirect: playerReturnTo(
            typeof window === "undefined"
              ? "/shop"
              : window.location.pathname + window.location.search + window.location.hash,
          ),
          ...(sessionExpired ? { reason: "expired" as const } : {}),
        },
        replace: true,
      });
  }, [ready, isAuthenticated, sessionExpired, navigate]);

  if (!ready && playerSessionError)
    return (
      <div className="mx-auto max-w-3xl px-4 py-20">
        <ErrorState
          title="Unable to verify your session."
          description="Please check your connection and try again. Your saved session has not been removed."
          onRetry={retryPlayerSession}
        />
      </div>
    );

  if (!ready || !isAuthenticated)
    return (
      <PublicLayout>
        <div className="mx-auto max-w-3xl px-4 py-20">
          <LoadingState label="Checking your session…" rows={2} />
        </div>
      </PublicLayout>
    );

  return <AuthenticatedShopPage />;
}

function AuthenticatedShopPage() {
  const { isAuthenticated, player } = useAuth();
  const navigate = useNavigate();
  const [purchasingId, setPurchasingId] = useState<string | null>(null);

  // Live server-authoritative PlayFab CO virtual currency balance
  const balanceQuery = useQuery({
    queryKey: ["player-balance", player?.playFabId],
    queryFn: async () => {
      try {
        const vc = await getVirtualCurrency();
        return vc["CO"] ?? 0;
      } catch {
        return 0;
      }
    },
    enabled: isAuthenticated && Boolean(player?.playFabId),
    staleTime: 15_000,
  });

  // Query active product catalog from server, falling back to built-in catalog
  const productsQuery = useQuery<PaymentProduct[]>({
    queryKey: ["shop-products"],
    queryFn: async () => {
      try {
        const res = await playerFetch("/api/shop/products");
        if (!res.ok) throw new Error("Failed to load catalog");
        const data = (await res.json()) as { products?: PaymentProduct[] };
        if (Array.isArray(data.products) && data.products.length > 0) {
          return data.products;
        }
      } catch {
        // Fallback to built-in catalog
      }
      return DEFAULT_PRODUCTS;
    },
    initialData: DEFAULT_PRODUCTS,
    staleTime: 60_000,
  });

  const products = productsQuery.data ?? DEFAULT_PRODUCTS;

  const handleBuy = async (product: PaymentProduct) => {
    if (!isAuthenticated) {
      toast.info("Please sign in to purchase Coins.", {
        description: "You'll be redirected to sign in to your Civil Craft account.",
      });
      navigate({ to: "/login", search: { redirect: "/shop" } });
      return;
    }

    const ticket = currentSessionTicket();
    if (!ticket) {
      toast.error("Your session has expired. Please sign in again.");
      navigate({ to: "/login", search: { redirect: "/shop" } });
      return;
    }

    try {
      setPurchasingId(product.id);
      const res = await playerFetch("/api/payments/paymongo/create-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ticket}`,
        },
        body: JSON.stringify({ productId: product.id }),
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
    } finally {
      setPurchasingId(null);
    }
  };

  return (
    <PublicLayout>
      <div className="relative min-h-[calc(100vh-16rem)] blueprint py-10 sm:py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          {/* Hero Section */}
          <div className="text-center space-y-4 max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 rounded-full border-2 border-border bg-card/95 px-4 py-1 text-xs font-extrabold uppercase tracking-widest text-muted-foreground shadow-sm">
              <Hammer className="h-3.5 w-3.5 text-gold" />
              <span>CIVIL CRAFT: BRIDGE EDITION</span>
            </div>

            <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-foreground">
              Coin Shop
            </h1>

            <p className="text-base sm:text-lg text-foreground/80 font-medium leading-relaxed">
              Customize your builder and support the continued development of Civil Craft.
            </p>

            <p className="text-xs sm:text-sm text-muted-foreground font-semibold">
              Optional coin packages are available for cosmetic items and customization. Core
              bridge-engineering lessons remain free.
            </p>

            {/* Player Balance Card */}
            <div className="pt-4">
              {isAuthenticated ? (
                <div className="panel mx-auto max-w-sm border-2 border-gold/40 bg-card p-4 sm:p-5 text-center shadow-md">
                  <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
                    YOUR CIVIL CRAFT BALANCE
                  </span>
                  <div className="mt-1 flex items-center justify-center gap-2">
                    <span className="text-2xl sm:text-3xl select-none" aria-hidden="true">
                      🪙
                    </span>
                    <span className="font-display text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
                      {balanceQuery.isLoading ? "..." : (balanceQuery.data ?? 0).toLocaleString()}
                    </span>
                    <span className="text-sm font-extrabold text-gold tracking-wide">COINS</span>
                  </div>
                  <div className="mt-2 flex items-center justify-center gap-3 text-xs text-muted-foreground">
                    <Link to="/dashboard" className="font-bold text-gold hover:underline">
                      Dashboard →
                    </Link>
                    <span className="text-border">•</span>
                    <Link
                      to="/dashboard/transactions"
                      className="font-semibold hover:text-foreground"
                    >
                      Transactions
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="panel mx-auto max-w-sm border-2 border-border/80 bg-card/90 p-4 sm:p-5 text-center shadow-sm">
                  <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
                    YOUR CIVIL CRAFT BALANCE
                  </span>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    Sign in to view your balance
                  </p>
                  <div className="mt-3">
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="font-bold border-2 border-border hover:border-gold hover:text-gold"
                    >
                      <Link to="/login" search={{ redirect: "/shop" }}>
                        Sign In to Civil Craft
                      </Link>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <SectionDivider variant="draft" className="my-10 sm:my-12" />

          {/* Storefront Products Grid */}
          <div className="space-y-6">
            <div className="text-center space-y-1">
              <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-foreground">
                Available Coin Packages
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground font-semibold">
                Instant PlayFab delivery upon verified payment.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 items-stretch pt-2">
              {products.map((product) => {
                const isPopular = Boolean(product.popular);
                return (
                  <div
                    key={product.id}
                    className={cn(
                      "panel relative flex flex-col justify-between p-6 sm:p-7 bg-card rounded-2xl border-2 transition-all hover-lift",
                      isPopular
                        ? "border-gold ring-2 ring-gold/20 shadow-lift"
                        : "border-border/80",
                    )}
                  >
                    {/* Badge */}
                    {product.badge ? (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-3.5 py-0.5 text-xs font-extrabold uppercase tracking-wider shadow-sm",
                            isPopular
                              ? "bg-gold text-primary-foreground border border-gold"
                              : "bg-secondary border border-border text-foreground",
                          )}
                        >
                          {isPopular && <Sparkles className="h-3 w-3" />}
                          {product.badge}
                        </span>
                      </div>
                    ) : null}

                    {/* Card Content Top */}
                    <div>
                      {/* Coin Illustration Container */}
                      <div className="mx-auto mb-4 mt-2 flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-gold/40 bg-gold/15 shadow-inner">
                        <span className="text-4xl select-none" aria-hidden="true">
                          🪙
                        </span>
                      </div>

                      <h3 className="font-display text-2xl sm:text-3xl font-extrabold text-foreground text-center tracking-tight">
                        {product.rewardCoins.toLocaleString()} COINS
                      </h3>

                      <p className="mt-1 text-xs text-muted-foreground text-center font-medium min-h-[2rem]">
                        {product.description || product.name}
                      </p>

                      <div className="mt-4 flex items-baseline justify-center gap-1">
                        <span className="font-display text-3xl sm:text-4xl font-extrabold text-gold">
                          {formatProductPrice(product.amount, product.currency)}
                        </span>
                        <span className="text-xs font-semibold text-muted-foreground">
                          / one-time
                        </span>
                      </div>

                      {/* Benefits List */}
                      <div className="mt-6 border-t border-border/70 pt-4 space-y-2 text-xs sm:text-sm text-muted-foreground">
                        <div className="flex items-center gap-2.5">
                          <Check className="h-4 w-4 shrink-0 text-gold" />
                          <span>
                            <strong>+{product.rewardCoins.toLocaleString()} Coins</strong> added to
                            balance
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <Check className="h-4 w-4 shrink-0 text-gold" />
                          <span>Cosmetics, hats & builder outfits</span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <Check className="h-4 w-4 shrink-0 text-gold" />
                          <span>Directly supports Civil Craft research</span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <Check className="h-4 w-4 shrink-0 text-gold" />
                          <span>Official PayMongo secure checkout</span>
                        </div>
                      </div>
                    </div>

                    {/* Card Action Button */}
                    <div className="mt-6 pt-3">
                      {isAuthenticated ? (
                        <Button
                          variant={isPopular ? "gold" : "default"}
                          size="lg"
                          className="w-full font-bold text-sm sm:text-base shadow-md transition-all"
                          onClick={() => handleBuy(product)}
                          disabled={purchasingId !== null}
                        >
                          {purchasingId === product.id ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Connecting Checkout...
                            </>
                          ) : (
                            <>
                              <Coins className="mr-2 h-4 w-4" />
                              Buy {product.rewardCoins.toLocaleString()} Coins —{" "}
                              {formatProductPrice(product.amount, product.currency)}
                              <ArrowRight className="ml-2 h-4 w-4" />
                            </>
                          )}
                        </Button>
                      ) : (
                        <Button
                          asChild
                          variant="outline"
                          size="lg"
                          className="w-full font-bold text-sm sm:text-base border-2 border-border hover:border-gold hover:text-gold transition-all"
                        >
                          <Link to="/login" search={{ redirect: "/shop" }}>
                            SIGN IN TO PURCHASE
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <SectionDivider variant="beam" className="my-12 sm:my-16" />

          {/* Secondary Information Sections */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {/* Free to Play Card */}
            <div className="panel border-2 border-border bg-card p-6 rounded-2xl shadow-sm space-y-3">
              <div className="flex items-center gap-2.5 text-gold">
                <ShieldCheck className="h-5 w-5" />
                <h3 className="font-display text-lg font-bold text-foreground">
                  Free-to-Play Commitment
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Civil Craft's bridge-engineering lessons, structural mechanics activities, sandbox
                tools, and core gameplay remain completely accessible without purchasing coins.
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Coins are optional and intended for builder customization, hats, and cosmetic gear.
              </p>
            </div>

            {/* Payment & Test Mode Card */}
            <div className="panel border-2 border-border bg-card p-6 rounded-2xl shadow-sm space-y-3">
              <div className="flex items-center gap-2.5 text-gold">
                <Lock className="h-5 w-5" />
                <h3 className="font-display text-lg font-bold text-foreground">Secure Checkout</h3>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Payments are securely handled by PayMongo, supporting QR Ph / QR payments, GCash,
                Maya, GrabPay, BPI/UBP direct, and credit/debit cards.
              </p>
              <div className="rounded-lg border border-gold/40 bg-gold/10 p-3 text-xs text-foreground/90 font-medium">
                <strong className="text-gold">TEST MODE:</strong> This shop is currently operating
                in PayMongo Test Mode. Simulated sandbox payments do not deduct real funds.
              </div>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
