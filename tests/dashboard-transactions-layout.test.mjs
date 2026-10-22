import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { act, create } from "react-test-renderer";
import ts from "typescript";

const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const element =
  (tag) =>
  ({ children, ...props }) =>
    React.createElement(tag, props, children);
const text = (node) =>
  typeof node === "string" || typeof node === "number"
    ? String(node)
    : node.children.map(text).join("");
const tokens = (node) => new Set((node.props.className ?? "").split(/\s+/));
const cards = (renderer) =>
  renderer.root.findAllByType("button").filter((node) => tokens(node).has("panel"));
const button = (renderer, label) =>
  renderer.root.findAllByType("button").find((node) => text(node) === label);
const base = {
  playerId: "FIXTURE-PLAYER",
  itemCategory: "Currency",
  currency: "PHP",
  createdAt: "2026-10-09T00:00:00Z",
};
const transactions = [
  {
    ...base,
    transactionId: `order_${"Aa09".repeat(24)}`,
    itemId: "diamonds",
    itemName: "1,234,567 Civil Craft Diamonds",
    rewardCurrency: "DI",
    rewardAmount: 1234567,
    amount: 999999.99,
    type: "purchase",
    status: "pending",
    paymentMethod: "PayMongo",
  },
  {
    ...base,
    transactionId: `reward_${"Bb10".repeat(24)}`,
    itemId: "anniversary-reward",
    itemName: `EngineersCelebrationCosmeticPackage${"X".repeat(100)}`,
    itemCategory: `ExclusiveAnniversaryAccessories${"Y".repeat(80)}`,
    itemSlot: "head",
    itemImageUrl: "/fixture-cosmetic.png",
    amount: 0,
    currency: "",
    type: "reward",
    status: "completed",
    owned: true,
    equipped: true,
  },
  {
    ...base,
    transactionId: `refund_${"Cc11".repeat(24)}`,
    itemId: "coins",
    itemName: "750 Civil Craft Coins",
    rewardCurrency: "CO",
    rewardAmount: 750,
    amount: 80,
    type: "refund",
    status: "refunded",
  },
];

