import { playerFetch } from "./client";
/**
 * Purchases and granted items, derived from the player's PlayFab inventory.
 * The website never keeps a duplicate purchase database.
 */
import { currentSessionTicket } from "./client";
import { getRawInventory } from "./inventory";
import type { Transaction } from "./types";

export async function getTransactions(playerId: string): Promise<Transaction[]> {
  const [inventory, paymentOrders] = await Promise.all([
    getRawInventory().catch(() => ({ Inventory: [] })),
    fetchPlayerPaymentTransactions(playerId),
  ]);

  const inventoryTransactions: Transaction[] = (inventory.Inventory ?? [])
    .filter((item) => item.PurchaseDate)
    .map((item) => ({
      transactionId: item.ItemInstanceId ?? item.ItemId,
      playerId,
      itemId: item.ItemId,
      itemName: item.DisplayName ?? item.ItemId,
      itemCategory: item.ItemClass ?? "Item",
      amount: item.UnitPrice ?? 0,
      currency: item.UnitCurrency ?? "",
      type: (item.UnitPrice ?? 0) > 0 ? ("purchase" as const) : ("reward" as const),
      status: "completed" as const,
      createdAt: item.PurchaseDate as string,
      owned: true,
    }));

  return [...paymentOrders, ...inventoryTransactions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

async function fetchPlayerPaymentTransactions(playerId: string): Promise<Transaction[]> {
  if (typeof window === "undefined") return [];
  const ticket = currentSessionTicket();
  if (!ticket) return [];

  try {
    const res = await playerFetch("/api/payments/paymongo/player-orders", {
      headers: { Authorization: `Bearer ${ticket}` },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      orders?: Array<{
        orderId: string;
        productId: string;
        status: string;
        expectedCoins: number;
        expectedAmount: number;
        currency: string;
        createdAt: string;
      }>;
    };

    return (data.orders ?? []).map((o) => ({
      transactionId: o.orderId,
      playerId,
      itemId: o.productId,
      itemName: o.productId === "coins_500" ? "500 Civil Craft Coins" : o.productId,
      itemCategory: "Currency",
      amount: o.expectedAmount / 100,
      currency: o.currency,
      type: "purchase" as const,
      status:
        o.status === "fulfilled"
          ? ("completed" as const)
          : o.status === "failed" || o.status === "cancelled"
            ? ("refunded" as const)
            : ("pending" as const),
      paymentMethod: "PayMongo",
      createdAt: o.createdAt,
    }));
  } catch {
    return [];
  }
}
