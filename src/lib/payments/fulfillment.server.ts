import { playFabAdmin } from "../playfab/admin-client.server.ts";
import { getProduct } from "./products.ts";
import {
  getOrder,
  isEventProcessed,
  markEventProcessed,
  updateOrderStatus,
} from "./orders.server.ts";
import { verifyPayMongoSignature } from "./paymongo.server.ts";
import type { PayMongoWebhookEvent } from "./types.ts";

export function getCoinsCurrencyCode(): string {
  return (process.env["PLAYFAB_COINS_CURRENCY_CODE"] || "CO").trim().toUpperCase();
}

export interface WebhookProcessResult {
  status: number;
  body: {
    success: boolean;
    received?: boolean;
    idempotent?: boolean;
    message?: string;
    orderId?: string;
    coinsAwarded?: number;
    error?: string;
  };
}

export async function processPayMongoWebhook(
  rawBody: string,
  signatureHeader: string | null | undefined,
): Promise<WebhookProcessResult> {
  // 1. Signature verification
  const verification = verifyPayMongoSignature({
    signatureHeader,
    rawBody,
  });

  if (!verification.valid) {
    console.warn(`[payments/webhook] Invalid signature: ${verification.reason}`);
    return {
      status: 400,
      body: {
        success: false,
        error: `Signature verification failed: ${verification.reason}`,
      },
    };
  }

  // 2. Parse event payload
  let event: PayMongoWebhookEvent;
  try {
    event = JSON.parse(rawBody) as PayMongoWebhookEvent;
  } catch {
    return {
      status: 400,
      body: { success: false, error: "Invalid JSON in webhook payload" },
    };
  }

  const eventData = event?.data;
  const eventAttributes = eventData?.attributes;
  if (!eventData || !eventAttributes) {
    return {
      status: 400,
      body: { success: false, error: "Malformed PayMongo event payload" },
    };
  }

  // 3. Test / Live safety
  if (eventAttributes.livemode === true) {
    console.error("[payments/webhook] Live mode event received on test endpoint. Rejecting.");
    return {
      status: 400,
      body: {
        success: false,
        error: "Live mode events are not accepted on test webhook endpoint",
      },
    };
  }

  const eventType = eventAttributes.type;
  if (eventType !== "checkout_session.payment.paid") {
    // Safely ignore other event types
    return {
      status: 200,
      body: {
        success: true,
        received: true,
        message: `Event type ${eventType} ignored`,
      },
    };
  }

  const eventId = eventData.id;

  // 4. Event Deduplication check
  const alreadyProcessed = await isEventProcessed(eventId);
  if (alreadyProcessed) {
    console.info(`[payments/webhook] Event ${eventId} was already processed. Idempotent return.`);
    return {
      status: 200,
      body: {
        success: true,
        idempotent: true,
        message: "Event already processed",
      },
    };
  }

  // 5. Extract Session & Order
  const session = eventAttributes.data;
  const sessionAttributes = session?.attributes;
  const metadata = sessionAttributes?.metadata ?? {};
  const orderId =
    metadata["orderId"] ||
    metadata["order_id"] ||
    sessionAttributes?.reference_number;

  if (!orderId) {
    console.error("[payments/webhook] Missing order ID in session metadata or reference_number");
    return {
      status: 400,
      body: { success: false, error: "Missing order ID in webhook payload" },
    };
  }

  const order = await getOrder(orderId);
  if (!order) {
    console.error(`[payments/webhook] Order not found for orderId: ${orderId}`);
    return {
      status: 404,
      body: { success: false, error: `Order ${orderId} not found` },
    };
  }

  // 6. Check if order is already fulfilled
  if (order.status === "fulfilled") {
    console.info(`[payments/webhook] Order ${orderId} is already fulfilled. Idempotent return.`);
    await markEventProcessed(eventId, orderId);
    return {
      status: 200,
      body: {
        success: true,
        idempotent: true,
        orderId,
        message: "Order already fulfilled",
      },
    };
  }

  // 7. Payment Amount & Currency Verification
  // Check session level amount/currency or line_items or payments
  const paidPayments = sessionAttributes?.payments ?? [];
  const paymentRecord = paidPayments[0]?.attributes;
  const paidAmount =
    paymentRecord?.amount ??
    sessionAttributes?.amount ??
    sessionAttributes?.line_items?.[0]?.amount;
  const paidCurrency = (
    paymentRecord?.currency ??
    sessionAttributes?.currency ??
    sessionAttributes?.line_items?.[0]?.currency ??
    ""
  ).toUpperCase();

  if (paidAmount !== undefined && paidAmount !== order.expectedAmount) {
    console.error(
      `[payments/webhook] Amount mismatch for order ${orderId}: expected ${order.expectedAmount}, got ${paidAmount}`,
    );
    await updateOrderStatus(orderId, {
      status: "failed",
      error: `Amount mismatch: expected ${order.expectedAmount}, got ${paidAmount}`,
    });
    return {
      status: 400,
      body: { success: false, error: "Payment amount mismatch" },
    };
  }

  if (paidCurrency && paidCurrency !== order.currency.toUpperCase()) {
    console.error(
      `[payments/webhook] Currency mismatch for order ${orderId}: expected ${order.currency}, got ${paidCurrency}`,
    );
    await updateOrderStatus(orderId, {
      status: "failed",
      error: `Currency mismatch: expected ${order.currency}, got ${paidCurrency}`,
    });
    return {
      status: 400,
      body: { success: false, error: "Payment currency mismatch" },
    };
  }

  // 8. Fulfill Coins in PlayFab
  const product = getProduct(order.productId);
  const coinsToAward = product?.rewardCoins ?? order.expectedCoins;
  const currencyCode = getCoinsCurrencyCode();

  try {
    if (coinsToAward > 0) {
      await playFabAdmin("Server/AddUserVirtualCurrency", {
        PlayFabId: order.playFabId,
        VirtualCurrency: currencyCode,
        Amount: coinsToAward,
      });
    }

    const paidAt = new Date().toISOString();
    await updateOrderStatus(orderId, {
      status: "fulfilled",
      paidAt,
      fulfilledAt: paidAt,
      webhookEventId: eventId,
      PayMongoCheckoutSessionId: session.id || order.PayMongoCheckoutSessionId,
      error: null,
    });

    await markEventProcessed(eventId, orderId);

    console.info(
      `[payments/fulfillment] Successfully credited ${coinsToAward} ${currencyCode} to player ${order.playFabId} for order ${orderId}`,
    );

    return {
      status: 200,
      body: {
        success: true,
        orderId,
        coinsAwarded: coinsToAward,
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "PlayFab API error";
    console.error(
      `[payments/fulfillment] Failed to credit coins for order ${orderId}: ${errorMsg}`,
    );

    // Keep order as "paid" with error recorded so fulfillment can be retried safely
    await updateOrderStatus(orderId, {
      status: "paid",
      paidAt: new Date().toISOString(),
      webhookEventId: eventId,
      error: errorMsg,
    });

    // Do NOT mark event as processed, and return 500 so PayMongo retries delivery
    return {
      status: 500,
      body: {
        success: false,
        error: "Virtual currency fulfillment temporarily unavailable. Retry expected.",
      },
    };
  }
}
