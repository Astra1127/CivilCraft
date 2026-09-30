import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, beforeEach, test } from "node:test";
import { handlePaymentsRequest } from "../src/lib/payments/api.server.ts";
import { getProduct, PAYMENT_PRODUCTS } from "../src/lib/payments/products.ts";
import {
  createPayMongoCheckout,
  verifyPayMongoSignature,
} from "../src/lib/payments/paymongo.server.ts";
import {
  generateOrderId,
  getOrder,
  isEventProcessed,
  listOrders,
  saveOrder,
} from "../src/lib/payments/orders.server.ts";
import { processPayMongoWebhook } from "../src/lib/payments/fulfillment.server.ts";
import type { PaymentOrder } from "../src/lib/payments/types.ts";
import { handlePlayFabAdminRequest } from "../src/lib/playfab/admin-api.server.ts";
import { getAdminAuthConfig } from "../src/lib/admin-auth/config.server.ts";
import { cookieName, issueAdminSession } from "../src/lib/admin-auth/session.server.ts";
import { hashAdminPassword } from "../src/lib/admin-auth/password.server.ts";

const TEST_SECRET_KEY = "sk_test_civilcraft_fake_secret_key_123";
const TEST_WEBHOOK_SECRET = "whsec_test_civilcraft_webhook_secret_987";
const TEST_PLAYER_ID = "E851A9A5B7F72D01";
const TEST_PLAYER_TICKET = "valid-player-session-ticket-abc";

const env = {
  VITE_PLAYFAB_TITLE_ID: "17FA03",
  PLAYFAB_SECRET_KEY: "test-playfab-secret",
  PAYMONGO_SECRET_KEY: TEST_SECRET_KEY,
  PAYMONGO_WEBHOOK_SECRET: TEST_WEBHOOK_SECRET,
  PLAYFAB_COINS_CURRENCY_CODE: "CO",
  PUBLIC_APP_URL: "https://civil-craft.vercel.app",
  ADMIN_AUTH_ORIGIN: "https://civil-craft.vercel.app",
  ADMIN_SESSION_SECRET: "paymongo-test-session-secret-at-least-32-bytes",
  ADMIN_USERS_JSON: JSON.stringify([
    {
      email: "admin@civilcraft.test",
      displayName: "Admin",
      passwordHash: await hashAdminPassword("test-admin-password"),
    },
  ]),
};

const previousEnv = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
const originalFetch = globalThis.fetch;

let internalData: Record<string, string> = {};
let awardedCoinsLog: Array<{ playFabId: string; currency: string; amount: number }> = [];
let payMongoApiRequests: Array<{ url: string; headers: Record<string, string>; body: any }> = [];
let playFabFailureMode = false;

beforeEach(() => {
  Object.assign(process.env, env);
  internalData = {};
  awardedCoinsLog = [];
  payMongoApiRequests = [];
  playFabFailureMode = false;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = String(input);

    // Mock PayMongo API
    if (urlStr.includes("api.paymongo.com/v2/checkout_sessions")) {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const body = JSON.parse(String(init?.body || "{}"));
      payMongoApiRequests.push({ url: urlStr, headers, body });

      return Response.json({
        data: {
          id: "cs_test_" + Date.now(),
          type: "checkout_session",
          attributes: {
            checkout_url: "https://checkout.paymongo.com/cs_test_mock_url",
            reference_number: body.data?.attributes?.reference_number,
          },
        },
      });
    }

    // Mock PlayFab APIs
    if (urlStr.includes("playfabapi.com")) {
      const body = JSON.parse(String(init?.body || "{}"));

      if (urlStr.endsWith("/Server/AuthenticateSessionTicket")) {
        if (body.SessionTicket === TEST_PLAYER_TICKET) {
          return Response.json({
            code: 200,
            data: {
              UserInfo: { PlayFabId: TEST_PLAYER_ID },
              IsSessionTicketExpired: false,
            },
          });
        }
        return Response.json({
          code: 200,
          data: {
            UserInfo: {},
            IsSessionTicketExpired: true,
          },
        });
      }

      if (urlStr.endsWith("/Admin/GetTitleInternalData")) {
        const keys = body.Keys as string[] | undefined;
        let filteredData = { ...internalData };
        if (keys && Array.isArray(keys)) {
          filteredData = {};
          for (const k of keys) {
            if (internalData[k] !== undefined) {
              filteredData[k] = internalData[k];
            }
          }
        }
        return Response.json({
          code: 200,
          data: { Data: filteredData },
        });
      }

      if (urlStr.endsWith("/Admin/SetTitleInternalData")) {
        if (body.Value === null) {
          delete internalData[body.Key];
        } else {
          internalData[body.Key] = body.Value;
        }
        return Response.json({ code: 200, data: {} });
      }

      if (urlStr.endsWith("/Server/AddUserVirtualCurrency")) {
        if (playFabFailureMode) {
          return Response.json(
            { code: 500, status: "InternalServerError", errorMessage: "Simulated PlayFab outage" },
            { status: 500 },
          );
        }
        awardedCoinsLog.push({
          playFabId: body.PlayFabId,
          currency: body.VirtualCurrency,
          amount: body.Amount,
        });
        return Response.json({
          code: 200,
          data: {
            PlayFabId: body.PlayFabId,
            VirtualCurrency: body.VirtualCurrency,
            BalanceChange: body.Amount,
            Balance: 1500,
          },
        });
      }

      return Response.json({ code: 200, data: {} });
    }

    return Response.json({ code: 404 }, { status: 404 });
  };
});

