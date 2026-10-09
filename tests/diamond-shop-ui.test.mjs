import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { act, create } from "react-test-renderer";
import ts from "typescript";
import * as display from "../src/lib/payments/shop-display.ts";
import * as products from "../src/lib/payments/products.ts";
import * as sessionErrors from "../src/lib/playfab/session-errors.ts";
import { playerNameDependencies } from "./helpers/player-name-ui.mjs";

const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const element =
  (tag) =>
  ({ children, asChild, ...props }) =>
    React.createElement(tag, props, children);
const renderedText = (node) =>
  typeof node === "string" || typeof node === "number"
    ? String(node)
    : node.children.map(renderedText).join("");
const buyButton = (renderer) =>
  renderer.root.findAllByType("button").find((button) => renderedText(button).includes("Buy "));

function load(path, options = {}) {
  const exports = {};
  const navigation = [];
  const queries = [];
  const requests = [];
  const invalidations = [];
  const timers = new Map();
  const auth = options.auth ?? {
    isAuthenticated: true,
    player: { playFabId: "PLAYER-A", displayName: "Engineer A" },
  };
  const queryClient = {
    invalidateQueries: async (args) => {
      invalidations.push(args);
    },
  };
  const window = {
    location: { pathname: "/dashboard/shop", search: "?currency=diamonds", hash: "", href: "" },
  };
  let timerId = 0;
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(source, {
    exports,
    window,
    URL,
    AbortController,
    Error,
    console,
    setTimeout: (fn) => {
      const id = ++timerId;
      timers.set(id, fn);
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    require: (name) => {
      if (playerNameDependencies[name]) return playerNameDependencies[name];
      if (name === "react" || name === "react/jsx-runtime") return require(name);
      if (name === "@tanstack/react-router")
        return {
          Link: ({ to, children, ...props }) =>
            React.createElement("a", { ...props, href: to }, children),
          useNavigate: () => (args) => navigation.push(args),
          useSearch: () => options.search ?? { order_id: "ORDER-A" },
          createFileRoute: () => (config) => ({
            ...config,
            useSearch: () => options.search ?? { currency: "diamonds" },
          }),
          redirect: (args) => Object.assign(new Error("redirect"), args),
          Outlet: () => React.createElement("div"),
        };
      if (name === "@/lib/auth") return { useAuth: () => auth };
      if (name === "@/lib/playfab/session-errors") return sessionErrors;
      if (name === "@/lib/payments/shop-display") return display;
      if (name === "@/lib/payments/products") return products;
      if (name === "@/lib/utils") return { cn: (...values) => values.filter(Boolean).join(" ") };
      if (name === "@/lib/playfab/client")
        return {
          currentSessionTicket: () => (options.ticket === undefined ? "ticket-A" : options.ticket),
          playerFetch: async (path, init) => {
            requests.push({ path, init });
            return options.fetch ? options.fetch(path, init) : Response.json({ products: [] });
          },
        };
      if (name === "@tanstack/react-query")
        return {
          useQueryClient: () => queryClient,
          useQuery: (config) => {
            queries.push(config);
            const balances = {
              coins: 123,
              diamonds: 500,
              diamondsAvailable: true,
              ...options.balances,
            };
            return {
              data:
                config.queryKey[0] === "player-currencies"
                  ? balances
                  : (options.products ?? products.DEFAULT_PRODUCTS),
              isPending: false,
              isError: false,
              ...options.queryResult,
              refetch: () => {},
            };
          },
        };
      if (name === "sonner") return { toast: new Proxy({}, { get: () => () => {} }) };
      if (name === "zod") return require(name);
      if (name.endsWith("/button")) return { Button: element("button") };
      return new Proxy({}, { get: () => element("div") });
    },
  });
  return { ...exports, navigation, queries, requests, invalidations, timers, window };
}

async function mount(module) {
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(module.Route.component));
  });
  return renderer;
}

