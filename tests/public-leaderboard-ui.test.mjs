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
import { playerNameDependencies } from "./helpers/player-name-ui.mjs";

const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
test("public rankings display measurements, pin paging versions and reset on selection", async () => {
  const calls = [], exports = {};
  const source = ts.transpileModule(readFileSync("src/components/site/PublicLeaderboard.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(source, { exports, require: (name) => {
    if (playerNameDependencies[name]) return playerNameDependencies[name];
    if (name === "@tanstack/react-query") return reactQuery;
    if (name.endsWith("/leaderboard-shared")) return shared;
    if (name.endsWith("/public-leaderboard")) return { getPublicLeaderboard: async (...args) => {
      calls.push(args);
      return { entries: [{ rank: 1, displayName: "<#BF40BF>Public Engineer", cost: 12345, peakStress: 58.2 }], version: 3, nextStart: 20 };
    } };
    if (name.endsWith("/button")) return { Button: ({ children, ...props }) => React.createElement("button", props, children) };
    return require(name);
  } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  let renderer;
  const settle = async () => { for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)); }); };
  try {
    await act(async () => { renderer = create(React.createElement(QueryClientProvider, { client }, React.createElement(exports.PublicLeaderboard))); });
    await settle();
    const content = JSON.stringify(renderer.toJSON());
    assert.match(content, /Public Engineer/);
    assert.doesNotMatch(content, /<#BF40BF>/);
    const playerLabel = renderer.root.findAllByType("span").find((node) => node.children.join("") === "Public Engineer");
    assert.equal(playerLabel.props.style.color, "#BF40BF");
    assert.match(content, /12,345/);
    assert.match(content, /58.2/);
    assert.doesNotMatch(content, /playFabId|email|AccountId/);
    await act(async () => renderer.root.findAllByType("button").find((b) => b.props.children === "Next").props.onClick());
    await settle();
    assert.deepEqual(calls.at(-1), [shared.DEFAULT_CONTRACT, shared.DEFAULT_MODE, 20, 3]);
    await act(async () => renderer.root.findAllByType("select")[1].props.onChange({ target: { value: "strongest" } }));
    await settle();
    assert.deepEqual(calls.at(-1), [shared.DEFAULT_CONTRACT, "strongest", 0, undefined]);
  } finally { await act(async () => renderer?.unmount()); client.clear(); }
});