after(() => {
  globalThis.fetch = originalFetch;
  for (const [k, v] of Object.entries(previousEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function signPayload(
  rawBody: string,
  secret = TEST_WEBHOOK_SECRET,
  timestamp = Math.floor(Date.now() / 1000),
) {
  const payload = `${timestamp}.${rawBody}`;
  const hmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return {
    header: `t=${timestamp},te=${hmac}`,
    timestamp,
    signature: hmac,
  };
}

function createSampleEvent(params: {
  eventId?: string;
  orderId: string;
  amount?: number;
  currency?: string;
  livemode?: boolean;
  type?: string;
}) {
  const {
    eventId = "evt_test_" + Date.now(),
    orderId,
    amount = 5000,
    currency = "PHP",
    livemode = false,
    type = "checkout_session.payment.paid",
  } = params;

  return JSON.stringify({
    data: {
      id: eventId,
      type: "event",
      attributes: {
        type,
        livemode,
        data: {
          id: "cs_mock_123",
          type: "checkout_session",
          attributes: {
            status: "paid",
            amount,
            currency,
            reference_number: orderId,
            payments: [
              {
                id: "pay_123",
                type: "payment",
                attributes: {
                  amount,
                  currency,
                  status: "paid",
                },
              },
            ],
            metadata: {
              orderId,
              productId: "coins_500",
              playFabId: TEST_PLAYER_ID,
            },
          },
        },
      },
    },
  });
}

// -------------------------------------------------------------
// Test 1: Valid TEST webhook signature verification
// -------------------------------------------------------------
test("1. Valid TEST webhook signature passes verification", () => {
  const rawBody = JSON.stringify({ hello: "civilcraft" });
  const { header, timestamp } = signPayload(rawBody);

  const res = verifyPayMongoSignature({
    signatureHeader: header,
    rawBody,
  });

  assert.equal(res.valid, true);
  if (res.valid) {
    assert.equal(res.timestamp, timestamp);
  }
});

// -------------------------------------------------------------
// Test 2: Invalid signature rejection
// -------------------------------------------------------------
test("2. Invalid webhook signature is strictly rejected", () => {
  const rawBody = JSON.stringify({ hello: "civilcraft" });
  const fakeHeader = `t=${Math.floor(Date.now() / 1000)},te=0000000000000000000000000000000000000000000000000000000000000000`;

  const res = verifyPayMongoSignature({
    signatureHeader: fakeHeader,
    rawBody,
  });

  assert.equal(res.valid, false);
  if (!res.valid) {
    assert.equal(res.reason, "signature_mismatch");
  }
});

// -------------------------------------------------------------
// Test 3: Missing signature rejection
// -------------------------------------------------------------
test("3. Missing signature header or parts is rejected", () => {
  const rawBody = "{}";

  const resNull = verifyPayMongoSignature({ signatureHeader: null, rawBody });
  assert.equal(resNull.valid, false);
  if (!resNull.valid) assert.equal(resNull.reason, "missing_signature");

  const resEmpty = verifyPayMongoSignature({ signatureHeader: "", rawBody });
  assert.equal(resEmpty.valid, false);

  const resMissingTe = verifyPayMongoSignature({ signatureHeader: "t=123456", rawBody });
  assert.equal(resMissingTe.valid, false);
  if (!resMissingTe.valid) assert.equal(resMissingTe.reason, "missing_signature");
});

// -------------------------------------------------------------
// Test 4: Stale timestamp rejection (> 300s)
// -------------------------------------------------------------
test("4. Stale/expired webhook timestamp is rejected to prevent replay attacks", () => {
  const rawBody = "{}";
  const staleTimestamp = Math.floor(Date.now() / 1000) - 400; // 400 seconds ago
  const { header } = signPayload(rawBody, TEST_WEBHOOK_SECRET, staleTimestamp);

  const res = verifyPayMongoSignature({
    signatureHeader: header,
    rawBody,
  });

  assert.equal(res.valid, false);
  if (!res.valid) {
    assert.equal(res.reason, "stale_timestamp");
  }
});

// -------------------------------------------------------------
// Test 5: Reject livemode === true on TEST endpoint
// -------------------------------------------------------------
test("5. livemode=true event is strictly rejected by the TEST endpoint", async () => {
  const orderId = generateOrderId();
  await saveOrder({
    orderId,
    playFabId: TEST_PLAYER_ID,
    productId: "coins_500",
    expectedAmount: 5000,
    currency: "PHP",
    expectedCoins: 500,
    PayMongoCheckoutSessionId: null,
    PayMongoReferenceNumber: orderId,
    status: "pending",
    createdAt: new Date().toISOString(),
    paidAt: null,
    fulfilledAt: null,
    webhookEventId: null,
  });

  const rawBody = createSampleEvent({ orderId, livemode: true });
  const { header } = signPayload(rawBody);

  const res = await processPayMongoWebhook(rawBody, header);
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  assert.match(res.body.error || "", /Live mode events are not accepted/i);
  assert.equal(awardedCoinsLog.length, 0);
});

// -------------------------------------------------------------
// Test 6: Unknown productId rejection during checkout creation
// -------------------------------------------------------------
test("6. Checkout creation rejects unknown productId", async () => {
  const req = new Request("https://civil-craft.vercel.app/api/payments/paymongo/create-checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TEST_PLAYER_TICKET}`,
    },
    body: JSON.stringify({ productId: "unknown_hack_product" }),
  });

  const response = await handlePaymentsRequest(req);
  assert.ok(response);
  assert.equal(response.status, 400);
  const data = (await response.json()) as any;
  assert.match(data.error, /Unknown or unavailable product/);
});

// -------------------------------------------------------------
// Test 7: Unauthorized checkout creation
// -------------------------------------------------------------
test("7. Checkout creation rejects unauthenticated or expired tickets", async () => {
  const reqNoAuth = new Request(
    "https://civil-craft.vercel.app/api/payments/paymongo/create-checkout",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "coins_500" }),
    },
  );

  const resNoAuth = await handlePaymentsRequest(reqNoAuth);
  assert.ok(resNoAuth);
  assert.equal(resNoAuth.status, 401);

  const reqBadTicket = new Request(
    "https://civil-craft.vercel.app/api/payments/paymongo/create-checkout",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer expired-or-invalid-ticket",
      },
      body: JSON.stringify({ productId: "coins_500" }),
    },
  );

  const resBadTicket = await handlePaymentsRequest(reqBadTicket);
  assert.ok(resBadTicket);
  assert.equal(resBadTicket.status, 401);
});

