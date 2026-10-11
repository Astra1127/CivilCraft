import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { act, create } from "react-test-renderer";
import * as reactQuery from "@tanstack/react-query";
import ts from "typescript";
import * as products from "../src/lib/payments/products.ts";

const require = createRequire(import.meta.url);
const { QueryClient, QueryClientProvider } = reactQuery;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const source = ts.transpileModule(
  readFileSync(new URL("../src/routes/dashboard.payment.cancel.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;

// Use the real query cache/observer lifecycle, but no real authentication, API or checkout.
function harness(options = {}) {
  const state = {
    player: { playFabId: "PLAYER-A" },
    ticket: "ticket-A",
    orderId: "ORDER-A",
    ...options,
  };
  const requests = [];
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, refetchOnWindowFocus: false },
    },
  });
  const exports = {};
  runInNewContext(source, {
    exports,
    Error,
    require: (name) => {
      if (name === "@tanstack/react-query") return reactQuery;
      if (["react/jsx-runtime", "lucide-react"].includes(name)) return require(name);
      if (name === "@tanstack/react-router")
        return {
          createFileRoute: () => (config) => config,
          useSearch: () => ({ order_id: state.orderId }),
          Link: ({ to, search, children, ...props }) =>
            React.createElement(
              "a",
              { ...props, href: to, "data-currency": search?.currency },
              children,
            ),
        };
      if (name === "@/lib/auth") return { useAuth: () => ({ player: state.player }) };
      if (name === "@/lib/payments/products") return products;
      if (name === "@/components/ui/button")
        return {
          Button: ({ asChild, variant, size, children, ...props }) =>
            React.createElement("div", props, children),
        };
      if (name === "@/lib/playfab/client")
        return {
          currentSessionTicket: () => state.ticket,
          playerFetch: async (path, init) => {
            requests.push({ path, init });
            return state.fetch(path, init);
          },
        };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  let renderer;
  const tree = () =>
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(exports.Route.component),
    );
  return {
    state,
    requests,
    queryClient,
    get renderer() {
      return renderer;
    },
    text: () => JSON.stringify(renderer.toJSON()),
    links: () => renderer.root.findAllByType("a"),
    mount: async () => {
      await act(async () => {
        renderer = create(tree());
      });
    },
    update: async () => {
      await act(async () => {
        renderer.update(tree());
      });
    },
    close: async () => {
      await act(async () => {
        renderer.unmount();
        queryClient.clear();
      });
    },
  };
}

async function waitFor(check) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (check()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
  assert.ok(check(), "query/render did not settle");
}

function order(currency = "CO", overrides = {}) {
  return {
    orderId: "ORDER-A",
    status: "fulfilled",
    expectedCoins: currency === "CO" ? 500 : 0,
    rewardCurrency: currency,
    rewardAmount: 500,
    ...overrides,
  };
}

function assertNoCredit(h) {
  assert.doesNotMatch(h.text(), /Payment Received|were credited to your game account/);
}

for (const status of ["pending", "paid", "fulfilled", "failed", "cancelled"]) {
  for (const currency of ["CO", "DI", "legacy CO"]) {
    test(`cancel page prioritizes manual review over ${status} for ${currency}`, async () => {
      const snapshot =
        currency === "legacy CO"
          ? { orderId: "ORDER-A", status, expectedCoins: 500, fulfillmentReviewRequired: true }
          : order(currency, { status, fulfillmentReviewRequired: true });
      const h = harness({ fetch: async () => Response.json(snapshot) });
      await h.mount();
      try {
        await waitFor(() => /Purchase needs review/.test(h.text()));
        assert.match(h.text(), /MANUAL REVIEW|Purchase needs review/);
        assert.match(h.text(), /cannot yet confirm the currency credit/);
        assert.match(h.text(), /Do not pay again/);
        assert.match(h.text(), /Reference:.*ORDER-A/);
        assert.match(h.text(), /Package:.*500.*(?:Coins|Diamonds)/);
        assertNoCredit(h);
        assert.ok(h.links().some((link) => link.props.href === "/contact"));
        assert.ok(h.links().some((link) => link.props.href === "/dashboard/transactions"));
        assert.equal(
          h.links().some((link) => link.props.href === "/dashboard/shop"),
          false,
        );
        assert.equal(h.requests.length, 1);
        assert.equal(h.requests[0].init.headers.Authorization, "Bearer ticket-A");
        assert.equal(h.requests[0].init.method ?? "GET", "GET");
      } finally {
        await h.close();
      }
    });
  }
}

for (const currency of ["CO", "DI"]) {
  test(`verified fulfilled ${currency} still displays its immutable credited amount`, async () => {
    for (const reviewFlag of [undefined, false]) {
      const h = harness({
        fetch: async () =>
          Response.json(order(currency, { fulfillmentReviewRequired: reviewFlag })),
      });
      await h.mount();
      try {
        await waitFor(() => /Payment Received/.test(h.text()));
        assert.match(
          h.text(),
          new RegExp(`500 ${currency === "DI" ? "Diamonds" : "Coins"} were credited`),
        );
        assert.doesNotMatch(h.text(), /MANUAL REVIEW|Do not pay again/);
        assert.equal(
          h.links().find((link) => link.props.href === "/dashboard/shop")?.props["data-currency"],
          currency === "DI" ? "diamonds" : "coins",
        );
        assert.equal(h.requests.length, 1);
      } finally {
        await h.close();
      }
    }
  });
}

test("unpaid, cancelled and failed orders never claim a currency credit", async () => {
  for (const status of ["pending", "paid", "cancelled", "failed"]) {
    const h = harness({ fetch: async () => Response.json(order("CO", { status })) });
    await h.mount();
    try {
      await waitFor(
        () =>
          h.queryClient.getQueryState(["payment-order", "PLAYER-A", "ORDER-A"])?.status ===
          "success",
      );
      assertNoCredit(h);
      assert.match(h.text(), /Closing checkout does not confirm a payment or grant currency/);
      assert.equal(h.requests.length, 1);
    } finally {
      await h.close();
    }
  }
});

test("unverifiable orders show an error rather than a credit", async () => {
  const responses = [
    ...[401, 403, 404, 503].map((status) => async () => new Response(null, { status })),
    async () => {
      throw new Error("Network unavailable");
    },
    async () => Response.json(order("CO", { orderId: "OTHER-ORDER" })),
    async () => Response.json(order("CO", { rewardAmount: 1 })),
  ];
  for (const fetch of responses) {
    const h = harness({ fetch });
    await h.mount();
    try {
      await waitFor(() => /Unable to verify this order/.test(h.text()));
      assertNoCredit(h);
      assert.equal(h.requests.length, 1, "do not automatically retry the order endpoint");
    } finally {
      await h.close();
    }
  }
});

test("missing player/reference/ticket cannot request or display a credited order", async () => {
  for (const override of [{ player: null }, { orderId: "" }, { ticket: null }]) {
    const h = harness({
      ...override,
      fetch: async () => {
        throw new Error("must not fetch");
      },
    });
    await h.mount();
    try {
      if (override.ticket === null)
        await waitFor(() => /Unable to verify this order/.test(h.text()));
      assertNoCredit(h);
      assert.equal(h.requests.length, 0);
    } finally {
      await h.close();
    }
  }
});

test("an error on refetch hides an earlier cached credit confirmation", async () => {
  const h = harness({ fetch: async () => Response.json(order()) });
  await h.mount();
  try {
    await waitFor(() => /Payment Received/.test(h.text()));
    h.state.fetch = async () => new Response(null, { status: 403 });
    await act(async () => {
      await h.queryClient.invalidateQueries({ queryKey: ["payment-order", "PLAYER-A", "ORDER-A"] });
    });
    await waitFor(() => /Unable to verify this order/.test(h.text()));
    assertNoCredit(h);
  } finally {
    await h.close();
  }
});

test("a verified order transitioning to review removes the old credit message", async () => {
  const h = harness({ fetch: async () => Response.json(order()) });
  await h.mount();
  try {
    await waitFor(() => /Payment Received/.test(h.text()));
    h.state.fetch = async () => Response.json(order("CO", { fulfillmentReviewRequired: true }));
    await act(async () => {
      await h.queryClient.invalidateQueries({ queryKey: ["payment-order", "PLAYER-A", "ORDER-A"] });
    });
    await waitFor(() => /Purchase needs review/.test(h.text()));
    assertNoCredit(h);
  } finally {
    await h.close();
  }
});

test("switching accounts aborts and ignores a delayed old-owner response", async () => {
  let resolveA;
  const h = harness({
    fetch: () =>
      new Promise((resolve) => {
        resolveA = resolve;
      }),
  });
  await h.mount();
  try {
    await waitFor(() => h.requests.length === 1);
    h.state.player = { playFabId: "PLAYER-B" };
    h.state.ticket = "ticket-B";
    h.state.fetch = async () => new Response(null, { status: 404 });
    await h.update();
    await waitFor(() => /Unable to verify this order/.test(h.text()));
    assert.equal(h.requests[0].init.signal?.aborted, true);
    await act(async () => {
      resolveA(Response.json(order()));
    });
    assertNoCredit(h);
    assert.equal(h.queryClient.getQueryData(["payment-order", "PLAYER-B", "ORDER-A"]), undefined);
    assert.equal(h.queryClient.getQueryData(["payment-order", "PLAYER-A", "ORDER-A"]), undefined);
    assert.equal(h.requests[1].init.headers.Authorization, "Bearer ticket-B");
  } finally {
    await h.close();
  }
});

test("a changed session ticket rejects an in-flight confirmation even for the same player", async () => {
  let resolveOrder;
  const h = harness({
    fetch: () =>
      new Promise((resolve) => {
        resolveOrder = resolve;
      }),
  });
  await h.mount();
  try {
    await waitFor(() => h.requests.length === 1);
    h.state.ticket = "ticket-A-new";
    await act(async () => {
      resolveOrder(Response.json(order()));
    });
    await waitFor(() => /Unable to verify this order/.test(h.text()));
    assertNoCredit(h);
    assert.equal(h.requests.length, 1);
  } finally {
    await h.close();
  }
});

test("signing out cannot retain or complete an old-owner credit confirmation", async () => {
  let resolveOrder;
  const h = harness({
    fetch: () =>
      new Promise((resolve) => {
        resolveOrder = resolve;
      }),
  });
  await h.mount();
  try {
    await waitFor(() => h.requests.length === 1);
    h.state.player = null;
    h.state.ticket = null;
    await h.update();
    assert.equal(h.requests[0].init.signal?.aborted, true);
    await act(async () => {
      resolveOrder(Response.json(order()));
    });
    assertNoCredit(h);
    assert.equal(h.requests.length, 1);
    assert.equal(h.queryClient.getQueryData(["payment-order", "PLAYER-A", "ORDER-A"]), undefined);
  } finally {
    await h.close();
  }
});

test("leaving the cancellation page aborts an outstanding order request", async () => {
  let resolveOrder;
  const h = harness({
    fetch: () =>
      new Promise((resolve) => {
        resolveOrder = resolve;
      }),
  });
  await h.mount();
  await waitFor(() => h.requests.length === 1);
  await h.close();
  assert.equal(h.requests[0].init.signal?.aborted, true);
  await act(async () => {
    resolveOrder(Response.json(order()));
  });
  assert.equal(h.queryClient.getQueryCache().getAll().length, 0);
});
