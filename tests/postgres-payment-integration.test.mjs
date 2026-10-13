import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import * as coinMaintenance from "../src/lib/payments/coin-maintenance.server.ts";

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
const GAME_WALLET = {
  storage: "postgres",
  namespace: "civilcraft_game_wallet_v3",
  databaseId: ID,
  targetId: TARGET,
  protocolVersion: 3,
  entity: ENTITY,
};
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
        if (name.endsWith("cohort.server.ts") && !Object.hasOwn(mocks, name))
          return {
            newAccountCohortConfig: () => null,
            prepareAccountCoinAuthority: () =>
              assert.fail("Cohort enrollment is not enabled in this legacy fixture"),
          };
        if (name in mocks) return mocks[name];
        if (name.endsWith("coin-maintenance.server.ts")) return coinMaintenance;
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
    gameEnabled: false,
    gameMigrated: true,
    gameBalance: 7,
    gameGrants: 0,
    gameReceipts: new Set(),
    gateDepth: 0,
    gateEntries: 0,
    maxGateDepth: 0,
    receiptReads: [],
    gateEvents: [],
    legacyRecords: new Set(),
    auditWrites: 0,
    eventsProcessed: 0,
    betaConfigured: false,
    productId: "package",
    authPlayer: "ABC123",
  };
  const betaEnvironment = {
    COIN_BETA_CHECKOUT_ENABLED: "false",
    COIN_BETA_DELIVERY_ENABLED: "false",
    COIN_BETA_SCOPE_ID: "fixture-account-only-test",
    COIN_BETA_TITLE_ID: "17FA03",
    COIN_BETA_PLAYER_ID: "ABC123",
    COIN_BETA_ENTITY_ID: ENTITY.Id,
    PUBLIC_APP_URL: "https://civil-craft.vercel.app",
  };
  const admin = {
    AdminApiError: ApiError,
    adminGameConfig: () => ({ titleId: "17FA03" }),
    object: (value) => (value && typeof value === "object" ? value : {}),
    playFabAdmin: async () => ({ VirtualCurrency: { CO: 7 } }),
  };
  const orders = {
    generateOrderId: () => "CC-DATABASE-ORDER",
    getOrder: async (id) => state.orders.get(id) ?? null,
    saveOrder: async (order) => state.orders.set(order.orderId, plain(order)),
    updateOrderStatus: async (id, updates) => {
      state.auditWrites++;
      if (state.failure) throw new ApiError(503, "Audit unavailable");
      const next = { ...state.orders.get(id), ...updates };
      state.orders.set(id, next);
      return next;
    },
    markEventProcessed: async () => {
      state.eventsProcessed++;
    },
    listOrdersForPlayer: async (id) =>
      [...state.orders.values()]
        .filter((order) => order.playFabId.toUpperCase() === id.toUpperCase())
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
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
      state.receiptReads.push(plain(input));
      if (input.receipt !== undefined) assert.deepEqual(plain(input.receipt), RECEIPT);
      if (state.receiptReadHook) await state.receiptReadHook(input);
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
      state.receiptReads.push(plain(input));
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
    requirePayMongoCheckoutReady: () => ({
      appUrl: state.betaConfigured
        ? "https://civil-craft.vercel.app"
        : "https://civilcraft.example",
      secretKey: "sk_test_fixture_not_a_real_key",
      webhookSecret: "fixture_webhook_secret",
    }),
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
  const gameWallet = {
    isGameWalletEnabled: () => state.gameEnabled,
    isGameWalletInstalled: () => state.gameEnabled || state.gameInstalled === true,
    requireGameWalletReady: () => {
      if (state.gameUnavailable) throw new ApiError(503, "Unified wallet unavailable");
      return GAME_WALLET;
    },
    gameCoinSnapshot: async (player, beta) => {
      betaPolicy.assertCoinCheckoutSnapshotAllowed(player, beta);
      if (beta && !state.gameMigrated) throw new ApiError(409, "Wallet import required");
      const snapshot = state.gameSnapshot ?? GAME_WALLET;
      if (beta) betaPolicy.assertCoinBetaWalletBinding(beta, snapshot);
      return snapshot;
    },
    gameCoinBalance: async () => ({
      coins: state.gameMigrated ? state.gameBalance : null,
      ready: state.gameMigrated,
      version: 1,
    }),
    assertGameShopLink: async (token, id) => {
      assert.equal(id, "ABC123");
      if (token !== "correct-game-token") throw new ApiError(409, "Switch accounts");
      return { valid: true, currency: "coins" };
    },
    grantGameCoins: async (order) => {
      betaPolicy.assertCoinOrderDeliveryAllowed(order);
      assert.equal(order.coinReceiptVersion, 3);
      assert.deepEqual(plain(order.gameWallet), GAME_WALLET);
      const alreadyGranted = state.gameReceipts.has(order.orderId);
      if (!alreadyGranted) {
        state.gameReceipts.add(order.orderId);
        state.gameGrants++;
      }
      return { alreadyGranted };
    },
    repairGameCoinOrder: async (order) => {
      betaPolicy.assertCoinOrderDeliveryAllowed(order);
      assert.equal(order.coinReceiptVersion, 3);
      assert.deepEqual(plain(order.gameWallet), GAME_WALLET);
      state.receiptReads.push({ orderId: order.orderId, gameWallet: plain(order.gameWallet) });
      if (state.gameReceipts.has(order.orderId))
        return { ...order, status: "fulfilled", fulfillmentReviewRequired: false };
      if (order.status === "fulfilled") throw new ApiError(503, "No permanent receipt");
      return order;
    },
    withLegacyCoinGate: async (id, task) => {
      assert.equal(id, "ABC123");
      if (state.gateDepth !== 0)
        throw new ApiError(409, "This account has a pending wallet migration or legacy purchase.");
      state.gateEntries++;
      state.gateDepth++;
      state.maxGateDepth = Math.max(state.maxGateDepth, state.gateDepth);
      state.gateEvents.push("acquire");
      try {
        return await task();
      } finally {
        state.gateEvents.push("release");
        state.gateDepth--;
      }
    },
    recordLegacyCoinGrant: async (order) => {
      if (!state.gameEnabled && !state.gameInstalled) return;
      assert.ok(state.gateDepth > 0, "Legacy records must be serialized against migration");
      assert.ok(
        state.receipts.has(order.orderId),
        "An old permanent receipt must prove the classic grant",
      );
      state.legacyRecords.add(order.orderId);
    },
  };
  const betaPolicy = load(
    "payments/coin-beta.server.ts",
    {
      "../playfab/admin-client.server.ts": admin,
      "../game-wallet/config.server.ts": {
        requireGameWalletReady: () => {
          if (!state.gameEnabled || state.gameUnavailable)
            throw new ApiError(503, "Wallet disabled");
          return GAME_WALLET;
        },
        requireGameWalletSettlementReady: () => GAME_WALLET,
      },
      "./coin-maintenance.server.ts": coinMaintenance,
      "./paymongo.server.ts": paymongo,
      "./products.ts": products,
    },
    betaEnvironment,
  );
  const mocks = {
    "../playfab/admin-client.server.ts": admin,
    "../playfab/premium-wallet.server.ts": wallet,
    "./products.ts": products,
    "./orders.server.ts": orders,
    "./paymongo.server.ts": paymongo,
    "./coin-receipts.server.ts": coin,
    "../game-wallet/index.server.ts": gameWallet,
    "./coin-beta.server.ts": betaPolicy,
  };
  const fulfillment = load("payments/fulfillment.server.ts", mocks);
  let currency = "DI";
  const api = load(
    "payments/api.server.ts",
    {
      ...mocks,
      "./checkout-preflight.ts": load("payments/checkout-preflight.ts", {
        "./products.ts": mocks["./products.ts"],
      }),
      "./fulfillment.server.ts": fulfillment,
      "./products.server.ts": {
        getProductById: async () => ({
          id: state.productId,
          active: true,
          category: "currency",
          amount: 5000,
          currency: "PHP",
          rewardCurrency: currency,
          rewardAmount: 500,
          rewardCoins: currency === "CO" ? 500 : 0,
          ...state.productOverrides,
        }),
        listActiveProducts: async () => [],
      },
      "./player-auth.server.ts": {
        authenticatePaymentPlayer: async (request) => {
          if (state.requireAuth && request.headers.get("Authorization") !== "Bearer owner-session")
            throw new ApiError(401, "Player sign-in is required.");
          return { playFabId: state.authPlayer };
        },
      },
    },
    { COIN_RECEIPTS_STORAGE: "postgres" },
  );
  const checkout = (extras = {}) =>
    api.handlePaymentsRequest(
      new Request("https://civilcraft.example/api/payments/paymongo/create-checkout", {
        method: "POST",
        body: JSON.stringify({
          productId: state.productId,
          playFabId: "BAD",
          rewardAmount: 999999,
          rewardCurrency: "CO",
          price: 1,
          databaseId: "forged",
          ...extras,
        }),
      }),
    );
  const webhook = (evidence = {}) =>
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
                ...(state.betaConfigured ? { livemode: false } : {}),
                reference_number: "CC-DATABASE-ORDER",
                metadata: {
                  orderId: "CC-DATABASE-ORDER",
                  productId: state.productId,
                  playFabId: "ABC123",
                },
                payments: [
                  {
                    attributes: {
                      status: "paid",
                      amount: 5000,
                      currency: "PHP",
                      ...(state.betaConfigured ? { livemode: false } : {}),
                      ...evidence.payment,
                    },
                  },
                ],
                ...evidence.session,
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
    gameWallet,
    orders,
    api,
    fulfillment,
    checkout,
    webhook,
    betaEnvironment,
    betaPolicy,
    enableBeta() {
      state.betaConfigured = true;
      state.gameEnabled = true;
      state.gameBalance = 0;
      state.productId = "coins_500";
      currency = "CO";
      betaEnvironment.COIN_BETA_CHECKOUT_ENABLED = "true";
      const windowNow = Date.now();
      betaEnvironment.COIN_BETA_CHECKOUT_STARTS_AT = new Date(windowNow - 60_000).toISOString();
      betaEnvironment.COIN_BETA_CHECKOUT_ENDS_AT = new Date(windowNow + 29 * 60_000).toISOString();
      betaEnvironment.COIN_BETA_DELIVERY_ENABLED = "true";
    },
    setCurrency(value) {
      currency = value;
    },
  };
}