// -------------------------------------------------------------
// Test 8: Client attempt to manipulate price or coin amount
// -------------------------------------------------------------
test("8. Client-supplied price, coins, or playFabId are completely ignored and server-controlled", async () => {
  const req = new Request("https://civil-craft.vercel.app/api/payments/paymongo/create-checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TEST_PLAYER_TICKET}`,
    },
    body: JSON.stringify({
      productId: "coins_500",
      amount: 1, // Attempt to pay ₱0.01 instead of ₱50
      coins: 999999, // Attempt to grant huge coins
      playFabId: "ATTACKER_ID_999", // Attempt to credit another user
    }),
  });

  const response = await handlePaymentsRequest(req);
  assert.ok(response);
  assert.equal(response.status, 200);

  // Verify PayMongo API was called with authoritative server values
  assert.equal(payMongoApiRequests.length, 1);
  const firstReq = payMongoApiRequests[0];
  assert.ok(firstReq);
  const payMongoPayload = firstReq.body.data.attributes;
  assert.equal(payMongoPayload.line_items[0].amount, 5000); // ₱50.00
  assert.equal(payMongoPayload.line_items[0].currency, "PHP");
  assert.equal(payMongoPayload.metadata.playFabId, TEST_PLAYER_ID); // Server-authenticated ID, not attacker ID

  // Verify internal stored order has authoritative values
  const orders = await listOrders();
  const createdOrder = orders.find((o) => o.productId === "coins_500");
  assert.ok(createdOrder);
  assert.equal(createdOrder.expectedAmount, 5000);
  assert.equal(createdOrder.expectedCoins, 500);
  assert.equal(createdOrder.playFabId, TEST_PLAYER_ID);
  assert.equal(createdOrder.status, "pending");
});

// -------------------------------------------------------------
// Test 9: Successful payment and PlayFab virtual currency credit
// -------------------------------------------------------------
test("9. Successful payment webhook fulfills order and credits exactly 500 CO to player", async () => {
  const orderId = generateOrderId();
  await saveOrder({
    orderId,
    playFabId: TEST_PLAYER_ID,
    productId: "coins_500",
    expectedAmount: 5000,
    currency: "PHP",
    expectedCoins: 500,
    PayMongoCheckoutSessionId: "cs_test_session_1",
    PayMongoReferenceNumber: orderId,
    status: "pending",
    createdAt: new Date().toISOString(),
    paidAt: null,
    fulfilledAt: null,
    webhookEventId: null,
  });

  const eventId = "evt_test_payment_success_1";
  const rawBody = createSampleEvent({ eventId, orderId, amount: 5000, currency: "PHP" });
  const { header } = signPayload(rawBody);

  const res = await processPayMongoWebhook(rawBody, header);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.coinsAwarded, 500);

  // Verify PlayFab AddUserVirtualCurrency was called
  assert.equal(awardedCoinsLog.length, 1);
  const firstAward = awardedCoinsLog[0];
  assert.ok(firstAward);
  assert.equal(firstAward.playFabId, TEST_PLAYER_ID);
  assert.equal(firstAward.currency, "CO");
  assert.equal(firstAward.amount, 500);

  // Verify order updated to fulfilled
  const order = await getOrder(orderId);
  assert.ok(order);
  assert.equal(order.status, "fulfilled");
  assert.ok(order.paidAt);
  assert.ok(order.fulfilledAt);
  assert.equal(order.webhookEventId, eventId);

  // Verify event recorded as processed
  const processed = await isEventProcessed(eventId);
  assert.equal(processed, true);
});

