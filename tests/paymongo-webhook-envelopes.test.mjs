import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as coinMaintenance from "../src/lib/payments/coin-maintenance.server.ts";

const SECRET = "whsk_mock_current_webhook_secret";
const PLAYER = "ABC123";
const ENTITY = { Id: "FACE123", Type: "title_player_account" };
const DATABASE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const TARGET_ID = "b".repeat(64);
const WALLET = {
  storage: "postgres",
  collectionId: "premium-wallet",
  databaseId: DATABASE_ID,
  targetId: TARGET_ID,
  schemaVersion: 1,
};
const plain = (value) => JSON.parse(JSON.stringify(value));
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Compile real payment/signature source into isolated, credential-free test contexts. */
function load(path, mocks = {}, environment = {}) {
  const source = readFileSync(new URL(`../src/lib/payments/${path}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Buffer,
    URL,
    process: { env: environment },
    require(name) {
      if (name.endsWith("coin-maintenance.server.ts")) return coinMaintenance;
      if (name === "node:crypto") return crypto;
      if (Object.hasOwn(mocks, name)) return mocks[name];
      throw new Error(`Unexpected isolated dependency: ${name}`);
    },
  });
  return exports;
}
const products = load("products.ts");
const actualPaymongo = load("paymongo.server.ts", {}, { PAYMONGO_WEBHOOK_SECRET: SECRET });

function sign(rawBody, timestamp = Math.floor(Date.now() / 1000), secret = SECRET) {
  const digest = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  return `t=${timestamp},te=${digest}`;
}

function harness(currency = "CO", amount = 500, price = 5000) {
  const order = {
    orderId: `CC-${currency}-CURRENT-ENVELOPE`,
    playFabId: PLAYER,
    productId: `${currency === "CO" ? "coins" : "diamonds"}_${amount}`,
    expectedAmount: price,
    currency: "PHP",
    expectedCoins: currency === "CO" ? amount : 0,
    rewardCurrency: currency,
    rewardAmount: amount,
    ...(currency === "CO"
      ? {
          coinCurrencyCode: "CO",
          coinReceiptVersion: 2,
          coinReceipt: {
            storage: "postgres",
            databaseId: DATABASE_ID,
            targetId: TARGET_ID,
            schemaVersion: 1,
          },
        }
      : { premiumWallet: { ...WALLET, entity: ENTITY } }),
    PayMongoCheckoutSessionId: "cs_current_verified",
    PayMongoReferenceNumber: `CC-${currency}-CURRENT-ENVELOPE`,
    status: "pending",
    createdAt: "2026-01-01T00:00:00Z",
    paidAt: null,
    fulfilledAt: null,
    webhookEventId: null,
  };
  const state = {
    order: plain(order),
    receipt: false,
    credits: [],
    audits: [],
    orderReads: 0,
    retrievals: [],
    verifiedCheckout: undefined,
    failFulfilledOnce: false,
  };
  const verifyGrantIdentity = (input) => {
    assert.equal(input.orderId, order.orderId);
    assert.equal(input.playFabId, PLAYER);
    assert.equal(input.rewardAmount, amount);
    if (currency === "DI") {
      assert.deepEqual(plain(input.wallet), WALLET);
      assert.deepEqual(plain(input.entity), ENTITY);
    } else {
      assert.equal(input.currencyCode, "CO");
      assert.deepEqual(plain(input.receipt), order.coinReceipt);
    }
  };
  const grant = async (input) => {
    verifyGrantIdentity(input);
    const alreadyGranted = state.receipt;
    if (!alreadyGranted) {
      state.receipt = true;
      state.credits.push({ currency, amount, playFabId: PLAYER });
    }
    return { alreadyGranted, balance: amount };
  };
  const api = load("fulfillment.server.ts", {
    "../game-wallet/index.server.ts": {
      isGameWalletInstalled: () => false,
      withLegacyCoinGate: async (_id, task) => task(),
      recordLegacyCoinGrant: async () => {},
    },
    "../playfab/admin-client.server.ts": {
      AdminApiError: ApiError,
      object: (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {}),
    },
    "../playfab/premium-wallet.server.ts": {
      grantDiamonds: grant,
      hasDiamondReceipt: async (input) => {
        verifyGrantIdentity(input);
        return state.receipt;
      },
    },
    "./products.ts": products,
    "./orders.server.ts": {
      getOrder: async (id) => {
        state.orderReads++;
        return id === order.orderId ? plain(state.order) : null;
      },
      updateOrderStatus: async (id, updates) => {
        assert.equal(id, order.orderId);
        if (updates.status === "fulfilled" && state.failFulfilledOnce) {
          state.failFulfilledOnce = false;
          throw new ApiError(503, "Mock audit persistence failure");
        }
        state.order = { ...state.order, ...plain(updates) };
        return plain(state.order);
      },
      markEventProcessed: async (id, orderId) => state.audits.push({ id, orderId }),
    },
    "./paymongo.server.ts": {
      verifyPayMongoSignature: actualPaymongo.verifyPayMongoSignature,
      retrievePayMongoCheckout: async (id) => {
        state.retrievals.push(id);
        if (!state.verifiedCheckout) throw new ApiError(503, "Mock checkout retrieval unavailable");
        return plain(state.verifiedCheckout);
      },
    },
    "./coin-receipts.server.ts": {
      CoinGrantReviewRequired: class extends ApiError {
        constructor() {
          super(503, "Mock Coin receipt requires review");
        }
      },
      grantCoinsOnce: grant,
      getCoinReceiptStatus: async (input) => {
        verifyGrantIdentity(input);
        return state.receipt ? "granted" : "absent";
      },
    },
  });
  const session = () => ({
    id: order.PayMongoCheckoutSessionId,
    type: "checkout_session",
    attributes: {
      livemode: false,
      reference_number: order.PayMongoReferenceNumber,
      metadata: { orderId: order.orderId, productId: order.productId, playFabId: PLAYER },
      payments: [
        {
          id: "pay_current_verified",
          type: "payment",
          attributes: { livemode: false, status: "paid", amount: price, currency: "PHP" },
        },
      ],
    },
  });
  const legacy = () => ({
    data: {
      id: "evt_legacy_current_comparison",
      type: "event",
      attributes: { type: "checkout_session.payment.paid", livemode: false, data: session() },
    },
  });
  const modern = () => ({
    event_type: "send.webhook",
    data: {
      type: "checkout_session.payment.paid",
      resource: "checkout_session",
      livemode: false,
      organization_id: "org_mock",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      data: session(),
    },
  });
  const processRaw = (raw, signature = sign(raw)) => api.processPayMongoWebhook(raw, signature);
  const process = (event) => processRaw(JSON.stringify(event));
  return { order, state, session, legacy, modern, process, processRaw };
}

for (const currency of ["CO", "DI"]) {
  for (const [amount, price] of [
    [500, 5000],
    [1000, 9500],
    [2500, 22000],
  ]) {
    test(`${currency} ${amount}: documented current webhook without event ID grants its immutable package exactly once`, async () => {
      const h = harness(currency, amount, price);
      const raw = JSON.stringify(h.modern());
      const result = await h.processRaw(raw);
      assert.equal(result.status, 200);
      assert.equal(result.body.rewardCurrency, currency);
      assert.deepEqual(h.state.credits, [{ currency, amount, playFabId: PLAYER }]);
      assert.equal(h.state.order.status, "fulfilled");
      assert.equal(
        h.state.order.webhookEventId,
        `evt_body_${crypto.createHash("sha256").update(raw).digest("hex")}`,
      );
      assert.equal((await h.processRaw(raw, sign(raw))).body.idempotent, true);
      assert.equal(h.state.credits.length, 1);
      assert.equal(h.state.retrievals.length, 0);
    });
  }
  for (const formats of [
    ["legacy", "modern"],
    ["modern", "legacy"],
  ]) {
    test(`${currency}: cross-format duplicate ${formats.join(" then ")} preserves the order receipt`, async () => {
      const h = harness(currency);
      assert.equal((await h.process(h[formats[0]]())).status, 200);
      const result = await h.process(h[formats[1]]());
      assert.equal(result.status, 200);
      assert.equal(result.body.idempotent, true);
      assert.equal(h.state.credits.length, 1);
      assert.equal(
        h.state.audits.some(({ id }) => id.startsWith("evt_body_")),
        true,
      );
      assert.equal(
        h.state.audits.some(({ id }) => id === "evt_legacy_current_comparison"),
        true,
      );
    });
  }
  test(`${currency}: simultaneous current and legacy signed deliveries still grant one order once`, async () => {
    const h = harness(currency);
    const results = await Promise.all([h.process(h.modern()), h.process(h.legacy())]);
    assert.equal(
      results.every((result) => result.status === 200),
      true,
    );
    assert.equal(h.state.credits.length, 1);
    assert.equal(h.state.receipt, true);
    assert.equal(h.state.order.status, "fulfilled");
  });
  test(`${currency}: current transport retries after audit-save failure repair only from its permanent receipt`, async () => {
    const h = harness(currency);
    h.state.failFulfilledOnce = true;
    assert.equal((await h.process(h.modern())).status, 500);
    assert.equal(h.state.credits.length, 1);
    assert.equal((await h.process(h.legacy())).body.idempotent, true);
    assert.equal(h.state.credits.length, 1);
    assert.equal(h.state.order.status, "fulfilled");
  });
}

for (const status of ["pending", "paid"]) {
  test(`current signed evidence cannot reinterpret a historic ${status} Coin order without a receipt protocol`, async () => {
    const h = harness();
    h.state.order.status = status;
    delete h.state.order.coinReceiptVersion;
    delete h.state.order.coinReceipt;
    const result = await h.process(h.modern());
    assert.equal(result.status, 500);
    assert.equal(h.state.order.fulfillmentReviewRequired, true);
    assert.equal(h.state.credits.length, 0);
    assert.equal(h.state.receipt, false);
  });
}

test("current body-bound audit identity changes with signed transport details but not monetary authority", async () => {
  const h = harness();
  const first = h.modern();
  await h.process(first);
  const second = h.modern();
  second.data.updated_at = "2026-01-02T00:00:00Z";
  assert.equal((await h.process(second)).body.idempotent, true);
  assert.notEqual(h.state.audits[0].id, h.state.audits[1].id);
  assert.equal(h.state.credits.length, 1);
});

for (const signatureCase of [
  "missing",
  "forged",
  "altered-body",
  "stale",
  "future",
  "live-signature",
]) {
  test(`current webhook rejects ${signatureCase} HMAC evidence before reading orders`, async () => {
    const h = harness();
    const raw = JSON.stringify(h.modern());
    let signed = sign(raw);
    let delivered = raw;
    if (signatureCase === "missing") signed = null;
    if (signatureCase === "forged") signed = sign(raw, Math.floor(Date.now() / 1000), "forged-key");
    if (signatureCase === "altered-body") delivered = raw + " ";
    if (signatureCase === "stale") signed = sign(raw, Math.floor(Date.now() / 1000) - 301);
    if (signatureCase === "future") signed = sign(raw, Math.floor(Date.now() / 1000) + 301);
    if (signatureCase === "live-signature") signed = signed.replace(",te=", ",li=");
    assert.equal((await h.processRaw(delivered, signed)).status, 400);
    assert.equal(h.state.credits.length, 0);
    assert.equal(h.state.orderReads, 0);
  });
}

for (const variant of [
  "event-live",
  "event-mode-missing",
  "event-mode-string",
  "session-live",
  "payment-live",
]) {
  test(`current webhook rejects ${variant} without credit`, async () => {
    const h = harness();
    const event = h.modern();
    if (variant === "event-live") event.data.livemode = true;
    if (variant === "event-mode-missing") delete event.data.livemode;
    if (variant === "event-mode-string") event.data.livemode = "false";
    if (variant === "session-live") event.data.data.attributes.livemode = true;
    if (variant === "payment-live")
      event.data.data.attributes.payments[0].attributes.livemode = true;
    assert.equal((await h.process(event)).status, 400);
    assert.equal(h.state.credits.length, 0);
  });
}

for (const variant of [
  "wrong-wrapper",
  "null-wrapper",
  "modern-with-legacy-attributes",
  "legacy-with-modern-wrapper",
  "legacy-with-direct-resource",
  "legacy-with-conflicting-event-type",
  "legacy-with-conflicting-resource",
  "resource-conflict",
  "wrong-nested-type",
  "missing-resource",
  "missing-type",
  "invalid-id",
  "data-array",
]) {
  test(`ambiguous or malformed webhook envelope ${variant} is rejected before order lookup`, async () => {
    const h = harness();
    let event = h.modern();
    if (variant === "wrong-wrapper") event.event_type = "checkout_session.payment.paid";
    if (variant === "null-wrapper") event.event_type = null;
    if (variant === "modern-with-legacy-attributes")
      event.data.attributes = h.legacy().data.attributes;
    if (variant === "legacy-with-modern-wrapper")
      event = { ...h.legacy(), event_type: "send.webhook" };
    if (variant === "legacy-with-direct-resource")
      event = { data: { ...h.legacy().data, resource: "checkout_session" } };
    if (variant === "legacy-with-conflicting-event-type")
      event = { data: { ...h.legacy().data, type: "payment.paid" } };
    if (variant === "legacy-with-conflicting-resource") {
      event = h.legacy();
      event.data.attributes.resource = "payment";
    }
    if (variant === "resource-conflict") event.data.resource = "payment";
    if (variant === "wrong-nested-type") event.data.data.type = "payment";
    if (variant === "missing-resource") delete event.data.resource;
    if (variant === "missing-type") delete event.data.type;
    if (variant === "invalid-id") event.data.id = "untrusted/invalid/event";
    if (variant === "data-array") event.data = [];
    assert.equal((await h.process(event)).status, 400);
    assert.equal(h.state.orderReads, 0);
    assert.equal(h.state.credits.length, 0);
    assert.equal(h.state.audits.length, 0);
  });
}

for (const variant of [
  "session-id",
  "player-id",
  "product-id",
  "reference",
  "amount",
  "fractional-amount",
  "currency",
  "ambiguous-paid",
]) {
  test(`current signed event with forged or inconsistent ${variant} cannot grant`, async () => {
    const h = harness();
    const event = h.modern();
    const session = event.data.data;
    const attrs = session.attributes;
    if (variant === "session-id") session.id = "cs_not_this_order";
    if (variant === "player-id") attrs.metadata.playFabId = "BAD999";
    if (variant === "product-id") attrs.metadata.productId = "diamonds_2500";
    if (variant === "reference") attrs.reference_number = "OTHER_ORDER";
    if (variant === "amount") attrs.payments[0].attributes.amount = 1;
    if (variant === "fractional-amount") attrs.payments[0].attributes.amount = 5000.1;
    if (variant === "currency") attrs.payments[0].attributes.currency = "USD";
    if (variant === "ambiguous-paid") attrs.payments.push(plain(attrs.payments[0]));
    assert.equal((await h.process(event)).status, 400);
    assert.equal(h.state.credits.length, 0);
    assert.equal(h.state.retrievals.length, 0);
  });
}

test("current incomplete evidence retrieves only the stored bound checkout and fails closed on an outage", async () => {
  const h = harness();
  const event = h.modern();
  delete event.data.data.attributes.payments[0].attributes.amount;
  assert.equal((await h.process(event)).status, 500);
  assert.equal(h.state.credits.length, 0);
  h.state.verifiedCheckout = h.session();
  assert.equal((await h.process(event)).status, 200);
  assert.deepEqual(h.state.retrievals, [
    h.order.PayMongoCheckoutSessionId,
    h.order.PayMongoCheckoutSessionId,
  ]);
  assert.equal(h.state.credits.length, 1);
});

test("current unpaid or browser-success evidence cannot fulfill without a verified paid checkout", async () => {
  const h = harness();
  const event = h.modern();
  event.data.data.attributes.payments[0].attributes.status = "pending";
  event.data.data.attributes.status = "paid";
  assert.equal((await h.process(event)).status, 500);
  assert.equal(h.state.credits.length, 0);
  assert.equal(h.state.receipt, false);
});

test("current unrelated events and standalone QR resources remain nonmonetary acknowledgments", async () => {
  for (const [type, resource] of [
    ["payment.failed", "payment"],
    ["qr.paid", "qr_code"],
  ]) {
    const h = harness();
    const result = await h.process({
      event_type: "send.webhook",
      data: {
        type,
        resource,
        livemode: false,
        data: { id: "unrelated_resource", type: resource, attributes: {} },
      },
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.received, true);
    assert.equal(h.state.orderReads, 0);
    assert.equal(h.state.credits.length, 0);
  }
});