function historyOrder(orderId, version, createdAt, currency = "CO") {
  return {
    orderId,
    playFabId: "ABC123",
    productId: `${currency.toLowerCase()}_500`,
    expectedAmount: 5000,
    expectedCoins: currency === "CO" ? 500 : 0,
    rewardCurrency: currency,
    rewardAmount: 500,
    currency: "PHP",
    status: "paid",
    createdAt,
    paidAt: createdAt,
    fulfilledAt: null,
    ...(currency === "DI"
      ? { premiumWallet: { ...WALLET, entity: ENTITY } }
      : version === 3
        ? { coinReceiptVersion: 3, gameWallet: GAME_WALLET }
        : {
            coinReceiptVersion: version,
            coinCurrencyCode: "CO",
            ...(version === 2 ? { coinReceipt: RECEIPT } : {}),
          }),
  };
}

const historyRequest = (h, authorized = true) =>
  h.api.handlePaymentsRequest(
    new Request("https://civilcraft.example/api/payments/paymongo/player-orders", {
      headers: authorized ? { Authorization: "Bearer owner-session" } : {},
    }),
  );

test("installed history repairs multiple legacy Coin receipts sequentially under the exclusive account gate", async () => {
  const h = harness();
  h.state.gameInstalled = true;
  h.state.gameEnabled = false; // Repair remains available during wallet maintenance.
  h.state.receiptReadHook = async () => {
    assert.equal(h.state.gateDepth, 1, "Receipt verification must remain inside the account gate");
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(h.state.gateDepth, 1, "Keep the gate while waiting for its receipt provider");
  };
  for (const [id, version, date] of [
    ["legacy-older", 1, "2026-10-01T00:00:00Z"],
    ["legacy-newer", 2, "2026-10-02T00:00:00Z"],
    ["legacy-newest", 2, "2026-10-03T00:00:00Z"],
  ]) {
    h.state.orders.set(id, historyOrder(id, version, date));
    h.state.receipts.add(id);
  }
  const response = await historyRequest(h);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(
    body.orders.map((order) => order.orderId),
    ["legacy-newest", "legacy-newer", "legacy-older"],
  );
  assert.ok(body.orders.every((order) => order.status === "fulfilled"));
  assert.equal(h.state.maxGateDepth, 1);
  assert.equal(h.state.gateDepth, 0);
  assert.equal(h.state.gateEntries, 3);
  assert.deepEqual(h.state.gateEvents, [
    "acquire",
    "release",
    "acquire",
    "release",
    "acquire",
    "release",
  ]);
  assert.equal(h.state.legacyRecords.size, 3);
  assert.equal(h.state.grants, 0, "History must not repeat any classic Coin grant");
  assert.deepEqual(
    h.state.receiptReads.find((input) => input.orderId === "legacy-newer").receipt,
    RECEIPT,
  );
  assert.equal(
    h.state.receiptReads.find((input) => input.orderId === "legacy-older").receipt,
    undefined,
  );
});