test("currency search is an allowlisted preference and missing balances are unavailable", () => {
  assert.equal(display.shopCurrency("diamonds"), "diamonds");
  for (const bad of [undefined, "DI", "http://example.com", { currency: "diamonds" }])
    assert.equal(display.shopCurrency(bad), "coins");
  assert.equal(display.displayBalance(null), "Unavailable");
  assert.equal(display.displayBalance(undefined), "Unavailable");
  assert.equal(display.displayBalance(0), "0");
  assert.equal(
    display.isDiamondShopDestination("https://evil.example/shop?currency=diamonds"),
    false,
  );
});

test("legacy shop preserves Diamonds and defaults invalid currency to Coins", () => {
  const { Route } = load("../src/routes/shop.tsx");
  for (const [currency, expected] of [
    ["diamonds", "diamonds"],
    [undefined, "coins"],
    ["untrusted", "coins"],
  ]) {
    const search = Route.validateSearch({ currency });
    assert.throws(
      () => Route.beforeLoad({ search }),
      (error) => error.to === "/dashboard/shop" && error.search.currency === expected,
    );
  }
});

test("dashboard auth redirect preserves the Diamond destination including expiry", async () => {
  const module = load("../src/routes/dashboard.tsx", {
    auth: { ready: true, isAuthenticated: false, sessionExpired: true },
  });
  const renderer = await mount(module);
  try {
    assert.equal(module.navigation[0].to, "/login");
    assert.equal(module.navigation[0].search.redirect, "/dashboard/shop?currency=diamonds");
    assert.equal(module.navigation[0].search.reason, "expired");
  } finally {
    await act(async () => renderer.unmount());
  }
});

test("Diamond login shows the exact account note and authenticated login returns to Diamonds", async () => {
  const search = { redirect: "/dashboard/shop?currency=diamonds" };
  const module = load("../src/routes/login.tsx", { search, auth: { isAuthenticated: false } });
  const renderer = await mount(module);
  try {
    assert.match(
      JSON.stringify(renderer.toJSON()),
      /Log in with your Civil Craft game account before buying Diamonds\./,
    );
  } finally {
    await act(async () => renderer.unmount());
  }
  const signedIn = load("../src/routes/login.tsx", { search, auth: { isAuthenticated: true } });
  const signedRenderer = await mount(signedIn);
  try {
    assert.equal(signedIn.navigation[0].to, search.redirect);
  } finally {
    await act(async () => signedRenderer.unmount());
  }
});

test("storefront keeps balances separate and purchases only a server catalog product ID", async () => {
  const module = load("../src/routes/dashboard.shop.tsx", {
    fetch: async () => Response.json({ checkoutUrl: "https://checkout.paymongo.test/session" }),
  });
  const renderer = await mount(module);
  try {
    const text = JSON.stringify(renderer.toJSON());
    assert.match(text, /PLAYER-A/);
    assert.match(text, /Engineer A/);
    assert.match(text, /DIAMONDS/);
    assert.doesNotMatch(text, /500 COINS/);
    const buy = buyButton(renderer);
    assert.ok(buy && !buy.props.disabled);
    await act(async () => {
      await buy.props.onClick();
    });
    assert.equal(module.requests[0].path, "/api/payments/paymongo/create-checkout");
    assert.deepEqual(JSON.parse(module.requests[0].init.body), { productId: "diamonds_500" });
    assert.equal(module.requests[0].init.headers.Authorization, "Bearer ticket-A");
    assert.equal(module.window.location.href, "https://checkout.paymongo.test/session");
  } finally {
    await act(async () => renderer.unmount());
  }
});

