import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, beforeEach, test } from "node:test";
import nodemailer from "nodemailer";
import {
  formatPaymentMethod,
  formatReceiptDate,
  renderPurchaseReceiptEmail,
  sendPurchaseReceiptEmail,
  resolveSupportEmail,
  extractPaymentDetails,
} from "../src/lib/email/purchase-receipt.server.ts";
import { coinReceiptVerificationFingerprint } from "../src/lib/payments/coin-receipts.server.ts";
import { premiumWalletVerificationFingerprint } from "../src/lib/playfab/premium-wallet.server.ts";
import { processPayMongoWebhook } from "../src/lib/payments/fulfillment.server.ts";
import {
  getOrder,
  saveOrder,
  getReceiptEmailClaim,
  saveReceiptEmailClaim,
} from "../src/lib/payments/orders.server.ts";
import type { PaymentOrder } from "../src/lib/payments/types.ts";

const TEST_SECRET_KEY = "sk_test_mock_secret_key_receipt_123";
const TEST_WEBHOOK_SECRET = "whsec_mock_webhook_secret_receipt_456";
const TEST_PLAYER_ID = "E851A9A5B7F72D01";
const TEST_VERIFIED_EMAIL = "builder@civilcraft.game";

const env = {
  VITE_PLAYFAB_TITLE_ID: "17FA03",
  PLAYFAB_SECRET_KEY: "test-playfab-secret",
  PAYMONGO_SECRET_KEY: TEST_SECRET_KEY,
  PAYMONGO_WEBHOOK_SECRET: TEST_WEBHOOK_SECRET,
  PLAYFAB_COINS_CURRENCY_CODE: "CO",
  PUBLIC_APP_URL: "https://civil-craft.vercel.app",
  PUBLIC_SITE_URL: "https://civil-craft.vercel.app",
  ADMIN_AUTH_ORIGIN: "https://civil-craft.vercel.app",
  GMAIL_SMTP_USER: "notifications@civilcraft.game",
  GMAIL_SMTP_APP_PASSWORD: "abcd efgh ijkl mnop",
  GMAIL_SMTP_HOST: "smtp.gmail.com",
  GMAIL_SMTP_PORT: "465",
  GMAIL_SMTP_SECURE: "true",
  PLAYFAB_COINS_RECEIPTS_VERIFIED: "true",
  PLAYFAB_COINS_VERIFIED_TITLE_ID: "17FA03",
  PLAYFAB_COINS_VERIFIED_CONFIG_SHA256: coinReceiptVerificationFingerprint(),
  PLAYFAB_DIAMONDS_ENABLED: "false",
  PLAYFAB_DIAMONDS_STORAGE: "entity-objects",
  PLAYFAB_DIAMONDS_BOOTSTRAP_VERIFIED: "true",
  PLAYFAB_DIAMONDS_PLAYER_WRITES_DENIED: "true",
  PLAYFAB_DIAMONDS_CAPACITY_VERIFIED: "true",
  PLAYFAB_DIAMONDS_VERIFIED_TITLE_ID: "17FA03",
  PLAYFAB_DIAMONDS_VERIFIED_CONFIG_SHA256: premiumWalletVerificationFingerprint(),
};

const previousEnv = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
const originalFetch = globalThis.fetch;

let internalData: Record<string, string> = {};
let mockPlayerProfile: Record<string, unknown> = {};
let mockUserInfo: Record<string, unknown> = {};
let sentEmails: Array<Record<string, unknown>> = [];
let sendMailFailureCount = 0;
let premiumObjects: Record<string, unknown> = {};
let premiumVersion = 1;

