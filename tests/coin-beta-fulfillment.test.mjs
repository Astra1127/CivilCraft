import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Fictional identities/configuration only; all provider and wallet I/O is mocked.
const TITLE = "F00D01";
const PLAYER = "ABC123";
const ENTITY = { Id: "FACE123", Type: "title_player_account" };
const SECRET = "whsk_fixture_coin_beta";
const CONFIG = {
  storage: "postgres",
  namespace: "civilcraft_game_wallet_v3",
  databaseId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  targetId: "b".repeat(64),
  protocolVersion: 3,
};
const SNAPSHOT = { ...CONFIG, entity: ENTITY };
const BINDING = {
  protocolVersion: 1,
  mode: "test",
  scopeId: "fixture-account-only-test",
  titleId: TITLE,
  playerId: PLAYER,
  entity: ENTITY,
  productId: "coins_500",
  rewardCurrency: "CO",
  rewardAmount: 500,
  expectedAmount: 5000,
  currency: "PHP",
};
const SECOND_ENTITY = { Id: "FACE456", Type: "title_player_account" };
const SECOND_BINDING = {
  ...BINDING,
  scopeId: "fixture-second-account-test",
  playerId: "ABC456",
  entity: SECOND_ENTITY,
};
const SECOND_SNAPSHOT = { ...CONFIG, entity: SECOND_ENTITY };
function enableSecond(environment) {
  Object.assign(environment, {
    COIN_BETA_SECOND_CHECKOUT_ENABLED: "true",
    COIN_BETA_SECOND_DELIVERY_ENABLED: "true",
    COIN_BETA_SECOND_SCOPE_ID: SECOND_BINDING.scopeId,
    COIN_BETA_SECOND_PLAYER_ID: SECOND_BINDING.playerId,
    COIN_BETA_SECOND_ENTITY_ID: SECOND_ENTITY.Id,
  });
}
const plain = (value) => JSON.parse(JSON.stringify(value));
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const admin = {
  AdminApiError: ApiError,
  adminGameConfig: () => ({ titleId: TITLE, secret: "fixture_admin_not_a_key" }),
  object: (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {}),
};

/** Exercise real policy/fulfillment/signature source without credentials or network. */
function load(file, mocks = {}, environment = {}) {
  const source = readFileSync(new URL(`../src/lib/${file}`, import.meta.url), "utf8");
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
      if (name.endsWith("cohort.server.ts") && !Object.hasOwn(mocks, name))
        return {
          newAccountCohortConfig: () => null,
          prepareAccountCoinAuthority: () =>
            assert.fail("Cohort enrollment is not enabled in this legacy fixture"),
        };
      if (name === "node:crypto") return crypto;
      if (Object.hasOwn(mocks, name)) return mocks[name];
      throw new Error(`Unexpected isolated dependency: ${name}`);
    },
  });
  return exports;
}

