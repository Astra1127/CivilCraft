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
  "COIN_BETA_CHECKOUT_STARTS_AT",
  "COIN_BETA_CHECKOUT_ENDS_AT",
  "COIN_BETA_DELIVERY_ENABLED",
  "COIN_BETA_SCOPE_ID",
  "COIN_BETA_TITLE_ID",
  "COIN_BETA_PLAYER_ID",
  "COIN_BETA_ENTITY_ID",
  "COIN_BETA_SECOND_CHECKOUT_ENABLED",
  "COIN_BETA_SECOND_DELIVERY_ENABLED",
  "COIN_BETA_SECOND_SCOPE_ID",
  "COIN_BETA_SECOND_PLAYER_ID",
  "COIN_BETA_SECOND_ENTITY_ID",
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
    COIN_BETA_CHECKOUT_STARTS_AT: new Date(Date.now() - 60_000).toISOString(),
    COIN_BETA_CHECKOUT_ENDS_AT: new Date(Date.now() + 29 * 60_000).toISOString(),
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

const SECOND_PLAYER = "BEE123";
const SECOND_ENTITY = { Id: "B0B1234", Type: "title_player_account" as const };
function enableSecond() {
  Object.assign(process.env, {
    COIN_BETA_SECOND_CHECKOUT_ENABLED: "true",
    COIN_BETA_SECOND_DELIVERY_ENABLED: "true",
    COIN_BETA_SECOND_SCOPE_ID: "coin-beta-second-fixture",
    COIN_BETA_SECOND_PLAYER_ID: SECOND_PLAYER,
    COIN_BETA_SECOND_ENTITY_ID: SECOND_ENTITY.Id,
  });
}
const secondBinding = () => createCoinBetaCheckoutBinding(SECOND_PLAYER, product())!;
const secondSnapshot = (): GameWalletSnapshot => ({
  ...gameWalletConfig(),
  entity: { ...SECOND_ENTITY },
});
const secondOrder = (): GameCoinOrder => ({
  ...order(),
  orderId: "fixture-second-beta-order",
  playFabId: SECOND_PLAYER,
  coinBeta: secondBinding(),
  gameWallet: secondSnapshot(),
});

test("absolute checkout window is start-inclusive, end-exclusive and cannot renew on a fresh call", (t) =>
  fixture(() => {
    enableSecond();
    const start = Date.parse("2026-10-12T00:00:00.000Z");
    const end = start + 30 * 60_000;
    process.env["COIN_BETA_CHECKOUT_STARTS_AT"] = new Date(start).toISOString();
    process.env["COIN_BETA_CHECKOUT_ENDS_AT"] = new Date(end).toISOString();
    let now = start;
    t.mock.method(Date, "now", () => now);
    const accepted = [order(), secondOrder()];
    for (const [at, open] of [
      [start - 1, false],
      [start, true],
      [end - 1, true],
      [end, false],
      [end + 60_000, false],
    ] as const) {
      now = at;
      for (const player of [PLAYER, SECOND_PLAYER]) {
        assert.equal(isCoinBetaCheckoutCandidate(player), open);
        if (open) assert.ok(createCoinBetaCheckoutBinding(player, product()));
        else paused(() => createCoinBetaCheckoutBinding(player, product()));
      }
      for (const old of accepted) {
        if (!open) paused(() => assertCoinCheckoutSnapshotAllowed(old.playFabId, old.coinBeta));
        assert.doesNotThrow(() => assertCoinOrderDeliveryAllowed(old));
      }
    }
  }));

test("missing/malformed/overlong checkout windows fail closed without holding accepted delivery", (t) =>
  fixture(() => {
    enableSecond();
    const start = "2026-10-12T00:00:00.000Z";
    const end = "2026-10-12T00:30:00.000Z";
    process.env["COIN_BETA_CHECKOUT_STARTS_AT"] = start;
    process.env["COIN_BETA_CHECKOUT_ENDS_AT"] = end;
    t.mock.method(Date, "now", () => Date.parse("2026-10-12T00:05:00.000Z"));
    const accepted = [order(), secondOrder()];
    for (const [badStart, badEnd] of [
      [undefined, end],
      [start, undefined],
      ["", end],
      [start, "not-a-date"],
      [start, "2026-10-12T00:30:00Z"],
      [start, "2026-10-12T00:30:00.000+00:00"],
      ["2026-02-30T00:00:00.000Z", end],
      [start, start],
      [end, start],
      [start, "2026-10-12T00:30:00.001Z"],
      ["2026-10-11T00:00:00.000Z", end],
    ]) {
      if (badStart === undefined) delete process.env["COIN_BETA_CHECKOUT_STARTS_AT"];
      else process.env["COIN_BETA_CHECKOUT_STARTS_AT"] = badStart;
      if (badEnd === undefined) delete process.env["COIN_BETA_CHECKOUT_ENDS_AT"];
      else process.env["COIN_BETA_CHECKOUT_ENDS_AT"] = badEnd;
      for (const player of [PLAYER, SECOND_PLAYER]) {
        assert.equal(isCoinBetaCheckoutCandidate(player), false);
        paused(() => createCoinBetaCheckoutBinding(player, product()));
      }
      for (const old of accepted) assert.doesNotThrow(() => assertCoinOrderDeliveryAllowed(old));
    }
  }));

