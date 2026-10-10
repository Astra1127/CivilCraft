import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";
import * as catalog from "../src/lib/game-wallet/catalog.server.ts";
import { AdminApiError } from "../src/lib/playfab/admin-client.server.ts";
import * as gateContext from "../src/lib/game-wallet/gate-context.server.ts";

const require = createRequire(import.meta.url),
  PLAYER = "ABCDEF",
  ENTITY = { Id: "FACE123", Type: "title_player_account" };
const CONFIG = {
  storage: "postgres",
  namespace: "civilcraft_game_wallet_v3",
  databaseId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  targetId: "a".repeat(64),
  protocolVersion: 3,
};
const plain = (value) => JSON.parse(JSON.stringify(value));
function load(file, mocks, env = {}) {
  const exports = {};
  const output = ts.transpileModule(
    readFileSync(new URL(`../src/lib/game-wallet/${file}`, import.meta.url), "utf8"),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    },
  ).outputText;
  vm.runInNewContext(output, {
    exports,
    URL,
    URLSearchParams,
    Response,
    Request,
    Headers,
    Date,
    process: { env },
    Buffer,
    require(name) {
      if (name in mocks) return mocks[name];
      if (name.startsWith("node:")) return require(name);
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return exports;
}
function harness() {
  const state = {
    enabled: true,
    installed: true,
    calls: [],
    entityReads: 0,
    rows: null,
    auditFailure: false,
  };
  const config = {
    isGameWalletEnabled: () => state.enabled,
    isGameWalletInstalled: () => state.installed,
    requireGameWalletReady: () => {
      if (!state.enabled) throw new AdminApiError(503, "disabled");
      return CONFIG;
    },
    requireGameWalletSettlementReady: () => CONFIG,
  };
  const database = {
    walletUnavailable: () => new AdminApiError(503, "unavailable"),
    walletInteger: (n) => Number(n),
    walletIdentity: (_c, player, entity) => [
      CONFIG.databaseId,
      "17FA03",
      player,
      entity.Id,
      entity.Type,
    ],
    balanceRow: (row) => ({
      coins: row.ready ? Number(row.coins) : null,
      ready: row.ready,
      version: Number(row.version),
    }),
    walletCall: async (name, args, settlement) => {
      state.calls.push({ name, args, settlement });
      if (state.rows) return state.rows(name, args);
      if (name === "wallet_balance")
        return [
          {
            coins: 700,
            ready: true,
            version: 5,
            lifetime_gold_earned: 200,
            lifetime_gold_spent: 100,
          },
        ];
      if (name === "credit") return [{ already_granted: false, covered: false }];
      if (name === "receipt") return [{ granted: true }];
      return [];
    },
  };
  const legacy = {
    withAccountGate: async (_id, _reason, task) => task("11111111-2222-3333-4444-555555555555"),
    legacyOpeningSnapshot: async () => ({ classic: 500, covered: [] }),
    GateBeforeMutationError: class extends Error {
      constructor(original) {
        super();
        this.original = original;
      }
    },
  };
  const service = load("service.server.ts", {
    "../playfab/admin-client.server.ts": {
      AdminApiError,
      object: (n) => (n && typeof n === "object" ? n : {}),
    },
    "../playfab/premium-wallet.server.ts": {
      resolvePremiumEntity: async () => {
        state.entityReads++;
        return ENTITY;
      },
      getDiamondBalance: async () => 7,
    },
    "../payments/products.ts": {
      normalizeOrderReward: (o) => ({
        rewardCurrency: o.rewardCurrency ?? "CO",
        rewardAmount: o.rewardAmount ?? o.expectedCoins,
      }),
    },
    "../payments/orders.server.ts": {
      updateOrderStatus: async () => {
        if (state.auditFailure) throw new Error("private");
      },
    },
    "./config.server.ts": config,
    "./database.server.ts": database,
    "./catalog.server.ts": catalog,
    "./legacy.server.ts": legacy,
    "./types.ts": { MAX_GAME_COINS: 2147483647 },
  });
  return { service, state, config, database, legacy };
}
test("default disabled game balance performs no DB or PlayFab lookup", async () => {
  const { service, state } = harness();
  state.enabled = false;
  state.installed = false;
  assert.deepEqual(plain(await service.gameCoinBalance(PLAYER)), {
    coins: null,
    ready: false,
    version: 0,
    lifetimeGoldEarned: null,
    lifetimeGoldSpent: null,
  });
  assert.equal(state.calls.length, 0);
  assert.equal(state.entityReads, 0);
});
test("verified wallet still reads and settles immutable v3 orders while new operations are disabled", async () => {
  const { service, state } = harness();
  state.enabled = false;
  const balance = await service.gameCoinBalance(PLAYER);
  assert.equal(balance.coins, 700);
  assert.equal(balance.lifetimeGoldEarned, 200);
  const order = {
    orderId: "v3-order",
    playFabId: PLAYER,
    expectedCoins: 500,
    rewardCurrency: "CO",
    rewardAmount: 500,
    coinReceiptVersion: 3,
    gameWallet: { ...CONFIG, entity: ENTITY },
    status: "paid",
  };
  assert.equal((await service.grantGameCoins(order)).alreadyGranted, false);
  assert.equal(state.calls.at(-1).settlement, true);
  state.auditFailure = true;
  assert.equal((await service.repairGameCoinOrder(order)).status, "fulfilled");
  await assert.rejects(service.gameCoinSnapshot(PLAYER), /disabled/);
  const before = state.calls.length;
  await assert.rejects(
    service.grantGameCoins({
      ...order,
      gameWallet: { ...order.gameWallet, targetId: "b".repeat(64) },
    }),
    /unavailable/,
  );
  assert.equal(state.calls.length, before);
});
test("approved import snapshots counters, unknown old IDs cannot grant, second save never reimports", async () => {
  const { service, state } = harness();
  let imported = false;
  state.rows = (name, args) => {
    if (name === "wallet_balance")
      return [
        {
          ready: imported,
          coins: imported ? 700 : null,
          version: imported ? 1 : 0,
          lifetime_gold_earned: 200,
          lifetime_gold_spent: 100,
        },
      ];
    if (name === "import_wallet") {
      imported = true;
      assert.equal(args.at(-2), 200);
      assert.equal(args.at(-1), 100);
      return [{ ready: true, coins: 700, version: 1 }];
    }
    throw new Error(name);
  };
  const input = {
    gold: 200,
    saveHash: "a".repeat(64),
    lifetimeGoldEarned: 200,
    lifetimeGoldSpent: 100,
    completedContracts: ["ShopKeeperContract"],
    unlockedAchievements: ["ACH_001"],
  };
  assert.equal((await service.importGameWallet(PLAYER, input)).ready, true);
  const mutation = state.calls.find((c) => c.name === "import_wallet");
  assert.equal(mutation.args[6], 200);
  assert.equal(mutation.args[7], 500);
  assert.ok(mutation.args[10].includes("contract:ShopKeeper"));
  await service.importGameWallet(PLAYER, { ...input, gold: 999 });
  assert.equal(state.calls.filter((c) => c.name === "import_wallet").length, 1);
});
test("catalog purchase always uses server price and exposes locked status words", async () => {
  const { service, state } = harness();
  const item = catalog.gameCatalog.items[0],
    op = "11111111-2222-3333-4444-555555555555";
  state.rows = (name, args) =>
    name === "purchase"
      ? [
          {
            result: {
              operationId: op,
              status: "fulfilled",
              coins: 600,
              version: 6,
              entitlement: JSON.parse(args.at(-1)),
            },
          },
        ]
      : [];
  const result = await service.purchaseGameItem(PLAYER, {
    operationId: op,
    targetKind: "cosmetic",
    targetId: item.itemId,
  });
  assert.equal(result.status, "completed");
  assert.equal(state.calls[0].args.at(-2), item.price);
  assert.equal(result.entitlement.cosmeticId, item.cosmeticId);
  state.rows = () => [
    { result: { operationId: op, status: "already-owned", coins: 600, version: 6 } },
  ];
  assert.equal((await service.gamePurchaseStatus(PLAYER, op)).status, "already_owned");
  state.rows = () => [
    {
      result: {
        operationId: op,
        status: "rejected",
        reason: "insufficient-coins",
        coins: 0,
        version: 6,
      },
    },
  ];
  assert.equal((await service.gamePurchaseStatus(PLAYER, op)).status, "insufficient_funds");
});
test("unknown catalog purchase writes permanent rejection proof rather than leaving an ambiguous 400", async () => {
  const { service, state } = harness();
  const op = "11111111-2222-3333-4444-555555555555";
  state.rows = (name) => {
    assert.equal(name, "reject_purchase");
    return [{ result: { operationId: op, status: "rejected", reason: "invalid-catalog" } }];
  };
  await assert.rejects(
    service.purchaseGameItem(PLAYER, {
      operationId: op,
      targetKind: "cosmetic",
      targetId: "UNKNOWN",
    }),
    (error) => error.status === 400 && error.terminal === true && error.operationId === op,
  );
});
test("opaque shop link verification rejects wrong browser account and expired links", async () => {
  const { service, state } = harness();
  const token = "a".repeat(43);
  state.rows = () => [
    {
      player_id: PLAYER,
      currency: "diamonds",
      expires_at: new Date(Date.now() + 100000).toISOString(),
    },
  ];
  assert.equal((await service.assertGameShopLink(token, PLAYER)).currency, "diamonds");
  state.rows = () => [
    {
      player_id: "AAAA",
      currency: "diamonds",
      expires_at: new Date(Date.now() + 100000).toISOString(),
    },
  ];
  await assert.rejects(service.assertGameShopLink(token, PLAYER), (error) => error.status === 409);
  state.rows = () => [
    { player_id: PLAYER, currency: "diamonds", expires_at: new Date(Date.now() - 1).toISOString() },
  ];
  await assert.rejects(service.assertGameShopLink(token, PLAYER), (error) => error.status === 410);
});
function apiHarness() {
  const h = harness();
  const calls = [];
  let authentications = 0;
  const methods = {};
  for (const name of [
    "gameWallet",
    "gameEntitlements",
    "gamePurchaseStatus",
    "grantGameRewards",
    "importGameWallet",
    "purchaseGameItem",
    "assertGameShopLink",
  ])
    methods[name] = async (...args) => {
      calls.push({ name, args });
      return { ready: true, coins: 700, diamonds: 7, version: 1 };
    };
  methods.GamePurchaseRejected = h.service.GamePurchaseRejected;
  methods.issueGameShopLink = async (...args) => {
    calls.push({ name: "issueGameShopLink", args });
    return { token: "a".repeat(43), currency: args[1], expiresAt: "2026-10-10T12:00:00Z" };
  };
  const api = load(
    "api.server.ts",
    {
      "../playfab/admin-client.server.ts": {
        AdminApiError,
        object: (n) => (n && typeof n === "object" ? n : {}),
      },
      "../payments/player-auth.server.ts": {
        authenticatePaymentPlayer: async (request) => {
          authentications++;
          if (!request.headers.get("authorization"))
            throw new AdminApiError(401, "Sign in required.");
          return { playFabId: PLAYER };
        },
      },
      "./config.server.ts": h.config,
      "./service.server.ts": methods,
    },
    { PUBLIC_APP_URL: "https://civil-craft.vercel.app", NODE_ENV: "production" },
  );
  const request = (path, method = "GET", input, authorized = true) =>
    new Request(`https://civil-craft.vercel.app${path}`, {
      method,
      headers: {
        ...(authorized ? { authorization: "Bearer fixture" } : {}),
        ...(input ? { "Content-Type": "application/json" } : {}),
      },
      ...(input ? { body: JSON.stringify(input) } : {}),
    });
  return { api, calls, request, state: h.state, methods, authentications: () => authentications };
}
test("API disabled guard and unknown/method routes perform no authentication or fallback SSR", async () => {
  const h = apiHarness();
  h.state.enabled = false;
  h.state.installed = false;
  assert.equal((await h.api.handleGameWalletRequest(h.request("/api/game/wallet"))).status, 503);
  assert.equal(h.authentications(), 0);
  assert.equal((await h.api.handleGameWalletRequest(h.request("/api/game/unknown"))).status, 404);
  assert.equal(
    (await h.api.handleGameWalletRequest(h.request("/api/game/import", "POST", {}))).status,
    404,
  );
  assert.equal(
    (await h.api.handleGameWalletRequest(h.request("/api/game/wallet", "POST", {}))).status,
    405,
  );
  assert.equal(await h.api.handleGameWalletRequest(h.request("/api/other")), null);
});
test("API import uses locked wallet/import endpoint and owner identity from session only", async () => {
  const h = apiHarness();
  const input = {
    gold: 200,
    saveHash: "a".repeat(64),
    lifetimeGoldEarned: 200,
    lifetimeGoldSpent: 100,
  };
  const response = await h.api.handleGameWalletRequest(
    h.request("/api/game/wallet/import", "POST", input),
  );
  assert.equal(response.status, 200);
  assert.equal(h.calls[0].name, "importGameWallet");
  assert.equal(h.calls[0].args[0], PLAYER);
  for (const [key, value] of Object.entries({
    "cache-control": "no-store",
    vary: "Authorization",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  }))
    assert.equal(response.headers.get(key), value);
  assert.equal(
    (
      await h.api.handleGameWalletRequest(
        h.request("/api/game/wallet/import", "POST", { ...input, playFabId: "OTHER" }),
      )
    ).status,
    400,
  );
  assert.equal(
    (await h.api.handleGameWalletRequest(h.request("/api/game/wallet", "GET", undefined, false)))
      .status,
    401,
  );
});
test("shop-link API returns only opaque link and internal post-login destination", async () => {
  const h = apiHarness();
  const response = await h.api.handleGameWalletRequest(
    h.request("/api/game/shop-link", "POST", { currency: "diamonds" }),
  );
  const value = await response.json();
  assert.equal(value.currency, "diamonds");
  const url = new URL(value.url);
  assert.equal(url.origin, "https://civil-craft.vercel.app");
  assert.equal(url.pathname, "/login");
  assert.equal(
    url.searchParams.get("redirect"),
    `/dashboard/shop?currency=diamonds&gameLink=${"a".repeat(43)}`,
  );
  assert.ok(!value.url.includes(PLAYER) && !value.url.includes("fixture"));
});
test("purchase API forbids supplied price/credits and returns only durable terminal proof", async () => {
  const h = apiHarness(),
    op = "11111111-2222-3333-4444-555555555555";
  assert.equal(
    (
      await h.api.handleGameWalletRequest(
        h.request("/api/game/purchases", "POST", {
          operationId: op,
          targetKind: "cosmetic",
          targetId: "hat",
          price: 1,
        }),
      )
    ).status,
    400,
  );
  assert.equal(h.calls.length, 0);
  h.methods.purchaseGameItem = async () => {
    throw new h.methods.GamePurchaseRejected(op);
  };
  const response = await h.api.handleGameWalletRequest(
    h.request("/api/game/purchases", "POST", {
      operationId: op,
      targetKind: "cosmetic",
      targetId: "UNKNOWN",
    }),
  );
  const result = await response.json();
  assert.equal(response.status, 400);
  assert.equal(result.terminal, true);
  assert.equal(result.operationId, op);
});
test("legacy gate safe failures release; uncertain external attempt retains; receipt proof permits release", async () => {
  for (const mode of ["read", "uncertain", "confirmed"]) {
    const calls = [];
    const legacy = load("legacy.server.ts", {
      "../playfab/admin-client.server.ts": {
        AdminApiError,
        object: (n) => n,
        playFabAdmin: async () => ({}),
      },
      "../playfab/premium-wallet.server.ts": { resolvePremiumEntity: async () => ENTITY },
      "../payments/coin-receipts.server.ts": {
        getCoinReceiptStatus: async () => (mode === "confirmed" ? "granted" : "pending"),
      },
      "../payments/products.ts": {
        normalizeOrderReward: () => ({ rewardCurrency: "CO", rewardAmount: 100 }),
      },
      "./config.server.ts": {
        isLegacyCoinGateRequired: () => true,
        requireGameWalletSettlementReady: () => CONFIG,
      },
      "./database.server.ts": {
        walletIdentity: () => [CONFIG.databaseId, "17FA03", PLAYER, ENTITY.Id, ENTITY.Type],
        walletInteger: Number,
        walletUnavailable: () => new AdminApiError(503, "Unavailable"),
        walletCall: async (name) => {
          calls.push(name);
          return [{ acquired: true, released: true }];
        },
      },
      "./catalog.server.ts": catalog,
      "./gate-context.server.ts": gateContext,
    });
    await assert.rejects(
      legacy.withLegacyCoinGate(PLAYER, async () => {
        if (mode !== "read")
          gateContext.markLegacyCoinMutationAttempted({
            orderId: "order",
            playFabId: PLAYER,
            currencyCode: "CO",
            rewardAmount: 100,
          });
        throw new AdminApiError(503, "Safe service failure");
      }),
      /Safe service failure/,
    );
    assert.equal(calls.includes("gate_release"), mode !== "uncertain");
  }
});

test("lost atomic import response releases only with imported marker proof", async () => {
  for (const committed of [true, false]) {
    const calls = [];
    const legacy = load("legacy.server.ts", {
      "../playfab/admin-client.server.ts": {
        AdminApiError,
        object: (n) => n,
        playFabAdmin: async () => ({}),
      },
      "../playfab/premium-wallet.server.ts": { resolvePremiumEntity: async () => ENTITY },
      "../payments/coin-receipts.server.ts": { getCoinReceiptStatus: async () => "absent" },
      "../payments/products.ts": {
        normalizeOrderReward: () => ({ rewardCurrency: "CO", rewardAmount: 100 }),
      },
      "./config.server.ts": {
        isLegacyCoinGateRequired: () => true,
        requireGameWalletSettlementReady: () => CONFIG,
      },
      "./database.server.ts": {
        walletIdentity: () => [CONFIG.databaseId, "17FA03", PLAYER, ENTITY.Id, ENTITY.Type],
        walletInteger: Number,
        walletUnavailable: () => new AdminApiError(503, "Unavailable"),
        walletCall: async (name) => {
          calls.push(name);
          return name === "wallet_balance"
            ? [{ ready: committed }]
            : [{ acquired: true, released: true }];
        },
      },
      "./catalog.server.ts": catalog,
      "./gate-context.server.ts": gateContext,
    });
    await assert.rejects(
      legacy.withAccountGate(PLAYER, "import", async () => {
        gateContext.markGameWalletImportAttempted();
        throw new AdminApiError(503, "Lost response");
      }),
      /Lost response/,
    );
    assert.equal(calls.includes("gate_release"), committed);
  }
});
