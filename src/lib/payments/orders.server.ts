import crypto from "node:crypto";
import { AdminApiError, object, playFabAdmin } from "../playfab/admin-client.server.ts";
import type { PaymentOrder } from "./types.ts";

const ORDER_PREFIX = "civilcraft.website.v1.payment-orders.";
const EVENT_PREFIX = "civilcraft.website.v1.payment-events.";

export function generateOrderId(rewardCurrency = "CO"): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(16).toString("hex").toUpperCase();
  return `CC-${rewardCurrency === "DI" ? "DIAMONDS" : "COINS"}-${ts}-${rand}`;
}

export async function saveOrder(order: PaymentOrder): Promise<void> {
  const key = ORDER_PREFIX + order.orderId;
  const serialized = JSON.stringify(order);
  if (Buffer.byteLength(serialized) > 9500) {
    throw new AdminApiError(400, "Order record payload exceeded maximum internal data size.");
  }

  await playFabAdmin("Admin/SetTitleInternalData", {
    Key: key,
    Value: serialized,
  });
}

export async function getOrder(orderId: string): Promise<PaymentOrder | null> {
  if (!orderId || typeof orderId !== "string" || !/^[a-z0-9_-]{1,128}$/i.test(orderId)) return null;
  const key = ORDER_PREFIX + orderId.trim();

  try {
    const res = await playFabAdmin("Admin/GetTitleInternalData", { Keys: [key] });
    const data = object(res["Data"]);
    const raw = data[key];
    if (typeof raw !== "string" || !raw) return null;
    return JSON.parse(raw) as PaymentOrder;
  } catch (error) {
    if (error instanceof AdminApiError) throw error;
    throw new AdminApiError(503, "Payment order storage is temporarily unavailable.");
  }
}

export async function updateOrderStatus(
  orderId: string,
  updates: Partial<PaymentOrder>,
): Promise<PaymentOrder | null> {
  const existing = await getOrder(orderId);
  if (!existing) throw new AdminApiError(404, "Payment order not found.");

  const updated: PaymentOrder = {
    ...existing,
    ...updates,
    orderId: existing.orderId,
    playFabId: existing.playFabId,
    productId: existing.productId,
    expectedAmount: existing.expectedAmount,
    expectedCoins: existing.expectedCoins,
    currency: existing.currency,
    rewardCurrency: existing.rewardCurrency,
    rewardAmount: existing.rewardAmount,
    premiumWallet: existing.premiumWallet,
    gameWallet: existing.gameWallet,
    coinCurrencyCode: existing.coinCurrencyCode,
    coinReceiptVersion: existing.coinReceiptVersion,
    coinReceipt: existing.coinReceipt,
    PayMongoReferenceNumber: existing.PayMongoReferenceNumber,
    PayMongoCheckoutSessionId:
      existing.PayMongoCheckoutSessionId || updates.PayMongoCheckoutSessionId || null,
    createdAt: existing.createdAt,
    status: existing.status === "fulfilled" ? "fulfilled" : (updates.status ?? existing.status),
  };

  await saveOrder(updated);
  return updated;
}

export async function isEventProcessed(eventId: string): Promise<boolean> {
  if (!eventId || typeof eventId !== "string") return false;
  const key = EVENT_PREFIX + eventId.trim();

  try {
    const res = await playFabAdmin("Admin/GetTitleInternalData", { Keys: [key] });
    const data = object(res["Data"]);
    return Boolean(data[key]);
  } catch (error) {
    if (error instanceof AdminApiError) throw error;
    throw new AdminApiError(503, "Payment event storage is temporarily unavailable.");
  }
}

export async function markEventProcessed(eventId: string, orderId: string): Promise<void> {
  if (!eventId || typeof eventId !== "string") return;
  const key = EVENT_PREFIX + eventId.trim();
  const payload = JSON.stringify({
    eventId,
    orderId,
    processedAt: new Date().toISOString(),
  });

  await playFabAdmin("Admin/SetTitleInternalData", {
    Key: key,
    Value: payload,
  });
}

export async function listOrders(): Promise<PaymentOrder[]> {
  try {
    const res = await playFabAdmin("Admin/GetTitleInternalData");
    const data = object(res["Data"]);
    const orders: PaymentOrder[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith(ORDER_PREFIX) && typeof value === "string") {
        try {
          const parsed = JSON.parse(value) as PaymentOrder;
          if (parsed && parsed.orderId) {
            orders.push(parsed);
          }
        } catch {
          // ignore corrupted single row
        }
      }
    }

    return orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    if (error instanceof AdminApiError) throw error;
    throw new AdminApiError(503, "Payment history is temporarily unavailable.");
  }
}

export async function listOrdersForPlayer(playFabId: string): Promise<PaymentOrder[]> {
  if (!playFabId) return [];
  const all = await listOrders();
  const targetId = playFabId.trim().toUpperCase();
  return all.filter((o) => o.playFabId?.trim().toUpperCase() === targetId);
}
