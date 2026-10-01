import { lookupCosmetic } from "./cosmetics-catalog.ts";
import type { CosmeticItem, CosmeticSlot, EquippedCosmetics } from "./types.ts";

export const GAME_EQUIPMENT_SLOTS: CosmeticSlot[] = ["accessory", "hair", "top", "pants", "shoes"];
const loadoutFields = {
  hairID: "hair",
  shirtID: "top",
  pantsID: "pants",
  shoesID: "shoes",
} as const;

/** Supports the inspected Unity save model IF the programmer publishes it as the projection.
 * This is not evidence that the game currently emits this wire format.
 */
function readGameLoadout(value: Record<string, unknown>): CosmeticItem[] {
  const allowed = new Set([
    "accessoryIDs",
    "accessoriesID",
    ...Object.keys(loadoutFields),
    "accessoriesColor",
    "hairColor",
    "shirtColor",
    "pantsColor",
    "shoesColor",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new Error();
  const items: CosmeticItem[] = [];
  for (const [field, slot] of Object.entries(loadoutFields)) {
    const id = value[field];
    if (typeof id !== "string") throw new Error();
    if (id.trim()) items.push({ slot, itemId: id.trim(), name: id.trim() });
  }
  const legacy = value["accessoriesID"];
  if (legacy !== undefined && typeof legacy !== "string") throw new Error();
  let accessories = value["accessoryIDs"];
  if (
    accessories !== undefined &&
    (!Array.isArray(accessories) || accessories.some((id) => typeof id !== "string"))
  )
    throw new Error();
  if (accessories === undefined && legacy === undefined) throw new Error();
  // Matches Unity's empty-list migration from the legacy single-accessory field.
  if (!Array.isArray(accessories) || accessories.length === 0) accessories = legacy ? [legacy] : [];
  const seen = new Set<string>();
  for (const raw of accessories as string[]) {
    const id = raw.trim();
    if (!id || id.toLowerCase() === "accessory_none" || seen.has(id.toLowerCase())) continue;
    seen.add(id.toLowerCase());
    items.push({ slot: "accessory", itemId: id, name: id });
  }
  return items;
}

/** Preserve every accessory rather than overwriting earlier entries. */
export function equipmentRecord(items: CosmeticItem[]): EquippedCosmetics {
  const result: EquippedCosmetics = {};
  for (const item of items) {
    if (item.slot !== "accessory") result[item.slot] = item.itemId;
    else {
      const previous = result.accessory;
      result.accessory =
        previous === undefined
          ? item.itemId
          : [...(Array.isArray(previous) ? previous : [previous]), item.itemId];
    }
  }
  return result;
}

const slots = new Set<string>([
  "helmet",
  "hair",
  "top",
  "vest",
  "pants",
  "gloves",
  "shoes",
  "accessory",
]);
export function equipmentSnapshot(raw: string | undefined): {
  status: "missing" | "invalid" | "synced";
  items: CosmeticItem[];
  slots?: CosmeticSlot[];
} {
  if (!raw?.trim()) return { status: "missing", items: [] };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error();
    if (
      !Array.isArray(parsed) &&
      ["accessoryIDs", "accessoriesID", ...Object.keys(loadoutFields)].some((key) =>
        Object.hasOwn(parsed, key),
      )
    ) {
      return {
        status: "synced",
        items: readGameLoadout(parsed as Record<string, unknown>),
        slots: GAME_EQUIPMENT_SLOTS,
      };
    }
    const entries = Array.isArray(parsed)
      ? parsed.map((entry) => [entry?.slot ?? entry?.Slot, entry])
      : Object.entries(parsed);
    const items: CosmeticItem[] = [];
    const seen = new Set<string>();
    for (const [key, value] of entries) {
      if (typeof key !== "string" || !slots.has(key.toLowerCase())) throw new Error();
      const slot = key.toLowerCase() as CosmeticSlot;
      if (seen.has(slot)) throw new Error();
      seen.add(slot);
      if (value === null || value === "") continue;
      const id = typeof value === "string" ? value : (value?.itemId ?? value?.ItemId ?? value?.id);
      if (typeof id !== "string") throw new Error();
      if (!id.trim()) continue;
      const name = value?.name ?? value?.Name;
      const image = value?.imageUrl ?? value?.ImageUrl;
      const rarity = value?.rarity ?? value?.Rarity;
      items.push({
        slot,
        itemId: id.trim(),
        name: typeof name === "string" && name.trim() ? name : id.trim(),
        ...(safeCosmeticImage(image) ? { imageUrl: image } : {}),
        ...(typeof rarity === "string" ? { rarity } : {}),
      });
    }
    return { status: "synced", items };
  } catch {
    return { status: "invalid", items: [] };
  }
}

export function safeCosmeticImage(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.startsWith("/images/")) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function resolveEquipment(
  items: CosmeticItem[],
  catalog: {
    ItemId: string;
    DisplayName?: string;
    ItemImageUrl?: string;
  }[] = [],
): CosmeticItem[] {
  const byId = new Map(catalog.map((item) => [item.ItemId, item]));
  return items.map((item) => {
    const metadata = byId.get(item.itemId);
    const staticMeta = lookupCosmetic(item.itemId);
    const resolvedName =
      metadata?.DisplayName?.trim() ||
      (item.name && item.name !== item.itemId ? item.name : undefined) ||
      staticMeta?.name ||
      item.name;
    const resolvedImage =
      (safeCosmeticImage(metadata?.ItemImageUrl) ? metadata.ItemImageUrl : undefined) ||
      (safeCosmeticImage(item.imageUrl) ? item.imageUrl : undefined) ||
      staticMeta?.imageUrl;
    return {
      ...item,
      name: resolvedName,
      ...(resolvedImage ? { imageUrl: resolvedImage } : {}),
    };
  });
}