// -------------------------------------------------------------
// Test 10: Idempotency: Prevent duplicate Coin grants on duplicate webhook
// -------------------------------------------------------------
test("10. Duplicate webhook delivery does NOT credit coins twice (strictly idempotent)", async () => {
  const orderId = generateOrderId();
  await saveOrder({
    orderId,
    playFabId: TEST_PLAYER_ID,
    productId: "coins_500",
    expectedAmount: 5000,
    currency: "PHP",
    expectedCoins: 500,
    PayMongoCheckoutSessionId: "cs_test_session_2",
    PayMongoReferenceNumber: orderId,
    status: "pending",
    createdAt: new Date().toISOString(),
    paidAt: null,
    fulfilledAt: null,
    webhookEventId: null,
  });

  const eventId = "evt_test_duplicate_check_1";
  const rawBody = createSampleEvent({ eventId, orderId });
  const { header } = signPayload(rawBody);

  // Delivery 1
  const res1 = await processPayMongoWebhook(rawBody, header);
  assert.equal(res1.status, 200);
  assert.equal(res1.body.success, true);
  assert.equal(awardedCoinsLog.length, 1);

  // Delivery 2 (PayMongo automatic webhook retry)
  const res2 = await processPayMongoWebhook(rawBody, header);
  assert.equal(res2.status, 200);
  assert.equal(res2.body.idempotent, true);

  // Crucial: Coins must STILL be credited exactly once!
  assert.equal(awardedCoinsLog.length, 1);
});

// -------------------------------------------------------------
// Test 11: Idempotency: Order already fulfilled with different event ID
// -------------------------------------------------------------
test("11. Webhook for an order that is already fulfilled returns 200 without re-crediting", async () => {
  const orderId = generateOrderId();
  await saveOrder({
    orderId,
    playFabId: TEST_PLAYER_ID,
    productId: "coins_500",
    expectedAmount: 5000,
    currency: "PHP",
    expectedCoins: 500,
    PayMongoCheckoutSessionId: "cs_test_session_3",
    PayMongoReferenceNumber: orderId,
    status: "fulfilled",
    createdAt: new Date().toISOString(),
    paidAt: new Date().toISOString(),
    fulfilledAt: new Date().toISOString(),
    webhookEventId: "evt_previous_event",
  });

  const newEventId = "evt_second_event_for_same_order";
  const rawBody = createSampleEvent({ eventId: newEventId, orderId });
  const { header } = signPayload(rawBody);

  const res = await processPayMongoWebhook(rawBody, header);
  assert.equal(res.status, 200);
  assert.equal(res.body.idempotent, true);
  assert.equal(awardedCoinsLog.length, 0); // No coins awarded
});

// -------------------------------------------------------------
// Test 12: Wrong payment amount rejection
// -------------------------------------------------------------
test("12. Webhook payment with amount mismatch is rejected and order marked failed", async () => {
  const orderId = generateOrderId();
  await saveOrder({
    orderId,
    playFabId: TEST_PLAYER_ID,
    productId: "coins_500",
    expectedAmount: 5000,
    currency: "PHP",
    expectedCoins: 500,
    PayMongoCheckoutSessionId: null,
    PayMongoReferenceNumber: orderId,
    status: "pending",
    createdAt: new Date().toISOString(),
    paidAt: null,
    fulfilledAt: null,
    webhookEventId: null,
  });

  // PayMongo sent event with 2500 centavos instead of expected 5000
  const rawBody = createSampleEvent({ orderId, amount: 2500, currency: "PHP" });
  const { header } = signPayload(rawBody);

  const res = await processPayMongoWebhook(rawBody, header);
  assert.equal(res.status, 400);
  assert.equal(awardedCoinsLog.length, 0);

  const order = await getOrder(orderId);
  assert.ok(order);
  assert.equal(order.status, "failed");
  assert.match(order.error || "", /Amount mismatch/);
});

// -------------------------------------------------------------
// Test 13: Wrong payment currency rejection
// -------------------------------------------------------------
test("13. Webhook payment with currency mismatch is rejected and order marked failed", async () => {
  const orderId = generateOrderId();
  await saveOrder({
    orderId,
    playFabId: TEST_PLAYER_ID,
    productId: "coins_500",
    expectedAmount: 5000,
    currency: "PHP",
    expectedCoins: 500,
    PayMongoCheckoutSessionId: null,
    PayMongoReferenceNumber: orderId,
    status: "pending",
    createdAt: new Date().toISOString(),
    paidAt: null,
    fulfilledAt: null,
    webhookEventId: null,
  });

  const rawBody = createSampleEvent({ orderId, amount: 5000, currency: "USD" });
  const { header } = signPayload(rawBody);

  const res = await processPayMongoWebhook(rawBody, header);
  assert.equal(res.status, 400);
  assert.equal(awardedCoinsLog.length, 0);

  const order = await getOrder(orderId);
  assert.ok(order);
  assert.equal(order.status, "failed");
  assert.match(order.error || "", /Currency mismatch/);
});

// -------------------------------------------------------------
// Test 14: PlayFab failure safety and retry readiness
// -------------------------------------------------------------
test("14. PlayFab outage marks order as paid with error and returns 500 for webhook retry", async () => {
  const orderId = generateOrderId();
  await saveOrder({
    orderId,
    playFabId: TEST_PLAYER_ID,
    productId: "coins_500",
    expectedAmount: 5000,
    currency: "PHP",
    expectedCoins: 500,
    PayMongoCheckoutSessionId: null,
    PayMongoReferenceNumber: orderId,
    status: "pending",
    createdAt: new Date().toISOString(),
    paidAt: null,
    fulfilledAt: null,
    webhookEventId: null,
  });

  playFabFailureMode = true; // Trigger failure on AddUserVirtualCurrency
  const eventId = "evt_test_playfab_failure_1";
  const rawBody = createSampleEvent({ eventId, orderId });
  const { header } = signPayload(rawBody);

  const res = await processPayMongoWebhook(rawBody, header);
  assert.equal(res.status, 500); // 500 signals PayMongo to retry delivery!

  const order = await getOrder(orderId);
  assert.ok(order);
  assert.equal(order.status, "paid"); // Not fulfilled
  assert.ok(order.error);
  assert.equal(order.fulfilledAt, null);

  // Crucial: Event must NOT be marked processed so the retry can attempt fulfillment again
  const processed = await isEventProcessed(eventId);
  assert.equal(processed, false);
});