function load({ rows = transactions, query = {} } = {}) {
  const exports = {};
  const queries = [];
  let retries = 0;
  const source = ts.transpileModule(
    readFileSync(new URL("../src/routes/dashboard.transactions.tsx", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
  ).outputText;
  const imports = {
    react: React,
    "react/jsx-runtime": require("react/jsx-runtime"),
    "@tanstack/react-router": { createFileRoute: () => (config) => config },
    "@tanstack/react-query": {
      useQuery: (config) => {
        queries.push(config);
        return { data: rows, isPending: false, isError: false, refetch: () => retries++, ...query };
      },
    },
    "@/lib/auth": { useAuth: () => ({ player: { playFabId: base.playerId } }) },
    "@/lib/playfab": {
      transactionService: {
        getTransactions: () => {
          throw new Error("Tests must not call the transaction service");
        },
      },
    },
    "@/lib/utils": { cn: (...values) => values.filter(Boolean).join(" ") },
    "@/lib/payments/products": {
      currencyLabel: (currency) => (currency === "DI" ? "Diamonds" : "Coins"),
    },
    "@/components/dashboard/CharacterPreview": {
      SLOT_META: { head: { label: "Headwear", icon: element("svg") } },
    },
    "@/components/common/DemoBadge": { DemoBadge: () => React.createElement("span", null, "Demo") },
    "@/components/common/PageHeader": {
      SectionHeading: ({ title, description, action }) =>
        React.createElement(
          "header",
          null,
          React.createElement("h1", null, title),
          React.createElement("p", null, description),
          action,
        ),
    },
    "@/components/common/States": {
      LoadingState: ({ label }) => React.createElement("p", { role: "status" }, label),
      ErrorState: ({ description, onRetry }) =>
        React.createElement(
          "div",
          { role: "alert" },
          description,
          React.createElement("button", { onClick: onRetry }, "Retry"),
        ),
    },
    "@/components/ui/button": { Button: element("button") },
    "@/components/ui/badge": { Badge: element("div") },
    "@/components/ui/dialog": {
      Dialog: ({ open, children, onOpenChange }) =>
        open
          ? React.createElement("section", { "data-dialog": true, onOpenChange }, children)
          : null,
      DialogContent: ({ children, ...props }) =>
        React.createElement("article", { ...props, role: "dialog" }, children),
      DialogHeader: element("header"),
      DialogTitle: element("h2"),
      DialogDescription: element("p"),
      DialogFooter: element("footer"),
    },
    "@/assets/chibi-engineer.png": "fixture-engineer.png",
    "lucide-react": Object.fromEntries(
      ["Coins", "Diamond", "Gift", "PackageOpen", "Receipt", "RotateCcw", "Star"].map((name) => [
        name,
        element("svg"),
      ]),
    ),
  };
  runInNewContext(source, {
    exports,
    require: (name) => {
      assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`);
      return imports[name];
    },
  });
  return {
    component: exports.Route.component,
    queries,
    get retries() {
      return retries;
    },
  };
}

async function render(module, check) {
  let renderer;
  try {
    await act(async () => {
      renderer = create(React.createElement(module.component));
    });
    await check(renderer);
  } finally {
    await act(async () => renderer?.unmount());
  }
}

test("long mixed transaction fixtures remain selectable and filter by type", async () => {
  const module = load();
  await render(module, async (renderer) => {
    assert.deepEqual(
      renderer.root.findAllByType("h3").map(text),
      transactions.map((tx) => tx.itemName),
    );
    assert.equal(cards(renderer).length, 3);
    assert.ok(text(cards(renderer)[1]).includes("✓ OwnedEquipped"));
    assert.deepEqual([...module.queries[0].queryKey], ["transactions", base.playerId]);
    assert.equal(renderer.root.findAllByProps({ role: "dialog" }).length, 0);
    for (const [label, expected] of [
      ["Purchase", 0],
      ["Reward", 1],
      ["Refunded", 2],
    ]) {
      await act(async () => button(renderer, label).props.onClick());
      assert.equal(cards(renderer).length, 1);
      assert.ok(text(cards(renderer)[0]).includes(transactions[expected].itemName));
      await act(async () => cards(renderer)[0].props.onClick());
      assert.equal(text(renderer.root.findByType("h2")), transactions[expected].itemName);
      await act(async () => button(renderer, "Close").props.onClick());
      assert.equal(renderer.root.findAllByProps({ role: "dialog" }).length, 0);
    }
    await act(async () => button(renderer, "All").props.onClick());
    assert.equal(cards(renderer).length, 3);
    await act(async () => cards(renderer)[0].props.onClick());
    await act(async () =>
      renderer.root.findByProps({ "data-dialog": true }).props.onOpenChange(false),
    );
    assert.equal(renderer.root.findAllByProps({ role: "dialog" }).length, 0);
  });
});

test("transaction cards allow long fields to wrap in the narrow desktop main area", async () => {
  await render(load(), (renderer) => {
    const grid = tokens(renderer.root.findByType("ul"));
    for (const utility of ["grid-cols-1", "sm:grid-cols-2", "xl:grid-cols-3"])
      assert.ok(grid.has(utility));
    assert.ok(
      !grid.has("lg:grid-cols-3"),
      "The sidebar breakpoint must not also squeeze three cards",
    );
    for (const card of cards(renderer)) {
      const body = card
        .findAllByType("div")
        .find((node) => node.children.some((child) => child.type === "h3"));
      const preview = card.findAllByType("div").find((node) => tokens(node).has("blueprint"));
      const footer = body.findAllByType("div").find((node) => tokens(node).has("flex-wrap"));
      assert.ok(tokens(card).has("min-w-0"));
      assert.ok(tokens(body).has("min-w-0"));
      for (const utility of ["min-h-10", "whitespace-normal", "break-words"])
        assert.ok(tokens(card.findByType("h3")).has(utility));
      for (const field of body.findAllByType("p").slice(0, 2))
        assert.ok(tokens(field).has("break-words"));
      assert.ok(tokens(footer).has("mt-auto"));
      assert.ok([...tokens(footer)].some((utility) => utility.startsWith("pt-")));
      assert.ok(tokens(preview).has("shrink-0"));
      assert.ok([...tokens(preview)].some((utility) => /^h-\d+$/.test(utility)));
      assert.ok(![...tokens(preview)].some((utility) => utility.startsWith("aspect-")));
    }
  });
});

test("phone transaction details constrain their grid and display the complete case-sensitive ID", async () => {
  await render(load(), async (renderer) => {
    await act(async () => cards(renderer)[0].props.onClick());
    const dialog = renderer.root.findByProps({ role: "dialog" });
    for (const utility of [
      "min-w-0",
      "grid-cols-[minmax(0,1fr)]",
      "w-[calc(100%-2rem)]",
      "max-h-[calc(100dvh-2rem)]",
      "overflow-y-auto",
    ])
      assert.ok(tokens(dialog).has(utility));
    const dl = dialog.findByType("dl");
    assert.ok(tokens(dl).has("min-w-0"));
    for (const row of dl.findAllByType("div")) {
      assert.ok(tokens(row).has("grid"));
      assert.ok(tokens(row).has("min-w-0"));
      assert.ok(
        [...tokens(row)].some(
          (utility) => utility.startsWith("sm:grid-cols-") && utility.includes("minmax(0,"),
        ),
      );
      const value = row.findByType("dd");
      assert.ok(tokens(value).has("min-w-0"));
      assert.ok(tokens(value).has("[overflow-wrap:anywhere]"));
      assert.ok(!tokens(value).has("truncate"));
    }
    const idRow = dl
      .findAllByType("div")
      .find((row) => text(row.findByType("dt")) === "Transaction ID");
    const id = idRow.findByType("dd");
    assert.equal(text(id), transactions[0].transactionId);
    assert.ok(tokens(id).has("font-mono"));
    assert.ok(!tokens(id).has("capitalize"));
    const preview = dialog.findAllByType("div").find((node) => tokens(node).has("blueprint"));
    assert.ok([...tokens(preview)].some((utility) => /^h-\d+$/.test(utility)));
    assert.ok(![...tokens(preview)].some((utility) => utility.startsWith("aspect-")));
  });
});

test("pending, failed, empty, and single-type queries avoid irrelevant transaction controls", async () => {
  for (const options of [
    { rows: undefined, query: { isPending: true } },
    { rows: [], query: { isError: true, error: new Error("Fixture failure") } },
    { rows: [] },
    { rows: [transactions[0]] },
  ]) {
    const module = load(options);
    await render(module, async (renderer) => {
      assert.equal(button(renderer, "All"), undefined);
      assert.equal(renderer.root.findAllByProps({ role: "dialog" }).length, 0);
      if (options.query?.isPending)
        assert.equal(text(renderer.root.findByProps({ role: "status" })), "Loading purchases…");
      else if (options.query?.isError) {
        assert.ok(text(renderer.root.findByProps({ role: "alert" })).includes("Fixture failure"));
        await act(async () => button(renderer, "Retry").props.onClick());
        assert.equal(module.retries, 1);
      } else if (options.rows.length === 0)
        assert.equal(text(renderer.root.findByType("h3")), "No purchases yet");
      else assert.equal(cards(renderer).length, 1);
    });
  }
});
