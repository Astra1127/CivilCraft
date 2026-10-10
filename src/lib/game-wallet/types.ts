export const GAME_WALLET_NAMESPACE = "civilcraft_game_wallet_v3" as const;
export const GAME_WALLET_VERSION = 3 as const;
export const MAX_GAME_COINS = 2_147_483_647;
export interface GameWalletConfig {
  readonly storage: "postgres";
  readonly namespace: typeof GAME_WALLET_NAMESPACE;
  readonly databaseId: string;
  readonly targetId: string;
  readonly protocolVersion: 3;
}
export interface GameWalletSnapshot extends GameWalletConfig {
  readonly entity: { readonly Id: string; readonly Type: "title_player_account" };
}
export interface GameCoinOrder {
  orderId: string;
  playFabId: string;
  expectedCoins: number;
  rewardCurrency?: "CO" | "DI" | undefined;
  rewardAmount?: number | undefined;
  gameWallet?: GameWalletSnapshot | undefined;
  coinReceiptVersion?: 1 | 2 | 3 | undefined;
  coinCurrencyCode?: string | undefined;
  coinReceipt?:
    { storage: "postgres"; databaseId: string; targetId: string; schemaVersion: 1 } | undefined;
  status: string;
  fulfilledAt?: string | null | undefined;
  error?: string | null | undefined;
  fulfillmentReviewRequired?: boolean | undefined;
}
export interface GameWalletDTO {
  coins: number | null;
  diamonds: number | null;
  ready: boolean;
  version: number;
  lifetimeGoldEarned: number | null;
  lifetimeGoldSpent: number | null;
}
export interface GameEntitlements {
  shopItems: Array<{ itemId: string; cosmeticId: string }>;
  materials: Array<{ contractId: string; materialId: string; saveKey: string }>;
  version: number;
}