test("optional second account defaults closed and does not change the original binding", () =>
  fixture(() => {
    const original = binding();
    assert.equal(isCoinBetaCheckoutCandidate(SECOND_PLAYER), false);
    paused(() => secondBinding());
    enableSecond();
    assert.deepEqual(binding(), original);
    assert.equal(isCoinBetaCheckoutCandidate(PLAYER), true);
    assert.equal(isCoinBetaCheckoutCandidate(SECOND_PLAYER.toLowerCase()), true);
    const second = secondBinding();
    assert.deepEqual(second, {
      ...original,
      scopeId: "coin-beta-second-fixture",
      playerId: SECOND_PLAYER,
      entity: SECOND_ENTITY,
    });
    assert.ok(Object.isFrozen(second) && Object.isFrozen(second.entity));
    assert.doesNotThrow(() => assertCoinCheckoutSnapshotAllowed(SECOND_PLAYER, second));
    assert.doesNotThrow(() => assertCoinBetaWalletBinding(second, secondSnapshot()));
    assert.doesNotThrow(() => assertCoinOrderDeliveryAllowed(secondOrder()));
    assert.doesNotThrow(() => assertCoinOrderDeliveryAllowed(order(original)));
    assert.equal(isCoinBetaCheckoutCandidate("BAD999"), false);
    paused(() => createCoinBetaCheckoutBinding("BAD999", product()));
  }));

test("secondary/global checkout closure preserves original and second accepted delivery", () =>
  fixture(() => {
    enableSecond();
    const first = order();
    const second = secondOrder();
    process.env["COIN_BETA_SECOND_CHECKOUT_ENABLED"] = "false";
    assert.equal(isCoinBetaCheckoutCandidate(PLAYER), true);
    assert.equal(isCoinBetaCheckoutCandidate(SECOND_PLAYER), false);
    paused(() => secondBinding());
    paused(() => assertCoinCheckoutSnapshotAllowed(SECOND_PLAYER, second.coinBeta));
    assert.doesNotThrow(() => assertCoinOrderDeliveryAllowed(second));
    assert.doesNotThrow(() => assertCoinOrderDeliveryAllowed(first));
    process.env["COIN_BETA_SECOND_CHECKOUT_ENABLED"] = "true";
    process.env["COIN_BETA_CHECKOUT_ENABLED"] = "false";
    for (const candidate of [PLAYER, SECOND_PLAYER]) {
      assert.equal(isCoinBetaCheckoutCandidate(candidate), false);
      paused(() => createCoinBetaCheckoutBinding(candidate, product()));
    }
    for (const accepted of [first, second]) {
      paused(() => assertCoinCheckoutSnapshotAllowed(accepted.playFabId, accepted.coinBeta));
      assert.doesNotThrow(() => assertCoinOrderDeliveryAllowed(accepted));
    }
    process.env["GAME_WALLET_ENABLED"] = "false";
    for (const accepted of [first, second])
      assert.doesNotThrow(() => assertCoinOrderDeliveryAllowed(accepted));
  }));

test("second delivery is separately gated and cannot bypass the global delivery gate", () =>
  fixture(() => {
    enableSecond();
    const first = order();
    const second = secondOrder();
    for (const value of [undefined, "false", "1", "yes"]) {
      if (value === undefined) delete process.env["COIN_BETA_SECOND_DELIVERY_ENABLED"];
      else process.env["COIN_BETA_SECOND_DELIVERY_ENABLED"] = value;
      assert.equal(isCoinBetaCheckoutCandidate(SECOND_PLAYER), false);
      paused(() => secondBinding());
      paused(() => assertCoinOrderDeliveryAllowed(second));
      assert.doesNotThrow(() => assertCoinOrderDeliveryAllowed(first));
    }
    process.env["COIN_BETA_SECOND_DELIVERY_ENABLED"] = "true";
    process.env["COIN_BETA_DELIVERY_ENABLED"] = "false";
    for (const accepted of [first, second]) {
      assert.equal(isCoinBetaCheckoutCandidate(accepted.playFabId), false);
      paused(() => assertCoinOrderDeliveryAllowed(accepted));
    }
  }));

