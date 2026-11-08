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

function fixture(overallState = "populated", initialView = "overall") {
  const overallCalls = [];
  const bridgeCalls = [];
  const multiplayerCalls = [];

  const api = {
    getLeaderboardContracts: async () => ({
      schemaVersion: 1,
      contractIds: [...shared.LEADERBOARD_CONTRACTS],
    }),
    getPublicLeaderboard: async (...args) => {
      bridgeCalls.push(args);
      return {
        entries: [
          { rank: 1, displayName: "<#BF40BF>Bridge Engineer", cost: 12500, peakStress: 60.5 },
        ],
        version: 1,
        nextStart: null,
      };
    },
    getPublicMultiplayerLeaderboard: async (...args) => {
      multiplayerCalls.push(args);
      return { entries: [] };
    },
    getPublicOverallLeaderboard: async (...args) => {
      overallCalls.push(args);
      if (overallState === "error") throw new Error("Private backend error");
      if (overallState === "loading") return new Promise(() => {});
      if (overallState === "empty") return { entries: [], version: 1, nextStart: null };
      return {
        entries: [
          {
            rank: 1,
            displayName: "<#BF40BF>Supreme Architect",
            totalScore: 125000,
            bridgesCompleted: 45,
            challengesCompleted: 28,
          },
          {
            rank: 2,
            displayName: "Junior Draftsman",
            totalScore: 98000,
            bridgesCompleted: 30,
            challengesCompleted: 15,
          },
        ],
        version: 3,
        nextStart: 20,
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
  const publicLeaderboardModule = compile("../src/components/site/PublicLeaderboard.tsx", {
    ...imports,
    "./MultiplayerLeaderboard": multiplayer,
    "@/components/site/MultiplayerLeaderboard": multiplayer,
  });

  const PublicLeaderboard = publicLeaderboardModule.PublicLeaderboard;
  const OverallLeaderboard = publicLeaderboardModule.OverallLeaderboard;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  let renderer;

  return {
    overallCalls,
    bridgeCalls,
    multiplayerCalls,
    get renderer() {
      return renderer;
    },
    async mountPublic(view = initialView) {
      await act(async () => {
        renderer = create(
          React.createElement(
            QueryClientProvider,
            { client },
            React.createElement(PublicLeaderboard, { initialView: view }),
          ),
        );
      });
      await settle();
    },
    async mountOverall() {
      await act(async () => {
        renderer = create(
          React.createElement(
            QueryClientProvider,
            { client },
            React.createElement(OverallLeaderboard),
          ),
        );
      });
      await settle();
    },
    async dispose() {
      await act(async () => {
        renderer?.unmount();
      });
      client.clear();
    },
  };
}

async function settle() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
    });
  }
}

function findButton(renderer, label) {
  return renderer.root
    .findAllByType("button")
    .find((node) => node.children.join("").trim() === label);
}