// -------------------------------------------------------------
// Test 15: Single order public status endpoint
// -------------------------------------------------------------
test("15. Order status endpoint returns safe public fields without secrets", async () => {
  const orderId = generateOrderId();
  await saveOrder({
    orderId,
    playFabId: TEST_PLAYER_ID,
    productId: "coins_500",
    expectedAmount: 5000,
    currency: "PHP",
    expectedCoins: 500,
    PayMongoCheckoutSessionId: "cs_secret_session_id",
    PayMongoReferenceNumber: orderId,
    status: "fulfilled",
    createdAt: new Date().toISOString(),
    paidAt: new Date().toISOString(),
    fulfilledAt: new Date().toISOString(),
    webhookEventId: "evt_123",
  });

  const req = new Request(
    `https://civil-craft.vercel.app/api/payments/paymongo/order?id=${orderId}`,
    { method: "GET" },
  );

  const res = await handlePaymentsRequest(req);
  assert.ok(res);
  assert.equal(res.status, 200);
  const data = (await res.json()) as any;

  assert.equal(data.orderId, orderId);
  assert.equal(data.status, "fulfilled");
  assert.equal(data.expectedCoins, 500);
  assert.equal(data.expectedAmount, 5000);
  assert.equal(data.currency, "PHP");

  // Verify sensitive fields are not leaked
  assert.equal(data.PayMongoCheckoutSessionId, undefined);
  assert.equal(data.playFabId, undefined);
  assert.equal(data.webhookEventId, undefined);
});

// -------------------------------------------------------------
// Test 16: Player orders endpoint returns player's payment orders
// -------------------------------------------------------------
test("16. Player orders endpoint returns the authenticated player's orders", async () => {
  const orderId = generateOrderId();
  await saveOrder({
    orderId,
    playFabId: TEST_PLAYER_ID,
    productId: "coins_500",
    expectedAmount: 5000,
    currency: "PHP",
    expectedCoins: 500,
    PayMongoCheckoutSessionId: "cs_mock",
    PayMongoReferenceNumber: orderId,
    status: "fulfilled",
    createdAt: new Date().toISOString(),
    paidAt: new Date().toISOString(),
    fulfilledAt: new Date().toISOString(),
    webhookEventId: "evt_1",
  });

  const req = new Request(
    "https://civil-craft.vercel.app/api/payments/paymongo/player-orders",
    {
      method: "GET",
      headers: { Authorization: `Bearer ${TEST_PLAYER_TICKET}` },
    },
  );

  const res = await handlePaymentsRequest(req);
  assert.ok(res);
  assert.equal(res.status, 200);
  const data = (await res.json()) as any;
  assert.ok(Array.isArray(data.orders));
  assert.ok(data.orders.some((o: any) => o.orderId === orderId));
});

// -------------------------------------------------------------
// Test 17: Admin transactions endpoint lists PayMongo purchases
// -------------------------------------------------------------
test("17. Admin transactions endpoint integrates PayMongo orders as Transaction records", async () => {
  const orderId = generateOrderId();
  await saveOrder({
    orderId,
    playFabId: TEST_PLAYER_ID,
    productId: "coins_500",
    expectedAmount: 5000,
    currency: "PHP",
    expectedCoins: 500,
    PayMongoCheckoutSessionId: "cs_admin_test",
    PayMongoReferenceNumber: orderId,
    status: "fulfilled",
    createdAt: new Date().toISOString(),
    paidAt: new Date().toISOString(),
    fulfilledAt: new Date().toISOString(),
    webhookEventId: "evt_admin_1",
  });

  const config = getAdminAuthConfig()!;
  const sessionToken = await issueAdminSession(config, config.users[0]!);
  const cookieHeader = `${cookieName(config)}=${sessionToken}`;

  const adminReq = new Request("https://civil-craft.vercel.app/api/admin/transactions?orders=1", {
    method: "GET",
    headers: {
      cookie: cookieHeader,
      origin: "https://civil-craft.vercel.app",
    },
  });

  const adminRes = await handlePlayFabAdminRequest(adminReq);
  assert.ok(adminRes);
  assert.equal(adminRes.status, 200);
  const data = (await adminRes.json()) as any;
  assert.equal(data.configured, true);
  assert.ok(Array.isArray(data.records));

  const tx = data.records.find((r: any) => r.transactionId === orderId);
  assert.ok(tx, "Expected PayMongo order to be listed in admin transactions");
  assert.equal(tx.playerId, TEST_PLAYER_ID);
  assert.equal(tx.itemName, "500 Civil Craft Coins");
  assert.equal(tx.amount, 50); // ₱50.00
  assert.equal(tx.currency, "PHP");
  assert.equal(tx.type, "purchase");
  assert.equal(tx.status, "completed");
  assert.equal(tx.paymentMethod, "PayMongo");
});

// -------------------------------------------------------------
// Test 18: Safely ignores unsupported event types
// -------------------------------------------------------------
test("18. Unsupported webhook events are safely acknowledged with 200 and ignored", async () => {
  const rawBody = JSON.stringify({
    data: {
      id: "evt_other_123",
      type: "event",
      attributes: {
        type: "source.chargeable",
        livemode: false,
        data: {},
      },
    },
  });

  const { header } = signPayload(rawBody);
  const res = await processPayMongoWebhook(rawBody, header);
  assert.equal(res.status, 200);
  assert.equal(res.body.received, true);
  assert.equal(awardedCoinsLog.length, 0);
});

