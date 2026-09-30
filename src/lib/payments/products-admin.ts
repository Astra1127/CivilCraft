import type { PaymentProduct } from "./types.ts";

export interface AdminProductsResponse {
  products: PaymentProduct[];
  success?: boolean;
  message?: string;
  error?: string;
}

export async function fetchAdminProducts(): Promise<PaymentProduct[]> {
  const res = await fetch("/api/admin/products", {
    headers: { "Cache-Control": "no-cache" },
    credentials: "same-origin",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to load coin products");
  }
  const data = (await res.json()) as AdminProductsResponse;
  return data.products || [];
}

export async function saveAdminProduct(
  product: Partial<PaymentProduct> & {
    id?: string;
    name: string;
    rewardCoins: number;
    amount: number;
    description: string;
  },
): Promise<PaymentProduct[]> {
  const res = await fetch("/api/admin/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      action: "save",
      product,
    }),
  });
  const data = (await res.json()) as AdminProductsResponse;
  if (!res.ok) {
    throw new Error(data.error || "Failed to save product");
  }
  return data.products || [];
}

export async function toggleAdminProduct(id: string, active?: boolean): Promise<PaymentProduct[]> {
  const res = await fetch("/api/admin/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      action: "toggle-active",
      id,
      active,
    }),
  });
  const data = (await res.json()) as AdminProductsResponse;
  if (!res.ok) {
    throw new Error(data.error || "Failed to update product status");
  }
  return data.products || [];
}

export async function deleteAdminProduct(id: string): Promise<PaymentProduct[]> {
  const res = await fetch("/api/admin/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      action: "delete",
      id,
    }),
  });
  const data = (await res.json()) as AdminProductsResponse;
  if (!res.ok) {
    throw new Error(data.error || "Failed to delete product");
  }
  return data.products || [];
}

export async function reorderAdminProducts(orderedIds: string[]): Promise<PaymentProduct[]> {
  const res = await fetch("/api/admin/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      action: "reorder",
      orderedIds,
    }),
  });
  const data = (await res.json()) as AdminProductsResponse;
  if (!res.ok) {
    throw new Error(data.error || "Failed to reorder products");
  }
  return data.products || [];
}