test("unavailable Diamond wallet disables checkout; catalog outages never use static products", async () => {
  const module = load("../src/routes/dashboard.shop.tsx", {
    balances: { diamonds: null, diamondsAvailable: false },
    fetch: async () => new Response("unavailable", { status: 503 }),
  });
  const renderer = await mount(module);
  try {
    assert.match(JSON.stringify(renderer.toJSON()), /Unavailable/);
    const buy = buyButton(renderer);
    assert.equal(buy.props.disabled, true);
    await assert.rejects(
      module.queries.find((query) => query.queryKey[0] === "shop-products").queryFn(),
    );
    assert.equal(
      module.queries.find((query) => query.queryKey[0] === "shop-products").initialData,
      undefined,
    );
  } finally {
    await act(async () => renderer.unmount());
  }
});

test("expired checkout session returns to the selected Diamond shop without payment", async () => {
  const module = load("../src/routes/dashboard.shop.tsx", { ticket: null });
  const renderer = await mount(module);
  try {
    const buy = buyButton(renderer);
    await act(async () => {
      await buy.props.onClick();
    });
    assert.equal(module.requests.length, 0);
    assert.equal(module.navigation[0].search.redirect, "/dashboard/shop?currency=diamonds");
  } finally {
    await act(async () => renderer.unmount());
  }
});

test("confirmation requires authenticated server status; fulfilled Diamonds stop polling and refresh balances", async () => {
  const module = load("../src/routes/dashboard.payment.success.tsx", {
    fetch: async () =>
      Response.json({
        orderId: "ORDER-A",
        productId: "renamed-product",
        status: "fulfilled",
        expectedCoins: 0,
        rewardCurrency: "DI",
        rewardAmount: 2500,
        expectedAmount: 22000,
        currency: "PHP",
        createdAt: "2026-10-09T00:00:00Z",
        paidAt: "2026-10-09T00:01:00Z",
        fulfilledAt: "2026-10-09T00:01:01Z",
      }),
  });
  const renderer = await mount(module);
  try {
    assert.equal(module.requests[0].init.headers.Authorization, "Bearer ticket-A");
    assert.match(JSON.stringify(renderer.toJSON()), /Diamonds/);
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /500 Civil Craft Coins/);
    assert.equal(module.timers.size, 0);
    assert.ok(module.invalidations.some((query) => query.queryKey[0] === "player-currencies"));
  } finally {
    await act(async () => renderer.unmount());
  }
});

test("pending confirmations are bounded and unmount cancels queued status checks", async () => {
  const pending = () =>
    Response.json({ orderId: "ORDER-A", status: "pending", expectedCoins: 500 });
  const module = load("../src/routes/dashboard.payment.success.tsx", {
    fetch: async () => pending(),
  });
  const renderer = await mount(module);
  try {
    for (let n = 0; n < 25 && module.timers.size; n += 1) {
      const [id, callback] = module.timers.entries().next().value;
      module.timers.delete(id);
      await act(async () => {
        await callback();
      });
    }
    assert.equal(module.requests.length, 20);
    assert.equal(module.timers.size, 0);
    assert.match(JSON.stringify(renderer.toJSON()), /Check Transactions later/);
  } finally {
    await act(async () => renderer.unmount());
  }
  const cancelled = load("../src/routes/dashboard.payment.success.tsx", {
    fetch: async () => pending(),
  });
  const cancelledRenderer = await mount(cancelled);
  assert.equal(cancelled.timers.size, 1);
  await act(async () => cancelledRenderer.unmount());
  assert.equal(cancelled.timers.size, 0);
  assert.equal(cancelled.requests[0].init.signal.aborted, true);
});

test("manual-review confirmation stops polling, never claims credit and offers support rather than another purchase", async () => {
  for (const status of ["paid", "fulfilled"]) {
    const module = load("../src/routes/dashboard.payment.success.tsx", {
      fetch: async () =>
        Response.json({
          orderId: "ORDER-A",
          status,
          expectedCoins: 500,
          fulfillmentReviewRequired: true,
        }),
    });
    const renderer = await mount(module);
    try {
      const text = JSON.stringify(renderer.toJSON());
      assert.match(text, /Purchase needs review/);
      assert.match(text, /Do not pay again/);
      assert.match(text, /order reference/);
      assert.match(text, /Contact Support/);
      assert.doesNotMatch(
        text,
        /PURCHASE COMPLETE|Currency Credited|have been added|Checking live|Confirmation is still pending/,
      );
      assert.equal(module.requests.length, 1);
      assert.equal(module.timers.size, 0);
      assert.equal(module.invalidations.length, 0);
      assert.ok(renderer.root.findAllByType("a").some((link) => link.props.href === "/contact"));
      assert.equal(
        renderer.root.findAllByType("a").some((link) => link.props.href === "/dashboard/shop"),
        false,
      );
    } finally {
      await act(async () => renderer.unmount());
    }
  }
});

