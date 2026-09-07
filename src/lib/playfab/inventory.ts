/**
 * PlayFab inventory (cosmetic ownership). Read-only: equipping happens in the
 * Unity game.
 */
import { callPlayerApi } from "./client";
import { getEquippedCosmetics } from "./player";
import type { CosmeticSlot, PlayerInventory } from "./types";

export interface InventoryItem {
  ItemId: string;
  ItemInstanceId?: string;
  DisplayName?: string;
  ItemClass?: string;
  PurchaseDate?: string;
  UnitPrice?: number;
  UnitCurrency?: string;
}

interface InventoryResult {
  Inventory?: InventoryItem[];
  VirtualCurrency?: Record<string, number>;
}

export async function getRawInventory(): Promise<InventoryResult> {
  return callPlayerApi<InventoryResult>("/Client/GetUserInventory", {});
}

export async function getInventory(): Promise<PlayerInventory> {
  const [inventory, equipped] = await Promise.all([
    getRawInventory(),
    getEquippedCosmetics().catch(() => ({})),
  ]);
  const equippedItemIds: Partial<Record<CosmeticSlot, string>> = {};
  for (const [slot, itemId] of Object.entries(equipped)) {
    if (typeof itemId === "string") equippedItemIds[slot as CosmeticSlot] = itemId;
  }
  return {
    ownedItemIds: (inventory.Inventory ?? []).map((i) => i.ItemId),
    equippedItemIds,
  };
}

/** Virtual currency balances (e.g. Coins) as reported by PlayFab. */
export async function getVirtualCurrency(): Promise<Record<string, number>> {
  return (await getRawInventory()).VirtualCurrency ?? {};
}
