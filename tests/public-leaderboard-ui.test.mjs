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
const TabContext = React.createContext(null);
const tabs = {
  Tabs: ({ children, defaultValue, value, onValueChange, ...props }) => {
    const [selected, setSelected] = React.useState(defaultValue);
    const active = value ?? selected;
    const select = (next) => {
      setSelected(next);
      onValueChange?.(next);
    };
    return React.createElement(
      TabContext.Provider,
      { value: { active, select } },
      React.createElement("div", props, children),
    );
  },
  TabsList: ({ children, ...props }) =>
    React.createElement("div", { ...props, role: "tablist" }, children),
  TabsTrigger: ({ children, value, ...props }) => {
    const { active, select } = React.useContext(TabContext);
    return React.createElement(
      "button",
      {
        ...props,
        role: "tab",
        "aria-selected": active === value,
        onClick: () => select(value),
      },
      children,
    );
  },
  TabsContent: ({ children, value, forceMount, ...props }) => {
    const { active } = React.useContext(TabContext);
    if (!forceMount && active !== value) return null;
    return React.createElement(
      "div",
      { ...props, role: "tabpanel", hidden: active !== value },
      children,
    );
  },
};

function compile(path, imports) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(source, { exports, require: (name) => imports[name] ?? require(name) });
  return exports;
}