test("mixed v1/v2/v3 Coin and Diamond history retains date order and verified-owner-only data", async () => {
  const h = harness();
  h.state.requireAuth = true;
  h.state.gameInstalled = true;
  for (const [id, version, date, currency] of [
    ["legacy-v1", 1, "2026-10-02T00:00:00Z", "CO"],
    ["new-v3", 3, "2026-10-04T00:00:00Z", "CO"],
    ["diamonds", 0, "2026-10-01T00:00:00Z", "DI"],
    ["legacy-v2", 2, "2026-10-03T00:00:00Z", "CO"],
  ]) {
    h.state.orders.set(id, historyOrder(id, version, date, currency));
    if (version === 3) h.state.gameReceipts.add(id);
    else h.state.receipts.add(id);
  }
  h.state.orders.set("other-account", {
    ...historyOrder("other-account", 2, "2026-10-05T00:00:00Z"),
    playFabId: "BAD999",
  });
  const unauthenticated = await historyRequest(h, false);
  assert.equal(unauthenticated.status, 401);
  assert.equal(h.state.receiptReads.length, 0);
  const response = await historyRequest(h);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(
    body.orders.map((order) => order.orderId),
    ["new-v3", "legacy-v2", "legacy-v1", "diamonds"],
  );
  assert.ok(body.orders.every((order) => order.status === "fulfilled"));
  assert.equal(h.state.gateEntries, 2);
  assert.equal(body.orders.find((order) => order.orderId === "diamonds").rewardCurrency, "DI");
  for (const order of body.orders) {
    for (const privateField of [
      "playFabId",
      "premiumWallet",
      "gameWallet",
      "coinReceipt",
      "coinReceiptVersion",
    ])
      assert.equal(Object.hasOwn(order, privateField), false);
  }
});

