import { z } from "zod";
import { AdminApiError, object, playFabAdmin } from "../playfab/admin-client.server.ts";
import { DEFAULT_PRODUCTS, MAX_REWARD_AMOUNT, normalizeProductReward } from "./products.ts";
import { listOrders } from "./orders.server.ts";
import type { PaymentProduct } from "./types.ts";

// Preserve the existing storage prefix and all legacy Coin records.
const PRODUCT_PREFIX = "civilcraft.website.v1.coin-products.";
const quantity = z.number().int().max(MAX_REWARD_AMOUNT);

export const productSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(2)
      .max(64)
      .regex(
        /^[a-z0-9_-]+$/i,
        "Product ID must contain only alphanumeric characters, underscores, and hyphens",
      )
      .transform((id) => id.toLowerCase()),
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().min(2).max(500),
    amount: z.number().int().positive("Price must be greater than zero").max(MAX_REWARD_AMOUNT),
    currency: z.literal("PHP").default("PHP"),
    rewardCoins: quantity.min(0).optional(),
    rewardCurrency: z.enum(["CO", "DI"]).optional(),
    rewardAmount: quantity.positive("Reward must be greater than zero").optional(),
    category: z.enum(["currency", "support", "cosmetic"]).default("currency"),
    badge: z.string().trim().max(50).optional(),
    popular: z.boolean().optional(),
    active: z.boolean().default(true),
    order: z.number().int().default(0),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .superRefine((product, ctx) => {
    const legacy = product.rewardCurrency === undefined && product.rewardAmount === undefined;
    if (legacy) {
      if (!product.rewardCoins || product.rewardCoins <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rewardCoins"],
          message: "Legacy Coin reward must be greater than zero.",
        });
      }
      return;
    }
    if (product.rewardCurrency === undefined || product.rewardAmount === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rewardCurrency"],
        message: "Currency and reward amount must be supplied together.",
      });
      return;
    }
    const compatibleCoins = product.rewardCurrency === "CO" ? product.rewardAmount : 0;
    if (product.rewardCoins !== undefined && product.rewardCoins !== compatibleCoins) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rewardCoins"],
        message: "Legacy Coin amount conflicts with the selected currency reward.",
      });
    }
  })
  .transform((product) => {
    const rewardCurrency = product.rewardCurrency ?? "CO";
    const rewardAmount = product.rewardAmount ?? product.rewardCoins!;
    return {
      ...product,
      rewardCurrency,
      rewardAmount,
      rewardCoins: rewardCurrency === "CO" ? rewardAmount : 0,
    };
  });

export type ProductInput = z.input<typeof productSchema>;

function parseStoredProduct(key: string, raw: unknown): PaymentProduct | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const product = productSchema.parse(JSON.parse(raw));
    if (key !== PRODUCT_PREFIX + product.id)
      throw new Error("Product ID does not match its stored key.");
    normalizeProductReward(product);
    return product as PaymentProduct;
  } catch {
    // Never replace malformed persisted records with an active template.
    console.warn(`[products.server] Invalid product record for key ${key}.`);
    return null;
  }
}

/** Reads are side-effect free. Empty catalogues stay empty; outages propagate safely. */
export async function listAllProducts(): Promise<PaymentProduct[]> {
  const res = await playFabAdmin("Admin/GetTitleInternalData");
  const products: PaymentProduct[] = [];
  for (const [key, raw] of Object.entries(object(res["Data"]))) {
    if (!key.startsWith(PRODUCT_PREFIX)) continue;
    const product = parseStoredProduct(key, raw);
    if (product) products.push(product);
  }
  return products.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.amount - b.amount);
}

/** Explicit authenticated-admin migration: add only missing package keys. */
export async function seedMissingDefaultProducts(): Promise<PaymentProduct[]> {
  const res = await playFabAdmin("Admin/GetTitleInternalData");
  const existing = object(res["Data"]);
  const now = new Date().toISOString();
  for (const [index, template] of DEFAULT_PRODUCTS.entries()) {
    const key = PRODUCT_PREFIX + template.id;
    if (Object.hasOwn(existing, key)) continue;
    // Recheck immediately before writing; preserve disabled/custom/malformed records.
    const check = await playFabAdmin("Admin/GetTitleInternalData", { Keys: [key] });
    if (Object.hasOwn(object(check["Data"]), key)) continue;
    const product = productSchema.parse({
      ...template,
      active: true,
      order: (index + 1) * 10,
      createdAt: now,
      updatedAt: now,
    });
    await playFabAdmin("Admin/SetTitleInternalData", { Key: key, Value: JSON.stringify(product) });
  }
  return listAllProducts();
}

export async function listActiveProducts(): Promise<PaymentProduct[]> {
  return (await listAllProducts()).filter((p) => p.active !== false);
}

export async function getProductById(productId: string): Promise<PaymentProduct | null> {
  if (typeof productId !== "string") return null;
  const normalizedId = productId.trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,64}$/.test(normalizedId)) return null;
  const key = PRODUCT_PREFIX + normalizedId;
  const res = await playFabAdmin("Admin/GetTitleInternalData", { Keys: [key] });
  return parseStoredProduct(key, object(res["Data"])[key]);
}

export async function saveProduct(input: unknown): Promise<PaymentProduct> {
  const validated = productSchema.parse(input);
  const existing = await getProductById(validated.id);
  const productToSave: PaymentProduct = {
    ...validated,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const serialized = JSON.stringify(productToSave);
  if (Buffer.byteLength(serialized) > 9500)
    throw new AdminApiError(400, "Product record exceeded maximum size.");
  await playFabAdmin("Admin/SetTitleInternalData", {
    Key: PRODUCT_PREFIX + productToSave.id,
    Value: serialized,
  });
  return productToSave;
}

export async function toggleProductActive(id: string, active?: boolean): Promise<PaymentProduct> {
  const existing = await getProductById(id);
  if (!existing) throw new AdminApiError(404, `Product '${id}' not found.`);
  return saveProduct({ ...existing, active: active !== undefined ? active : !existing.active });
}

export async function deleteProduct(id: string): Promise<{ success: boolean; message: string }> {
  if (!id) throw new AdminApiError(400, "Product ID is required.");
  const normalizedId = id.trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,64}$/.test(normalizedId))
    throw new AdminApiError(400, "Product ID is invalid.");
  // Failure to read history must never permit deletion.
  const orders = await listOrders();
  if (orders.some((o) => o.productId.toLowerCase() === normalizedId)) {
    throw new AdminApiError(
      400,
      "Cannot delete this product because transaction records exist for it. You can set it to Inactive to hide it from the Currency Shop.",
    );
  }
  await playFabAdmin("Admin/SetTitleInternalData", {
    Key: PRODUCT_PREFIX + normalizedId,
    Value: null,
  });
  return { success: true, message: `Product '${normalizedId}' deleted successfully.` };
}

export async function reorderProducts(orderedIds: string[]): Promise<PaymentProduct[]> {
  const all = await listAllProducts();
  const idMap = new Map(all.map((p) => [p.id, p]));
  const updated: PaymentProduct[] = [];
  let currentOrder = 10;
  for (const id of orderedIds) {
    const product = idMap.get(id.toLowerCase());
    if (!product) continue;
    updated.push(await saveProduct({ ...product, order: currentOrder }));
    currentOrder += 10;
    idMap.delete(product.id);
  }
  for (const product of idMap.values()) {
    updated.push(await saveProduct({ ...product, order: currentOrder }));
    currentOrder += 10;
  }
  return updated;
}
