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
import * as visibility from "../src/lib/playfab/leaderboard-visibility.ts";

const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function fixture(initial = ["ShopKeeper", "ReedsContract"], failRead = false) {
  let ids = initial,
    failWrite = false;
  const writes = [];
  const exports = {};
  const wrapper = ({ children }) => React.createElement("div", null, children);
  const modules = {
    react: React,
    "react/jsx-runtime": require("react/jsx-runtime"),
    "@tanstack/react-query": reactQuery,
    "@tanstack/react-router": { createFileRoute: () => (value) => value },
    "@/components/admin/ui": { AdminPage: wrapper, Panel: wrapper, AdminHeading: wrapper },
    "@/components/ui/button": {
      Button: ({ children, ...props }) => React.createElement("button", props, children),
    },
    "@/lib/playfab/leaderboard-shared": shared,
    "@/lib/playfab/leaderboard-visibility": visibility,
    "@/lib/playfab/admin-service": {
      request: async (path, body) => {
        assert.equal(path, "leaderboard-contracts");
        if (!body && failRead) throw new Error("private backend failure");
        if (body) {
          writes.push(JSON.parse(JSON.stringify(body)));
          if (failWrite) throw new Error("private write failure");
          ids = body.contractIds;
        }
        return { schemaVersion: 1, contractIds: ids };
      },
    },
  };
  runInNewContext(
    ts.transpileModule(
      readFileSync(new URL("../src/routes/admin.leaderboard.tsx", import.meta.url), "utf8"),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
      },
    ).outputText,
    { exports, require: (name) => modules[name] ?? require(name) },
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(
        QueryClientProvider,
        { client },
        React.createElement(exports.AdminLeaderboardContracts),
      ),
    );
  });
  await settle();
  return {
    renderer,
    writes,
    client,
    failWrite(value) {
      failWrite = value;
    },
    failRead(value) {
      failRead = value;
    },
    async dispose() {
      await act(async () => renderer.unmount());
      client.clear();
    },
  };
}
async function settle() {
  for (let i = 0; i < 4; i++)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
}
function button(f, label) {
  return f.renderer.root.findAllByType("button").find((node) => node.children.join("") === label);
}

test("admin checkboxes save the complete selection including empty and invalidate public selections", async () => {
  const f = await fixture();
  try {
    const checkboxes = () => f.renderer.root.findAllByType("input");
    assert.equal(checkboxes().length, shared.LEADERBOARD_CONTRACTS.length);
    assert.equal(button(f, "Save contracts").props.disabled, true);
    for (const input of checkboxes().filter((node) => node.props.checked)) {
      await act(async () => input.props.onChange({ target: { checked: false } }));
    }
    f.client.setQueryData(["leaderboard-contracts"], {
      schemaVersion: 1,
      contractIds: ["ShopKeeper"],
    });
    f.client.setQueryData(["public-leaderboard", "ShopKeeper"], { entries: [] });
    await act(async () => button(f, "Save contracts").props.onClick());
    await settle();
    assert.deepEqual(f.writes, [{ schemaVersion: 1, contractIds: [] }]);
    assert.ok(checkboxes().every((node) => !node.props.checked));
    assert.equal(button(f, "Save contracts").props.disabled, true);
    assert.equal(f.client.getQueryState(["leaderboard-contracts"]).isInvalidated, true);
    assert.equal(f.client.getQueryState(["public-leaderboard", "ShopKeeper"]).isInvalidated, true);
    assert.match(JSON.stringify(f.renderer.toJSON()), /Contract selection saved/);
  } finally {
    await f.dispose();
  }
});

test("failed save retains draft and retry persists only when confirmed by the server", async () => {
  const f = await fixture();
  try {
    f.failWrite(true);
    await act(async () =>
      f.renderer.root.findAllByType("input")[0].props.onChange({ target: { checked: false } }),
    );
    await act(async () => button(f, "Save contracts").props.onClick());
    await settle();
    assert.equal(f.renderer.root.findAllByType("input")[0].props.checked, false);
    assert.match(JSON.stringify(f.renderer.toJSON()), /Unable to save/);
    assert.doesNotMatch(
      JSON.stringify(f.renderer.toJSON()),
      /private write failure|Contract selection saved/,
    );
    f.failWrite(false);
    await act(async () => button(f, "Save contracts").props.onClick());
    await settle();
    assert.equal(f.writes.length, 2);
    assert.deepEqual(f.writes[1], { schemaVersion: 1, contractIds: ["ReedsContract"] });
  } finally {
    await f.dispose();
  }
});

test("failed initial settings read offers retry without showing default checked contracts", async () => {
  const f = await fixture([], true);
  try {
    assert.equal(f.renderer.root.findAllByType("input").length, 0);
    assert.equal(f.writes.length, 0);
    assert.equal(f.renderer.root.findAllByProps({ role: "alert" }).length, 1);
    assert.doesNotMatch(JSON.stringify(f.renderer.toJSON()), /private backend failure/);
    f.failRead(false);
    await act(async () => button(f, "Retry").props.onClick());
    await settle();
    assert.equal(f.renderer.root.findAllByType("input").length, 9);
    assert.ok(f.renderer.root.findAllByType("input").every((node) => !node.props.checked));
  } finally {
    await f.dispose();
  }
});