test("history does not bypass a gate held by another workflow and can retry after its safe release", async () => {
  const h = harness();
  h.state.gameInstalled = true;
  h.state.orders.set("legacy-order", historyOrder("legacy-order", 2, "2026-10-01T00:00:00Z"));
  h.state.receipts.add("legacy-order");
  let release;
  const reserved = new Promise((resolve) => {
    release = resolve;
  });
  const workflow = h.gameWallet.withLegacyCoinGate("ABC123", async () => reserved);
  assert.equal(h.state.gateDepth, 1);
  const blocked = await historyRequest(h);
  assert.equal(blocked.status, 409);
  assert.equal(Object.hasOwn(await blocked.json(), "orders"), false);
  assert.equal(h.state.receiptReads.length, 0);
  assert.equal(h.state.legacyRecords.size, 0);
  assert.equal(h.state.gateDepth, 1, "History cannot release another workflow's gate");
  release();
  await workflow;
  const retry = await historyRequest(h);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).orders[0].status, "fulfilled");
  assert.equal(h.state.gateDepth, 0);
});

test("a failed receipt check returns an error, never partial or falsely verified history", async () => {
  const h = harness();
  h.state.gameInstalled = true;
  for (const [id, date] of [
    ["newer-good", "2026-10-02T00:00:00Z"],
    ["older-unavailable", "2026-10-01T00:00:00Z"],
  ]) {
    h.state.orders.set(id, historyOrder(id, 2, date));
    h.state.receipts.add(id);
  }
  h.state.receiptReadHook = async (input) => {
    if (input.orderId === "older-unavailable")
      throw new ApiError(503, "Receipt provider unavailable");
  };
  const response = await historyRequest(h);
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(Object.hasOwn(body, "orders"), false);
  assert.equal(h.state.orders.get("older-unavailable").status, "paid");
  assert.equal(h.state.grants, 0);
  assert.equal(h.state.gateDepth, 0);
});

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

test("unified Coin checkout binds version3, ignores browser wallet data and never grants classic CO", async () => {
  const h = harness();
  h.state.gameEnabled = true;
  h.setCurrency("CO");
  assert.equal(
    (await h.checkout({ gameLink: "correct-game-token", gameWallet: { databaseId: "forged" } }))
      .status,
    200,
  );
  const order = h.state.orders.get("CC-DATABASE-ORDER");
  assert.equal(order.coinReceiptVersion, 3);
  assert.deepEqual(order.gameWallet, GAME_WALLET);
  assert.equal(order.coinReceipt, undefined);
  assert.equal(order.coinCurrencyCode, undefined);
  assert.equal((await h.webhook()).status, 200);
  assert.equal(h.state.grants, 0);
  assert.equal(h.state.gameGrants, 1);
  assert.equal((await h.webhook()).body.idempotent, true);
  assert.equal(h.state.gameGrants, 1);
});

