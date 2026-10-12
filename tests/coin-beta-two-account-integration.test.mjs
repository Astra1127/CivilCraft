import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { before, after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import ts from "typescript";
import * as catalog from "../src/lib/game-wallet/catalog.server.ts";

// Disposable in-memory PostgreSQL only. Real policy, API, signature verification,
// wallet service, restricted database adapter and installed wallet SQL are used.
// Authentication, PlayFab Entity resolution, audit storage and the provider's
// network are fixtures. No actual account/key/.env, browser or external API is used.
const TITLE = "17FA03";
const A = "ABC123";
const B = "ABC456";
const C = "ABC789";
const D = "ABC999";
const ENTITIES = {
  [A]: { Id: "FACE123", Type: "title_player_account" },
  [B]: { Id: "FACE456", Type: "title_player_account" },
  [C]: { Id: "FACE789", Type: "title_player_account" },
  [D]: { Id: "FACE999", Type: "title_player_account" },
};
const WEBHOOK_SECRET = "fixture_webhook_not_a_key";
const TARGET = crypto.createHash("sha256").update("two-account-memory-fixture").digest("hex");
const plain = (value) => JSON.parse(JSON.stringify(value));
let db, databaseId;
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function load(path, mocks = {}, environment = {}) {
  const source = readFileSync(new URL(`../src/lib/${path}`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
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
      fetch() {
        throw new Error("External network is forbidden in this fixture");
      },
      require(name) {
        if (Object.hasOwn(mocks, name)) return mocks[name];
        if (name === "node:crypto") return crypto;
        throw new Error(`Unexpected isolated dependency: ${name}`);
      },
    },
    { filename: path },
  );
  return exports;
}
const sqlCall = async (name, args) =>
  (
    await db.query(
      `SELECT * FROM civilcraft_game_wallet_v3.${name}(${args.map((_, i) => `$${i + 1}`).join(",")})`,
      args,
    )
  ).rows;
const identity = (player) => [
  databaseId,
  TITLE,
  player,
  ENTITIES[player].Id,
  "title_player_account",
];
before(async () => {
  db = await PGlite.create();
  await db.exec(readFileSync(new URL("../database/currency-schema.sql", import.meta.url), "utf8"));
  await db.exec(readFileSync(new URL("../database/game-wallet-v3.sql", import.meta.url), "utf8"));
  databaseId = (await db.query("SELECT database_id FROM civilcraft_currency.installation")).rows[0]
    .database_id;
  await db.exec(
    "CREATE ROLE two_beta_fixture LOGIN; GRANT civilcraft_currency_app,civilcraft_game_wallet_app TO two_beta_fixture; SET SESSION AUTHORIZATION two_beta_fixture",
  );
  for (const [player, gold] of [
    [A, 1000],
    [B, 0],
    [C, 57113],
  ]) {
    const owner = crypto.randomUUID();
    assert.equal(
      (await sqlCall("gate_acquire", [...identity(player), owner, "import"]))[0].acquired,
      true,
    );
    await sqlCall("import_wallet", [
      ...identity(player),
      owner,
      gold,
      0,
      catalog.digest(player),
      "[]",
      "[]",
      "[]",
    ]);
    await sqlCall("gate_release", [...identity(player), owner]);
  }
});
after(async () => {
  await db?.close();
});
async function balances() {
  return Object.fromEntries(
    await Promise.all(
      [A, B].map(async (player) => [
        player,
        Number((await sqlCall("wallet_balance", identity(player)))[0].coins),
      ]),
    ),
  );
}
async function paymentRows(orderId) {
  await db.exec("SET SESSION AUTHORIZATION postgres");
  try {
    return (
      await db.query(
        "SELECT player_id,amount,fingerprint FROM civilcraft_game_wallet_v3.ledger WHERE entry_id='payment:'||$1 AND kind='payment'",
        [orderId],
      )
    ).rows;
  } finally {
    await db.exec("SET SESSION AUTHORIZATION two_beta_fixture");
  }
}
test("additional account checkout, unpaid and duplicate paid delivery remain isolated after closure", async () => {
  const h = harness();
  enableSecond(h.environment);
  const entry = {
    scopeId: "fixture-third",
    playerId: C,
    entityId: ENTITIES[C].Id,
    checkoutEnabled: true,
    deliveryEnabled: true,
  };
  const pending = {
    scopeId: "fixture-unmigrated",
    playerId: D,
    entityId: ENTITIES[D].Id,
    checkoutEnabled: true,
    deliveryEnabled: true,
  };
  h.environment.COIN_BETA_ADDITIONAL_ACCOUNTS = JSON.stringify([entry, pending]);
  const before = await balances();
  const coinBefore = Number((await sqlCall("wallet_balance", identity(C)))[0].coins);
  assert.equal((await h.checkout(D)).status, 409);
  assert.equal(h.state.checkouts, 0);
  const owner = crypto.randomUUID();
  await sqlCall("gate_acquire", [...identity(D), owner, "import"]);
  try {
    assert.equal((await h.checkout(D)).status, 409);
  } finally {
    await sqlCall("gate_release", [...identity(D), owner]);
  }
  const response = await h.checkout(C);
  assert.equal(response.status, 200);
  const { orderId } = await response.json();
  assert.equal(h.state.orders.get(orderId).coinBeta.scopeId, entry.scopeId);
  assert.equal((await h.request(A, `/api/payments/paymongo/order?id=${orderId}`)).status, 404);
  const failed = h.event(orderId, { status: "failed" });
  h.state.providerSession = failed.data.attributes.data;
  assert.equal((await h.webhook(failed)).status, 400);
  assert.deepEqual(await paymentRows(orderId), []);
  assert.equal(Number((await sqlCall("wallet_balance", identity(C)))[0].coins), coinBefore);
  h.environment.COIN_BETA_CHECKOUT_ENABLED = "false";
  h.environment.COIN_BETA_ADDITIONAL_ACCOUNTS = JSON.stringify([
    { ...entry, checkoutEnabled: false },
    pending,
  ]);
  assert.equal((await h.checkout(C)).status, 503);
  h.state.failFulfilledOnce = true;
  assert.equal((await h.webhook(h.event(orderId))).status, 500);
  assert.equal((await h.webhook(h.event(orderId))).body.idempotent, true);
  assert.equal((await h.webhook(h.event(orderId))).body.idempotent, true);
  assert.equal(Number((await sqlCall("wallet_balance", identity(C)))[0].coins), coinBefore + 500);
  assert.equal((await paymentRows(orderId)).length, 1);
  assert.deepEqual(await balances(), before);
});

function enableSecond(environment) {
  Object.assign(environment, {
    COIN_BETA_SECOND_CHECKOUT_ENABLED: "true",
    COIN_BETA_SECOND_DELIVERY_ENABLED: "true",
    COIN_BETA_SECOND_SCOPE_ID: "fixture-second-test-scope",
    COIN_BETA_SECOND_PLAYER_ID: B,
    COIN_BETA_SECOND_ENTITY_ID: ENTITIES[B].Id,
  });
}
function harness(existingOrders = new Map()) {
  const now = Date.now();
  const environment = {
    COIN_FULFILLMENT_MAINTENANCE: "true",
    COIN_BETA_CHECKOUT_ENABLED: "true",
    COIN_BETA_CHECKOUT_STARTS_AT: new Date(now - 60_000).toISOString(),
    COIN_BETA_CHECKOUT_ENDS_AT: new Date(now + 29 * 60_000).toISOString(),
    COIN_BETA_DELIVERY_ENABLED: "true",
    COIN_BETA_SCOPE_ID: "fixture-original-test-scope",
    COIN_BETA_TITLE_ID: TITLE,
    COIN_BETA_PLAYER_ID: A,
    COIN_BETA_ENTITY_ID: ENTITIES[A].Id,
    PAYMONGO_SECRET_KEY: "sk_test_fixture_not_a_key",
    PAYMONGO_WEBHOOK_SECRET: WEBHOOK_SECRET,
    PUBLIC_APP_URL: "https://civil-craft.vercel.app",
    NODE_ENV: "production",
  };
  const config = {
    storage: "postgres",
    namespace: "civilcraft_game_wallet_v3",
    databaseId,
    targetId: TARGET,
    protocolVersion: 3,
  };
  const state = {
    orders: existingOrders,
    checkouts: 0,
    auditUpdates: [],
    events: [],
    providerReads: [],
    providerSession: null,
    failFulfilledOnce: false,
    expireWindowDuringSave: false,
    gameEnabled: true,
  };
  const admin = {
    AdminApiError: ApiError,
    adminGameConfig: () => ({ titleId: TITLE }),
    object: (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {}),
  };
  const configMock = {
    isGameWalletEnabled: () => state.gameEnabled,
    isGameWalletInstalled: () => true,
    gameWalletConfig: () => config,
    requireGameWalletReady: () => {
      if (!state.gameEnabled) throw new ApiError(503, "Wallet feature is disabled");
      return config;
    },
    requireGameWalletSettlementReady: () => config,
  };
  const database = load("game-wallet/database.server.ts", {
    "../playfab/admin-client.server.ts": admin,
    "../payments/currency-database.server.ts": {
      currencyDatabaseConnection: () => ({
        unsafe: async (query, args) => (await db.query(query, args)).rows,
      }),
    },
    "./config.server.ts": configMock,
    "./types.ts": { MAX_GAME_COINS: 2147483647 },
    "./gate-context.server.ts": {
      markGameWalletImportAttempted: () => assert.fail("Unexpected import"),
    },
  });
  const products = load("payments/products.ts");
  const maintenance = load(
    "payments/coin-maintenance.server.ts",
    { "../playfab/admin-client.server.ts": admin },
    environment,
  );
  const provider = load("payments/paymongo.server.ts", {}, environment);
  const policy = load(
    "payments/coin-beta.server.ts",
    {
      "../playfab/admin-client.server.ts": admin,
      "../game-wallet/config.server.ts": configMock,
      "./coin-maintenance.server.ts": maintenance,
      "./paymongo.server.ts": provider,
      "./products.ts": products,
    },
    environment,
  );
  const orders = {
    generateOrderId: () => `CC-COINS-FIXTURE-${crypto.randomUUID()}`,
    getOrder: async (id) => (state.orders.has(id) ? plain(state.orders.get(id)) : null),
    saveOrder: async (order) => {
      state.orders.set(order.orderId, plain(order));
      if (state.expireWindowDuringSave)
        environment.COIN_BETA_CHECKOUT_ENDS_AT = new Date(Date.now()).toISOString();
    },
    updateOrderStatus: async (id, updates) => {
      if (updates.status === "fulfilled" && state.failFulfilledOnce) {
        state.failFulfilledOnce = false;
        throw new ApiError(503, "Fixture audit unavailable after credit");
      }
      state.auditUpdates.push(plain(updates));
      const next = { ...state.orders.get(id), ...plain(updates) };
      state.orders.set(id, next);
      return plain(next);
    },
    markEventProcessed: async (event, orderId) => state.events.push({ event, orderId }),
    listOrdersForPlayer: async (player) =>
      [...state.orders.values()].filter((order) => order.playFabId === player).map(plain),
  };
  const premium = {
    resolvePremiumEntity: async (player) => {
      const entity = ENTITIES[player];
      if (!entity) return { Id: "BAD999", Type: "title_player_account" };
      return plain(entity);
    },
    requireDiamondCheckoutReady: () => ({}),
    getDiamondBalance: async () => 0,
    grantDiamonds: () => assert.fail("Unexpected Diamond credit"),
    hasDiamondReceipt: () => assert.fail("Unexpected Diamond receipt"),
  };
  const legacy = {
    withAccountGate: () => assert.fail("Unexpected migration or legacy gate"),
    legacyOpeningSnapshot: () => assert.fail("Unexpected legacy opening"),
    GateBeforeMutationError: class extends Error {},
  };
  const game = load("game-wallet/service.server.ts", {
    "../playfab/admin-client.server.ts": admin,
    "../playfab/premium-wallet.server.ts": premium,
    "../payments/products.ts": products,
    "../payments/orders.server.ts": orders,
    "../payments/coin-beta.server.ts": policy,
    "./config.server.ts": configMock,
    "./database.server.ts": database,
    "./catalog.server.ts": catalog,
    "./legacy.server.ts": legacy,
    "./types.ts": { MAX_GAME_COINS: 2147483647 },
  });
  const paymentProvider = {
    ...provider,
    createPayMongoCheckout: async ({ orderId }) => {
      state.checkouts++;
      return {
        referenceNumber: orderId,
        checkoutId: `cs_${crypto.randomUUID()}`,
        checkoutUrl: "https://checkout.paymongo.com/fixture",
      };
    },
    retrievePayMongoCheckout: async (id) => {
      state.providerReads.push(id);
      if (!state.providerSession) throw new ApiError(503, "Fixture provider unavailable");
      return plain(state.providerSession);
    },
  };
  const coin = {
    CoinGrantReviewRequired: class extends ApiError {},
    getCoinReceiptStatus: () => assert.fail("Unexpected classic receipt read"),
    grantCoinsOnce: () => assert.fail("Unexpected classic credit"),
  };
  const mocks = {
    "../playfab/admin-client.server.ts": admin,
    "../playfab/premium-wallet.server.ts": premium,
    "./products.ts": products,
    "./orders.server.ts": orders,
    "./paymongo.server.ts": paymentProvider,
    "./coin-maintenance.server.ts": maintenance,
    "./coin-beta.server.ts": policy,
    "./coin-receipts.server.ts": coin,
    "../game-wallet/index.server.ts": { ...game, ...configMock },
  };
  const fulfillment = load("payments/fulfillment.server.ts", mocks, environment);
  const api = load(
    "payments/api.server.ts",
    {
      ...mocks,
      "./fulfillment.server.ts": fulfillment,
      "./products.server.ts": {
        getProductById: async (id) =>
          id === "coins_500" ? { ...plain(products.COINS_500), active: true } : null,
        listActiveProducts: async () => [],
      },
      "./player-auth.server.ts": {
        authenticatePaymentPlayer: async (request) => {
          const ticket = request.headers.get("Authorization");
          if (![A, B, C, D].some((player) => ticket === `Bearer fixture-${player}`))
            throw new ApiError(401, "Player sign-in is required.");
          return { playFabId: ticket.slice("Bearer fixture-".length) };
        },
      },
    },
    environment,
  );
  const request = (player, path, body) =>
    api.handlePaymentsRequest(
      new Request(`https://civil-craft.vercel.app${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Bearer fixture-${player}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
  const checkout = (player, extra = {}) =>
    request(player, "/api/payments/paymongo/create-checkout", { productId: "coins_500", ...extra });
  const event = (orderId, payment = {}) => {
    const order = state.orders.get(orderId);
    return {
      data: {
        id: `evt_${crypto.randomUUID()}`,
        type: "event",
        attributes: {
          type: "checkout_session.payment.paid",
          livemode: false,
          data: {
            id: order.PayMongoCheckoutSessionId,
            type: "checkout_session",
            attributes: {
              livemode: false,
              reference_number: order.orderId,
              metadata: { orderId, productId: order.productId, playFabId: order.playFabId },
              payments: [
                {
                  id: "pay_fixture",
                  type: "payment",
                  attributes: {
                    status: "paid",
                    amount: 5000,
                    currency: "PHP",
                    livemode: false,
                    ...payment,
                  },
                },
              ],
            },
          },
        },
      },
    };
  };
  const webhook = async (payload, signed = true) => {
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(`${timestamp}.${body}`)
      .digest("hex");
    return fulfillment.processPayMongoWebhook(
      body,
      signed ? `t=${timestamp},te=${signature}` : null,
    );
  };
  return { state, environment, policy, request, checkout, event, webhook, game, config };
}

test("two-account checkout stays closed while verified balances remain readable", async () => {
  const h = harness();
  enableSecond(h.environment);
  h.environment.COIN_BETA_CHECKOUT_ENABLED = "false";
  h.environment.COIN_BETA_SECOND_CHECKOUT_ENABLED = "false";
  const before = await balances();
  for (const player of [A, B]) {
    const response = await h.request(player, "/api/player/currencies");
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.coins, before[player]);
    assert.equal(data.diamonds, 0);
    assert.equal(data.coinsAvailable, false);
    assert.equal(data.coinTestCheckout, undefined);
    assert.equal((await h.checkout(player)).status, 503);
  }
  assert.equal(h.state.orders.size, 0);
  assert.equal(h.state.checkouts, 0);
  assert.deepEqual(await balances(), before);
});

test("deadline closes both account APIs while accepted signed payments still settle once", async () => {
  const h = harness();
  enableSecond(h.environment);
  const before = await balances();
  const accepted = [];
  for (const player of [A, B]) {
    const response = await h.checkout(player);
    assert.equal(response.status, 200);
    accepted.push([player, (await response.json()).orderId]);
  }
  h.environment.COIN_BETA_CHECKOUT_ENDS_AT = new Date(Date.now() - 1).toISOString();
  for (const player of [A, B]) {
    assert.equal((await h.checkout(player)).status, 503);
    const data = await (await h.request(player, "/api/player/currencies")).json();
    assert.equal(data.coins, before[player]);
    assert.equal(data.coinsAvailable, false);
    assert.equal(data.coinTestCheckout, undefined);
  }
  assert.equal(h.state.checkouts, 2);
  for (const [player, id] of accepted) {
    const paid = h.event(id);
    assert.equal((await h.webhook(paid)).status, 200);
    assert.equal((await h.webhook(paid)).status, 200);
    const rows = await paymentRows(id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].player_id, player);
    assert.equal(Number(rows[0].amount), 500);
  }
  assert.deepEqual(await balances(), { [A]: before[A] + 500, [B]: before[B] + 500 });
});

test("expiry during awaited order storage prevents any provider checkout or currency credit", async () => {
  const h = harness();
  enableSecond(h.environment);
  const before = await balances();
  h.state.expireWindowDuringSave = true;
  assert.equal((await h.checkout(B)).status, 503);
  assert.equal(h.state.checkouts, 0);
  assert.equal(h.state.orders.size, 1);
  for (const order of h.state.orders.values()) {
    assert.equal(order.status, "pending");
    assert.equal(order.PayMongoCheckoutSessionId, null);
    assert.equal((await paymentRows(order.orderId)).length, 0);
  }
  assert.deepEqual(await balances(), before);
});

test("old A and new B signed payments credit each wallet once despite duplicate delivery and closure", async () => {
  const h = harness();
  const before = await balances();
  const first = await (await h.checkout(A)).json();
  const original = plain(h.state.orders.get(first.orderId));
  enableSecond(h.environment);
  const secondResponse = await h.checkout(B, {
    playFabId: A,
    price: 1,
    rewardAmount: 999999,
    gameWallet: { entity: ENTITIES[A] },
  });
  assert.equal(secondResponse.status, 200);
  const second = await secondResponse.json();
  const secondOrder = h.state.orders.get(second.orderId);
  assert.equal(secondOrder.playFabId, B);
  assert.deepEqual(secondOrder.coinBeta.entity, ENTITIES[B]);
  assert.equal(secondOrder.coinBeta.scopeId, "fixture-second-test-scope");
  assert.equal(secondOrder.expectedCoins, 500);
  assert.equal(secondOrder.expectedAmount, 5000);
  assert.deepEqual(secondOrder.gameWallet.entity, ENTITIES[B]);
  assert.deepEqual(h.state.orders.get(first.orderId), original);
  assert.equal(
    (await h.request(A, `/api/payments/paymongo/order?id=${second.orderId}`)).status,
    404,
  );
  assert.deepEqual(
    (await (await h.request(A, "/api/payments/paymongo/player-orders")).json()).orders.map(
      (order) => order.orderId,
    ),
    [first.orderId],
  );
  assert.deepEqual(await balances(), before);
  h.environment.COIN_BETA_CHECKOUT_ENABLED = "false";
  h.environment.COIN_BETA_SECOND_CHECKOUT_ENABLED = "false";
  const events = [h.event(first.orderId), h.event(second.orderId)];
  const results = await Promise.all(
    events.flatMap((event) => [h.webhook(event), h.webhook(event)]),
  );
  assert.ok(results.every((result) => result.status === 200));
  assert.deepEqual(await balances(), { [A]: before[A] + 500, [B]: before[B] + 500 });
  for (const [player, orderId] of [
    [A, first.orderId],
    [B, second.orderId],
  ]) {
    const rows = await paymentRows(orderId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].player_id, player);
    assert.equal(Number(rows[0].amount), 500);
    assert.equal(
      rows[0].fingerprint,
      catalog.digest({
        protocol: 3,
        titleId: TITLE,
        orderId,
        player,
        amount: 500,
        snapshot: h.state.orders.get(orderId).gameWallet,
        coinBeta: h.state.orders.get(orderId).coinBeta,
      }),
    );
    for (let retry = 0; retry < 3; retry++)
      assert.equal(
        (await (await h.request(player, `/api/payments/paymongo/order?id=${orderId}`)).json())
          .status,
        "fulfilled",
      );
  }
  const reloaded = harness(h.state.orders);
  enableSecond(reloaded.environment);
  reloaded.environment.COIN_BETA_CHECKOUT_ENABLED = "false";
  reloaded.state.gameEnabled = false;
  for (const [player, orderId] of [
    [A, first.orderId],
    [B, second.orderId],
  ]) {
    assert.equal(
      (await (await reloaded.request(player, `/api/payments/paymongo/order?id=${orderId}`)).json())
        .status,
      "fulfilled",
    );
    assert.equal((await reloaded.webhook(reloaded.event(orderId))).body.idempotent, true);
  }
  assert.deepEqual(await balances(), { [A]: before[A] + 500, [B]: before[B] + 500 });
  assert.deepEqual(h.state.orders.get(first.orderId).coinBeta, original.coinBeta);
});

test("B unpaid/cancelled polling gives no credit; independently verified late paid evidence settles once", async () => {
  const h = harness();
  enableSecond(h.environment);
  const before = await balances();
  const { orderId } = await (await h.checkout(B)).json();
  h.state.orders.get(orderId).status = "cancelled";
  for (let retry = 0; retry < 3; retry++)
    assert.equal(
      (await (await h.request(B, `/api/payments/paymongo/order?id=${orderId}`)).json()).status,
      "cancelled",
    );
  const failed = h.event(orderId, { status: "failed" });
  h.state.providerSession = failed.data.attributes.data;
  assert.equal((await h.webhook(failed)).status, 400);
  assert.deepEqual(await balances(), before);
  assert.deepEqual(await paymentRows(orderId), []);
  h.environment.COIN_BETA_CHECKOUT_ENABLED = "false";
  assert.equal((await h.webhook(h.event(orderId))).status, 200);
  assert.equal((await h.webhook(h.event(orderId))).body.idempotent, true);
  assert.deepEqual(await balances(), { [A]: before[A], [B]: before[B] + 500 });
  assert.equal((await paymentRows(orderId)).length, 1);
});

test("B wrong account/live/unsigned confirmation cannot create either payment receipt", async () => {
  const h = harness();
  enableSecond(h.environment);
  const before = await balances();
  const { orderId } = await (await h.checkout(B)).json();
  const wrong = h.event(orderId);
  wrong.data.attributes.data.attributes.metadata.playFabId = A;
  assert.equal((await h.webhook(wrong)).status, 400);
  assert.equal((await h.webhook(h.event(orderId, { livemode: true }))).status, 400);
  assert.equal((await h.webhook(h.event(orderId), false)).status, 400);
  assert.deepEqual(await balances(), before);
  assert.deepEqual(await paymentRows(orderId), []);
  assert.equal(h.state.events.length, 0);
});

test("B credit survives a failed audit write; retry repairs status without another SQL credit", async () => {
  const h = harness();
  enableSecond(h.environment);
  const before = await balances();
  const { orderId } = await (await h.checkout(B)).json();
  h.state.failFulfilledOnce = true;
  assert.equal((await h.webhook(h.event(orderId))).status, 500);
  assert.equal(h.state.orders.get(orderId).status, "paid");
  assert.deepEqual(await balances(), { [A]: before[A], [B]: before[B] + 500 });
  assert.equal((await paymentRows(orderId)).length, 1);
  h.environment.COIN_BETA_SECOND_CHECKOUT_ENABLED = "false";
  assert.equal((await h.webhook(h.event(orderId))).body.idempotent, true);
  assert.equal(h.state.orders.get(orderId).status, "fulfilled");
  assert.deepEqual(await balances(), { [A]: before[A], [B]: before[B] + 500 });
  assert.equal((await paymentRows(orderId)).length, 1);
});

test("B preflight rejects forged scope, crossed resolved Entity and secondary closure before provider checkout", async () => {
  for (const change of [
    (h) => {
      h.environment.COIN_BETA_SECOND_ENTITY_ID = "BAD999";
    },
    (h) => {
      h.environment.COIN_BETA_SECOND_ENTITY_ID = ENTITIES[A].Id;
    },
    (h) => {
      h.environment.COIN_BETA_SECOND_SCOPE_ID = h.environment.COIN_BETA_SCOPE_ID;
    },
    (h) => {
      h.environment.COIN_BETA_SECOND_CHECKOUT_ENABLED = "false";
    },
    (h) => {
      h.environment.COIN_BETA_SECOND_DELIVERY_ENABLED = "false";
    },
  ]) {
    const h = harness();
    enableSecond(h.environment);
    change(h);
    assert.equal((await h.checkout(B)).status, 503);
    assert.equal(h.state.orders.size, 0);
    assert.equal(h.state.checkouts, 0);
    assert.equal((await h.request(A, "/api/player/currencies")).status, 200);
    assert.equal(
      (await (await h.request(A, "/api/player/currencies")).json()).coinsAvailable,
      true,
    );
  }
  const h = harness();
  enableSecond(h.environment);
  assert.equal(
    (await h.checkout(B, { coinBeta: { scopeId: h.environment.COIN_BETA_SCOPE_ID } })).status,
    400,
  );
  assert.equal(
    (
      await h.request("BAD999", "/api/payments/paymongo/create-checkout", {
        productId: "coins_500",
      })
    ).status,
    401,
  );
  assert.equal(h.state.checkouts, 0);
  assert.equal(h.state.orders.size, 0);
});