function sign(body) {
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = crypto.createHmac("sha256", SECRET).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},te=${digest}`;
}

function fixtureOrder(binding = BINDING, snapshot = SNAPSHOT) {
  return {
    orderId: "CC-COINS-FIXTURE-BETA",
    playFabId: binding.playerId,
    productId: "coins_500",
    expectedAmount: 5000,
    currency: "PHP",
    expectedCoins: 500,
    rewardCurrency: "CO",
    rewardAmount: 500,
    coinCurrencyCode: "CO",
    coinReceiptVersion: 3,
    coinBeta: plain(binding),
    gameWallet: plain(snapshot),
    PayMongoCheckoutSessionId: "cs_fixture_beta",
    PayMongoReferenceNumber: "CC-COINS-FIXTURE-BETA",
    status: "pending",
    createdAt: "2026-01-01T00:00:00Z",
    paidAt: null,
    fulfilledAt: null,
    webhookEventId: null,
  };
}

function harness({ second = false } = {}) {
  const binding = second ? SECOND_BINDING : BINDING;
  const snapshot = second ? SECOND_SNAPSHOT : SNAPSHOT;
  const environment = {
    COIN_FULFILLMENT_MAINTENANCE: "true",
    COIN_BETA_CHECKOUT_ENABLED: "true",
    COIN_BETA_CHECKOUT_STARTS_AT: new Date(Date.now() - 60_000).toISOString(),
    COIN_BETA_CHECKOUT_ENDS_AT: new Date(Date.now() + 29 * 60_000).toISOString(),
    COIN_BETA_DELIVERY_ENABLED: "true",
    COIN_BETA_SCOPE_ID: BINDING.scopeId,
    COIN_BETA_TITLE_ID: TITLE,
    COIN_BETA_PLAYER_ID: PLAYER,
    COIN_BETA_ENTITY_ID: ENTITY.Id,
    PAYMONGO_SECRET_KEY: "sk_test_fixture_not_a_real_key",
    PAYMONGO_WEBHOOK_SECRET: SECRET,
    PUBLIC_APP_URL: "https://civil-craft.vercel.app",
    NODE_ENV: "production",
  };
  if (second) enableSecond(environment);
  const products = load("payments/products.ts");
  const maintenance = load(
    "payments/coin-maintenance.server.ts",
    { "../playfab/admin-client.server.ts": admin },
    environment,
  );
  const paymongo = load("payments/paymongo.server.ts", {}, environment);
  const policy = load(
    "payments/coin-beta.server.ts",
    {
      "../playfab/admin-client.server.ts": admin,
      "../game-wallet/config.server.ts": {
        requireGameWalletReady: () => CONFIG,
        requireGameWalletSettlementReady: () => CONFIG,
      },
      "./paymongo.server.ts": paymongo,
      "./coin-maintenance.server.ts": maintenance,
      "./products.ts": products,
    },
    environment,
  );
  const state = {
    order: fixtureOrder(binding, snapshot),
    receipt: false,
    credits: [],
    auditWrites: [],
    events: [],
    retrievals: [],
    orderReads: 0,
    gameRepairs: 0,
    legacyReads: 0,
    legacyGrants: 0,
    legacyGates: 0,
    legacyOverlays: 0,
    diamondGrants: 0,
    verifiedCheckout: undefined,
    failFulfilledOnce: false,
  };
  const assertDestination = (order) => {
    assert.equal(order.orderId, state.order.orderId);
    assert.equal(order.playFabId, binding.playerId);
    assert.equal(order.expectedCoins, 500);
    assert.deepEqual(plain(order.gameWallet), snapshot);
    assert.deepEqual(plain(order.coinBeta), binding);
  };
  const update = async (id, updates) => {
    assert.equal(id, state.order.orderId);
    state.auditWrites.push(plain(updates));
    if (updates.status === "fulfilled" && state.failFulfilledOnce) {
      state.failFulfilledOnce = false;
      throw new ApiError(503, "Fixture audit store unavailable");
    }
    state.order = { ...state.order, ...plain(updates) };
    return plain(state.order);
  };
  const api = load(
    "payments/fulfillment.server.ts",
    {
      "../playfab/admin-client.server.ts": admin,
      "../playfab/premium-wallet.server.ts": {
        grantDiamonds: async () => {
          state.diamondGrants++;
          return { alreadyGranted: false };
        },
        hasDiamondReceipt: async () => false,
      },
      "./products.ts": products,
      "./coin-maintenance.server.ts": maintenance,
      "./coin-beta.server.ts": policy,
      "./orders.server.ts": {
        getOrder: async (id) => {
          state.orderReads++;
          return id === state.order.orderId ? plain(state.order) : null;
        },
        updateOrderStatus: update,
        markEventProcessed: async (event, id) => state.events.push({ event, id }),
      },
      "./paymongo.server.ts": {
        verifyPayMongoSignature: paymongo.verifyPayMongoSignature,
        retrievePayMongoCheckout: async (id) => {
          state.retrievals.push(id);
          if (!state.verifiedCheckout) throw new ApiError(503, "Fixture provider unavailable");
          return plain(state.verifiedCheckout);
        },
      },
      "./coin-receipts.server.ts": {
        CoinGrantReviewRequired: class extends ApiError {},
        getCoinReceiptStatus: async () => {
          state.legacyReads++;
          return "absent";
        },
        grantCoinsOnce: async () => {
          state.legacyGrants++;
          return { alreadyGranted: false };
        },
      },
      "../game-wallet/index.server.ts": {
        isGameWalletInstalled: () => true,
        repairGameCoinOrder: async (order) => {
          state.gameRepairs++;
          assertDestination(order);
          if (!state.receipt) return order;
          await update(order.orderId, { status: "fulfilled" });
          return { ...order, status: "fulfilled" };
        },
        grantGameCoins: async (order) => {
          assertDestination(order);
          const alreadyGranted = state.receipt;
          if (!alreadyGranted) {
            state.receipt = true;
            state.credits.push({
              amount: 500,
              player: binding.playerId,
              databaseId: CONFIG.databaseId,
            });
          }
          return { alreadyGranted };
        },
        withLegacyCoinGate: async (_player, task) => {
          state.legacyGates++;
          return task();
        },
        recordLegacyCoinGrant: async () => state.legacyOverlays++,
      },
    },
    environment,
  );
  const session = () => ({
    id: state.order.PayMongoCheckoutSessionId,
    type: "checkout_session",
    attributes: {
      livemode: false,
      reference_number: state.order.PayMongoReferenceNumber,
      metadata: {
        orderId: state.order.orderId,
        productId: state.order.productId,
        playFabId: state.order.playFabId,
      },
      payments: [
        {
          id: "pay_fixture_beta",
          type: "payment",
          attributes: { status: "paid", livemode: false, amount: 5000, currency: "PHP" },
        },
      ],
    },
  });
  const event = () => ({
    event_type: "send.webhook",
    data: {
      type: "checkout_session.payment.paid",
      resource: "checkout_session",
      livemode: false,
      data: session(),
    },
  });
  const process = (payload, signature) => {
    const body = JSON.stringify(payload);
    return api.processPayMongoWebhook(body, signature === undefined ? sign(body) : signature);
  };
  return { state, environment, api, session, event, process, maintenance };
}

function noDelivery(h) {
  assert.equal(h.state.receipt, false);
  assert.equal(h.state.credits.length, 0);
  assert.equal(h.state.legacyGrants, 0);
  assert.equal(h.state.legacyGates, 0);
  assert.equal(h.state.legacyOverlays, 0);
  assert.equal(h.state.events.length, 0);
}

test("explicit TEST beta v3 purchase credits original account/destination once across duplicate envelopes", async () => {
  const h = harness();
  const first = await h.process(h.event());
  assert.equal(first.status, 200);
  assert.equal(first.body.coinsAwarded, 500);
  assert.equal(h.state.order.status, "fulfilled");
  const legacy = {
    data: {
      id: "evt_fixture_beta_duplicate",
      type: "event",
      attributes: { type: "checkout_session.payment.paid", livemode: false, data: h.session() },
    },
  };
  assert.equal((await h.process(legacy)).body.idempotent, true);
  assert.equal(h.state.credits.length, 1);
  assert.equal(h.state.retrievals.length, 0);
  assert.equal(h.state.legacyGrants, 0);
});

test("simultaneous paid beta deliveries retain one permanent receipt", async () => {
  const h = harness();
  const results = await Promise.all([h.process(h.event()), h.process(h.event())]);
  assert.ok(results.every((result) => result.status === 200));
  assert.equal(h.state.credits.length, 1);
});

test("closing new checkout does not strand an already bound paid TEST beta order", async () => {
  const h = harness();
  h.environment.COIN_BETA_CHECKOUT_ENABLED = "false";
  assert.equal((await h.process(h.event())).status, 200);
  assert.equal(h.state.credits.length, 1);
  assert.equal(h.environment.COIN_FULFILLMENT_MAINTENANCE, "true");
});

test("beta receipt repairs a failed fulfilled audit without another credit", async () => {
  const h = harness();
  h.state.failFulfilledOnce = true;
  assert.equal((await h.process(h.event())).status, 500);
  assert.equal(h.state.receipt, true);
  assert.equal((await h.process(h.event())).body.idempotent, true);
  assert.equal(h.state.order.status, "fulfilled");
  assert.equal(h.state.credits.length, 1);
});

for (const version of [1, 2, 3]) {
  test(`non-beta version-${version} delivery/repair stays fenced before provider, ledger or audit I/O`, async () => {
    const h = harness();
    delete h.state.order.coinBeta;
    h.state.order.coinReceiptVersion = version;
    if (version !== 3) delete h.state.order.gameWallet;
    if (version === 2)
      h.state.order.coinReceipt = {
        storage: "postgres",
        databaseId: CONFIG.databaseId,
        targetId: CONFIG.targetId,
        schemaVersion: 1,
      };
    const before = plain(h.state.order);
    const event = h.event();
    delete event.data.data.attributes.payments[0].attributes.amount;
    assert.equal((await h.process(event)).status, 503);
    await assert.rejects(
      h.api.repairPaymentOrder(before),
      (error) => error instanceof h.maintenance.CoinFulfillmentMaintenance,
    );
    noDelivery(h);
    assert.equal(h.state.retrievals.length, 0);
    assert.equal(h.state.auditWrites.length, 0);
    assert.equal(h.state.gameRepairs, 0);
    assert.equal(h.state.legacyReads, 0);
    assert.deepEqual(h.state.order, before);
  });
}

for (const mutate of [
  (h) => {
    h.environment.COIN_BETA_DELIVERY_ENABLED = "false";
  },
  (h) => {
    delete h.environment.COIN_BETA_SCOPE_ID;
  },
  (h) => {
    h.environment.COIN_BETA_PLAYER_ID = "BAD999";
  },
  (h) => {
    h.environment.COIN_BETA_ENTITY_ID = "BAD123";
  },
  (h) => {
    h.environment.PUBLIC_APP_URL = "https://fork.example";
  },
  (h) => {
    h.environment.PAYMONGO_SECRET_KEY = "sk_live_fixture_not_a_real_key";
  },
  (h) => {
    h.state.order.coinBeta.scopeId = "different-scope";
  },
  (h) => {
    h.state.order.coinBeta.mode = "live";
  },
  (h) => {
    h.state.order.coinBeta.playerId = "BAD999";
  },
  (h) => {
    h.state.order.gameWallet.entity.Id = "BAD123";
  },
  (h) => {
    h.state.order.gameWallet.databaseId = "ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee";
  },
  (h) => {
    h.state.order.gameWallet.targetId = "c".repeat(64);
  },
  (h) => {
    h.state.order.coinReceiptVersion = 2;
  },
  (h) => {
    h.state.order.productId = "coins_1000";
  },
  (h) => {
    h.state.order.expectedAmount = 1;
  },
  (h) => {
    h.state.order.currency = "USD";
  },
]) {
  test(`invalid beta delivery scope/config/order fails closed: ${mutate.toString()}`, async () => {
    const h = harness();
    mutate(h);
    const before = plain(h.state.order);
    assert.equal((await h.process(h.event())).status, 503);
    noDelivery(h);
    assert.equal(h.state.retrievals.length, 0);
    assert.equal(h.state.auditWrites.length, 0);
    assert.equal(h.state.gameRepairs, 0);
    assert.deepEqual(h.state.order, before);
  });
}

for (const where of ["session", "payment"]) {
  test(`beta ${where} livemode=true is rejected before monetary authority`, async () => {
    const h = harness();
    const event = h.event();
    const attrs =
      where === "session"
        ? event.data.data.attributes
        : event.data.data.attributes.payments[0].attributes;
    attrs.livemode = true;
    assert.equal((await h.process(event)).status, 400);
    noDelivery(h);
    assert.equal(h.state.retrievals.length, 0);
  });
  for (const mode of [undefined, "false", 0]) {
    test(`beta ${where} non-explicit TEST mode ${String(mode)} requires bound provider confirmation`, async () => {
      const h = harness();
      const event = h.event();
      const attrs =
        where === "session"
          ? event.data.data.attributes
          : event.data.data.attributes.payments[0].attributes;
      if (mode === undefined) delete attrs.livemode;
      else attrs.livemode = mode;
      assert.equal((await h.process(event)).status, 500);
      noDelivery(h);
      assert.deepEqual(h.state.retrievals, [h.state.order.PayMongoCheckoutSessionId]);
      assert.equal(h.state.auditWrites.length, 0);
      h.state.verifiedCheckout = h.session();
      assert.equal((await h.process(event)).status, 200);
      assert.equal(h.state.credits.length, 1);
      assert.deepEqual(h.state.retrievals, [
        h.state.order.PayMongoCheckoutSessionId,
        h.state.order.PayMongoCheckoutSessionId,
      ]);
    });
  }
}

for (const where of ["session", "payment"]) {
  test(`provider GET without explicitly TEST ${where} cannot complete beta evidence`, async () => {
    const h = harness();
    const event = h.event();
    delete event.data.data.attributes.payments[0].attributes.amount;
    h.state.verifiedCheckout = h.session();
    const attrs =
      where === "session"
        ? h.state.verifiedCheckout.attributes
        : h.state.verifiedCheckout.attributes.payments[0].attributes;
    delete attrs.livemode;
    assert.equal((await h.process(event)).status, 400);
    noDelivery(h);
  });
}

for (const variant of [
  "session-id",
  "player",
  "product",
  "reference",
  "amount",
  "currency",
  "ambiguous-payment",
]) {
  test(`inconsistent beta payment ${variant} cannot grant`, async () => {
    const h = harness();
    const event = h.event();
    const session = event.data.data;
    const attrs = session.attributes;
    if (variant === "session-id") session.id = "cs_other";
    if (variant === "player") attrs.metadata.playFabId = "BAD999";
    if (variant === "product") attrs.metadata.productId = "coins_1000";
    if (variant === "reference") attrs.reference_number = "different-order";
    if (variant === "amount") attrs.payments[0].attributes.amount = 1;
    if (variant === "currency") attrs.payments[0].attributes.currency = "USD";
    if (variant === "ambiguous-payment") attrs.payments.push(plain(attrs.payments[0]));
    assert.equal((await h.process(event)).status, 400);
    noDelivery(h);
    assert.equal(h.state.retrievals.length, 0);
  });
}

for (const status of ["pending", "failed", "cancelled"]) {
  test(`beta provider payment ${status}, not paid, cannot grant from checkout status alone`, async () => {
    const h = harness();
    const event = h.event();
    event.data.data.attributes.status = "paid";
    event.data.data.attributes.payments[0].attributes.status = status;
    h.state.verifiedCheckout = plain(event.data.data);
    assert.equal((await h.process(event)).status, 400);
    noDelivery(h);
  });
}

for (const status of ["cancelled", "failed"]) {
  test(`late verified TEST paid beta evidence still settles its original ${status} audit record`, async () => {
    const h = harness();
    h.state.order.status = status;
    h.environment.COIN_BETA_CHECKOUT_ENABLED = "false";
    assert.equal((await h.process(h.event())).status, 200);
    assert.equal(h.state.credits.length, 1);
    assert.equal(h.state.order.status, "fulfilled");
  });
}

test("missing signature, non-TEST events and unrelated failed/cancelled events never grant", async () => {
  for (const mode of [true, undefined, "false"]) {
    const h = harness();
    const event = h.event();
    if (mode === undefined) delete event.data.livemode;
    else event.data.livemode = mode;
    assert.equal((await h.process(event)).status, 400);
    noDelivery(h);
    assert.equal(h.state.orderReads, 0);
  }
  const unsigned = harness();
  assert.equal((await unsigned.process(unsigned.event(), null)).status, 400);
  noDelivery(unsigned);
  for (const type of ["checkout_session.payment.failed", "checkout_session.cancelled"]) {
    const h = harness();
    const event = h.event();
    event.data.type = type;
    assert.equal((await h.process(event)).status, 200);
    noDelivery(h);
    assert.equal(h.state.orderReads, 0);
  }
});

test("a beta marker attached to a Diamond order is rejected without Diamond delivery", async () => {
  const h = harness();
  h.state.order.rewardCurrency = "DI";
  h.state.order.expectedCoins = 0;
  h.state.order.premiumWallet = {
    storage: "postgres",
    collectionId: "premium-wallet",
    databaseId: CONFIG.databaseId,
    targetId: CONFIG.targetId,
    schemaVersion: 1,
    entity: ENTITY,
  };
  assert.equal((await h.process(h.event())).status, 503);
  assert.equal(h.state.diamondGrants, 0);
  noDelivery(h);
  assert.equal(h.state.auditWrites.length, 0);
});

test("adding the second scope preserves an already-bound original signed paid order and retry", async () => {
  const h = harness();
  const originalBinding = plain(h.state.order.coinBeta);
  enableSecond(h.environment);
  h.environment.COIN_BETA_CHECKOUT_ENABLED = "false";
  assert.equal((await h.process(h.event())).status, 200);
  assert.equal((await h.process(h.event())).body.idempotent, true);
  assert.deepEqual(h.state.order.coinBeta, originalBinding);
  assert.deepEqual(h.state.credits, [
    { amount: 500, player: PLAYER, databaseId: CONFIG.databaseId },
  ]);
  assert.equal(h.state.legacyGrants, 0);
});

test("signed second-account TEST order retains its own destination through closure and audit retry", async () => {
  const h = harness({ second: true });
  h.environment.COIN_BETA_SECOND_CHECKOUT_ENABLED = "false";
  h.environment.COIN_BETA_CHECKOUT_ENABLED = "false";
  h.state.failFulfilledOnce = true;
  assert.equal((await h.process(h.event())).status, 500);
  assert.equal(h.state.receipt, true);
  assert.equal((await h.process(h.event())).body.idempotent, true);
  assert.equal((await h.process(h.event())).body.idempotent, true);
  assert.equal(h.state.order.status, "fulfilled");
  assert.deepEqual(h.state.credits, [
    { amount: 500, player: SECOND_BINDING.playerId, databaseId: CONFIG.databaseId },
  ]);
  assert.equal(h.state.legacyGrants, 0);
  assert.equal(h.state.diamondGrants, 0);
});

for (const status of ["pending", "failed", "cancelled"]) {
  test(`second-account ${status} payment is not a paid confirmation`, async () => {
    const h = harness({ second: true });
    const event = h.event();
    event.data.data.attributes.payments[0].attributes.status = status;
    h.state.verifiedCheckout = plain(event.data.data);
    assert.equal((await h.process(event)).status, 400);
    noDelivery(h);
  });
}

for (const variant of [
  "primary-metadata",
  "primary-entity",
  "primary-scope",
  "live",
  "unsigned",
  "delivery-off",
]) {
  test(`second-account delivery rejects ${variant} without a credit`, async () => {
    const h = harness({ second: true });
    const event = h.event();
    if (variant === "primary-metadata") event.data.data.attributes.metadata.playFabId = PLAYER;
    if (variant === "primary-entity") h.state.order.gameWallet.entity = plain(ENTITY);
    if (variant === "primary-scope") h.state.order.coinBeta.scopeId = BINDING.scopeId;
    if (variant === "live") event.data.data.attributes.payments[0].attributes.livemode = true;
    if (variant === "delivery-off") h.environment.COIN_BETA_SECOND_DELIVERY_ENABLED = "false";
    assert.notEqual(
      (await h.process(event, variant === "unsigned" ? null : undefined)).status,
      200,
    );
    noDelivery(h);
    // Invalid signed payment evidence may record a failed audit, never paid or
    // fulfilled. Scope/signature fences still return before any audit mutation.
    assert.ok(h.state.auditWrites.every((update) => update.status === "failed"));
    assert.equal(h.state.legacyGrants, 0);
  });
}

test("normal Diamond evidence retains existing missing-inner-mode compatibility during Coin maintenance", async () => {
  const h = harness();
  delete h.state.order.coinBeta;
  delete h.state.order.gameWallet;
  delete h.state.order.coinReceiptVersion;
  h.state.order.productId = "diamonds_500";
  h.state.order.rewardCurrency = "DI";
  h.state.order.expectedCoins = 0;
  h.state.order.premiumWallet = {
    storage: "postgres",
    collectionId: "premium-wallet",
    databaseId: CONFIG.databaseId,
    targetId: CONFIG.targetId,
    schemaVersion: 1,
    entity: ENTITY,
  };
  const event = h.event();
  delete event.data.data.attributes.livemode;
  delete event.data.data.attributes.payments[0].attributes.livemode;
  assert.equal((await h.process(event)).status, 200);
  assert.equal(h.state.diamondGrants, 1);
  assert.equal(h.state.credits.length, 0);
  assert.equal(h.state.retrievals.length, 0);
  assert.equal(h.environment.COIN_FULFILLMENT_MAINTENANCE, "true");
});

for (const initiallyBound of [true, false]) {
  test(`order updates cannot ${initiallyBound ? "replace" : "smuggle in"} a beta binding or reroute the immutable destination`, async () => {
    let stored = fixtureOrder();
    if (!initiallyBound) delete stored.coinBeta;
    const original = plain(stored);
    const orderAdmin = {
      ...admin,
      playFabAdmin: async (path, body) => {
        if (path.endsWith("GetTitleInternalData"))
          return { Data: { [body.Keys[0]]: JSON.stringify(stored) } };
        stored = JSON.parse(body.Value);
        return {};
      },
    };
    const orders = load("payments/orders.server.ts", {
      "../playfab/admin-client.server.ts": orderAdmin,
    });
    await orders.updateOrderStatus(stored.orderId, {
      status: "paid",
      coinBeta: { ...BINDING, playerId: "BAD999", scopeId: "different-scope" },
      gameWallet: { ...SNAPSHOT, databaseId: "forged" },
      playFabId: "BAD999",
      productId: "coins_2500",
      expectedCoins: 2500,
      expectedAmount: 1,
      rewardAmount: 2500,
      currency: "USD",
      coinReceiptVersion: 1,
    });
    assert.equal(stored.status, "paid");
    for (const key of [
      "coinBeta",
      "gameWallet",
      "playFabId",
      "productId",
      "expectedCoins",
      "expectedAmount",
      "rewardAmount",
      "currency",
      "coinReceiptVersion",
    ])
      assert.deepEqual(stored[key], original[key]);
  });
}
