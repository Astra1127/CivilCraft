export type { CurrencyReward, PaymentProduct, RewardCurrency } from "./types.ts";
import type { CurrencyReward, PaymentOrder, PaymentProduct, RewardCurrency } from "./types.ts";

export const MAX_REWARD_AMOUNT = 2_147_483_647;

function normalizeReward(
  value: { rewardCurrency?: unknown; rewardAmount?: unknown },
  legacyAmount: unknown,
): CurrencyReward {
  const legacy = value.rewardCurrency === undefined && value.rewardAmount === undefined;
  const rewardCurrency = legacy ? "CO" : value.rewardCurrency;
  const rewardAmount = legacy ? legacyAmount : value.rewardAmount;
  if (
    (rewardCurrency !== "CO" && rewardCurrency !== "DI") ||
    typeof rewardAmount !== "number" ||
    !Number.isSafeInteger(rewardAmount) ||
    rewardAmount <= 0 ||
    rewardAmount > MAX_REWARD_AMOUNT
  ) {
    throw new Error("Product or order has an invalid currency reward.");
  }
  return { rewardCurrency, rewardAmount };
}

/** Only records with neither canonical field may use legacy Coin quantities. */
export function normalizeProductReward(
  product: Pick<PaymentProduct, "rewardCoins" | "rewardCurrency" | "rewardAmount">,
): CurrencyReward {
  const reward = normalizeReward(product, product.rewardCoins);
  if (
    product.rewardCurrency !== undefined &&
    product.rewardCoins !== (reward.rewardCurrency === "CO" ? reward.rewardAmount : 0)
  ) {
    throw new Error("Product has conflicting legacy and canonical currency rewards.");
  }
  return reward;
}

export function normalizeOrderReward(
  order: Pick<PaymentOrder, "expectedCoins" | "rewardCurrency" | "rewardAmount">,
): CurrencyReward {
  const reward = normalizeReward(order, order.expectedCoins);
  if (
    order.rewardCurrency !== undefined &&
    order.expectedCoins !== (reward.rewardCurrency === "CO" ? reward.rewardAmount : 0)
  ) {
    throw new Error("Order has conflicting legacy and canonical currency rewards.");
  }
  return reward;
}

export function currencyLabel(currency: RewardCurrency): string {
  return currency === "DI" ? "Diamonds" : "Coins";
}

export const COINS_500: PaymentProduct = {
  id: "coins_500",
  name: "500 Civil Craft Coins",
  description: "Starter coin pack for cosmetic gear and outfits",
  amount: 5000, // ₱50.00 in centavos
  currency: "PHP",
  rewardCoins: 500,
  rewardCurrency: "CO",
  rewardAmount: 500,
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
  rewardCurrency: "CO",
  rewardAmount: 1000,
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
  rewardCurrency: "CO",
  rewardAmount: 2500,
  category: "currency",
  badge: "Best Value",
};

export const DIAMONDS_500: PaymentProduct = {
  id: "diamonds_500",
  name: "500 Civil Craft Diamonds",
  description: "Starter Diamond pack for your Civil Craft premium wallet",
  amount: 5000,
  currency: "PHP",
  rewardCoins: 0,
  rewardCurrency: "DI",
  rewardAmount: 500,
  category: "currency",
  badge: "Starter Pack",
};

export const DIAMONDS_1000: PaymentProduct = {
  id: "diamonds_1000",
  name: "1,000 Civil Craft Diamonds",
  description: "Popular Diamond pack for your Civil Craft premium wallet",
  amount: 9500,
  currency: "PHP",
  rewardCoins: 0,
  rewardCurrency: "DI",
  rewardAmount: 1000,
  category: "currency",
  badge: "Most Popular",
  popular: true,
};

export const DIAMONDS_2500: PaymentProduct = {
  id: "diamonds_2500",
  name: "2,500 Civil Craft Diamonds",
  description: "Best value Diamond bundle for dedicated bridge builders",
  amount: 22000,
  currency: "PHP",
  rewardCoins: 0,
  rewardCurrency: "DI",
  rewardAmount: 2500,
  category: "currency",
  badge: "Best Value",
};

/** Templates only: public reads must never substitute these for stored products. */
export const DEFAULT_PRODUCTS: PaymentProduct[] = [
  COINS_500,
  COINS_1000,
  COINS_2500,
  DIAMONDS_500,
  DIAMONDS_1000,
  DIAMONDS_2500,
];

export const PAYMENT_PRODUCTS: Record<string, PaymentProduct> = {
  coins_500: COINS_500,
  coins_1000: COINS_1000,
  coins_2500: COINS_2500,
  diamonds_500: DIAMONDS_500,
  diamonds_1000: DIAMONDS_1000,
  diamonds_2500: DIAMONDS_2500,
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
