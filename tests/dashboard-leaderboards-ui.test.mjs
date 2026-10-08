import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { act, create } from "react-test-renderer";
import ts from "typescript";
import * as sessionErrors from "../src/lib/playfab/session-errors.ts";

const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const wrapper = ({ children }) => React.createElement("div", null, children);
const generic = new Proxy({}, { get: () => wrapper });

function load(path, auth = {}, navigations = [], snapshots = []) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const imports = {
    react: React,
    "react/jsx-runtime": require("react/jsx-runtime"),
    "@/lib/auth": { useAuth: () => auth },
    "@/lib/playfab/session-errors": sessionErrors,
    "@tanstack/react-router": {
      createFileRoute: () => (config) => config,
      useNavigate: () => (args) => navigations.push(args),
      Outlet: () => React.createElement("section", { "data-outlet": true }),
    },
    "@/components/dashboard/DashboardShell": {
      DashboardShell: ({ items, children }) => {
        snapshots.push(items);
        return React.createElement(
          "div",
          { "data-dashboard-shell": true },
          React.createElement(
            "nav",
            null,
            items.map((item) =>
              React.createElement("a", { key: item.to, href: item.to }, item.label),
            ),
          ),
          children,
        );
      },
    },
    "@/components/site/PublicLeaderboard": {
      PublicLeaderboard: () => React.createElement("section", { "data-shared-leaderboard": true }),
    },
    "@/components/common/States": {
      LoadingState: ({ label }) => React.createElement("p", { role: "status" }, label),
      ErrorState: ({ title, description }) =>
        React.createElement("p", { role: "alert" }, title, description),
    },
  };
  runInNewContext(source, {
    exports,
    require: (name) => imports[name] ?? generic,
    window: { location: { pathname: "/dashboard/leaderboards", search: "", hash: "" } },
  });
  return exports.Route;
}

test("dashboard leaderboards is a real shared rankings view, not a public-page redirect", async () => {
  const route = load("../src/routes/dashboard.leaderboards.tsx");
  assert.equal(route.beforeLoad, undefined);
  assert.equal(typeof route.component, "function");
  let renderer;
  try {
    await act(async () => {
      renderer = create(React.createElement(route.component));
    });
    assert.equal(renderer.root.findAllByProps({ "data-shared-leaderboard": true }).length, 1);
  } finally {
    await act(async () => renderer?.unmount());
  }
});

test("authenticated dashboard navigation restores the Leaderboards link", async () => {
  const navigations = [],
    snapshots = [];
  const route = load(
    "../src/routes/dashboard.tsx",
    {
      ready: true,
      isAuthenticated: true,
      player: { playFabId: "ABC123" },
    },
    navigations,
    snapshots,
  );
  let renderer;
  try {
    await act(async () => {
      renderer = create(React.createElement(route.component));
    });
    assert.equal(route.ssr, false);
    assert.equal(navigations.length, 0);
    assert.ok(snapshots.length);
    const item = snapshots.at(-1).find((entry) => entry.to === "/dashboard/leaderboards");
    assert.equal(item?.label, "Leaderboards");
    assert.equal(typeof item.icon, "function");
    assert.equal(renderer.root.findAllByProps({ href: "/dashboard/leaderboards" }).length, 1);
  } finally {
    await act(async () => renderer?.unmount());
  }
});

for (const state of ["restoring", "restore-outage", "admin-only", "expired"]) {
  test(`restored leaderboard link preserves the player dashboard gate for ${state}`, async () => {
    const navigations = [],
      snapshots = [];
    const waiting = state === "restoring" || state === "restore-outage";
    const route = load(
      "../src/routes/dashboard.tsx",
      {
        ready: !waiting,
        isAuthenticated: false,
        isAdmin: state === "admin-only",
        playerSessionError: state === "restore-outage",
        sessionExpired: state === "expired",
        retryPlayerSession: () => {},
      },
      navigations,
      snapshots,
    );
    let renderer;
    try {
      await act(async () => {
        renderer = create(React.createElement(route.component));
      });
      assert.equal(snapshots.length, 0);
      assert.equal(renderer.root.findAllByProps({ "data-outlet": true }).length, 0);
      if (waiting) {
        assert.equal(navigations.length, 0);
        assert.equal(
          renderer.root.findAllByProps({ role: state === "restore-outage" ? "alert" : "status" })
            .length,
          1,
        );
      } else {
        assert.equal(navigations[0].to, "/login");
        assert.equal(navigations[0].search.redirect, "/dashboard/leaderboards");
        assert.equal(navigations[0].search.reason, state === "expired" ? "expired" : undefined);
      }
    } finally {
      await act(async () => renderer?.unmount());
    }
  });
}