test("a bound v3 order keeps its wallet after feature rollback and receipt repairs an audit failure", async () => {
  const h = harness();
  h.state.gameEnabled = true;
  h.setCurrency("CO");
  await h.checkout();
  h.state.gameEnabled = false;
  const update = h.orders.updateOrderStatus;
  h.orders.updateOrderStatus = async (id, values) => {
    if (values.status === "fulfilled") throw new ApiError(503, "Audit unavailable");
    return update(id, values);
  };
  assert.equal((await h.webhook()).status, 500);
  assert.equal(h.state.gameGrants, 1);
  h.orders.updateOrderStatus = update;
  assert.equal((await h.webhook()).body.idempotent, true);
  assert.equal(h.state.gameGrants, 1);
  assert.equal(h.state.grants, 0);
});

test("unmigrated, overflowing and mismatched game accounts never start Coin checkout", async () => {
  for (const scenario of ["migration", "overflow", "mismatch", "malformed-link", "database"]) {
    const h = harness();
    h.state.gameEnabled = true;
    h.setCurrency("CO");
    if (scenario === "migration") h.state.gameMigrated = false;
    if (scenario === "overflow") h.state.gameBalance = 2_147_483_647;
    if (scenario === "database") h.state.gameUnavailable = true;
    const extras =
      scenario === "mismatch"
        ? { gameLink: "other-game-token" }
        : scenario === "malformed-link"
          ? { gameLink: 123 }
          : {};
    assert.notEqual((await h.checkout(extras)).status, 200);
    assert.equal(h.state.checkouts, 0);
    assert.equal(h.state.orders.size, 0);
  }
});

test("unified currency display uses account wallet; no import is represented as unavailable, not zero", async () => {
  const h = harness();
  h.state.gameEnabled = true;
  h.state.gameBalance = 1234;
  const read = async () =>
    (
      await h.api.handlePaymentsRequest(
        new Request("https://civilcraft.example/api/player/currencies"),
      )
    ).json();
  assert.deepEqual(await read(), {
    coins: 1234,
    diamonds: 0,
    diamondsAvailable: true,
    coinsAvailable: true,
    coinsMigrationRequired: false,
  });
  h.state.gameMigrated = false;
  assert.deepEqual(await read(), {
    coins: null,
    diamonds: 0,
    diamondsAvailable: true,
    coinsAvailable: false,
    coinsMigrationRequired: true,
  });
});

test("installed wallet maintenance retains its balance and refuses new classic Coin orders", async () => {
  const h = harness();
  h.state.gameInstalled = true;
  h.state.gameEnabled = false;
  h.state.gameBalance = 888;
  h.setCurrency("CO");
  const response = await h.api.handlePaymentsRequest(
    new Request("https://civilcraft.example/api/player/currencies"),
  );
  const balances = await response.json();
  assert.equal(balances.coins, 888);
  assert.equal(balances.coinsAvailable, false);
  assert.equal(balances.coinsMigrationRequired, false);
  assert.equal((await h.checkout()).status, 503);
  assert.equal(h.state.checkouts, 0);
  assert.equal(h.state.orders.size, 0);
});

test("a late legacy payment still receives its overlay while new wallet operations are disabled", async () => {
  const h = harness();
  h.setCurrency("CO");
  await h.checkout();
  h.state.gameInstalled = true;
  h.state.gameEnabled = false;
  assert.equal((await h.webhook()).status, 200);
  assert.equal(h.state.grants, 1);
  assert.equal(h.state.legacyRecords.size, 1);
  assert.equal((await h.webhook()).body.idempotent, true);
  assert.equal(h.state.grants, 1);
  assert.equal(h.state.legacyRecords.size, 1);
});

test("late legacy Coin grant preserves v2 and records credit under the migration gate", async () => {
  const h = harness();
  h.setCurrency("CO");
  await h.checkout();
  const before = structuredClone(h.state.orders.get("CC-DATABASE-ORDER"));
  h.state.gameEnabled = true;
  assert.equal((await h.webhook()).status, 200);
  assert.equal(h.state.grants, 1);
  assert.equal(h.state.gameGrants, 0);
  assert.equal(h.state.legacyRecords.size, 1);
  const after = h.state.orders.get("CC-DATABASE-ORDER");
  assert.deepEqual(after.coinReceipt, before.coinReceipt);
  assert.equal(after.coinReceiptVersion, 2);
});