test("missing, malformed or overlapping second settings fail closed without stranding primary delivery", () =>
  fixture(() => {
    const first = order();
    enableSecond();
    const accepted = secondOrder();
    for (const [key, values] of [
      [
        "COIN_BETA_SECOND_SCOPE_ID",
        [
          undefined,
          "",
          "BAD",
          "bad_scope",
          "-bad",
          "bad--scope",
          "x".repeat(65),
          "coin-beta-fixture",
        ],
      ],
      [
        "COIN_BETA_SECOND_PLAYER_ID",
        [undefined, "", "BEE123,ABC", '["BEE123"]', "x".repeat(33), PLAYER],
      ],
      [
        "COIN_BETA_SECOND_ENTITY_ID",
        [undefined, "", "B0B1234,ABC", '["B0B1234"]', "x".repeat(65), ENTITY.Id],
      ],
    ] as const) {
      const original = process.env[key];
      for (const value of values) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
        assert.equal(isCoinBetaCheckoutCandidate(SECOND_PLAYER), false);
        paused(() => secondBinding());
        paused(() => assertCoinOrderDeliveryAllowed(accepted));
        assert.doesNotThrow(() => assertCoinOrderDeliveryAllowed(first));
        assert.deepEqual(binding(), first.coinBeta);
      }
      process.env[key] = original;
    }
  }));

test("crossed account, entity and scope fields cannot reroute either immutable order", () =>
  fixture(() => {
    enableSecond();
    const first = order();
    const second = secondOrder();
    for (const [own, other] of [
      [first, second],
      [second, first],
    ] as const) {
      paused(() => assertCoinCheckoutSnapshotAllowed(other.playFabId, own.coinBeta));
      paused(() => assertCoinBetaWalletBinding(own.coinBeta!, other.gameWallet!));
      for (const change of [
        { coinBeta: other.coinBeta },
        { playFabId: other.playFabId },
        { gameWallet: other.gameWallet },
        { coinBeta: { ...own.coinBeta, scopeId: other.coinBeta!.scopeId } },
        { coinBeta: { ...own.coinBeta, playerId: other.playFabId } },
        { coinBeta: { ...own.coinBeta, entity: other.coinBeta!.entity } },
        { coinBeta: { ...own.coinBeta, extra: true } },
        { coinBeta: { ...own.coinBeta, entity: { ...own.coinBeta!.entity, extra: true } } },
      ])
        paused(() => assertCoinOrderDeliveryAllowed({ ...own, ...change } as GameCoinOrder));
    }
  }));

test("second account shares TEST provider, main origin, verified title and immutable wallet target guards", () =>
  fixture(() => {
    enableSecond();
    const second = secondOrder();
    for (const [key, bad] of [
      ["COIN_BETA_TITLE_ID", "FFFF"],
      ["PAYMONGO_SECRET_KEY", "sk_live_fixture_unused"],
      ["PAYMONGO_WEBHOOK_SECRET", ""],
      ["PUBLIC_APP_URL", "https://civil-craft-website.vercel.app"],
      ["GAME_WALLET_VERIFIED", "false"],
      ["GAME_WALLET_LEGACY_HANDLERS_QUIESCED", "false"],
    ] as const) {
      const original = process.env[key];
      process.env[key] = bad;
      assert.equal(isCoinBetaCheckoutCandidate(SECOND_PLAYER), false);
      paused(() => secondBinding());
      paused(() => assertCoinOrderDeliveryAllowed(second));
      process.env[key] = original;
    }
    for (const change of [
      { databaseId: "ffffffff-ffff-ffff-ffff-ffffffffffff" },
      { targetId: "0".repeat(64) },
      { protocolVersion: 2 },
      { entity: ENTITY },
      { extra: true },
    ])
      paused(() =>
        assertCoinOrderDeliveryAllowed({
          ...second,
          gameWallet: { ...second.gameWallet, ...change },
        } as GameCoinOrder),
      );
  }));

test("second account cannot purchase another package or mutate TEST mode, price or reward", () =>
  fixture(() => {
    enableSecond();
    const second = secondOrder();
    for (const change of [
      { id: "coins_1000" },
      { active: false },
      { amount: 1 },
      { currency: "USD" },
      { rewardCurrency: "DI" },
      { rewardAmount: 501, rewardCoins: 501 },
    ])
      paused(() =>
        createCoinBetaCheckoutBinding(SECOND_PLAYER, { ...product(), ...change } as PaymentProduct),
      );
    for (const change of [
      { mode: "live" },
      { protocolVersion: 2 },
      { productId: "coins_1000" },
      { expectedAmount: 1 },
      { rewardAmount: 501 },
      { titleId: "FFFF" },
    ])
      paused(() =>
        assertCoinOrderDeliveryAllowed({
          ...second,
          coinBeta: { ...second.coinBeta, ...change },
        } as GameCoinOrder),
      );
  }));

test("secondary checkout has no implicit permission from a configured tuple or delivery alone", () =>
  fixture(() => {
    enableSecond();
    const second = secondOrder();
    for (const value of [undefined, "false", "1", "yes"]) {
      if (value === undefined) delete process.env["COIN_BETA_SECOND_CHECKOUT_ENABLED"];
      else process.env["COIN_BETA_SECOND_CHECKOUT_ENABLED"] = value;
      assert.equal(isCoinBetaCheckoutCandidate(SECOND_PLAYER), false);
      paused(() => secondBinding());
      assert.doesNotThrow(() => assertCoinOrderDeliveryAllowed(second));
      assert.equal(isCoinBetaCheckoutCandidate(PLAYER), true);
    }
  }));
