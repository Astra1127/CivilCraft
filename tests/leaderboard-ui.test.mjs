import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { act, create } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as reactQuery from "@tanstack/react-query";
import ts from "typescript";
import * as shared from "../src/lib/playfab/leaderboard-shared.ts";

const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
test("selectors reset paging/version, scope both queries, and display decoded measurements", async () => {
  const calls = [];
  const row = {
    playFabId: "ABC",
    displayName: "Engineer",
    rank: 1,
    score: 2135125720,
    cost: 12345,
    peakStress: 58.2,
    level: null,
  };
  const exports = {};
  const element =
    (tag) =>
    ({ children, ...props }) =>
      React.createElement(tag, props, children);
  const source = ts.transpileModule(
    readFileSync(new URL("../src/components/site/LeaderboardView.tsx", import.meta.url), "utf8"),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    },
  ).outputText;
  runInNewContext(source, {
    exports,
    require: (name) => {
      if (name === "@tanstack/react-query") return reactQuery;
      if (name === "@/lib/playfab/leaderboard-shared") return shared;
      if (name === "@/lib/playfab")
        return {
          leaderboardService: {
            getLeaderboard: async (...args) => {
              calls.push(["top", ...args]);
              return { entries: [row], version: 3, nextStart: 20 };
            },
            getPlayerRank: async (...args) => {
              calls.push(["mine", ...args]);
              return row;
            },
          },
        };
      if (name === "@/lib/utils") return { cn: (...args) => args.filter(Boolean).join(" ") };
      if (name === "lucide-react")
        return Object.fromEntries(
          ["Crown", "Medal", "Search", "Trophy"].map((k) => [k, element("svg")]),
        );
      if (name.endsWith("/States"))
        return {
          EmptyState: element("aside"),
          ErrorState: element("aside"),
          LoadingState: element("aside"),
        };
      if (name.endsWith("/button")) return { Button: element("button") };
      if (name.endsWith("/input")) return { Input: element("input") };
      if (name.endsWith("/tabs"))
        return { Tabs: element("div"), TabsList: element("div"), TabsTrigger: element("button") };
      return require(name);
    },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  let renderer;
  const settle = async () => {
    for (let i = 0; i < 4; i++)
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
  };
  try {
    await act(async () => {
      renderer = create(
        React.createElement(
          QueryClientProvider,
          { client },
          React.createElement(exports.LeaderboardView, { highlightId: "ABC" }),
        ),
      );
    });
    await settle();
    assert.ok(
      calls.some(
        (c) =>
          c[0] === "top" && c[4] === "all-time" && c[6] === "ShopKeeper" && c[7] === "efficient",
      ),
    );
    const text = JSON.stringify(renderer.toJSON());
    assert.ok(text.includes("58.2"));
    assert.ok(text.includes("₱"));
    assert.ok(!text.includes("2135125720"));
    assert.equal(
      renderer.root.findAllByType("button").find((b) => b.props.children === "Weekly").props
        .disabled,
      true,
    );
    await act(async () => {
      renderer.root
        .findAllByType("button")
        .find((b) => b.props.children === "Next")
        .props.onClick();
    });
    await settle();
    assert.ok(calls.some((c) => c[0] === "top" && c[1] === 20));
    let before = calls.length;
    await act(async () => {
      renderer.root
        .findAllByType("select")[0]
        .props.onChange({ target: { value: "VancesContract" } });
    });
    await settle();
    let reads = calls.slice(before);
    assert.ok(
      reads.some(
        (c) => c[0] === "top" && c[1] === 0 && c[2] === undefined && c[6] === "VancesContract",
      ),
    );
    assert.ok(
      reads.some((c) => c[0] === "mine" && c[4] === "VancesContract" && c[5] === "efficient"),
    );
    before = calls.length;
    await act(async () => {
      renderer.root.findAllByType("select")[1].props.onChange({ target: { value: "strongest" } });
    });
    await settle();
    reads = calls.slice(before);
    assert.ok(
      reads.some((c) => c[0] === "top" && c[1] === 0 && c[2] === undefined && c[7] === "strongest"),
    );
    assert.ok(
      reads.some((c) => c[0] === "mine" && c[4] === "VancesContract" && c[5] === "strongest"),
    );
  } finally {
    if (renderer) await act(async () => renderer.unmount());
    client.clear();
  }
});