test("fulfilled legacy order repairs its missing overlay from the permanent old receipt", async () => {
  const h = harness();
  h.setCurrency("CO");
  await h.checkout();
  await h.webhook();
  assert.equal(h.state.legacyRecords.size, 0);
  h.state.gameEnabled = true;
  const response = await h.api.handlePaymentsRequest(
    new Request("https://civilcraft.example/api/payments/paymongo/order?id=CC-DATABASE-ORDER"),
  );
  assert.equal((await response.json()).status, "fulfilled");
  assert.equal(h.state.legacyRecords.size, 1);
  assert.equal(h.state.grants, 1);
  assert.equal((await h.webhook()).body.idempotent, true);
  assert.equal(h.state.grants, 1);
});

test("unknown historic fulfilled Coin grant stays review-only when unified wallet is enabled", async () => {
  const h = harness();
  h.setCurrency("CO");
  await h.checkout();
  const order = h.state.orders.get("CC-DATABASE-ORDER");
  delete order.coinReceiptVersion;
  delete order.coinReceipt;
  order.status = "fulfilled";
  h.state.gameEnabled = true;
  assert.equal((await h.webhook()).status, 500);
  assert.equal(h.state.grants, 0);
  assert.equal(h.state.gameGrants, 0);
  assert.equal(h.state.legacyRecords.size, 0);
  assert.equal(order.fulfillmentReviewRequired, undefined);
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
    gameWallet: GAME_WALLET,
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
    gameWallet: { ...GAME_WALLET, databaseId: "forged" },
    rewardAmount: 900,
  });
  assert.deepEqual(stored.coinReceipt, RECEIPT);
  assert.equal(stored.coinReceiptVersion, 2);
  assert.equal(stored.premiumWallet.databaseId, ID);
  assert.deepEqual(stored.gameWallet, GAME_WALLET);
  assert.equal(stored.rewardAmount, 500);
});

async function duringCoinMaintenance(task) {
  const previous = process.env.COIN_FULFILLMENT_MAINTENANCE;
  process.env.COIN_FULFILLMENT_MAINTENANCE = "true";
  try {
    return await task();
  } finally {
    if (previous === undefined) delete process.env.COIN_FULFILLMENT_MAINTENANCE;
    else process.env.COIN_FULFILLMENT_MAINTENANCE = previous;
  }
}

test("Coin maintenance fences new legacy/v3 checkout without affecting Diamond checkout", async () => {
  await duringCoinMaintenance(async () => {
    for (const enabled of [false, true]) {
      const h = harness();
      h.setCurrency("CO");
      h.state.gameEnabled = enabled;
      assert.equal((await h.checkout()).status, 503);
      assert.equal(h.state.checkouts, 0);
      assert.equal(h.state.orders.size, 0);
    }
    const diamond = harness();
    assert.equal((await diamond.checkout()).status, 200);
    assert.equal(diamond.state.checkouts, 1);
  });
});

test("paid v1/v2/v3 Coin webhooks retry with 503 and no grant, gate, receipt, audit or event acknowledgement", async () => {
  for (const version of [1, 2, 3]) {
    const h = harness();
    h.state.gameEnabled = version === 3;
    h.state.gameInstalled = version !== 3;
    const order = {
      ...historyOrder("CC-DATABASE-ORDER", version, "2026-10-01T00:00:00.000Z"),
      productId: "package",
      PayMongoCheckoutSessionId: "cs_test",
      PayMongoReferenceNumber: "CC-DATABASE-ORDER",
      status: "pending",
    };
    h.state.orders.set(order.orderId, order);
    await duringCoinMaintenance(async () => {
      const result = await h.webhook();
      assert.equal(result.status, 503);
      assert.equal(result.body.success, false);
      assert.equal(h.state.grants, 0);
      assert.equal(h.state.gameGrants, 0);
      assert.equal(h.state.gateEntries, 0);
      assert.equal(h.state.coinReads, 0);
      assert.equal(h.state.receiptReads.length, 0);
      assert.equal(h.state.auditWrites, 0);
      assert.equal(h.state.eventsProcessed, 0);
      assert.deepEqual(h.state.orders.get(order.orderId), order);
    });
    assert.equal((await h.webhook()).status, 200);
    assert.equal((await h.webhook()).status, 200);
    assert.equal(h.state.grants + h.state.gameGrants, 1);
  }
});