// -------------------------------------------------------------
// Test 19: Webhook rejects non-existent order with 404
// -------------------------------------------------------------
test("19. Webhook rejects unknown order ID with 404", async () => {
  const rawBody = createSampleEvent({ orderId: "CC-COINS-NONEXISTENT-999" });
  const { header } = signPayload(rawBody);

  const res = await processPayMongoWebhook(rawBody, header);
  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
  assert.equal(awardedCoinsLog.length, 0);
});

// -------------------------------------------------------------
// Test 20: Webhook rejects future timestamp beyond tolerance
// -------------------------------------------------------------
test("20. Webhook rejects timestamp too far in the future", () => {
  const rawBody = "{}";
  const futureTimestamp = Math.floor(Date.now() / 1000) + 500; // 500 seconds in the future
  const { header } = signPayload(rawBody, TEST_WEBHOOK_SECRET, futureTimestamp);

  const res = verifyPayMongoSignature({
    signatureHeader: header,
    rawBody,
  });

  assert.equal(res.valid, false);
  if (!res.valid) {
    assert.equal(res.reason, "stale_timestamp");
  }
});

// -------------------------------------------------------------
// Test 21: Non-POST HTTP methods rejected with 405
// -------------------------------------------------------------
test("21. Non-POST HTTP methods to payment endpoints are rejected with 405", async () => {
  const getCheckoutReq = new Request(
    "https://civil-craft.vercel.app/api/payments/paymongo/create-checkout",
    { method: "GET" },
  );
  const getCheckoutRes = await handlePaymentsRequest(getCheckoutReq);
  assert.ok(getCheckoutRes);
  assert.equal(getCheckoutRes.status, 405);

  const getWebhookReq = new Request(
    "https://civil-craft.vercel.app/api/webhooks/paymongo",
    { method: "GET" },
  );
  const getWebhookRes = await handlePaymentsRequest(getWebhookReq);
  assert.ok(getWebhookRes);
  assert.equal(getWebhookRes.status, 405);
});

// -------------------------------------------------------------
// Test 22: Shop products endpoint returns active catalog
// -------------------------------------------------------------
test("22. Public /api/shop/products returns product catalog with coins_500", async () => {
  const req = new Request("https://civil-craft.vercel.app/api/shop/products", {
    method: "GET",
  });
  const res = await handlePaymentsRequest(req);
  assert.ok(res);
  assert.equal(res.status, 200);

  const data = (await res.json()) as { products: Array<{ id: string; amount: number; rewardCoins: number }> };
  assert.ok(Array.isArray(data.products));
  assert.ok(data.products.length >= 1);

  const coins500 = data.products.find((p) => p.id === "coins_500");
  assert.ok(coins500);
  assert.equal(coins500.amount, 5000);
  assert.equal(coins500.rewardCoins, 500);
});

// -------------------------------------------------------------
// Test 23: Multi-product checkout creation with server validation
// -------------------------------------------------------------
test("23. Checkout creation works for coins_1000 and enforces server price", async () => {
  const req = new Request(
    "https://civil-craft.vercel.app/api/payments/paymongo/create-checkout",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_PLAYER_TICKET}`,
      },
      body: JSON.stringify({
        productId: "coins_1000",
        amount: 1, // client attempts to spoof price
        rewardCoins: 999999, // client attempts to spoof coins
      }),
    },
  );

  const res = await handlePaymentsRequest(req);
  assert.ok(res);
  assert.equal(res.status, 200);

  const data = (await res.json()) as { success: boolean; orderId: string };
  assert.equal(data.success, true);

  const order = await getOrder(data.orderId);
  assert.ok(order);
  assert.equal(order.expectedAmount, 9500); // Server-enforced
  assert.equal(order.expectedCoins, 1000); // Server-enforced
});

// -------------------------------------------------------------
// Test 24: QR payment method (qrph) enabled in Checkout Session
// -------------------------------------------------------------
test("24. Checkout creation includes qrph in payment_method_types alongside existing methods", async () => {
  payMongoApiRequests = [];
  const req = new Request(
    "https://civil-craft.vercel.app/api/payments/paymongo/create-checkout",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_PLAYER_TICKET}`,
      },
      body: JSON.stringify({
        productId: "coins_500",
      }),
    },
  );

  const res = await handlePaymentsRequest(req);
  assert.ok(res);
  assert.equal(res.status, 200);

  const lastReq = payMongoApiRequests[payMongoApiRequests.length - 1];
  assert.ok(lastReq);
  const types = lastReq.body?.data?.attributes?.payment_method_types as string[];
  assert.ok(Array.isArray(types));
  assert.ok(types.includes("qrph"), "payment_method_types must include qrph for QR payments");
  assert.ok(types.includes("card"), "payment_method_types must preserve card");
  assert.ok(types.includes("gcash"), "payment_method_types must preserve gcash");
  assert.ok(types.includes("paymaya"), "payment_method_types must preserve paymaya");
});

