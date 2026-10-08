import { AdminApiError, object } from "../playfab/admin-client.server.ts";
import { grantDiamonds, hasDiamondReceipt } from "../playfab/premium-wallet.server.ts";
import { normalizeOrderReward } from "./products.ts";
import { getOrder, markEventProcessed, updateOrderStatus } from "./orders.server.ts";
import { retrievePayMongoCheckout, verifyPayMongoSignature } from "./paymongo.server.ts";
import type { PaymentOrder } from "./types.ts";
import {
  CoinGrantReviewRequired,
  getCoinReceiptStatus,
  grantCoinsOnce,
} from "./coin-receipts.server.ts";

export function getCoinsCurrencyCode(): string {
  const code = (process.env["PLAYFAB_COINS_CURRENCY_CODE"] || "CO").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code))
    throw new AdminApiError(503, "Coin currency configuration is invalid.");
  return code;
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
    diamondsAwarded?: number;
    rewardCurrency?: "CO" | "DI";
    rewardAmount?: number;
    error?: string;
  };
}

function fail(status: number, error: string): WebhookProcessResult {
  return { status, body: { success: false, error } };
}

export function diamondGrantInput(order: PaymentOrder) {
  const reward = normalizeOrderReward(order);
  const snapshot = order.premiumWallet;
  if (reward.rewardCurrency !== "DI" || !snapshot)
    throw new AdminApiError(503, "Diamond wallet snapshot is unavailable.");
  return {
    orderId: order.orderId,
    playFabId: order.playFabId,
    entity: snapshot.entity,
    wallet:
      snapshot.storage === "entity-objects"
        ? {
            storage: snapshot.storage,
            collectionId: snapshot.collectionId,
            objectName: snapshot.objectName,
            maxBytes: snapshot.maxBytes,
          }
        : {
            collectionId: snapshot.collectionId,
            diamondItemId: snapshot.diamondItemId,
            receiptItemId: snapshot.receiptItemId,
          },
    rewardAmount: reward.rewardAmount,
  };
}

/** Receipt is the grant authority; title-internal order records are a repairable audit projection. */
export async function repairDiamondOrder(order: PaymentOrder): Promise<PaymentOrder> {
  if (normalizeOrderReward(order).rewardCurrency !== "DI") return order;
  if (await hasDiamondReceipt(diamondGrantInput(order))) {
    if (order.status !== "fulfilled") {
      const fulfilledAt = order.fulfilledAt || new Date().toISOString();
      try {
        await updateOrderStatus(order.orderId, { status: "fulfilled", fulfilledAt, error: null });
      } catch {
        /* The receipt still proves fulfillment when audit storage is unavailable. */
      }
      return { ...order, status: "fulfilled", fulfilledAt, error: null };
    }
    return order;
  }
  if (order.status === "fulfilled")
    throw new AdminApiError(503, "Diamond fulfillment could not be verified.");
  return order;
}

export function coinGrantInput(order: PaymentOrder) {
  const reward = normalizeOrderReward(order);
  if (reward.rewardCurrency !== "CO" || order.coinReceiptVersion !== 1)
    throw new CoinGrantReviewRequired();
  return {
    orderId: order.orderId,
    playFabId: order.playFabId,
    currencyCode: order.coinCurrencyCode || getCoinsCurrencyCode(),
    rewardAmount: reward.rewardAmount,
  };
}

export async function repairPaymentOrder(order: PaymentOrder): Promise<PaymentOrder> {
  if (normalizeOrderReward(order).rewardCurrency === "DI") return repairDiamondOrder(order);
  if (order.coinReceiptVersion !== 1) {
    // Historic fulfilled orders/history remain unchanged. Unfulfilled legacy orders
    // may already have been credited by the old code and cannot be granted safely.
    return order.status === "fulfilled" || order.status === "pending"
      ? order
      : { ...order, fulfillmentReviewRequired: true };
  }
  const status = await getCoinReceiptStatus(coinGrantInput(order));
  if (status === "granted") {
    const fulfilledAt = order.fulfilledAt || new Date().toISOString();
    const updates = {
      status: "fulfilled" as const,
      fulfilledAt,
      error: null,
      fulfillmentReviewRequired: false,
    };
    if (order.status !== "fulfilled" || order.fulfillmentReviewRequired) {
      try {
        await updateOrderStatus(order.orderId, updates);
      } catch {
        /* Receipt is authoritative. */
      }
    }
    return { ...order, ...updates };
  }
  if (order.status === "fulfilled")
    throw new AdminApiError(503, "Coin fulfillment could not be verified.");
  return { ...order, fulfillmentReviewRequired: status === "pending" };
}