test("Coin order/history repair is nonmutating during maintenance, including fulfilled missing overlays", async () => {
  await duringCoinMaintenance(async () => {
    for (const version of [1, 2, 3]) {
      const h = harness();
      h.state.gameInstalled = true;
      const order = {
        ...historyOrder("CC-REPAIR", version, "2026-10-01T00:00:00.000Z"),
        status: "fulfilled",
      };
      h.state.orders.set(order.orderId, order);
      const single = await h.api.handlePaymentsRequest(
        new Request("https://civilcraft.example/api/payments/paymongo/order?id=CC-REPAIR"),
      );
      assert.equal(single.status, 503);
      assert.equal((await historyRequest(h)).status, 503);
      assert.equal(h.state.gateEntries, 0);
      assert.equal(h.state.coinReads, 0);
      assert.equal(h.state.receiptReads.length, 0);
      assert.equal(h.state.auditWrites, 0);
      assert.equal(h.state.legacyRecords.size, 0);
      assert.deepEqual(h.state.orders.get(order.orderId), order);
    }
  });
});

test("Diamond verified payments continue during Coin-only maintenance", async () => {
  const h = harness();
  await h.checkout();
  await duringCoinMaintenance(async () => {
    assert.equal((await h.webhook()).status, 200);
    assert.equal((await h.webhook()).status, 200);
    assert.equal(h.state.grants, 1);
    assert.equal(h.state.orders.get("CC-DATABASE-ORDER").status, "fulfilled");
    assert.equal(h.state.eventsProcessed, 2);
  });
});

test("real checkout API creates a policy-valid beta v3 order and duplicate TEST webhooks credit it once", async () => {
  await duringCoinMaintenance(async () => {
    const h = harness();
    h.enableBeta();
    const balances = await (
      await h.api.handlePaymentsRequest(
        new Request("https://civil-craft.vercel.app/api/player/currencies"),
      )
    ).json();
    assert.equal(balances.coins, 0);
    assert.equal(balances.coinsAvailable, true);
    assert.equal(balances.coinTestCheckout, true);
    assert.deepEqual(balances.coinTestProductIds, ["coins_500"]);
    assert.equal(balances.diamondsAvailable, true);
    assert.equal(
      (await h.checkout({ gameLink: "correct-game-token", gameWallet: { databaseId: "forged" } }))
        .status,
      200,
    );
    const order = h.state.orders.get("CC-DATABASE-ORDER");
    assert.equal(order.coinReceiptVersion, 3);
    assert.equal(order.coinCurrencyCode, "CO");
    assert.equal(order.coinReceipt, undefined);
    assert.equal(order.playFabId, "ABC123");
    assert.equal(order.expectedAmount, 5000);
    assert.equal(order.expectedCoins, 500);
    assert.deepEqual(order.gameWallet, GAME_WALLET);
    assert.deepEqual(order.coinBeta, {
      protocolVersion: 1,
      mode: "test",
      scopeId: "fixture-account-only-test",
      titleId: "17FA03",
      playerId: "ABC123",
      entity: ENTITY,
      productId: "coins_500",
      rewardCurrency: "CO",
      rewardAmount: 500,
      expectedAmount: 5000,
      currency: "PHP",
    });
    assert.doesNotThrow(() => h.betaPolicy.assertCoinOrderDeliveryAllowed(order));
    const beforePayment = await h.api.handlePaymentsRequest(
      new Request(
        "https://civil-craft.vercel.app/api/payments/paymongo/order?id=CC-DATABASE-ORDER",
      ),
    );
    assert.equal((await beforePayment.json()).status, "pending");
    assert.equal(h.state.gameGrants, 0);
    assert.equal((await h.webhook()).status, 200);
    for (const result of await Promise.all([h.webhook(), h.webhook()]))
      assert.equal(result.status, 200);
    assert.equal(h.state.gameGrants, 1);
    assert.equal(h.state.gameReceipts.size, 1);
    assert.equal(h.state.grants, 0);
    assert.equal(h.state.gateEntries, 0);
    assert.equal(h.state.orders.get(order.orderId).status, "fulfilled");
  });
});