test("OverallLeaderboard renders rankings table with formatted score and career statistics", async () => {
  const f = fixture("populated");
  try {
    await f.mountOverall();
    assert.equal(f.overallCalls.length, 1);
    assert.deepEqual(f.overallCalls[0], [0, 20, undefined]);

    const content = JSON.stringify(f.renderer.toJSON());
    assert.match(content, /Overall Leaderboard/);
    assert.match(content, /Global cross-game rankings/);
    assert.match(content, /Supreme Architect/);
    assert.match(content, /125,000/);
    assert.match(content, /45/);
    assert.match(content, /28/);
    assert.match(content, /Junior Draftsman/);
    assert.match(content, /98,000/);
    assert.doesNotMatch(content, /<#BF40BF>/); // hex code stripped and styled
    assert.doesNotMatch(content, /playFabId|email|A11FACE1/);

    // Color applied to Supreme Architect
    const label = f.renderer.root
      .findAllByType("span")
      .find((node) => node.children.join("") === "Supreme Architect");
    assert.equal(label.props.style.color, "#BF40BF");

    // Table headers
    const ths = f.renderer.root.findAllByType("th").map((node) => node.children.join(""));
    assert.deepEqual(ths, ["Rank", "Player", "Total score", "Bridges built", "Challenges solved"]);
  } finally {
    await f.dispose();
  }
});

test("OverallLeaderboard pagination moves next and previous with pinned version", async () => {
  const f = fixture("populated");
  try {
    await f.mountOverall();
    assert.equal(f.overallCalls.length, 1);

    const prevBtn = findButton(f.renderer, "Previous");
    const nextBtn = findButton(f.renderer, "Next");
    assert.equal(prevBtn.props.disabled, true);
    assert.equal(nextBtn.props.disabled, false);

    // Click Next
    await act(async () => nextBtn.props.onClick());
    await settle();

    assert.equal(f.overallCalls.length, 2);
    assert.deepEqual(f.overallCalls[1], [20, 20, 3]);

    // Now Previous should be enabled
    const updatedPrev = findButton(f.renderer, "Previous");
    assert.equal(updatedPrev.props.disabled, false);

    // Click Previous
    await act(async () => updatedPrev.props.onClick());
    await settle();

    assert.equal(findButton(f.renderer, "Previous").props.disabled, true);
  } finally {
    await f.dispose();
  }
});

test("OverallLeaderboard displays empty state when no records exist", async () => {
  const f = fixture("empty");
  try {
    await f.mountOverall();
    const content = JSON.stringify(f.renderer.toJSON());
    assert.match(content, /No overall rankings recorded yet/);
    assert.equal(f.renderer.root.findAllByType("table").length, 0);
  } finally {
    await f.dispose();
  }
});

test("OverallLeaderboard displays loading status while fetching", async () => {
  const f = fixture("loading");
  try {
    await f.mountOverall();
    const status = f.renderer.root.findAllByProps({ role: "status" });
    assert.equal(status.length, 1);
    assert.match(status[0].children.join(""), /Loading overall rankings/);
  } finally {
    await f.dispose();
  }
});

test("OverallLeaderboard displays error alert on failure with Retry button", async () => {
  const f = fixture("error");
  try {
    await f.mountOverall();
    const alert = f.renderer.root.findAllByProps({ role: "alert" });
    assert.equal(alert.length, 1);
    assert.match(alert[0].children[0].children.join(""), /Unable to load the overall leaderboard/);
    assert.doesNotMatch(JSON.stringify(f.renderer.toJSON()), /Private backend error/);

    const retry = findButton(f.renderer, "Retry");
    assert.ok(retry);
    await act(async () => retry.props.onClick());
    await settle();
    assert.equal(f.overallCalls.length, 2);
  } finally {
    await f.dispose();
  }
});

test("PublicLeaderboard allows switching between Overall Leaderboard and Quest / Level Leaderboards", async () => {
  const f = fixture("populated", "overall");
  try {
    await f.mountPublic("overall");
    let content = JSON.stringify(f.renderer.toJSON());
    assert.match(content, /Overall Leaderboard/);
    assert.match(content, /Supreme Architect/);
    assert.equal(f.overallCalls.length, 1);
    assert.equal(f.bridgeCalls.length, 0);

    // Switch to Quest / Level Leaderboards
    const contractsButton = findButton(f.renderer, "Quest / Level Leaderboards");
    assert.ok(contractsButton, "Quest / Level Leaderboards button must exist");
    await act(async () => contractsButton.props.onClick());
    await settle();

    content = JSON.stringify(f.renderer.toJSON());
    assert.match(content, /Bridge Engineer/);
    assert.match(content, /All-time bridge rankings/);
    assert.equal(f.bridgeCalls.length, 1);

    // Switch back to Overall Leaderboard
    const overallButton = findButton(f.renderer, "Overall Leaderboard");
    assert.ok(overallButton, "Overall Leaderboard button must exist");
    await act(async () => overallButton.props.onClick());
    await settle();

    content = JSON.stringify(f.renderer.toJSON());
    assert.match(content, /Supreme Architect/);
    assert.doesNotMatch(content, /Bridge Engineer/);
  } finally {
    await f.dispose();
  }
});
