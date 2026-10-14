import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import React from "react";
import { act, create } from "react-test-renderer";
import ts from "typescript";
const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
test("private-message UI sends selected recipient only and requires delete confirmation", async () => {
  const exports = {},
    calls = [];
  let refreshes = 0;
  const query = {
    data: {
      messages: [
        { id: "msg", title: "Notice", body: "Private text", createdAt: "2026-10-14T00:00:00Z" },
      ],
    },
    refetch: async () => {
      refreshes++;
    },
  };
  const component =
    (tag) =>
    ({ children, ...props }) =>
      React.createElement(tag, props, children);
  const modules = {
    react: React,
    "react/jsx-runtime": require("react/jsx-runtime"),
    "@tanstack/react-query": {
      useQuery: (config) => {
        assert.deepEqual(Array.from(config.queryKey), ["admin-player-messages", "AAA"]);
        return query;
      },
    },
    "@/lib/playfab/admin-service": {
      request: async (...args) => {
        calls.push(args);
        return {};
      },
    },
    "@/components/ui/button": { Button: component("button") },
    "@/components/ui/input": { Input: component("input") },
    "@/components/ui/textarea": { Textarea: component("textarea") },
  };
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(new URL("../src/components/admin/PlayerMessages.tsx", import.meta.url), "utf8"),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
    ).outputText,
    { exports, require: (name) => modules[name] },
  );
  let renderer;
  await act(() => {
    renderer = create(React.createElement(exports.PlayerMessages, { playerId: "AAA" }));
  });
  const button = (label) =>
    renderer.root.findAllByType("button").find((b) => b.children.join("") === label);
  await act(() => renderer.root.findByType("input").props.onChange({ target: { value: "Hello" } }));
  await act(() =>
    renderer.root.findByType("textarea").props.onChange({ target: { value: "Only you" } }),
  );
  await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  assert.equal(calls[0][0], "players/AAA/messages");
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0][1])), {
    action: "send",
    title: "Hello",
    body: "Only you",
  });
  await act(() => button("Delete message").props.onClick());
  assert.equal(calls.length, 1, "Opening confirmation must not delete");
  await act(() => button("Cancel").props.onClick());
  assert.equal(calls.length, 1);
  await act(() => button("Delete message").props.onClick());
  await act(async () => button("Confirm delete").props.onClick());
  assert.deepEqual(JSON.parse(JSON.stringify(calls[1])), [
    "players/AAA/messages",
    { action: "delete", id: "msg" },
  ]);
  assert.equal(refreshes, 2);
  await act(() => renderer.unmount());
});
