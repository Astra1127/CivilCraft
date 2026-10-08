import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const TARGET = crypto.createHash("sha256").update("fixture-target").digest("hex");
const ENTITY = { Id: "FACE123", Type: "title_player_account" };
const WALLET = {
  storage: "postgres",
  collectionId: "premium-wallet",
  databaseId: ID,
  targetId: TARGET,
  schemaVersion: 1,
};
const RECEIPT = { storage: "postgres", databaseId: ID, targetId: TARGET, schemaVersion: 1 };
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function load(path, mocks, environment = {}) {
  const source = readFileSync(new URL(`../src/lib/${path}`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(
    output,
    {
      exports,
      Buffer,
      URL,
      Response,
      Headers,
      setTimeout,
      process: { env: environment },
      require(name) {
        if (name in mocks) return mocks[name];
        if (name === "node:crypto") return require(name);
        throw new Error(`Unexpected import ${name}`);
      },
    },
    { filename: path },
  );
  return exports;
}
const plain = (value) => JSON.parse(JSON.stringify(value));
function harness() {
  const state = {
    orders: new Map(),
    receipts: new Set(),
    grants: 0,
    checkouts: 0,
    coinReads: 0,
    failure: false,
  };
  const admin = {
    AdminApiError: ApiError,
    object: (value) => (value && typeof value === "object" ? value : {}),
    playFabAdmin: async () => ({ VirtualCurrency: { CO: 7 } }),
  };
  const orders = {
    generateOrderId: () => "CC-DATABASE-ORDER",
    getOrder: async (id) => state.orders.get(id) ?? null,
    saveOrder: async (order) => state.orders.set(order.orderId, plain(order)),
    updateOrderStatus: async (id, updates) => {
      if (state.failure) throw new ApiError(503, "Audit unavailable");
      const next = { ...state.orders.get(id), ...updates };
      state.orders.set(id, next);
      return next;
    },
    markEventProcessed: async () => {},
    listOrdersForPlayer: async () => [],
  };
  const coin = {
    assertClassicCurrencyConfigured: async () => {
      if (state.coinUnavailable) throw new ApiError(503, "Coin currency undefined");
    },
    CoinGrantReviewRequired: class extends ApiError {
      constructor() {
        super(503, "Review needed");
      }
    },
    coinReceiptSnapshot: () => RECEIPT,
    assertCoinCheckoutReady: async (input) => {
      assert.deepEqual(plain(input.receipt), RECEIPT);
    },
    getCoinReceiptStatus: async (input) => {
      state.coinReads++;
      assert.deepEqual(plain(input.receipt), RECEIPT);
      return state.receipts.has(input.orderId) ? "granted" : "absent";
    },
    grantCoinsOnce: async (input) => {
      const exists = state.receipts.has(input.orderId);
      if (!exists) {
        state.grants++;
        state.receipts.add(input.orderId);
      }
      return { alreadyGranted: exists };
    },
  };
  const wallet = {
    requireDiamondCheckoutReady: () => WALLET,
    resolvePremiumEntity: async (id) => {
      assert.equal(id, "ABC123");
      return ENTITY;
    },
    assertDiamondCheckoutCapacity: async (input) => {
      assert.equal(input.playFabId, "ABC123");
      assert.deepEqual(plain(input.wallet), WALLET);
    },
    getDiamondBalance: async () => 0,
    hasDiamondReceipt: async (input) => {
      assert.deepEqual(plain(input.wallet), WALLET);
      return state.receipts.has(input.orderId);
    },
    grantDiamonds: async (input) => {
      assert.deepEqual(plain(input.wallet), WALLET);
      const exists = state.receipts.has(input.orderId);
      if (!exists) {
        state.grants++;
        state.receipts.add(input.orderId);
      }
      return { alreadyGranted: exists, balance: 500 };
    },
  };
  const products = {
    normalizeOrderReward: (order) => ({
      rewardCurrency: order.rewardCurrency ?? "CO",
      rewardAmount: order.rewardAmount ?? order.expectedCoins,
    }),
    normalizeProductReward: (product) => ({
      rewardCurrency: product.rewardCurrency,
      rewardAmount: product.rewardAmount,
    }),
  };
  const paymongo = {
    requirePayMongoCheckoutReady: () => ({ appUrl: "https://civilcraft.example" }),
    createPayMongoCheckout: async () => {
      state.checkouts++;
      return {
        referenceNumber: "CC-DATABASE-ORDER",
        checkoutId: "cs_test",
        checkoutUrl: "https://checkout.paymongo.com/test",
      };
    },
    verifyPayMongoSignature: () => ({ valid: true }),
    retrievePayMongoCheckout: async () => {
      throw new Error("Unexpected retrieval");
    },
  };
  const mocks = {
    "../playfab/admin-client.server.ts": admin,
    "../playfab/premium-wallet.server.ts": wallet,
    "./products.ts": products,
    "./orders.server.ts": orders,
    "./paymongo.server.ts": paymongo,
    "./coin-receipts.server.ts": coin,
  };
  const fulfillment = load("payments/fulfillment.server.ts", mocks);
  let currency = "DI";
  const api = load(
    "payments/api.server.ts",
    {
      ...mocks,
      "./fulfillment.server.ts": fulfillment,
      "./products.server.ts": {
        getProductById: async () => ({
          id: "package",
          active: true,
          amount: 5000,
          currency: "PHP",
          rewardCurrency: currency,
          rewardAmount: 500,
        }),
        listActiveProducts: async () => [],
      },
      "./player-auth.server.ts": {
        authenticatePaymentPlayer: async () => ({ playFabId: "ABC123" }),
      },
    },
    { COIN_RECEIPTS_STORAGE: "postgres" },
  );
  const checkout = () =>
    api.handlePaymentsRequest(
      new Request("https://civilcraft.example/api/payments/paymongo/create-checkout", {
        method: "POST",
        body: JSON.stringify({
          productId: "package",
          playFabId: "BAD",
          rewardAmount: 999999,
          rewardCurrency: "CO",
          price: 1,
          databaseId: "forged",
        }),
      }),
    );
  const webhook = () =>
    fulfillment.processPayMongoWebhook(
      JSON.stringify({
        data: {
          id: crypto.randomUUID(),
          attributes: {
            type: "checkout_session.payment.paid",
            livemode: false,
            data: {
              id: "cs_test",
              type: "checkout_session",
              attributes: {
                reference_number: "CC-DATABASE-ORDER",
                metadata: {
                  orderId: "CC-DATABASE-ORDER",
                  productId: "package",
                  playFabId: "ABC123",
                },
                payments: [{ attributes: { status: "paid", amount: 5000, currency: "PHP" } }],
              },
            },
          },
        },
      }),
      "mock-verified-signature",
    );
  return {
    state,
    wallet,
    orders,
    api,
    fulfillment,
    checkout,
    webhook,
    setCurrency(value) {
      currency = value;
    },
  };
}

test("Postgres Diamond checkout snapshots server account, database identity and reward; ignores browser monetary fields", async () => {
  const h = harness();
  assert.equal((await h.checkout()).status, 200);
  const order = h.state.orders.get("CC-DATABASE-ORDER");
  assert.equal(order.playFabId, "ABC123");
  assert.equal(order.rewardAmount, 500);
  assert.equal(order.expectedAmount, 5000);
  assert.deepEqual(order.premiumWallet, { ...WALLET, entity: ENTITY });
  assert.equal(order.coinReceiptVersion, undefined);
});
test("Postgres Coin checkout snapshots version2 and distinct receipt provider", async () => {
  const h = harness();
  h.setCurrency("CO");
  assert.equal((await h.checkout()).status, 200);
  const order = h.state.orders.get("CC-DATABASE-ORDER");
  assert.equal(order.coinReceiptVersion, 2);
  assert.deepEqual(order.coinReceipt, RECEIPT);
  assert.equal(order.coinCurrencyCode, "CO");
});
for (const currency of ["DI", "CO"]) {
  test(`${currency}: failed audit persistence after credit repairs from permanent receipt and retry grants nothing`, async () => {
    const h = harness();
    h.setCurrency(currency);
    await h.checkout();
    const update = h.orders.updateOrderStatus;
    h.orders.updateOrderStatus = async (id, values) => {
      if (values.status === "fulfilled") throw new ApiError(503, "Audit unavailable");
      return update(id, values);
    };
    assert.equal((await h.webhook()).status, 500);
    assert.equal(h.state.grants, 1);
    h.orders.updateOrderStatus = update;
    const retry = await h.webhook();
    assert.equal(retry.status, 200);
    assert.equal(retry.body.idempotent, true);
    assert.equal(h.state.grants, 1);
    assert.equal(h.state.orders.get("CC-DATABASE-ORDER").status, "fulfilled");
  });
}
test("version2 Coin order without database snapshot is held for review, never granted", async () => {
  const h = harness();
  h.setCurrency("CO");
  await h.checkout();
  delete h.state.orders.get("CC-DATABASE-ORDER").coinReceipt;
  assert.equal((await h.webhook()).status, 500);
  assert.equal(h.state.grants, 0);
});
test("version1 Coin order cannot acquire a database provider snapshot", () => {
  const h = harness();
  assert.throws(
    () =>
      h.fulfillment.coinGrantInput({
        rewardCurrency: "CO",
        rewardAmount: 500,
        coinReceiptVersion: 1,
        coinReceipt: RECEIPT,
      }),
    /Review/,
  );
});
test("order polling remains owner authenticated with database receipts", async () => {
  const h = harness();
  await h.checkout();
  h.state.orders.get("CC-DATABASE-ORDER").playFabId = "BAD";
  assert.equal(
    (
      await h.api.handlePaymentsRequest(
        new Request("https://civilcraft.example/api/payments/paymongo/order?id=CC-DATABASE-ORDER"),
      )
    ).status,
    404,
  );
});
test("missing classic CO configuration displays unavailable, not zero, without hiding healthy Diamonds", async () => {
  const h = harness();
  h.state.coinUnavailable = true;
  const response = await h.api.handlePaymentsRequest(
    new Request("https://civilcraft.example/api/player/currencies"),
  );
  assert.equal(response.status, 200);
  const balances = await response.json();
  assert.equal(balances.coins, null);
  assert.equal(balances.diamonds, 0);
});
test("missing database configuration prevents checkout, creates neither order nor payment", async () => {
  const h = harness();
  h.wallet.requireDiamondCheckoutReady = () => {
    throw new ApiError(503, "Database unverified");
  };
  assert.equal((await h.checkout()).status, 503);
  assert.equal(h.state.checkouts, 0);
  assert.equal(h.state.orders.size, 0);
});
test("a pending order ID collision cannot overwrite the first checkout", async () => {
  const h = harness();
  await h.checkout();
  const original = structuredClone(h.state.orders.get("CC-DATABASE-ORDER"));
  assert.equal((await h.checkout()).status, 503);
  assert.deepEqual(h.state.orders.get("CC-DATABASE-ORDER"), original);
  assert.equal(h.state.checkouts, 1);
});

test("real Premium Wallet dispatcher retains database target and rejects a captured order after endpoint switch", async () => {
  let current = WALLET,
    status = "absent",
    calls = 0;
  const admin = {
    AdminApiError: ApiError,
    adminGameConfig: () => ({ titleId: "17FA03", secret: "fixture-title-secret" }),
    object: (value) => value ?? {},
    playFabAdmin: async () => ({
      UserInfo: { PlayFabId: "ABC123", TitleInfo: { TitlePlayerAccount: ENTITY } },
    }),
  };
  const db = {
    currencyDatabaseConfig: () => current,
    requireCurrencyDatabaseReady: () => current,
    currencyDatabaseVerificationFingerprint: () => "f".repeat(64),
    databaseDiamondBalance: async () => {
      calls++;
      return 0;
    },
    databaseReceiptStatus: async (input) => {
      calls++;
      assert.equal(input.targetId, current.targetId);
      return status;
    },
    grantDatabaseDiamonds: async (input) => {
      calls++;
      assert.equal(input.targetId, current.targetId);
      return { alreadyGranted: false, balance: input.amount };
    },
  };
  const api = load(
    "playfab/premium-wallet.server.ts",
    { "./admin-client.server.ts": admin, "../payments/currency-database.server.ts": db },
    { PLAYFAB_DIAMONDS_ENABLED: "true", PLAYFAB_DIAMONDS_STORAGE: "postgres" },
  );
  const input = {
    orderId: "diamond-order",
    playFabId: "ABC123",
    entity: ENTITY,
    wallet: api.premiumWalletConfig(),
    rewardAmount: 500,
  };
  assert.equal((await api.grantDiamonds(input)).balance, 500);
  status = "granted";
  await assert.rejects(api.assertDiamondCheckoutCapacity(input), /already has a receipt/);
  const before = calls;
  current = { ...WALLET, targetId: "b".repeat(64) };
  await assert.rejects(api.grantDiamonds(input), /approved wallet configuration/);
  assert.equal(calls, before);
});
test("order projection updates cannot overwrite database identities or reward snapshots", async () => {
  let stored = {
    orderId: "order-1",
    playFabId: "ABC123",
    status: "pending",
    coinReceiptVersion: 2,
    coinReceipt: RECEIPT,
    premiumWallet: { ...WALLET, entity: ENTITY },
    rewardAmount: 500,
    rewardCurrency: "DI",
  };
  const admin = {
    AdminApiError: ApiError,
    object: (value) => value ?? {},
    playFabAdmin: async (path, body) => {
      if (path.endsWith("GetTitleInternalData"))
        return { Data: { [body.Keys[0]]: JSON.stringify(stored) } };
      stored = JSON.parse(body.Value);
      return {};
    },
  };
  const orders = load("payments/orders.server.ts", { "../playfab/admin-client.server.ts": admin });
  await orders.updateOrderStatus("order-1", {
    status: "paid",
    coinReceiptVersion: 1,
    coinReceipt: { ...RECEIPT, databaseId: "other" },
    premiumWallet: undefined,
    rewardAmount: 900,
  });
  assert.deepEqual(stored.coinReceipt, RECEIPT);
  assert.equal(stored.coinReceiptVersion, 2);
  assert.equal(stored.premiumWallet.databaseId, ID);
  assert.equal(stored.rewardAmount, 500);
});
