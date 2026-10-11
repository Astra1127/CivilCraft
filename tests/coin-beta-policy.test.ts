import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COIN_BETA_PRODUCT_ID,
  assertCoinBetaWalletBinding,
  assertCoinCheckoutSnapshotAllowed,
  assertCoinOrderDeliveryAllowed,
  createCoinBetaCheckoutBinding,
  isCoinBetaCheckoutCandidate,
} from "../src/lib/payments/coin-beta.server.ts";
import { CoinFulfillmentMaintenance } from "../src/lib/payments/coin-maintenance.server.ts";
import { COINS_500 } from "../src/lib/payments/products.ts";
import {
  gameWalletConfig,
  gameWalletVerificationFingerprint,
} from "../src/lib/game-wallet/config.server.ts";
import type { GameCoinOrder, GameWalletSnapshot } from "../src/lib/game-wallet/types.ts";
import type { CoinBetaBinding, PaymentProduct } from "../src/lib/payments/types.ts";

// Synthetic identities and credentials. All policy checks are synchronous configuration checks;
// no PlayFab, database, provider payment, or browser call is made by this suite.
const PLAYER = "C0FFEE";
const ENTITY = { Id: "FACE1234", Type: "title_player_account" as const };
const TITLE = "AB12";
const envKeys = [
  "COIN_FULFILLMENT_MAINTENANCE",
  "COIN_BETA_CHECKOUT_ENABLED",
  "COIN_BETA_DELIVERY_ENABLED",
  "COIN_BETA_SCOPE_ID",
  "COIN_BETA_TITLE_ID",
  "COIN_BETA_PLAYER_ID",
  "COIN_BETA_ENTITY_ID",
  "VITE_PLAYFAB_TITLE_ID",
  "PLAYFAB_SECRET_KEY",
  "PAYMONGO_SECRET_KEY",
  "PAYMONGO_WEBHOOK_SECRET",
  "PUBLIC_APP_URL",
  "PUBLIC_SITE_URL",
  "SITE_URL",
  "NODE_ENV",
  "CURRENCY_DATABASE_URL",
  "CURRENCY_DATABASE_ID",
  "GAME_WALLET_ENABLED",
  "GAME_WALLET_VERIFIED",
  "GAME_WALLET_VERIFIED_TITLE_ID",
  "GAME_WALLET_VERIFIED_CONFIG_SHA256",
  "GAME_WALLET_LEGACY_HANDLERS_QUIESCED",
];
function fixture(run: () => void) {
  const previous = new Map(envKeys.map((key) => [key, process.env[key]]));
  for (const key of envKeys) delete process.env[key];
  Object.assign(process.env, {
    COIN_FULFILLMENT_MAINTENANCE: "true",
    COIN_BETA_CHECKOUT_ENABLED: "true",
    COIN_BETA_DELIVERY_ENABLED: "true",
    COIN_BETA_SCOPE_ID: "coin-beta-fixture",
    COIN_BETA_TITLE_ID: TITLE,
    COIN_BETA_PLAYER_ID: PLAYER,
    COIN_BETA_ENTITY_ID: ENTITY.Id,
    VITE_PLAYFAB_TITLE_ID: TITLE,
    PLAYFAB_SECRET_KEY: "fixture-not-a-key",
    PAYMONGO_SECRET_KEY: "sk_test_fixture_unused",
    PAYMONGO_WEBHOOK_SECRET: "fixture-unused",
    PUBLIC_APP_URL: "https://civil-craft.vercel.app",
    NODE_ENV: "production",
    CURRENCY_DATABASE_URL: "postgresql://fixture:fixture@invalid.example/fixture?sslmode=require",
    CURRENCY_DATABASE_ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    GAME_WALLET_ENABLED: "true",
    GAME_WALLET_VERIFIED: "true",
    GAME_WALLET_VERIFIED_TITLE_ID: TITLE,
    GAME_WALLET_LEGACY_HANDLERS_QUIESCED: "true",
  });
  process.env["GAME_WALLET_VERIFIED_CONFIG_SHA256"] = gameWalletVerificationFingerprint();
  try {
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
const product = (): PaymentProduct => ({ ...COINS_500, active: true });
const binding = () => createCoinBetaCheckoutBinding(PLAYER, product())!;
const snapshot = (): GameWalletSnapshot => ({ ...gameWalletConfig(), entity: { ...ENTITY } });
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function order(beta = binding()): GameCoinOrder {
  return {
    orderId: "fixture-beta-order",
    playFabId: PLAYER,
    productId: COIN_BETA_PRODUCT_ID,
    expectedCoins: 500,
    rewardCurrency: "CO",
    rewardAmount: 500,
    expectedAmount: 5000,
    currency: "PHP",
    coinReceiptVersion: 3,
    coinCurrencyCode: "CO",
    gameWallet: snapshot(),
    coinBeta: beta,
    status: "paid",
  };
}
const paused = (run: () => unknown) =>
  assert.throws(
    run,
    (error) => error instanceof CoinFulfillmentMaintenance && error.status === 503,
  );

test("beta defaults off and never changes the ordinary global maintenance fence", () =>
  fixture(() => {
    delete process.env["COIN_BETA_CHECKOUT_ENABLED"];
    delete process.env["COIN_BETA_DELIVERY_ENABLED"];
    assert.equal(isCoinBetaCheckoutCandidate(PLAYER), false);
    paused(() => createCoinBetaCheckoutBinding(PLAYER, product()));
    paused(() => assertCoinCheckoutSnapshotAllowed(PLAYER));
    paused(() => assertCoinOrderDeliveryAllowed({ ...orderWithoutBeta(), status: "paid" }));
    process.env["COIN_FULFILLMENT_MAINTENANCE"] = "false";
    assert.equal(createCoinBetaCheckoutBinding(PLAYER, product()), undefined);
    assert.equal(isCoinBetaCheckoutCandidate(PLAYER), false);
    assert.doesNotThrow(() => assertCoinCheckoutSnapshotAllowed(PLAYER));
    assert.doesNotThrow(() => assertCoinOrderDeliveryAllowed(orderWithoutBeta()));
  }));
function orderWithoutBeta(): GameCoinOrder {
  return {
    orderId: "fixture-ordinary-order",
    playFabId: PLAYER,
    expectedCoins: 500,
    rewardCurrency: "CO",
    rewardAmount: 500,
    coinReceiptVersion: 3,
    gameWallet: snapshot(),
    status: "paid",
  };
}

test("only the exact active TEST package and configured owner obtain a frozen server binding", () =>
  fixture(() => {
    const beta = binding();
    assert.equal(isCoinBetaCheckoutCandidate(PLAYER), true);
    assert.equal(isCoinBetaCheckoutCandidate("BADC0DE"), false);
    paused(() => createCoinBetaCheckoutBinding("BADC0DE", product()));
    assert.ok(Object.isFrozen(beta) && Object.isFrozen(beta.entity));
    assert.deepEqual(beta, {
      protocolVersion: 1,
      mode: "test",
      scopeId: "coin-beta-fixture",
      titleId: TITLE,
      playerId: PLAYER,
      entity: ENTITY,
      productId: "coins_500",
      rewardCurrency: "CO",
      rewardAmount: 500,
      expectedAmount: 5000,
      currency: "PHP",
    });
    assert.doesNotThrow(() => assertCoinCheckoutSnapshotAllowed(PLAYER, beta));
    assert.doesNotThrow(() => assertCoinBetaWalletBinding(beta, snapshot()));
    assert.doesNotThrow(() => assertCoinOrderDeliveryAllowed(order(beta)));
  }));

test("both flags and every well-formed single-account scope setting are required for new checkout", () =>
  fixture(() => {
    for (const key of ["COIN_BETA_CHECKOUT_ENABLED", "COIN_BETA_DELIVERY_ENABLED"]) {
      process.env[key] = "false";
      assert.equal(isCoinBetaCheckoutCandidate(PLAYER), false);
      paused(() => createCoinBetaCheckoutBinding(PLAYER, product()));
      process.env[key] = "true";
    }
    for (const [key, invalids] of [
      ["COIN_BETA_SCOPE_ID", ["", "BAD-SCOPE", "bad_scope", "-bad", "bad--scope", "a".repeat(65)]],
      ["COIN_BETA_TITLE_ID", ["", "FFFF", "AB12,FFFF"]],
      ["COIN_BETA_PLAYER_ID", ["", "C0FFEE,BADC0DE", '["C0FFEE"]', "x".repeat(33)]],
      ["COIN_BETA_ENTITY_ID", ["", "FACE1234,ABC", '["FACE1234"]', "x".repeat(65)]],
    ] as const) {
      const saved = process.env[key];
      for (const value of invalids) {
        process.env[key] = value;
        assert.equal(isCoinBetaCheckoutCandidate(PLAYER), false);
        paused(() => createCoinBetaCheckoutBinding(PLAYER, product()));
      }
      process.env[key] = saved;
    }
  }));

test("inactive, wrong package, price, currency, category, and inconsistent reward records cannot bypass maintenance", () =>
  fixture(() => {
    for (const change of [
      { active: false },
      { active: undefined },
      { id: "coins_1000" },
      { amount: 5001 },
      { currency: "USD" },
      { category: "support" },
      { rewardCoins: 501 },
      { rewardCurrency: "DI" },
      { rewardAmount: 501 },
      { rewardCurrency: undefined, rewardAmount: undefined },
    ])
      paused(() =>
        createCoinBetaCheckoutBinding(PLAYER, { ...product(), ...change } as PaymentProduct),
      );
  }));

test("live/incomplete provider keys, fork origins, queries, fragments and non-root return paths are denied", () =>
  fixture(() => {
    for (const [key, invalids] of [
      ["PAYMONGO_SECRET_KEY", ["", "sk_live_fixture", "sk_test_"]],
      ["PAYMONGO_WEBHOOK_SECRET", [""]],
      [
        "PUBLIC_APP_URL",
        [
          "",
          "https://civil-craft-website.vercel.app",
          "http://civil-craft.vercel.app",
          "https://civil-craft.vercel.app/path",
          "https://civil-craft.vercel.app?x=1",
          "https://civil-craft.vercel.app#x",
          "https://civil-craft.vercel.app///",
          "https://user@civil-craft.vercel.app",
          "https://civil-craft.vercel.app/path/..",
        ],
      ],
    ] as const) {
      const saved = process.env[key];
      for (const value of invalids) {
        process.env[key] = value;
        assert.equal(isCoinBetaCheckoutCandidate(PLAYER), false);
        paused(() => createCoinBetaCheckoutBinding(PLAYER, product()));
      }
      process.env[key] = saved;
    }
  }));

test("malformed, extra-key, or tampered beta bindings are rejected even when global maintenance is later removed", () =>
  fixture(() => {
    const good = binding();
    const invalid = [
      null,
      [],
      {},
      { ...good, extra: true },
      { ...good, mode: "live" },
      { ...good, protocolVersion: 3 },
      { ...good, scopeId: "other-scope" },
      { ...good, titleId: "FFFF" },
      { ...good, playerId: "BADC0DE" },
      { ...good, productId: "coins_1000" },
      { ...good, rewardCurrency: "DI" },
      { ...good, rewardAmount: 501 },
      { ...good, expectedAmount: 5001 },
      { ...good, currency: "USD" },
      { ...good, entity: { ...ENTITY, Id: "ABCD" } },
      { ...good, entity: { ...ENTITY, Type: "master_player_account" } },
      { ...good, entity: { ...ENTITY, extra: true } },
      { ...good, entity: [] },
      { ...good, entity: null },
    ];
    for (const beta of invalid) {
      paused(() => assertCoinCheckoutSnapshotAllowed(PLAYER, beta as CoinBetaBinding));
      paused(() => assertCoinBetaWalletBinding(beta as CoinBetaBinding, snapshot()));
      paused(() => assertCoinOrderDeliveryAllowed(order(beta as CoinBetaBinding)));
    }
    process.env["COIN_FULFILLMENT_MAINTENANCE"] = "false";
    for (const beta of invalid)
      paused(() => assertCoinOrderDeliveryAllowed(order(beta as CoinBetaBinding)));
  }));

test("bound delivery checks immutable v3 account/product/price/reward/destination snapshots with no legacy fallback", () =>
  fixture(() => {
    const good = order();
    for (const change of [
      { orderId: "" },
      { playFabId: "BADC0DE" },
      { productId: "coins_1000" },
      { coinReceiptVersion: 1 },
      { coinReceiptVersion: 2 },
      { coinReceiptVersion: undefined },
      { expectedCoins: 501 },
      { rewardAmount: 501 },
      { rewardCurrency: "DI" },
      { rewardAmount: undefined },
      { expectedAmount: 5001 },
      { currency: "USD" },
      { coinCurrencyCode: undefined },
      { coinCurrencyCode: "XX" },
      { coinReceipt: {} },
      { premiumWallet: {} },
      { gameWallet: undefined },
    ])
      paused(() => assertCoinOrderDeliveryAllowed({ ...good, ...change } as GameCoinOrder));
    for (const change of [
      { storage: "entity-objects" },
      { namespace: "other" },
      { protocolVersion: 2 },
      { databaseId: "ffffffff-ffff-ffff-ffff-ffffffffffff" },
      { targetId: "0".repeat(64) },
      { extra: true },
      { entity: { ...ENTITY, Id: "ABCD" } },
      { entity: { ...ENTITY, Type: "master_player_account" } },
      { entity: { ...ENTITY, extra: true } },
      { entity: null },
    ]) {
      const destination = { ...snapshot(), ...change } as GameWalletSnapshot;
      paused(() => assertCoinBetaWalletBinding(good.coinBeta!, destination));
      paused(() => assertCoinOrderDeliveryAllowed({ ...good, gameWallet: destination }));
    }
  }));

test("checkout can close while bound TEST delivery remains available through game-feature rollback", () =>
  fixture(() => {
    const good = order();
    process.env["COIN_BETA_CHECKOUT_ENABLED"] = "false";
    assert.equal(isCoinBetaCheckoutCandidate(PLAYER), false);
    paused(() => createCoinBetaCheckoutBinding(PLAYER, product()));
    paused(() => assertCoinCheckoutSnapshotAllowed(PLAYER, good.coinBeta));
    assert.doesNotThrow(() => assertCoinOrderDeliveryAllowed(good));
    process.env["GAME_WALLET_ENABLED"] = "false";
    assert.doesNotThrow(() => assertCoinOrderDeliveryAllowed(good));
    process.env["COIN_BETA_DELIVERY_ENABLED"] = "false";
    paused(() => assertCoinOrderDeliveryAllowed(good));
    process.env["COIN_FULFILLMENT_MAINTENANCE"] = "false";
    paused(() => assertCoinOrderDeliveryAllowed(good));
  }));

test("unverified wallet configuration, changed database target, or changed scope keeps old beta orders held", () =>
  fixture(() => {
    const good = clone(order());
    for (const key of ["GAME_WALLET_VERIFIED", "GAME_WALLET_LEGACY_HANDLERS_QUIESCED"]) {
      process.env[key] = "false";
      paused(() => assertCoinOrderDeliveryAllowed(good));
      process.env[key] = "true";
    }
    process.env["COIN_BETA_SCOPE_ID"] = "new-scope";
    paused(() => assertCoinOrderDeliveryAllowed(good));
    process.env["COIN_BETA_SCOPE_ID"] = "coin-beta-fixture";
    process.env["CURRENCY_DATABASE_URL"] =
      "postgresql://fixture:fixture@other.invalid/fixture?sslmode=require";
    paused(() => assertCoinOrderDeliveryAllowed(good));
    process.env["GAME_WALLET_VERIFIED_CONFIG_SHA256"] = gameWalletVerificationFingerprint();
    paused(() => assertCoinOrderDeliveryAllowed(good));
  }));