test("API beta rejects unapproved account/entity/package/product changes before creating an order or checkout", async () => {
  await duringCoinMaintenance(async () => {
    for (const change of [
      (h) => {
        h.state.authPlayer = "BAD123";
      },
      (h) => {
        h.betaEnvironment.COIN_BETA_ENTITY_ID = "BAD123";
      },
      (h) => {
        h.betaEnvironment.COIN_BETA_TITLE_ID = "BAD123";
      },
      (h) => {
        h.state.productId = "coins_1000";
      },
      (h) => {
        h.state.productOverrides = { amount: 1 };
      },
      (h) => {
        h.state.productOverrides = { rewardAmount: 999, rewardCoins: 999 };
      },
      (h) => {
        h.state.productOverrides = { active: false };
      },
      (h) => {
        h.state.gameMigrated = false;
      },
      (h) => {
        h.state.gameEnabled = false;
      },
      (h) => {
        h.state.gameUnavailable = true;
      },
      (h) => {
        h.state.gameSnapshot = { ...GAME_WALLET, targetId: "c".repeat(64) };
      },
    ]) {
      const h = harness();
      h.enableBeta();
      change(h);
      assert.notEqual((await h.checkout()).status, 200);
      assert.equal(h.state.checkouts, 0);
      assert.equal(h.state.orders.size, 0);
      assert.equal(h.state.gameGrants, 0);
      const response = await h.api.handlePaymentsRequest(
        new Request("https://civil-craft.vercel.app/api/player/currencies"),
      );
      assert.equal(response.status, 200);
      assert.equal((await response.json()).coinsAvailable, false);
    }
  });
});

test("API beta ignores browser prices but refuses a supplied beta marker and admin-only sessions", async () => {
  await duringCoinMaintenance(async () => {
    const h = harness();
    h.enableBeta();
    assert.equal((await h.checkout({ coinBeta: { mode: "test" } })).status, 400);
    assert.equal(h.state.orders.size, 0);
    h.state.requireAuth = true;
    const rejected = await h.api.handlePaymentsRequest(
      new Request("https://civil-craft.vercel.app/api/payments/paymongo/create-checkout", {
        method: "POST",
        headers: { Authorization: "Basic admin-session" },
        body: JSON.stringify({ productId: "coins_500" }),
      }),
    );
    assert.equal(rejected.status, 401);
    assert.equal(h.state.orders.size, 0);
    assert.equal(h.state.checkouts, 0);
  });
});

test("closing beta checkout preserves exact paid v3 delivery but never opens legacy Coin orders", async () => {
  await duringCoinMaintenance(async () => {
    const h = harness();
    h.enableBeta();
    assert.equal((await h.checkout()).status, 200);
    h.betaEnvironment.COIN_BETA_CHECKOUT_ENABLED = "false";
    h.state.gameEnabled = false;
    h.state.gameInstalled = true;
    const response = await h.api.handlePaymentsRequest(
      new Request("https://civil-craft.vercel.app/api/player/currencies"),
    );
    assert.equal((await response.json()).coinsAvailable, false);
    assert.equal((await h.checkout()).status, 503);
    assert.equal(h.state.checkouts, 1);
    assert.equal((await h.webhook()).status, 200);
    assert.equal((await h.webhook()).status, 200);
    assert.equal(h.state.gameGrants, 1);
    assert.equal(h.state.grants, 0);
    const legacy = {
      ...h.state.orders.get("CC-DATABASE-ORDER"),
      coinReceiptVersion: 2,
      coinBeta: undefined,
      gameWallet: undefined,
      coinReceipt: RECEIPT,
    };
    await assert.rejects(h.fulfillment.repairPaymentOrder(legacy), (error) => error.status === 503);
    assert.equal(h.state.grants, 0);
    assert.equal(h.state.gateEntries, 0);
  });
});

test("unpaid/failed beta checkout and owner polling cannot grant; true verified late payment can still deliver", async () => {
  await duringCoinMaintenance(async () => {
    const h = harness();
    h.enableBeta();
    await h.checkout();
    assert.notEqual((await h.webhook({ payment: { status: "failed" } })).status, 200);
    assert.equal(h.state.gameGrants, 0);
    assert.equal(h.state.gameReceipts.size, 0);
    h.state.orders.get("CC-DATABASE-ORDER").status = "cancelled";
    const pending = await h.api.handlePaymentsRequest(
      new Request(
        "https://civil-craft.vercel.app/api/payments/paymongo/order?id=CC-DATABASE-ORDER",
      ),
    );
    assert.equal((await pending.json()).status, "cancelled");
    assert.equal(h.state.gameGrants, 0);
    assert.equal((await h.webhook()).status, 200);
    assert.equal(h.state.gameGrants, 1);
  });
});