test("a pending order transitioning to manual review ends scheduled polling", async () => {
  let checks = 0;
  const module = load("../src/routes/dashboard.payment.success.tsx", {
    fetch: async () =>
      Response.json({
        orderId: "ORDER-A",
        status: "paid",
        expectedCoins: 500,
        fulfillmentReviewRequired: ++checks > 1,
      }),
  });
  const renderer = await mount(module);
  try {
    assert.equal(module.timers.size, 1);
    const [id, callback] = module.timers.entries().next().value;
    module.timers.delete(id);
    await act(async () => {
      await callback();
    });
    assert.equal(module.timers.size, 0);
    assert.equal(module.requests.length, 2);
    assert.match(JSON.stringify(renderer.toJSON()), /Purchase needs review/);
    assert.equal(module.invalidations.length, 0);
  } finally {
    await act(async () => renderer.unmount());
  }
});

test("wrong-owner order access and missing references never display a credited currency", async () => {
  for (const options of [
    { fetch: async () => new Response("forbidden", { status: 403 }) },
    { search: { order_id: "" } },
  ]) {
    const module = load("../src/routes/dashboard.payment.success.tsx", options);
    const renderer = await mount(module);
    try {
      const text = JSON.stringify(renderer.toJSON());
      assert.doesNotMatch(text, /PURCHASE COMPLETE/);
      assert.equal(module.invalidations.length, 0);
      assert.equal(module.timers.size, 0);
    } finally {
      await act(async () => renderer.unmount());
    }
  }
});

test("transaction currency names use immutable snapshots and legacy orders remain Coins", async () => {
  const source = ts.transpileModule(
    readFileSync(new URL("../src/lib/playfab/transactions.ts", import.meta.url), "utf8"),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    },
  ).outputText;
  const exports = {};
  const requests = [];
  runInNewContext(source, {
    exports,
    window: {},
    require: (name) => {
      if (name === "../payments/products.ts") return products;
      if (name === "./inventory") return { getRawInventory: async () => ({ Inventory: [] }) };
      if (name === "./client")
        return {
          currentSessionTicket: () => "ticket-A",
          playerFetch: async (path, init) => {
            requests.push({ path, init });
            return Response.json({
              orders: [
                {
                  orderId: "diamond-order",
                  productId: "product-was-deleted",
                  expectedCoins: 0,
                  rewardCurrency: "DI",
                  rewardAmount: 1000,
                  expectedAmount: 9500,
                  currency: "PHP",
                  status: "fulfilled",
                  createdAt: "2026-10-09T00:00:00Z",
                },
                {
                  orderId: "legacy-order",
                  productId: "not-coins-500",
                  expectedCoins: 750,
                  expectedAmount: 8000,
                  currency: "PHP",
                  status: "fulfilled",
                  createdAt: "2026-10-08T00:00:00Z",
                },
              ],
            });
          },
        };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  const rows = await exports.getTransactions("PLAYER-A");
  assert.equal(rows[0].itemName, "1,000 Civil Craft Diamonds");
  assert.equal(rows[0].rewardCurrency, "DI");
  assert.equal(rows[1].itemName, "750 Civil Craft Coins");
  assert.equal(rows[1].rewardCurrency, "CO");
  assert.equal(requests[0].init.headers.Authorization, "Bearer ticket-A");
});
