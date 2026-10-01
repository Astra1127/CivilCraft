import type { CosmeticSlot } from "./types.ts";

export interface CosmeticDefinitionMetadata {
  itemId: string;
  name: string;
  slot: CosmeticSlot;
  imageUrl?: string | undefined;
}

/**
 * Website-side catalog of the 27 authored cosmetics in Civil Craft.
 * Mapped to static website PNG images exported from Unity assets.
 * Cosmetics that only have 3D models in Unity omit imageUrl and fall back
 * cleanly to the website's slot icons.
 */
export const COSMETIC_CATALOG: Record<string, CosmeticDefinitionMetadata> = {
  // --- Accessories / Headwear ---
  Accessory_LargeCap: {
    itemId: "Accessory_LargeCap",
    name: "Large Cap",
    slot: "helmet",
  },
  Accessory_None: {
    itemId: "Accessory_None",
    name: "None",
    slot: "accessory",
  },
  Accessory_SafetyVest: {
    itemId: "Accessory_SafetyVest",
    name: "Safety Vest",
    slot: "vest",
  },
  Accessory_SmallCap: {
    itemId: "Accessory_SmallCap",
    name: "Small Cap",
    slot: "helmet",
  },
  EngineeringHardHat: {
    itemId: "EngineeringHardHat",
    name: "Engineering Hard Hat",
    slot: "helmet",
    imageUrl: "/images/cosmetics/hard_hat.png",
  },

  // --- Hair ---
  Hair_Base: {
    itemId: "Hair_Base",
    name: "Classic Hair",
    slot: "hair",
    imageUrl: "/images/cosmetics/Hair_Base.png",
  },
  Hair_1: {
    itemId: "Hair_1",
    name: "Side Sweep",
    slot: "hair",
    imageUrl: "/images/cosmetics/Hair_1.png",
  },
  Hair_2: {
    itemId: "Hair_2",
    name: "Short Layers",
    slot: "hair",
    imageUrl: "/images/cosmetics/Hair_2.png",
  },
  Hair_4: {
    itemId: "Hair_4",
    name: "Bob Cut",
    slot: "hair",
    imageUrl: "/images/cosmetics/Hair_4.png",
  },
  Hair_5: {
    itemId: "Hair_5",
    name: "Wavy Hair",
    slot: "hair",
    imageUrl: "/images/cosmetics/Hair_5.png",
  },
  Hair_6: {
    itemId: "Hair_6",
    name: "Crew Cut",
    slot: "hair",
    imageUrl: "/images/cosmetics/Hair_6.png",
  },
  Hair_8: {
    itemId: "Hair_8",
    name: "Curly Hair",
    slot: "hair",
    imageUrl: "/images/cosmetics/Hair_3.png",
  },

  // --- Shirts / Tops ---
  Shirt_Base: {
    itemId: "Shirt_Base",
    name: "Builder Tee",
    slot: "top",
  },
  Shirt_Tee1: {
    itemId: "Shirt_Tee1",
    name: "Work Tee",
    slot: "top",
    imageUrl: "/images/cosmetics/Tshirt_1.png",
  },
  Shirt_Tee2: {
    itemId: "Shirt_Tee2",
    name: "Pocket Tee",
    slot: "top",
    imageUrl: "/images/cosmetics/Tshirt_2.png",
  },
  Shirt_Polo: {
    itemId: "Shirt_Polo",
    name: "Polo",
    slot: "top",
    imageUrl: "/images/cosmetics/Polo.png",
  },
  Shirt_Blouse: {
    itemId: "Shirt_Blouse",
    name: "Blouse",
    slot: "top",
    imageUrl: "/images/cosmetics/Blouse.png",
  },

  // --- Pants ---
  Pants_Base: {
    itemId: "Pants_Base",
    name: "Builder Pants",
    slot: "pants",
  },
  Pants_Straight: {
    itemId: "Pants_Straight",
    name: "Straight Pants",
    slot: "pants",
    imageUrl: "/images/cosmetics/Pants.png",
  },
  Pants_Cargo: {
    itemId: "Pants_Cargo",
    name: "Cargo Pants",
    slot: "pants",
    imageUrl: "/images/cosmetics/Cargo_Pants.png",
  },
  Pants_Rolled: {
    itemId: "Pants_Rolled",
    name: "Rolled Pants",
    slot: "pants",
    imageUrl: "/images/cosmetics/RolledUp_Pants.png",
  },
  Pants_Skirt: {
    itemId: "Pants_Skirt",
    name: "Work Skirt",
    slot: "pants",
  },

  // --- Shoes ---
  Shoes_Base: {
    itemId: "Shoes_Base",
    name: "Builder Shoes",
    slot: "shoes",
    imageUrl: "/images/cosmetics/Shoe1.png",
  },
  Shoes_Black: {
    itemId: "Shoes_Black",
    name: "Black Shoes",
    slot: "shoes",
    imageUrl: "/images/cosmetics/Shoe.png",
  },
  Shoes_Boots1: {
    itemId: "Shoes_Boots1",
    name: "Work Boots",
    slot: "shoes",
    imageUrl: "/images/cosmetics/Boots_1.png",
  },
  Shoes_Boots2: {
    itemId: "Shoes_Boots2",
    name: "Heavy Boots",
    slot: "shoes",
    imageUrl: "/images/cosmetics/Boots_2.png",
  },
  Shoes_Sandals: {
    itemId: "Shoes_Sandals",
    name: "Sandals",
    slot: "shoes",
    imageUrl: "/images/cosmetics/Sandals.png",
  },
};

export function lookupCosmetic(itemId: string): CosmeticDefinitionMetadata | undefined {
  if (!itemId) return undefined;
  const match = COSMETIC_CATALOG[itemId];
  if (match) return match;
  const lower = itemId.toLowerCase();
  for (const entry of Object.values(COSMETIC_CATALOG)) {
    if (entry.itemId.toLowerCase() === lower) return entry;
  }
  return undefined;
}

