import type { PaymentProduct } from "./types.ts";

export const PAYMENT_PRODUCTS: Record<string, PaymentProduct> = {
  coins_500: {
    id: "coins_500",
    name: "500 Civil Craft Coins",
    description: "500 Coins for Civil Craft: Bridge Edition",
    amount: 5000, // ₱50.00 in centavos
    currency: "PHP",
    rewardCoins: 500,
    category: "currency",
  },
};

export function getProduct(productId: string): PaymentProduct | null {
  if (typeof productId !== "string") return null;
  const key = productId.trim().toLowerCase();
  return PAYMENT_PRODUCTS[key] ?? null;
}

export function formatProductPrice(amountInCentavos: number, currency = "PHP"): string {
  const value = amountInCentavos / 100;
  if (currency.toUpperCase() === "PHP") {
    return `₱${value.toFixed(2)}`;
  }
  return `${currency} ${value.toFixed(2)}`;
}