function paymentEvidence(
  session: Record<string, unknown>,
  order: PaymentOrder,
): "complete" | "incomplete" {
  if (session["id"] !== order.PayMongoCheckoutSessionId || session["type"] !== "checkout_session") {
    throw new AdminApiError(400, "Checkout session does not match this order.");
  }
  const attrs = object(session["attributes"]);
  if (attrs["livemode"] === true) throw new AdminApiError(400, "Live payments are not accepted.");
  const metadata = object(attrs["metadata"]);
  for (const [key, expected] of [
    ["orderId", order.orderId],
    ["productId", order.productId],
    ["playFabId", order.playFabId],
  ]) {
    const value = metadata[key!];
    if (value !== undefined && value !== expected)
      throw new AdminApiError(400, "Payment metadata does not match this order.");
  }
  if (
    attrs["reference_number"] !== undefined &&
    attrs["reference_number"] !== order.PayMongoReferenceNumber
  ) {
    throw new AdminApiError(400, "Payment reference does not match this order.");
  }
  const payments = Array.isArray(attrs["payments"]) ? attrs["payments"] : [];
  const paid = payments
    .map((p) => object(object(p)["attributes"]))
    .filter((p) => p["status"] === "paid");
  if (!paid.length) return "incomplete";
  if (paid.length !== 1) throw new AdminApiError(400, "Payment evidence is ambiguous.");
  const payment = paid[0]!;
  if (payment["livemode"] === true) throw new AdminApiError(400, "Live payments are not accepted.");
  const amount = payment["amount"];
  const currency = payment["currency"];
  if (amount === undefined || currency === undefined) return "incomplete";
  if (!Number.isSafeInteger(amount) || amount !== order.expectedAmount)
    throw new AdminApiError(400, "Payment amount mismatch");
  if (currency !== order.currency || currency !== "PHP")
    throw new AdminApiError(400, "Payment currency mismatch");
  if (
    !metadata["orderId"] ||
    !metadata["productId"] ||
    !metadata["playFabId"] ||
    !attrs["reference_number"]
  )
    return "incomplete";
  return "complete";
}