function fixture(multiplayerState = "populated") {
  const bridgeCalls = [],
    multiplayerCalls = [];
  const api = {
    getPublicLeaderboard: async (...args) => {
      bridgeCalls.push(args);
      return {
        entries: [
          { rank: 1, displayName: "<#BF40BF>Public Engineer", cost: 12345, peakStress: 58.2 },
        ],
        version: 3,
        nextStart: 20,
      };
    },
    getPublicMultiplayerLeaderboard: async (...args) => {
      multiplayerCalls.push(args);
      if (multiplayerState === "error") throw new Error("private internal failure");
      if (multiplayerState === "loading") return new Promise(() => {});
      return {
        entries:
          multiplayerState === "empty"
            ? []
            : [
                {
                  rank: 1,
                  displayName: "<#BF40BF>Ranked Rival",
                  wins: 5,
                  losses: 3,
                  draws: 2,
                  playFabId: "private-player-id",
                  email: "private@example.test",
                },
                { rank: 2, displayName: "Draws Only", wins: 0, losses: 0, draws: 4 },
              ],
      };
    },
  };
  const imports = {
    ...playerNameDependencies,
    "@tanstack/react-query": reactQuery,
    "@/lib/playfab/leaderboard-shared": shared,
    "@/lib/playfab/public-leaderboard": api,
    "@/components/ui/tabs": tabs,
    "@/components/ui/button": {
      Button: ({ children, ...props }) => React.createElement("button", props, children),
    },
  };
  const multiplayer = compile("../src/components/site/MultiplayerLeaderboard.tsx", imports);
  const component = compile("../src/components/site/PublicLeaderboard.tsx", {
    ...imports,
    "./MultiplayerLeaderboard": multiplayer,
    "@/components/site/MultiplayerLeaderboard": multiplayer,
  }).PublicLeaderboard;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  let renderer;
  return {
    bridgeCalls,
    multiplayerCalls,
    get renderer() {
      return renderer;
    },
    async mount() {
      await act(async () => {
        renderer = create(
          React.createElement(QueryClientProvider, { client }, React.createElement(component)),
        );
      });
      await settle();
    },
    async selectTab(label) {
      const tab = renderer.root
        .findAllByProps({ role: "tab" })
        .find((node) => node.children.join("") === label);
      assert.ok(tab, `Missing ${label} tab`);
      await act(async () => tab.props.onClick());
      await settle();
    },
    async dispose() {
      await act(async () => renderer?.unmount());
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

function button(renderer, text) {
  const match = renderer.root.findAllByType("button").find((node) => node.props.children === text);
  assert.ok(match, `Missing ${text} button`);
  return match;
}

test("single-player rankings retain measurements, colors and isolated paging versions", async () => {
  const f = fixture();
  try {
    await f.mount();
    assert.equal(
      f.renderer.root
        .findAllByProps({ role: "tab" })
        .find((node) => node.children.join("") === "Single-player").props["aria-selected"],
      true,
    );
    assert.equal(f.multiplayerCalls.length, 0, "Inactive multiplayer tab must not fetch");
    const content = JSON.stringify(f.renderer.toJSON());
    assert.match(content, /Public Engineer/);
    assert.doesNotMatch(content, /<#BF40BF>/);
    const label = f.renderer.root
      .findAllByType("span")
      .find((node) => node.children.join("") === "Public Engineer");
    assert.equal(label.props.style.color, "#BF40BF");
    assert.match(content, /12,345/);
    assert.match(content, /58.2/);
    assert.doesNotMatch(content, /playFabId|email|AccountId/);
    await act(async () => button(f.renderer, "Next").props.onClick());
    await settle();
    assert.deepEqual(f.bridgeCalls.at(-1), [shared.DEFAULT_CONTRACT, shared.DEFAULT_MODE, 20, 3]);
    await act(async () =>
      f.renderer.root.findAllByType("select")[1].props.onChange({ target: { value: "strongest" } }),
    );
    await settle();
    assert.deepEqual(f.bridgeCalls.at(-1), [shared.DEFAULT_CONTRACT, "strongest", 0, undefined]);
    assert.equal(f.multiplayerCalls.length, 0);
  } finally {
    await f.dispose();
  }
});

test("multiplayer tab fetches only its board, colors names and excludes draws from win rate", async () => {
  const f = fixture();
  try {
    await f.mount();
    const previousBridgeCalls = f.bridgeCalls.length;
    await f.selectTab("Multiplayer");
    assert.equal(f.bridgeCalls.length, previousBridgeCalls);
    assert.equal(f.multiplayerCalls.length, 1);
    const multiplayerArgs = f.multiplayerCalls[0];
    assert.ok(
      multiplayerArgs.length <= 1,
      "Multiplayer must not receive bridge contract or paging arguments",
    );
    if (multiplayerArgs.length) {
      assert.deepEqual(
        Array.from(multiplayerArgs[0].queryKey),
        ["public-multiplayer-leaderboard"],
        "Only React Query's isolated context may be supplied",
      );
    }
    const content = JSON.stringify(f.renderer.toJSON());
    assert.match(content, /Ranked Rival/);
    assert.match(content, /62\.5%/);
    assert.doesNotMatch(
      content,
      /<#BF40BF>|private-player-id|private@example|private internal|Public Engineer/,
    );
    assert.equal(f.renderer.root.findAllByType("select").length, 0);
    assert.equal(
      f.renderer.root
        .findAllByType("button")
        .some((node) => ["Previous", "Next"].includes(node.props.children)),
      false,
    );
    const label = f.renderer.root
      .findAllByType("span")
      .find((node) => node.children.join("") === "Ranked Rival");
    assert.equal(label.props.style.color, "#BF40BF");
    const rows = f.renderer.root
      .findAllByType("tr")
      .filter((row) => row.findAllByType("td").length);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].findAllByType("td")[2].children.join(""), "5");
    assert.equal(rows[0].findAllByType("td")[3].children.join(""), "3");
    assert.equal(rows[0].findAllByType("td")[4].children.join(""), "2");
    assert.equal(rows[1].findAllByType("td").at(-1).children.join(""), "—");
    await act(async () => button(f.renderer, "Refresh").props.onClick());
    await settle();
    assert.equal(f.multiplayerCalls.length, 2);
    assert.equal(f.bridgeCalls.length, previousBridgeCalls);
  } finally {
    await f.dispose();
  }
});

test("returning from multiplayer resets single-player page and pinned version", async () => {
  const f = fixture();
  try {
    await f.mount();
    await act(async () => button(f.renderer, "Next").props.onClick());
    await settle();
    assert.equal(f.bridgeCalls.at(-1)[2], 20);
    await f.selectTab("Multiplayer");
    await f.selectTab("Single-player");
    assert.deepEqual(f.bridgeCalls.at(-1), [
      shared.DEFAULT_CONTRACT,
      shared.DEFAULT_MODE,
      0,
      undefined,
    ]);
    assert.equal(button(f.renderer, "Previous").props.disabled, true);
    assert.match(JSON.stringify(f.renderer.toJSON()), /Page /);
    assert.doesNotMatch(JSON.stringify(f.renderer.toJSON()), /Ranked Rival/);
  } finally {
    await f.dispose();
  }
});

for (const state of ["empty", "error", "loading"]) {
  test(`multiplayer ${state} state is distinct and does not invent rows`, async () => {
    const f = fixture(state);
    try {
      await f.mount();
      await f.selectTab("Multiplayer");
      const content = JSON.stringify(f.renderer.toJSON());
      assert.equal(f.renderer.root.findAllByType("table").length, 0);
      assert.doesNotMatch(content, /Ranked Rival|Public Engineer|private internal failure/);
      if (state === "loading") {
        assert.equal(f.renderer.root.findAllByProps({ role: "status" }).length, 1);
        assert.equal(button(f.renderer, "Refresh").props.disabled, true);
      } else if (state === "error") {
        assert.equal(f.renderer.root.findAllByProps({ role: "alert" }).length, 1);
        assert.match(content, /Unable|unavailable|try/i);
        await act(async () => button(f.renderer, "Refresh").props.onClick());
        await settle();
        assert.equal(f.multiplayerCalls.length, 2);
      } else {
        assert.equal(f.renderer.root.findAllByProps({ role: "alert" }).length, 0);
        assert.equal(f.renderer.root.findAllByProps({ role: "status" }).length, 0);
        assert.match(content, /No multiplayer|No ranked|No .*rankings|No .*results/i);
      }
    } finally {
      await f.dispose();
    }
  });
}
