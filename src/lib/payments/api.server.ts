import { AdminApiError, object, playFabAdmin } from "../playfab/admin-client.server.ts";
import { getProduct, PAYMENT_PRODUCTS, DEFAULT_PRODUCTS } from "./products.ts";
import { getProductById, listActiveProducts } from "./products.server.ts";
import {
  generateOrderId,
  getOrder,
  listOrdersForPlayer,
  saveOrder,
  updateOrderStatus,
} from "./orders.server.ts";
import { createPayMongoCheckout, getPayMongoConfig } from "./paymongo.server.ts";
import { processPayMongoWebhook } from "./fulfillment.server.ts";
import type { PaymentOrder } from "./types.ts";

function resolveRequestOrigin(request: Request): string {
  const headerOrigin = request.headers.get("origin")?.trim();
  if (headerOrigin && headerOrigin !== "null") {
    return headerOrigin.replace(/\/+$/, "");
  }

  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (host) {
    const proto =
      request.headers.get("x-forwarded-proto") ||
      (request.url.startsWith("https:") ? "https" : "http");
    return `${proto}://${host}`.replace(/\/+$/, "");
  }

  try {
    const parsed = new URL(request.url);
    if (parsed.origin && parsed.origin !== "null") {
      return parsed.origin.replace(/\/+$/, "");
    }
  } catch {
    // fallback below
  }

  const { appUrl } = getPayMongoConfig();
  return appUrl;
}

async function authenticatePlayer(request: Request): Promise<string> {
  const authorization = request.headers.get("authorization");
  const ticket = authorization?.match(/^Bearer (\S+)$/)?.[1];
  if (!ticket || ticket.length > 4096) {
    throw new AdminApiError(401, "Player sign-in is required.");
  }
  const auth = await playFabAdmin("Server/AuthenticateSessionTicket", {
    SessionTicket: ticket,
  });
  const userInfo = object(auth["UserInfo"]);
  const id = userInfo["PlayFabId"];
  if (
    auth["IsSessionTicketExpired"] ||
    typeof id !== "string" ||
    !/^[a-f0-9]{1,32}$/i.test(id)
  ) {
    throw new AdminApiError(401, "Player sign-in is required.");
  }
  return id.toUpperCase();
}

function jsonResponse(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function handlePaymentsRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  // 1. Webhook endpoint
  if (path === "/api/webhooks/paymongo") {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    try {
      const rawBody = await request.clone().text();
      const signatureHeader =
        request.headers.get("paymongo-signature") ||
        request.headers.get("Paymongo-Signature");

      const result = await processPayMongoWebhook(rawBody, signatureHeader);
      return jsonResponse(result.body, result.status);
    } catch (err) {
      console.error("[payments/webhook] Unexpected webhook error:", err);
      return jsonResponse({ error: "Internal server error" }, 500);
    }
  }

  // 2. Create Checkout endpoint
  if (path === "/api/payments/paymongo/create-checkout") {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    try {
      const playFabId = await authenticatePlayer(request);

      let body: Record<string, unknown> = {};
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      const rawProductId = typeof body["productId"] === "string" ? body["productId"] : "";
      const product = await getProductById(rawProductId);
      if (!product || product.active === false) {
        return jsonResponse(
          { error: `Unknown or unavailable product: '${rawProductId}'` },
          400,
        );
      }

      const orderId = generateOrderId();
      const origin = resolveRequestOrigin(request);

      const order: PaymentOrder = {
        orderId,
        playFabId,
        productId: product.id,
        expectedAmount: product.amount,
        currency: product.currency,
        expectedCoins: product.rewardCoins,
        PayMongoCheckoutSessionId: null,
        PayMongoReferenceNumber: orderId,
        status: "pending",
        createdAt: new Date().toISOString(),
        paidAt: null,
        fulfilledAt: null,
        webhookEventId: null,
      };

      await saveOrder(order);

      const checkout = await createPayMongoCheckout({
        orderId,
        product,
        playFabId,
        requestOrigin: origin,
      });

      await updateOrderStatus(orderId, {
        PayMongoCheckoutSessionId: checkout.checkoutId,
        checkoutUrl: checkout.checkoutUrl,
      });

      return jsonResponse({
        success: true,
        orderId,
        checkoutUrl: checkout.checkoutUrl,
      });
    } catch (err) {
      if (err instanceof AdminApiError) {
        return jsonResponse({ error: err.message }, err.status);
      }
      const message = err instanceof Error ? err.message : "Failed to create checkout";
      console.error("[payments/checkout] Checkout creation error:", err);
      return jsonResponse({ error: message }, 500);
    }
  }

  // 3. Query single order status (for confirmation polling)
  if (path === "/api/payments/paymongo/order") {
    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const orderId = (url.searchParams.get("id") || "").trim();
    if (!orderId) {
      return jsonResponse({ error: "Missing order id" }, 400);
    }

    const order = await getOrder(orderId);
    if (!order) {
      return jsonResponse({ error: "Order not found" }, 404);
    }

    // Return safe public status only
    return jsonResponse({
      orderId: order.orderId,
      productId: order.productId,
      status: order.status,
      expectedCoins: order.expectedCoins,
      expectedAmount: order.expectedAmount,
      currency: order.currency,
      createdAt: order.createdAt,
      paidAt: order.paidAt,
      fulfilledAt: order.fulfilledAt,
    });
  }

  // 4. Query player's past orders
  if (path === "/api/payments/paymongo/player-orders") {
    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    try {
      const playFabId = await authenticatePlayer(request);
      const orders = await listOrdersForPlayer(playFabId);

      const safeOrders = orders.map((o) => ({
        orderId: o.orderId,
        productId: o.productId,
        status: o.status,
        expectedCoins: o.expectedCoins,
        expectedAmount: o.expectedAmount,
        currency: o.currency,
        createdAt: o.createdAt,
        paidAt: o.paidAt,
        fulfilledAt: o.fulfilledAt,
      }));

      return jsonResponse({ orders: safeOrders });
    } catch (err) {
      if (err instanceof AdminApiError) {
        return jsonResponse({ error: err.message }, err.status);
      }
      return jsonResponse({ error: "Unable to retrieve orders" }, 500);
    }
  }

  // 5. Public shop products catalog
  if (path === "/api/shop/products") {
    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }
    const products = await listActiveProducts();
    return jsonResponse({ products });
  }

  return null;
}