// -------------------------------------------------------------
// Test 25: qr.paid fulfills order and qr.expired is acknowledged
// -------------------------------------------------------------
test("25. qr.paid fulfills order to PlayFab and qr.expired is safely acknowledged", async () => {
  // 1. Create a pending order
  const orderId = generateOrderId();
  const initialOrder: PaymentOrder = {
    orderId,
    playFabId: TEST_PLAYER_ID,
    productId: "coins_500",
    expectedAmount: 5000,
    currency: "PHP",
    expectedCoins: 500,
    PayMongoCheckoutSessionId: "cs_test_qr_123",
    PayMongoReferenceNumber: orderId,
    status: "pending",
    createdAt: new Date().toISOString(),
    paidAt: null,
    fulfilledAt: null,
    webhookEventId: null,
  };
  await saveOrder(initialOrder);

  // 2. Test qr.expired acknowledgment
  const expiredPayload = JSON.stringify({
    data: {
      id: "evt_test_qr_expired_1",
      type: "event",
      attributes: {
        type: "qr.expired",
        livemode: false,
        data: {
          id: "qr_test_123",
          type: "qr_code",
          attributes: {
            metadata: { orderId },
          },
        },
      },
    },
  });
  const expiredSign = signPayload(expiredPayload);
  const expiredReq = new Request("https://civil-craft.vercel.app/api/webhooks/paymongo", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Paymongo-Signature": expiredSign.header,
    },
    body: expiredPayload,
  });
  const expiredRes = await handlePaymentsRequest(expiredReq);
  assert.ok(expiredRes);
  assert.equal(expiredRes.status, 200);

  // 3. Test qr.paid fulfillment
  awardedCoinsLog = [];
  const paidPayload = JSON.stringify({
    data: {
      id: "evt_test_qr_paid_1",
      type: "event",
      attributes: {
        type: "qr.paid",
        livemode: false,
        data: {
          id: "qr_test_123",
          type: "qr_code",
          attributes: {
            amount: 5000,
            currency: "PHP",
            status: "paid",
            metadata: { orderId },
          },
        },
      },
    },
  });
  const paidSign = signPayload(paidPayload);
  const paidReq = new Request("https://civil-craft.vercel.app/api/webhooks/paymongo", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Paymongo-Signature": paidSign.header,
    },
    body: paidPayload,
  });
  const paidRes = await handlePaymentsRequest(paidReq);
  assert.ok(paidRes);
  assert.equal(paidRes.status, 200);

  const updatedOrder = await getOrder(orderId);
  assert.ok(updatedOrder);
  assert.equal(updatedOrder.status, "fulfilled");
  assert.equal(updatedOrder.webhookEventId, "evt_test_qr_paid_1");

  assert.equal(awardedCoinsLog.length, 1);
  const firstAward = awardedCoinsLog[0];
  assert.ok(firstAward);
  assert.equal(firstAward.playFabId, TEST_PLAYER_ID);
  assert.equal(firstAward.currency, "CO");
  assert.equal(firstAward.amount, 500);
});

// -------------------------------------------------------------
// Test 26: Admin dynamically creates a new coin product
// -------------------------------------------------------------
test("26. Admin can create a new coin product and it appears dynamically in the shop", async () => {
  const config = getAdminAuthConfig()!;
  const sessionToken = await issueAdminSession(config, config.users[0]!);
  const cookieHeader = `${cookieName(config)}=${sessionToken}`;

  // 1. Create a 5,000 Coins — ₱400 product
  const createReq = new Request("https://civil-craft.vercel.app/api/admin/products", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: cookieHeader,
      origin: "https://civil-craft.vercel.app",
    },
    body: JSON.stringify({
      action: "save",
      product: {
        id: "coins_5000",
        name: "5,000 Civil Craft Coins",
        description: "Mega builder vault for elite bridge engineers",
        amount: 40000, // ₱400.00 in centavos
        currency: "PHP",
        rewardCoins: 5000,
        badge: "Ultimate Pack",
        popular: true,
        active: true,
      },
    }),
  });

  const createRes = await handlePlayFabAdminRequest(createReq);
  assert.ok(createRes);
  assert.equal(createRes.status, 200);
  const createData = (await createRes.json()) as any;
  assert.equal(createData.success, true);
  assert.ok(Array.isArray(createData.products));
  assert.ok(createData.products.some((p: any) => p.id === "coins_5000"));

  // 2. Verify that public /api/shop/products immediately returns this product
  const shopReq = new Request("https://civil-craft.vercel.app/api/shop/products", {
    method: "GET",
  });
  const shopRes = await handlePaymentsRequest(shopReq);
  assert.ok(shopRes);
  assert.equal(shopRes.status, 200);
  const shopData = (await shopRes.json()) as any;
  const p5000 = shopData.products.find((p: any) => p.id === "coins_5000");
  assert.ok(p5000, "Expected new 5,000 coin product to appear in /api/shop/products");
  assert.equal(p5000.amount, 40000);
  assert.equal(p5000.rewardCoins, 5000);
  assert.equal(p5000.badge, "Ultimate Pack");
});

