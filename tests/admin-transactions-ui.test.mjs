import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import React from "react";
import { act, create } from "react-test-renderer";
import ts from "typescript";
import {
  adminTransaction,
  filterTransactions,
  transactionCharts,
} from "../src/lib/payments/admin-transactions.ts";
const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const primitive =
  (tag) =>
  ({ children, ...props }) =>
    React.createElement(tag, props, children);
const primitives = new Proxy(
  {},
  { get: (cache, name) => (cache[name] ??= primitive(String(name))) },
);
async function mount(state) {
  const exports = {};
  const modules = {
    "@tanstack/react-router": { createFileRoute: () => (x) => x },
    "@tanstack/react-query": { useQuery: () => state },
    "@/components/admin/ui": {
      AdminPage: primitive("main"),
      Panel: primitive("section"),
      StatusPill: primitive("span"),
      AdminHeading: ({ title, actions }) => React.createElement("header", null, title, actions),
    },
    "@/components/common/States": primitives,
    "@/components/ui/button": { Button: primitive("button") },
    "@/lib/playfab": { adminPlayerService: {} },
    "@/lib/payments/admin-transactions": { filterTransactions, transactionCharts },
    recharts: primitives,
    "lucide-react": primitives,
  };
  runInNewContext(
    ts.transpileModule(
      readFileSync(new URL("../src/routes/admin.transactions.tsx", import.meta.url), "utf8"),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
    ).outputText,
    { exports, require: (name) => modules[name] ?? require(name) },
  );
  let renderer;
  await act(() => {
    renderer = create(React.createElement(exports.Route.component));
  });
  return renderer;
}
const text = (node) =>
  typeof node === "string" ? node : (node?.children ?? []).map(text).join("");
test("graphs and table follow filters and pagination without mutation controls", async () => {
  const records = Array.from({ length: 21 }, (_, i) =>
    adminTransaction({
      orderId: `ORDER-${i}`,
      playFabId: `PLAYER-${i}`,
      productId: "coins",
      expectedCoins: 500,
      expectedAmount: 4900,
      currency: "PHP",
      status: "fulfilled",
      createdAt: new Date().toISOString(),
      paidAt: null,
      fulfilledAt: null,
      PayMongoReferenceNumber: `REF-${i}`,
    }),
  );
  const renderer = await mount({
    data: { configured: true, records },
    isPending: false,
    isError: false,
    refetch: () => {},
  });
  assert.equal(renderer.root.findAllByType("LineChart").length, 1);
  assert.equal(renderer.root.findAllByType("tbody")[0].findAllByType("tr").length, 20);
  const buttons = renderer.root.findAllByType("button");
  assert.deepEqual(buttons.map(text), ["Refresh", "Previous", "Next"]);
  await act(() => buttons.find((b) => text(b) === "Next").props.onClick());
  assert.equal(renderer.root.findAllByType("tbody")[0].findAllByType("tr").length, 1);
  await act(() =>
    renderer.root.findByType("input").props.onChange({ target: { value: "PLAYER-20" } }),
  );
  assert.equal(renderer.root.findByType("BarChart").props.data[0].orders, 1);
  assert.match(text(renderer.toJSON()), /PLAYER-20/);
  await act(() =>
    renderer.root.findByType("input").props.onChange({ target: { value: "no-match" } }),
  );
  assert.equal(renderer.root.findAllByType("EmptyState").length, 1);
  assert.equal(renderer.root.findAllByType("LineChart").length, 0);
  await act(() => renderer.unmount());
});
test("provider failure hides charts and totals rather than fabricating zero activity", async () => {
  const renderer = await mount({ isError: true, isPending: false, refetch: () => {} });
  assert.equal(renderer.root.findAllByType("ErrorState").length, 1);
  assert.equal(renderer.root.findAllByType("LineChart").length, 0);
  assert.doesNotMatch(text(renderer.toJSON()), /Total orders/);
  await act(() => renderer.unmount());
});
