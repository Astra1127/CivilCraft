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

for (const state of ["ranked", "empty", "error", "loading", "guest"]) {
  test(`Your Ranking handles ${state} without a full table or fabricated measurements`, async () => {
    const calls = [],
      exports = {};
    const source = ts.transpileModule(
      readFileSync("src/components/dashboard/YourRanking.tsx", "utf8"),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
      },
    ).outputText;
    const element =
      (tag) =>
      ({ children, asChild, ...props }) =>
        React.createElement(tag, props, children);
    runInNewContext(source, {
      exports,
      require: (name) => {
        if (name === "@tanstack/react-query") return reactQuery;
        if (name === "@tanstack/react-router") return { Link: element("a") };
        if (name === "@/lib/auth")
          return {
            useAuth: () => ({
              isAuthenticated: state !== "guest",
              player: state === "guest" ? null : { playFabId: "ABC123" },
            }),
          };
        if (name.endsWith("/leaderboard-shared")) return shared;
        if (name.endsWith("/leaderboard"))
          return {
            getOwnStanding: async (...args) => {
              calls.push(args);
              if (state === "error") throw new Error("private internal error");
              if (state === "loading") return new Promise(() => {});
              return state === "empty" ? null : { rank: 4, cost: 12345, peakStress: 58.2 };
            },
          };
        if (name.endsWith("/button")) return { Button: element("button") };
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
            React.createElement(exports.YourRanking),
          ),
        );
      });
      await settle();
      const content = JSON.stringify(renderer.toJSON());
      assert.equal(renderer.root.findAllByType("table").length, 0);
      assert.equal(renderer.root.findByType("a").props.to, "/leaderboard");
      assert.doesNotMatch(content, /ABC123|private internal error/);
      if (state === "ranked") {
        assert.match(content, /12345|12,345/);
        assert.match(content, /58.2/);
        await act(async () =>
          renderer.root
            .findAllByType("select")[1]
            .props.onChange({ target: { value: "strongest" } }),
        );
        await settle();
        assert.deepEqual(calls.at(-1), [shared.DEFAULT_CONTRACT, "strongest"]);
      } else {
        assert.doesNotMatch(content, /Construction Cost|Peak Stress/);
        assert.match(
          content,
          state === "empty"
            ? /Not ranked yet/
            : state === "error"
              ? /Ranking currently unavailable/
              : /Loading ranking/,
        );
      }
      if (state === "guest") assert.equal(calls.length, 0);
    } finally {
      await act(async () => renderer?.unmount());
      client.clear();
    }
  });
}
