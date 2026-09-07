/**
 * Purchases and granted items, derived from the player's PlayFab inventory.
 * The website never keeps a duplicate purchase database.
 */
import { getRawInventory } from "./inventory";
import type { Transaction } from "./types";

export async function getTransactions(playerId: string): Promise<Transaction[]> {
  const inventory = await getRawInventory();
  return (inventory.Inventory ?? [])
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
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
