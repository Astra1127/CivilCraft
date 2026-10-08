export type PaymentOrderStatus = "pending" | "paid" | "fulfilled" | "failed" | "cancelled";

export type RewardCurrency = "CO" | "DI";

export interface CurrencyReward {
  rewardCurrency: RewardCurrency;
  rewardAmount: number;
}

export interface PremiumWalletSnapshot {
  entity: { Id: string; Type: "title_player_account" };
  collectionId: "premium-wallet";
  diamondItemId: string;
  receiptItemId: string;
}

export interface PaymentOrder {
  orderId: string;
  playFabId: string;
  productId: string;
  expectedAmount: number; // in centavos, e.g. 5000 = ₱50.00
  currency: string; // "PHP"
  expectedCoins: number; // e.g. 500
  /** Immutable reward snapshot. Missing fields identify legacy Coin orders only. */
  rewardCurrency?: RewardCurrency | undefined;
  rewardAmount?: number | undefined;
  premiumWallet?: PremiumWalletSnapshot | undefined;
  /** Snapshots the configured classic Coin code so later config changes cannot reroute it. */
  coinCurrencyCode?: string | undefined;
  PayMongoCheckoutSessionId: string | null;
  PayMongoReferenceNumber: string;
  status: PaymentOrderStatus;
  createdAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;
  webhookEventId: string | null;
  checkoutUrl?: string | null;
  error?: string | null;
}

export interface PaymentProduct {
  id: string;
  name: string;
  description: string;
  amount: number; // in centavos, e.g. 5000 = ₱50.00
  currency: string; // "PHP"
  rewardCoins: number;
  /** Canonical reward; rewardCoins remains for legacy records and is zero for DI. */
  rewardCurrency?: RewardCurrency | undefined;
  rewardAmount?: number | undefined;
  category: "currency" | "support" | "cosmetic";
  badge?: string | undefined;
  popular?: boolean | undefined;
  active?: boolean | undefined;
  order?: number | undefined;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
}

export interface PayMongoWebhookEvent {
  data: {
    id: string;
    type: string;
    attributes: {
      type: string;
      livemode: boolean;
      data: {
        id: string;
        type: string;
        attributes: {
          status?: string;
          amount?: number;
          currency?: string;
          reference_number?: string;
          payments?: Array<{
            id: string;
            type: string;
            attributes: {
              amount: number;
              currency: string;
              status: string;
              paid_at?: number;
            };
          }>;
          line_items?: Array<{
            amount: number;
            currency: string;
            name: string;
            quantity: number;
          }>;
          metadata?: Record<string, string>;
        };
      };
    };
  };
}