beforeEach(() => {
  for (const [k, v] of Object.entries(env)) {
    process.env[k] = v;
  }
  internalData = {};
  sentEmails = [];
  sendMailFailureCount = 0;
  premiumObjects = {};
  premiumVersion = 1;

  mockPlayerProfile = {
    PlayerId: TEST_PLAYER_ID,
    DisplayName: "MasterBuilder",
    ContactEmailAddresses: [
      {
        EmailAddress: TEST_VERIFIED_EMAIL,
        VerificationStatus: "Confirmed",
      },
    ],
  };

  mockUserInfo = {
    PlayFabId: TEST_PLAYER_ID,
    Username: "masterbuilder",
    TitleInfo: {
      DisplayName: "MasterBuilder",
      TitlePlayerAccount: { Id: "FACE123", Type: "title_player_account" },
    },
    PrivateInfo: {
      Email: TEST_VERIFIED_EMAIL,
    },
  };

  // Mock nodemailer createTransport
  // @ts-expect-error Mocking createTransport for tests
  nodemailer.createTransport = () => ({
    sendMail: async (mailOptions: Record<string, unknown>) => {
      if (sendMailFailureCount > 0) {
        sendMailFailureCount--;
        throw new Error("Temporary SMTP connection timeout");
      }
      sentEmails.push(mailOptions);
      return { messageId: "msg_test_12345" };
    },
    close: () => {},
  });

  // Mock globalThis.fetch for PlayFab Admin and Server APIs
  globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    const body = init?.body ? JSON.parse(String(init.body)) : {};

    if (urlStr.includes("playfabapi.com")) {
      if (urlStr.endsWith("/Admin/GetTitleInternalData")) {
        const keys = body.Keys as string[] | undefined;
        const resultData: Record<string, string> = {};
        if (keys && Array.isArray(keys)) {
          for (const k of keys) {
            if (internalData[k]) resultData[k] = internalData[k]!;
          }
        } else {
          Object.assign(resultData, internalData);
        }
        return Response.json({ code: 200, data: { Data: resultData } });
      }

      if (urlStr.endsWith("/Admin/SetTitleInternalData")) {
        internalData[body.Key] = body.Value;
        return Response.json({ code: 200, data: {} });
      }

      if (urlStr.endsWith("/Server/GetPlayerProfile")) {
        return Response.json({
          code: 200,
          data: { PlayerProfile: mockPlayerProfile },
        });
      }

      if (urlStr.endsWith("/Admin/GetUserAccountInfo")) {
        return Response.json({
          code: 200,
          data: { UserInfo: mockUserInfo },
        });
      }

      if (urlStr.endsWith("/Authentication/GetEntityToken")) {
        return Response.json({
          code: 200,
          data: {
            EntityToken: "mock-title-token",
            Entity: { Id: "17FA03", Type: "title" },
            TokenExpiration: new Date(Date.now() + 3_600_000).toISOString(),
          },
        });
      }

      if (urlStr.includes("/Object/")) {
        if (urlStr.endsWith("/GetObjects")) {
          return Response.json({
            code: 200,
            data: {
              Entity: body.Entity,
              ProfileVersion: premiumVersion,
              Objects: structuredClone(premiumObjects),
            },
          });
        }
        if (urlStr.endsWith("/SetObjects")) {
          const item = body.Objects?.[0];
          if (item) {
            premiumObjects[item.ObjectName] = structuredClone(item);
          }
          premiumVersion++;
          return Response.json({
            code: 200,
            data: {
              ProfileVersion: premiumVersion,
              SetResults: [
                {
                  ObjectName: item?.ObjectName || "civilcraft.coin-purchases.v1",
                  SetResult: "Updated",
                },
              ],
            },
          });
        }
      }

      if (urlStr.endsWith("/Server/GetUserInventory")) {
        return Response.json({
          code: 200,
          data: { VirtualCurrency: { CO: 500 } },
        });
      }

      if (urlStr.endsWith("/Server/AddUserVirtualCurrency")) {
        return Response.json({
          code: 200,
          data: {
            PlayFabId: body.PlayFabId,
            VirtualCurrency: body.VirtualCurrency,
            BalanceChange: body.Amount,
            Balance: 500,
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

function createTestOrder(overrides: Partial<PaymentOrder> = {}): PaymentOrder {
  return {
    orderId: "CC-COINS-TEST-1001",
    playFabId: TEST_PLAYER_ID,
    productId: "coins_500",
    expectedAmount: 5000, // ₱50.00
    currency: "PHP",
    expectedCoins: 500,
    rewardCurrency: "CO",
    rewardAmount: 500,
    PayMongoCheckoutSessionId: "cs_test_session_1001",
    PayMongoReferenceNumber: "CC-COINS-TEST-1001",
    status: "fulfilled",
    createdAt: "2026-11-12T00:00:00.000Z",
    paidAt: "2026-11-12T00:05:00.000Z",
    fulfilledAt: "2026-11-12T00:05:01.000Z",
    webhookEventId: "evt_test_1001",
    paymentMethod: "gcash",
    paymentReference: "pay_test_ref_1001",
    ...overrides,
  };
}

function signWebhook(
  rawBody: string,
  secret = TEST_WEBHOOK_SECRET,
  timestamp = Math.floor(Date.now() / 1000),
) {
  const payload = `${timestamp}.${rawBody}`;
  const hmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `t=${timestamp},te=${hmac}`;
}

test("formatPaymentMethod correctly maps supported providers and formats defaults", () => {
  assert.equal(formatPaymentMethod("gcash"), "GCash");
  assert.equal(formatPaymentMethod("paymaya"), "Maya");
  assert.equal(formatPaymentMethod("maya"), "Maya");
  assert.equal(formatPaymentMethod("card"), "Credit / Debit Card");
  assert.equal(formatPaymentMethod("qrph"), "QR Ph");
  assert.equal(formatPaymentMethod("grab_pay"), "GrabPay");
  assert.equal(formatPaymentMethod("dob"), "BPI Online Banking");
  assert.equal(formatPaymentMethod("dob_ubp"), "UnionBank Online Banking");
  assert.equal(formatPaymentMethod("custom_gateway"), "Custom gateway");
  assert.equal(formatPaymentMethod(null), "Online Payment");
});

test("renderPurchaseReceiptEmail renders complete Civil Craft branded email in Test Mode", () => {
  const order = createTestOrder();
  const rendered = renderPurchaseReceiptEmail({
    order,
    recipientEmail: TEST_VERIFIED_EMAIL,
    playerName: "MasterBuilder",
    paymentMethod: "gcash",
    paymentReference: "pay_gcash_123",
    isTestMode: true,
  });

  // Subject
  assert.match(rendered.subject, /Civil Craft — Purchase Confirmation \[TEST MODE\]/);
  assert.match(rendered.subject, /CC-COINS-TEST-1001/);

  // Content requirements
  assert.match(rendered.html, /Purchase Confirmed!/);
  assert.match(rendered.html, /MasterBuilder/);
  assert.match(rendered.html, /CC-COINS-TEST-1001/);
  assert.match(rendered.html, /500 Civil Craft Coins/);
  assert.match(rendered.html, /500 Coins/);
  assert.match(rendered.html, /₱50\.00/);
  assert.match(rendered.html, /GCash/);
  assert.match(rendered.html, /pay_gcash_123/);
  assert.match(rendered.html, /Completed &bull; Fulfilled/);
  assert.match(rendered.html, /TEST MODE TRANSACTION/);
  assert.match(rendered.html, /No real money was charged/);
  assert.match(rendered.html, /not an official tax invoice/);

  // Visual Palette
  assert.match(rendered.html, /#F3E7D1/); // Cream outer background
  assert.match(rendered.html, /#FCF6EC/); // Inner panel
  assert.match(rendered.html, /#4A3428/); // Brown border & header
  assert.match(rendered.html, /#C58A42/); // Gold accent
  assert.match(rendered.html, /#4E372C/); // Text color

  // Plain-text counterpart
  assert.match(rendered.text, /=== CIVIL CRAFT: BRIDGE EDITION ===/);
  assert.match(rendered.text, /\*\*\* TEST MODE PURCHASE CONFIRMATION \*\*\*/);
  assert.match(rendered.text, /Order ID:\s+CC-COINS-TEST-1001/);
  assert.match(rendered.text, /Total Paid:\s+₱50\.00/);
  assert.match(rendered.text, /TEST MODE NOTICE/);
  assert.match(rendered.text, /No real money was charged/);
});

test("renderPurchaseReceiptEmail renders official receipt language in Live Mode", () => {
  const order = createTestOrder({ orderId: "CC-COINS-LIVE-2001" });
  const rendered = renderPurchaseReceiptEmail({
    order,
    recipientEmail: TEST_VERIFIED_EMAIL,
    playerName: "EngineerAlice",
    paymentMethod: "card",
    paymentReference: "pay_card_456",
    isTestMode: false,
  });

  assert.equal(rendered.subject, "Civil Craft — Payment Receipt: CC-COINS-LIVE-2001");
  assert.match(rendered.html, /Official Payment Receipt/);
  assert.doesNotMatch(rendered.html, /TEST MODE TRANSACTION/);
  assert.doesNotMatch(rendered.html, /No real money was charged/);
  assert.match(rendered.text, /\*\*\* PAYMENT RECEIPT \*\*\*/);
});

test("renderPurchaseReceiptEmail correctly renders Diamond packages", () => {
  const order = createTestOrder({
    orderId: "CC-DIAMONDS-1001",
    productId: "diamonds_1000",
    expectedAmount: 9500, // ₱95.00
    expectedCoins: 0,
    rewardCurrency: "DI",
    rewardAmount: 1000,
  });

  const rendered = renderPurchaseReceiptEmail({
    order,
    recipientEmail: TEST_VERIFIED_EMAIL,
    playerName: "GemHunter",
    paymentMethod: "maya",
    isTestMode: true,
  });

  assert.match(rendered.html, /1,000 Civil Craft Diamonds/);
  assert.match(rendered.html, /1,000 Diamonds/);
  assert.match(rendered.html, /₱95\.00/);
  assert.match(rendered.html, /Maya/);
});

test("renderPurchaseReceiptEmail escapes HTML to prevent XSS", () => {
  const order = createTestOrder({ orderId: "CC-COINS-<script>alert(1)</script>" });
  const rendered = renderPurchaseReceiptEmail({
    order,
    recipientEmail: TEST_VERIFIED_EMAIL,
    playerName: "<b onmouseover='alert(2)'>Hacker</b>",
    isTestMode: true,
  });

  assert.doesNotMatch(rendered.html, /<script>/);
  assert.match(rendered.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(rendered.html, /&lt;b onmouseover=&#39;alert\(2\)&#39;&gt;Hacker&lt;\/b&gt;/);
});

test("sendPurchaseReceiptEmail sends receipt to verified player contact email", async () => {
  const order = createTestOrder();
  await saveOrder(order);

  const result = await sendPurchaseReceiptEmail({
    order,
    paymentSession: {
      attributes: {
        payments: [
          {
            attributes: {
              status: "paid",
              payment_method_type: "gcash",
              id: "pay_webhook_999",
            },
          },
        ],
      },
    },
  });

  assert.equal(result.success, true);
  assert.ok(result.sentAt);
  assert.equal(sentEmails.length, 1);

  const sent = sentEmails[0]!;
  assert.equal(sent["to"], TEST_VERIFIED_EMAIL);
  assert.equal(sent["from"], "Civil Craft <notifications@civilcraft.game>");
  assert.match(String(sent["subject"]), /CC-COINS-TEST-1001/);

  // Check updated order state
  const updated = await getOrder(order.orderId);
  assert.ok(updated?.receiptEmailSentAt);
  assert.equal(updated?.paymentMethod, "gcash");
  assert.equal(updated?.paymentReference, "pay_webhook_999");
});

test("sendPurchaseReceiptEmail skips sending when email is unverified (Unconfirmed)", async () => {
  mockPlayerProfile = {
    PlayerId: TEST_PLAYER_ID,
    ContactEmailAddresses: [
      {
        EmailAddress: "unverified@civilcraft.game",
        VerificationStatus: "Unconfirmed",
      },
    ],
  };

  const order = createTestOrder();
  await saveOrder(order);

  const result = await sendPurchaseReceiptEmail({ order });
  assert.equal(result.success, false);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "unverified_email");
  assert.equal(sentEmails.length, 0);

  const currentOrder = await getOrder(order.orderId);
  assert.equal(currentOrder?.receiptEmailSentAt, undefined);
});

test("sendPurchaseReceiptEmail skips sending when player has no contact email", async () => {
  mockPlayerProfile = {
    PlayerId: TEST_PLAYER_ID,
    ContactEmailAddresses: [],
  };
  mockUserInfo = {
    PlayFabId: TEST_PLAYER_ID,
    PrivateInfo: {},
  };

  const order = createTestOrder();
  await saveOrder(order);

  const result = await sendPurchaseReceiptEmail({ order });
  assert.equal(result.success, false);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "missing_email");
  assert.equal(sentEmails.length, 0);
});

test("sendPurchaseReceiptEmail enforces idempotency and skips duplicate sends", async () => {
  const order = createTestOrder({ receiptEmailSentAt: "2026-11-12T00:10:00.000Z" });
  await saveOrder(order);

  const result = await sendPurchaseReceiptEmail({ order });
  assert.equal(result.success, true);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "already_sent");
  assert.equal(sentEmails.length, 0);
});

test("sendPurchaseReceiptEmail retries transient SMTP failures and succeeds", async () => {
  const order = createTestOrder();
  await saveOrder(order);

  // Configure 1 transient failure before succeeding
  sendMailFailureCount = 1;

  const result = await sendPurchaseReceiptEmail({ order, maxRetries: 2 });
  assert.equal(result.success, true);
  assert.ok(result.sentAt);
  assert.equal(sentEmails.length, 1);
});

test("sendPurchaseReceiptEmail records error safely on persistent failure without throwing", async () => {
  const order = createTestOrder();
  await saveOrder(order);

  // Configure persistent failure
  sendMailFailureCount = 5;

  const result = await sendPurchaseReceiptEmail({ order, maxRetries: 1 });
  assert.equal(result.success, false);
  assert.match(result.error || "", /Temporary SMTP connection timeout/);
  assert.equal(sentEmails.length, 0);

  // Order record has error recorded, but order is NOT deleted or corrupted
  const current = await getOrder(order.orderId);
  assert.ok(current);
  assert.match(current.receiptEmailError || "", /Temporary SMTP connection timeout/);
  assert.equal(current.status, "fulfilled");
});

test("processPayMongoWebhook triggers purchase receipt email upon successful fulfillment", async () => {
  const orderId = "CC-COINS-WEBHOOK-1";
  const order: PaymentOrder = {
    orderId,
    playFabId: TEST_PLAYER_ID,
    productId: "coins_500",
    expectedAmount: 5000,
    currency: "PHP",
    expectedCoins: 500,
    rewardCurrency: "CO",
    rewardAmount: 500,
    coinReceiptVersion: 1,
    PayMongoCheckoutSessionId: "cs_webhook_1",
    PayMongoReferenceNumber: orderId,
    status: "pending",
    createdAt: "2026-11-12T00:00:00.000Z",
    paidAt: null,
    fulfilledAt: null,
    webhookEventId: null,
  };
  await saveOrder(order);

  const webhookBody = JSON.stringify({
    data: {
      id: "evt_webhook_1",
      type: "event",
      attributes: {
        type: "checkout_session.payment.paid",
        livemode: false,
        data: {
          id: "cs_webhook_1",
          type: "checkout_session",
          attributes: {
            livemode: false,
            reference_number: orderId,
            metadata: {
              orderId,
              productId: "coins_500",
              playFabId: TEST_PLAYER_ID,
            },
            payments: [
              {
                attributes: {
                  status: "paid",
                  livemode: false,
                  amount: 5000,
                  currency: "PHP",
                  payment_method_type: "gcash",
                  id: "pay_test_webhook_1",
                },
              },
            ],
          },
        },
      },
    },
  });

  const sigHeader = signWebhook(webhookBody);
  const processResult = await processPayMongoWebhook(webhookBody, sigHeader);

  assert.equal(processResult.status, 200);
  assert.equal(processResult.body.success, true);
  assert.equal(processResult.body.orderId, orderId);
  assert.equal(processResult.body.coinsAwarded, 500);

  // Verify receipt email was sent
  assert.equal(sentEmails.length, 1);
  const sent = sentEmails[0]!;
  assert.equal(sent["to"], TEST_VERIFIED_EMAIL);
  assert.match(String(sent["subject"]), new RegExp(orderId));

  // Second duplicate webhook delivery must NOT send a second email
  const duplicateResult = await processPayMongoWebhook(webhookBody, sigHeader);
  assert.equal(duplicateResult.status, 200);
  assert.equal(duplicateResult.body.idempotent, true);
  assert.equal(sentEmails.length, 1); // No new email sent!
});

test("webhook with invalid signature is rejected and does not send receipt email", async () => {
  const webhookBody = JSON.stringify({
    data: {
      id: "evt_invalid",
      type: "event",
      attributes: { type: "checkout_session.payment.paid" },
    },
  });

  const res = await processPayMongoWebhook(webhookBody, "t=12345,te=invalidsignature");
  assert.equal(res.status, 400);
  assert.equal(sentEmails.length, 0);
});

test("non-payment webhook event acknowledges without sending receipt email", async () => {
  const webhookBody = JSON.stringify({
    data: {
      id: "evt_unrelated",
      type: "event",
      attributes: {
        type: "source.chargeable",
        livemode: false,
        data: {},
      },
    },
  });

  const sigHeader = signWebhook(webhookBody);
  const res = await processPayMongoWebhook(webhookBody, sigHeader);
  assert.equal(res.status, 200);
  assert.equal(sentEmails.length, 0);
});

test("Diamond package webhook triggers receipt email with correct Diamonds branding", async () => {
  Object.assign(process.env, {
    PLAYFAB_DIAMONDS_ENABLED: "true",
    PLAYFAB_DIAMONDS_STORAGE: "entity-objects",
    PLAYFAB_DIAMONDS_VERIFIED_TITLE_ID: "17FA03",
    PLAYFAB_DIAMONDS_BOOTSTRAP_VERIFIED: "true",
    PLAYFAB_DIAMONDS_PLAYER_WRITES_DENIED: "true",
    PLAYFAB_DIAMONDS_CAPACITY_VERIFIED: "true",
    PLAYFAB_DIAMONDS_VERIFIED_CONFIG_SHA256: premiumWalletVerificationFingerprint(),
  });

  const orderId = "CC-DIAMONDS-WEBHOOK-1";
  const order: PaymentOrder = {
    orderId,
    playFabId: TEST_PLAYER_ID,
    productId: "diamonds_500",
    expectedAmount: 5000,
    currency: "PHP",
    expectedCoins: 0,
    rewardCurrency: "DI",
    rewardAmount: 500,
    premiumWallet: {
      storage: "entity-objects",
      collectionId: "premium-wallet",
      objectName: "civilcraft.premium-wallet.v1",
      maxBytes: 8192,
      entity: { Id: "FACE123", Type: "title_player_account" },
    },
    PayMongoCheckoutSessionId: "cs_diamonds_1",
    PayMongoReferenceNumber: orderId,
    status: "pending",
    createdAt: "2026-11-12T00:00:00.000Z",
    paidAt: null,
    fulfilledAt: null,
    webhookEventId: null,
  };
  await saveOrder(order);

  const webhookBody = JSON.stringify({
    data: {
      id: "evt_diamonds_1",
      type: "event",
      attributes: {
        type: "checkout_session.payment.paid",
        livemode: false,
        data: {
          id: "cs_diamonds_1",
          type: "checkout_session",
          attributes: {
            livemode: false,
            reference_number: orderId,
            metadata: {
              orderId,
              productId: "diamonds_500",
              playFabId: TEST_PLAYER_ID,
            },
            payments: [
              {
                attributes: {
                  status: "paid",
                  livemode: false,
                  amount: 5000,
                  currency: "PHP",
                  payment_method_type: "paymaya",
                  id: "pay_test_diamonds_1",
                },
              },
            ],
          },
        },
      },
    },
  });

  const sigHeader = signWebhook(webhookBody);
  const processResult = await processPayMongoWebhook(webhookBody, sigHeader);

  assert.equal(processResult.status, 200);
  assert.equal(processResult.body.success, true);
  assert.equal(processResult.body.orderId, orderId);
  assert.equal(processResult.body.diamondsAwarded, 500);

  // Verify Diamonds receipt email was sent
  assert.equal(sentEmails.length, 1);
  const sent = sentEmails[0]!;
  assert.equal(sent["to"], TEST_VERIFIED_EMAIL);
  assert.match(String(sent["subject"]), new RegExp(orderId));
  assert.match(String(sent["html"]), /500 Civil Craft Diamonds/);
  assert.match(String(sent["html"]), /500 Diamonds/);
  assert.match(String(sent["html"]), /Maya/);
});

test("delivery states transition through pending -> sending -> sent with persistent claim recorded", async () => {
  const orderId = "CC-COINS-STATE-1";
  const order: PaymentOrder = {
    orderId,
    playFabId: TEST_PLAYER_ID,
    productId: "coins_500",
    expectedAmount: 5000,
    currency: "PHP",
    expectedCoins: 500,
    rewardCurrency: "CO",
    rewardAmount: 500,
    PayMongoCheckoutSessionId: "cs_state_1",
    PayMongoReferenceNumber: orderId,
    status: "fulfilled",
    receiptEmailStatus: "pending",
    createdAt: "2026-11-12T00:00:00.000Z",
    paidAt: "2026-11-12T00:01:00.000Z",
    fulfilledAt: "2026-11-12T00:01:05.000Z",
    webhookEventId: "evt_state_1",
  };
  await saveOrder(order);

  const result = await sendPurchaseReceiptEmail({ order });
  assert.equal(result.success, true);
  assert.ok(result.sentAt);

  // Check updated order record
  const updated = await getOrder(orderId);
  assert.ok(updated);
  assert.equal(updated.receiptEmailStatus, "sent");
  assert.equal(updated.receiptEmailSentAt, result.sentAt);
  assert.equal(updated.receiptEmailError, null);

  // Check persistent claim in Title Internal Data
  const claim = await getReceiptEmailClaim(orderId);
  assert.ok(claim);
  assert.equal(claim.status, "sent");
  assert.equal(claim.sentAt, result.sentAt);
  assert.equal(claim.playFabId, TEST_PLAYER_ID);
});

test("delivery failure transitions state to failed and allows safe subsequent retry", async () => {
  const orderId = "CC-COINS-RETRY-1";
  const order: PaymentOrder = {
    orderId,
    playFabId: TEST_PLAYER_ID,
    productId: "coins_500",
    expectedAmount: 5000,
    currency: "PHP",
    expectedCoins: 500,
    rewardCurrency: "CO",
    rewardAmount: 500,
    PayMongoCheckoutSessionId: "cs_retry_1",
    PayMongoReferenceNumber: orderId,
    status: "fulfilled",
    receiptEmailStatus: "pending",
    createdAt: "2026-11-12T00:00:00.000Z",
    paidAt: "2026-11-12T00:01:00.000Z",
    fulfilledAt: "2026-11-12T00:01:05.000Z",
    webhookEventId: "evt_retry_1",
  };
  await saveOrder(order);

  // Configure SMTP to fail permanently on the first attempt
  sendMailFailureCount = 10;
  const failResult = await sendPurchaseReceiptEmail({ order, maxRetries: 0 });
  assert.equal(failResult.success, false);
  assert.match(failResult.error || "", /SMTP connection timeout/);

  // Check order record and claim are marked 'failed'
  const failedOrder = await getOrder(orderId);
  assert.ok(failedOrder);
  assert.equal(failedOrder.receiptEmailStatus, "failed");
  assert.equal(failedOrder.receiptEmailSentAt, null);
  assert.ok(failedOrder.receiptEmailError);

  const failedClaim = await getReceiptEmailClaim(orderId);
  assert.ok(failedClaim);
  assert.equal(failedClaim.status, "failed");

  // Verify that payment/fulfillment was NOT undone
  assert.equal(failedOrder.status, "fulfilled");

  // Now restore SMTP and retry the same order
  sendMailFailureCount = 0;
  const retryResult = await sendPurchaseReceiptEmail({ order: failedOrder });
  assert.equal(retryResult.success, true);
  assert.ok(retryResult.sentAt);

  // Check that order is now 'sent'
  const sentOrder = await getOrder(orderId);
  assert.ok(sentOrder);
  assert.equal(sentOrder.receiptEmailStatus, "sent");
  assert.equal(sentOrder.receiptEmailSentAt, retryResult.sentAt);
  assert.equal(sentOrder.receiptEmailError, null);

  const sentClaim = await getReceiptEmailClaim(orderId);
  assert.ok(sentClaim);
  assert.equal(sentClaim.status, "sent");
});

test("concurrent execution is prevented by in-flight mutex and lease lock", async () => {
  const orderId = "CC-COINS-CONCURRENT-1";
  const order: PaymentOrder = {
    orderId,
    playFabId: TEST_PLAYER_ID,
    productId: "coins_500",
    expectedAmount: 5000,
    currency: "PHP",
    expectedCoins: 500,
    rewardCurrency: "CO",
    rewardAmount: 500,
    PayMongoCheckoutSessionId: "cs_concurrent_1",
    PayMongoReferenceNumber: orderId,
    status: "fulfilled",
    receiptEmailStatus: "pending",
    createdAt: "2026-11-12T00:00:00.000Z",
    paidAt: "2026-11-12T00:01:00.000Z",
    fulfilledAt: "2026-11-12T00:01:05.000Z",
    webhookEventId: "evt_concurrent_1",
  };
  await saveOrder(order);

  // Execute two concurrent sendPurchaseReceiptEmail calls in parallel
  const [res1, res2] = await Promise.all([
    sendPurchaseReceiptEmail({ order }),
    sendPurchaseReceiptEmail({ order }),
  ]);

  // One must succeed and the other must be skipped as in_flight or already_sent
  const results = [res1, res2];
  const succeeded = results.filter((r) => r.success && !r.skipped);
  const skipped = results.filter((r) => r.skipped);

  assert.equal(succeeded.length, 1, "Exactly one send must perform delivery");
  assert.equal(skipped.length, 1, "The concurrent call must be skipped");
  assert.ok(
    skipped[0]!.reason === "in_flight" || skipped[0]!.reason === "already_sent",
    `Expected in_flight or already_sent, got ${skipped[0]!.reason}`,
  );
  assert.equal(sentEmails.length, 1, "Exactly one email must be delivered via SMTP");
});

test("expired sending lease allows recovery and successful delivery", async () => {
  const orderId = "CC-COINS-LEASE-1";
  const order: PaymentOrder = {
    orderId,
    playFabId: TEST_PLAYER_ID,
    productId: "coins_500",
    expectedAmount: 5000,
    currency: "PHP",
    expectedCoins: 500,
    rewardCurrency: "CO",
    rewardAmount: 500,
    PayMongoCheckoutSessionId: "cs_lease_1",
    PayMongoReferenceNumber: orderId,
    status: "fulfilled",
    receiptEmailStatus: "sending",
    createdAt: "2026-11-12T00:00:00.000Z",
    paidAt: "2026-11-12T00:01:00.000Z",
    fulfilledAt: "2026-11-12T00:01:05.000Z",
    webhookEventId: "evt_lease_1",
  };
  await saveOrder(order);

  // Simulate an expired lease in Title Internal Data (from a crashed worker 5 minutes ago)
  await saveReceiptEmailClaim({
    orderId,
    status: "sending",
    updatedAt: new Date(Date.now() - 300_000).toISOString(),
    leaseExpiresAt: Date.now() - 240_000, // expired 4 minutes ago
    playFabId: TEST_PLAYER_ID,
  });

  const result = await sendPurchaseReceiptEmail({ order });
  assert.equal(result.success, true);
  assert.equal(result.skipped, undefined);
  assert.ok(result.sentAt);

  const updatedOrder = await getOrder(orderId);
  assert.ok(updatedOrder);
  assert.equal(updatedOrder.receiptEmailStatus, "sent");
});

test("support email resolves configured environment variable or falls back to official address", async () => {
  delete process.env["SUPPORT_EMAIL"];
  const defaultSupport = await resolveSupportEmail();
  assert.equal(defaultSupport, "support@civilcraft.game");

  process.env["SUPPORT_EMAIL"] = "custom-support@civilcraft.game";
  const customSupport = await resolveSupportEmail();
  assert.equal(customSupport, "custom-support@civilcraft.game");
  delete process.env["SUPPORT_EMAIL"];
});