// -------------------------------------------------------------
// Test 27: Purchasing the admin-created product grants exact CO coins
// -------------------------------------------------------------
test("27. Checkout and webhook payment for admin-created product awards correct CO coins", async () => {
  // Pre-seed product in internalData since beforeEach clears it
  internalData["civilcraft.website.v1.coin-products.coins_5000"] = JSON.stringify({
    id: "coins_5000",
    name: "5,000 Civil Craft Coins",
    description: "Mega builder vault for elite bridge engineers",
    amount: 40000,
    currency: "PHP",
    rewardCoins: 5000,
    category: "currency",
    badge: "Ultimate Pack",
    popular: true,
    active: true,
  });

  // 1. Create checkout session for coins_5000
  const checkoutReq = new Request(
    "https://civil-craft.vercel.app/api/payments/paymongo/create-checkout",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_PLAYER_TICKET}`,
        origin: "https://civil-craft.vercel.app",
      },
      body: JSON.stringify({ productId: "coins_5000" }),
    },
  );

  const checkoutRes = await handlePaymentsRequest(checkoutReq);
  assert.ok(checkoutRes);
  assert.equal(checkoutRes.status, 200);
  const checkoutData = (await checkoutRes.json()) as any;
  assert.equal(checkoutData.success, true);
  const orderId = checkoutData.orderId;
  assert.ok(orderId);

  const order = await getOrder(orderId);
  assert.ok(order);
  assert.equal(order.productId, "coins_5000");
  assert.equal(order.expectedAmount, 40000); // ₱400.00
  assert.equal(order.expectedCoins, 5000); // 5000 CO coins

  // 2. Simulate PayMongo payment webhook for this order
  awardedCoinsLog = [];
  const eventId = "evt_test_dynamic_product_paid_1";
  const webhookBody = JSON.stringify({
    data: {
      id: eventId,
      type: "event",
      attributes: {
        type: "checkout_session.payment.paid",
        livemode: false,
        data: {
          id: order.PayMongoCheckoutSessionId,
          type: "checkout_session",
          attributes: {
            reference_number: orderId,
            payments: [
              {
                id: "pay_dyn_1",
                type: "payment",
                attributes: {
                  amount: 40000,
                  currency: "PHP",
                  status: "paid",
                },
              },
            ],
            metadata: { orderId },
          },
        },
      },
    },
  });

  const sign = signPayload(webhookBody);
  const webhookReq = new Request("https://civil-craft.vercel.app/api/webhooks/paymongo", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Paymongo-Signature": sign.header,
    },
    body: webhookBody,
  });

  const webhookRes = await handlePaymentsRequest(webhookReq);
  assert.ok(webhookRes);
  assert.equal(webhookRes.status, 200);

  const fulfilledOrder = await getOrder(orderId);
  assert.ok(fulfilledOrder);
  assert.equal(fulfilledOrder.status, "fulfilled");

  // Verify that exactly 5,000 CO coins were credited to the player
  assert.equal(awardedCoinsLog.length, 1);
  const award = awardedCoinsLog[0];
  assert.ok(award);
  assert.equal(award.playFabId, TEST_PLAYER_ID);
  assert.equal(award.currency, "CO");
  assert.equal(award.amount, 5000);
});

// -------------------------------------------------------------
// Test 28: Safe product deletion prevention
// -------------------------------------------------------------
test("28. Safe product deletion prevents deleting products with transaction history", async () => {
  const config = getAdminAuthConfig()!;
  const sessionToken = await issueAdminSession(config, config.users[0]!);
  const cookieHeader = `${cookieName(config)}=${sessionToken}`;

  // Seed product and an existing order for it
  internalData["civilcraft.website.v1.coin-products.coins_5000"] = JSON.stringify({
    id: "coins_5000",
    name: "5,000 Civil Craft Coins",
    description: "Mega builder vault",
    amount: 40000,
    currency: "PHP",
    rewardCoins: 5000,
    category: "currency",
    active: true,
  });

  const orderId = generateOrderId();
  await saveOrder({
    orderId,
    playFabId: TEST_PLAYER_ID,
    productId: "coins_5000",
    expectedAmount: 40000,
    currency: "PHP",
    expectedCoins: 5000,
    PayMongoCheckoutSessionId: null,
    PayMongoReferenceNumber: orderId,
    status: "fulfilled",
    createdAt: new Date().toISOString(),
    paidAt: new Date().toISOString(),
    fulfilledAt: new Date().toISOString(),
    webhookEventId: "evt_hist_1",
  });

  // Attempt to delete coins_5000
  const deleteReq = new Request("https://civil-craft.vercel.app/api/admin/products", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: cookieHeader,
      origin: "https://civil-craft.vercel.app",
    },
    body: JSON.stringify({
      action: "delete",
      id: "coins_5000",
    }),
  });

  const deleteRes = await handlePlayFabAdminRequest(deleteReq);
  assert.ok(deleteRes);
  assert.equal(deleteRes.status, 400); // Blocked because order exists
  const deleteData = (await deleteRes.json()) as any;
  assert.ok(deleteData.error.includes("transaction records exist"));

  // Disable coins_5000 instead
  const toggleReq = new Request("https://civil-craft.vercel.app/api/admin/products", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: cookieHeader,
      origin: "https://civil-craft.vercel.app",
    },
    body: JSON.stringify({
      action: "toggle-active",
      id: "coins_5000",
      active: false,
    }),
  });

  const toggleRes = await handlePlayFabAdminRequest(toggleReq);
  assert.ok(toggleRes);
  assert.equal(toggleRes.status, 200);

  // Shop now filters out disabled product
  const shopReq = new Request("https://civil-craft.vercel.app/api/shop/products", {
    method: "GET",
  });
  const shopRes = await handlePaymentsRequest(shopReq);
  assert.ok(shopRes);
  assert.equal(shopRes.status, 200);
  const shopData = (await shopRes.json()) as any;
  const p5000 = shopData.products.find((p: any) => p.id === "coins_5000");
  assert.equal(p5000, undefined, "Disabled product should not appear in player shop");
});