export async function processPayMongoWebhook(
  rawBody: string,
  signatureHeader: string | null | undefined,
): Promise<WebhookProcessResult> {
  const signature = verifyPayMongoSignature({ signatureHeader, rawBody });
  if (!signature.valid) return fail(400, `Signature verification failed: ${signature.reason}`);
  let envelope: Record<string, unknown>;
  try {
    envelope = object(JSON.parse(rawBody));
  } catch {
    return fail(400, "Invalid JSON in webhook payload");
  }
  const event = object(envelope["data"]);
  const attributes = object(event["attributes"]);
  if (
    typeof event["id"] !== "string" ||
    !/^[a-z0-9_-]{1,128}$/i.test(event["id"]) ||
    !Object.keys(attributes).length
  )
    return fail(400, "Malformed PayMongo event payload");
  if (attributes["livemode"] === true)
    return fail(400, "Live mode events are not accepted on this test endpoint.");
  if (attributes["livemode"] !== false)
    return fail(400, "Only explicitly test-mode events are accepted.");
  const eventType = attributes["type"];
  if (eventType !== "checkout_session.payment.paid" && eventType !== "qr.paid") {
    return {
      status: 200,
      body: {
        success: true,
        received: true,
        message: "Event does not require checkout fulfillment.",
      },
    };
  }
  const session = object(attributes["data"]);
  // Standalone QR resources are not evidence of a hosted checkout purchase.
  if (eventType === "qr.paid" && session["type"] === "qr_code")
    return { status: 200, body: { success: true, received: true } };
  if (session["type"] !== "checkout_session") return fail(400, "Malformed checkout payment event.");
  const attrs = object(session["attributes"]);
  const metadata = object(attrs["metadata"]);
  const rawOrderId = metadata["orderId"] ?? metadata["order_id"] ?? attrs["reference_number"];
  if (typeof rawOrderId !== "string" || !/^[a-z0-9_-]{1,128}$/i.test(rawOrderId))
    return fail(400, "Missing or invalid order ID in webhook payload");
  let order: PaymentOrder | null = null;
  let verifiedPayment = false;
  try {
    order = await getOrder(rawOrderId);
    if (!order) return fail(404, "Payment order not found.");
    if (!order.PayMongoCheckoutSessionId)
      throw new AdminApiError(503, "Checkout binding is not ready. Retry expected.");
    let verifiedSession = session;
    if (paymentEvidence(verifiedSession, order) === "incomplete") {
      verifiedSession = object(await retrievePayMongoCheckout(order.PayMongoCheckoutSessionId));
      if (object(verifiedSession["attributes"])["livemode"] !== false)
        throw new AdminApiError(400, "Only test-mode checkouts are accepted.");
      if (paymentEvidence(verifiedSession, order) !== "complete")
        throw new AdminApiError(400, "A completed paid payment could not be verified.");
    }
    verifiedPayment = true;
    const reward = normalizeOrderReward(order);
    order = await repairPaymentOrder(order);
    if (order.status === "fulfilled") {
      await markEventProcessed(event["id"] as string, order.orderId);
      return { status: 200, body: { success: true, idempotent: true, orderId: order.orderId } };
    }
    if (reward.rewardCurrency === "CO" && order.coinReceiptVersion !== 1)
      throw new CoinGrantReviewRequired();
    const paidAt = order.paidAt || new Date().toISOString();
    await updateOrderStatus(order.orderId, {
      status: "paid",
      paidAt,
      webhookEventId: event["id"] as string,
      error: null,
    });
    let alreadyGranted = false;
    if (reward.rewardCurrency === "DI") {
      const result = await grantDiamonds(diamondGrantInput(order));
      alreadyGranted = result.alreadyGranted;
    } else {
      const result = await grantCoinsOnce(coinGrantInput(order));
      alreadyGranted = result.alreadyGranted;
    }
    await updateOrderStatus(order.orderId, {
      status: "fulfilled",
      paidAt,
      fulfilledAt: new Date().toISOString(),
      webhookEventId: event["id"] as string,
      error: null,
      fulfillmentReviewRequired: false,
    });
    await markEventProcessed(event["id"] as string, order.orderId);
    return {
      status: 200,
      body: {
        success: true,
        orderId: order.orderId,
        idempotent: alreadyGranted,
        rewardCurrency: reward.rewardCurrency,
        rewardAmount: reward.rewardAmount,
        ...(reward.rewardCurrency === "DI"
          ? { diamondsAwarded: alreadyGranted ? 0 : reward.rewardAmount }
          : { coinsAwarded: alreadyGranted ? 0 : reward.rewardAmount }),
      },
    };
  } catch (error) {
    const status = error instanceof AdminApiError ? error.status : 503;
    const reviewRequired = error instanceof CoinGrantReviewRequired;
    if (order && (verifiedPayment || status === 400)) {
      try {
        await updateOrderStatus(order.orderId, {
          status: status === 400 ? "failed" : "paid",
          error: reviewRequired
            ? error.message
            : status === 400
              ? (error as Error).message
              : "Fulfillment is temporarily unavailable. Retry expected.",
          ...(reviewRequired ? { fulfillmentReviewRequired: true } : {}),
        });
      } catch {
        /* Never mask a failed state write as successful fulfillment. */
      }
    }
    return fail(
      status >= 500 ? 500 : status,
      reviewRequired
        ? error.message
        : status < 500 && error instanceof Error
          ? error.message
          : "Virtual currency fulfillment temporarily unavailable. Retry expected.",
    );
  }
}
