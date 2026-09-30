import { z } from "zod";
import { AdminApiError, object, playFabAdmin } from "../playfab/admin-client.server.ts";
import { DEFAULT_PRODUCTS } from "./products.ts";
import { listOrders } from "./orders.server.ts";
import type { PaymentProduct } from "./types.ts";

const PRODUCT_PREFIX = "civilcraft.website.v1.coin-products.";

export const productSchema = z.object({
  id: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9_-]+$/i, "Product ID must contain only alphanumeric characters, underscores, and hyphens"),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().min(2).max(500),
  amount: z.number().int().positive("Price must be greater than zero"),
  currency: z.string().trim().default("PHP"),
  rewardCoins: z.number().int().positive("Coin reward must be greater than zero"),
  category: z.enum(["currency", "support", "cosmetic"]).default("currency"),
  badge: z.string().trim().max(50).optional(),
  popular: z.boolean().optional(),
  active: z.boolean().default(true),
  order: z.number().int().default(0),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type ProductInput = z.infer<typeof productSchema>;

/** Seed Title Internal Data with the initial 3 coin products if empty */
async function seedDefaultProducts(): Promise<PaymentProduct[]> {
  const seeded: PaymentProduct[] = DEFAULT_PRODUCTS.map((p, index) => ({
    ...p,
    active: true,
    order: (index + 1) * 10,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));

  for (const product of seeded) {
    try {
      await playFabAdmin("Admin/SetTitleInternalData", {
        Key: PRODUCT_PREFIX + product.id,
        Value: JSON.stringify(product),
      });
    } catch (err) {
      console.warn(`[products.server] Failed to seed default product ${product.id}:`, err);
    }
  }

  return seeded;
}

/** Retrieve all coin products configured in Title Internal Data */
export async function listAllProducts(): Promise<PaymentProduct[]> {
  try {
    const res = await playFabAdmin("Admin/GetTitleInternalData");
    const data = object(res["Data"]);
    const products: PaymentProduct[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith(PRODUCT_PREFIX) && typeof value === "string") {
        try {
          const parsed = JSON.parse(value);
          const validated = productSchema.parse(parsed);
          products.push(validated as PaymentProduct);
        } catch (err) {
          console.warn(`[products.server] Invalid product JSON for key ${key}:`, err);
        }
      }
    }

    if (products.length === 0) {
      return await seedDefaultProducts();
    }

    return products.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.amount - b.amount);
  } catch (err) {
    console.error("[products.server] Failed to load products from PlayFab Title Data:", err);
    // Fall back to built-in defaults if PlayFab is unreachable
    return DEFAULT_PRODUCTS.map((p, i) => ({ ...p, active: true, order: (i + 1) * 10 }));
  }
}

/** Retrieve active products available in the Player Coin Shop */
export async function listActiveProducts(): Promise<PaymentProduct[]> {
  const all = await listAllProducts();
  return all.filter((p) => p.active !== false);
}

/** Retrieve a specific product by ID */
export async function getProductById(productId: string): Promise<PaymentProduct | null> {
  if (!productId || typeof productId !== "string") return null;
  const normalizedId = productId.trim().toLowerCase();

  // Try direct key lookup in Title Internal Data
  try {
    const key = PRODUCT_PREFIX + normalizedId;
    const res = await playFabAdmin("Admin/GetTitleInternalData", { Keys: [key] });
    const data = object(res["Data"]);
    const raw = data[key];
    if (typeof raw === "string" && raw) {
      const parsed = JSON.parse(raw);
      return productSchema.parse(parsed) as PaymentProduct;
    }
  } catch {
    // Continue to full list fallback
  }

  // Fallback to searching all products
  const all = await listAllProducts();
  const found = all.find((p) => p.id.toLowerCase() === normalizedId);
  if (found) return found;

  // Fallback to static defaults
  const fallback = DEFAULT_PRODUCTS.find((p) => p.id.toLowerCase() === normalizedId);
  return fallback ? { ...fallback, active: true } : null;
}

/** Create or update a coin product */
export async function saveProduct(input: unknown): Promise<PaymentProduct> {
  const validated = productSchema.parse(input);
  const existing = await getProductById(validated.id);

  const productToSave: PaymentProduct = {
    ...validated,
    id: validated.id.trim().toLowerCase(),
    currency: "PHP",
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const serialized = JSON.stringify(productToSave);
  if (Buffer.byteLength(serialized) > 9500) {
    throw new AdminApiError(400, "Product record exceeded maximum size.");
  }

  await playFabAdmin("Admin/SetTitleInternalData", {
    Key: PRODUCT_PREFIX + productToSave.id,
    Value: serialized,
  });

  return productToSave;
}

/** Toggle active / inactive status of a product */
export async function toggleProductActive(id: string, active?: boolean): Promise<PaymentProduct> {
  const existing = await getProductById(id);
  if (!existing) {
    throw new AdminApiError(404, `Product '${id}' not found.`);
  }

  const nextActive = active !== undefined ? active : !existing.active;
  return await saveProduct({
    ...existing,
    active: nextActive,
  });
}

/** Safely delete a product if no payment orders reference it */
export async function deleteProduct(id: string): Promise<{ success: boolean; message: string }> {
  if (!id) throw new AdminApiError(400, "Product ID is required.");
  const normalizedId = id.trim().toLowerCase();

  // Check if any historical orders reference this product
  try {
    const orders = await listOrders();
    const hasOrders = orders.some((o) => o.productId.toLowerCase() === normalizedId);
    if (hasOrders) {
      throw new AdminApiError(
        400,
        "Cannot delete this product because transaction records exist for it. You can set it to Inactive to hide it from the Coin Shop.",
      );
    }
  } catch (err) {
    if (err instanceof AdminApiError) throw err;
    console.warn("[products.server] Order check failed during delete; continuing with caution:", err);
  }

  // Delete key in PlayFab Title Internal Data by setting value to null
  await playFabAdmin("Admin/SetTitleInternalData", {
    Key: PRODUCT_PREFIX + normalizedId,
    Value: null,
  });

  return { success: true, message: `Product '${normalizedId}' deleted successfully.` };
}

/** Reorder coin products */
export async function reorderProducts(orderedIds: string[]): Promise<PaymentProduct[]> {
  const all = await listAllProducts();
  const idMap = new Map(all.map((p) => [p.id.toLowerCase(), p]));

  const updated: PaymentProduct[] = [];
  let currentOrder = 10;

  for (const id of orderedIds) {
    const product = idMap.get(id.toLowerCase());
    if (product) {
      product.order = currentOrder;
      currentOrder += 10;
      await saveProduct(product);
      updated.push(product);
      idMap.delete(id.toLowerCase());
    }
  }

  // Any remaining products keep trailing order
  for (const product of idMap.values()) {
    product.order = currentOrder;
    currentOrder += 10;
    await saveProduct(product);
    updated.push(product);
  }

  return updated.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
