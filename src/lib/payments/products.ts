export type { PaymentProduct } from "./types.ts";
import type { PaymentProduct } from "./types.ts";

export const COINS_500: PaymentProduct = {
  id: "coins_500",
  name: "500 Civil Craft Coins",
  description: "Starter coin pack for cosmetic gear and outfits",
  amount: 5000, // ₱50.00 in centavos
  currency: "PHP",
  rewardCoins: 500,
  category: "currency",
  badge: "Starter Pack",
};

export const COINS_1000: PaymentProduct = {
  id: "coins_1000",
  name: "1,000 Civil Craft Coins",
  description: "Popular coin pack for hats, outfits, and builder decals",
  amount: 9500, // ₱95.00 in centavos
  currency: "PHP",
  rewardCoins: 1000,
  category: "currency",
  badge: "Most Popular",
  popular: true,
};

export const COINS_2500: PaymentProduct = {
  id: "coins_2500",
  name: "2,500 Civil Craft Coins",
  description: "Best value bundle for dedicated bridge builders",
  amount: 22000, // ₱220.00 in centavos
  currency: "PHP",
  rewardCoins: 2500,
  category: "currency",
  badge: "Best Value",
};

export const DEFAULT_PRODUCTS: PaymentProduct[] = [
  COINS_500,
  COINS_1000,
  COINS_2500,
];

export const PAYMENT_PRODUCTS: Record<string, PaymentProduct> = {
  coins_500: COINS_500,
  coins_1000: COINS_1000,
  coins_2500: COINS_2500,
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
