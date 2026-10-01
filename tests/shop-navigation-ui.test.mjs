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
function load(path, auth, navigations, queries = [], adminSession = null) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const navigate = (args) => navigations.push(args);
  runInNewContext(source, {
    exports,
    require: (name) => {
      if (name === "react" || name === "react/jsx-runtime") return require(name);
      if (name === "@tanstack/react-router")
        return {
          Link: ({ to, children, ...props }) =>
            React.createElement("a", { ...props, href: to }, children),
          useNavigate: () => navigate,
          createFileRoute: () => (config) => config,
          Outlet: () => {
            const child = load("../src/routes/dashboard.shop.tsx", auth, navigations, queries).Route
              .component;
            return React.createElement(child);
          },
          redirect: (args) => Object.assign(new Error("redirect"), args),
        };
      if (name === "@/lib/auth") return { useAuth: () => auth };
      if (name === "@/lib/admin-auth/functions")
        return { getAdminSession: async () => adminSession };
      if (name === "@tanstack/react-query")
        return {
          useQuery: (options) => {
            queries.push(options);
            return { data: options.initialData };
          },
        };
      if (name === "@/lib/payments/products")
        return { DEFAULT_PRODUCTS: [], formatProductPrice: () => "" };
      if (name === "@/lib/utils") return { cn: (...values) => values.filter(Boolean).join(" ") };
      if (name.endsWith("/button")) return { Button: element("button") };
      return new Proxy({}, { get: () => element("div") });
    },
  });
  return exports;
}

test("desktop and mobile public menus have the requested links and no shop", async () => {
  const { SiteNavbar } = load("../src/components/site/SiteNavbar.tsx", { adminReady: true }, []);
  let renderer;
  try {
    await act(async () => {
      renderer = create(React.createElement(SiteNavbar));
    });
    const menus = renderer.root.findAllByType("ul");
    const expected = ["Home", "About", "Gallery", "FAQ", "Download", "Contact"];
    assert.deepEqual(
      menus[0].findAllByType("a").map((a) => a.props.children),
      expected,
    );
    assert.deepEqual(
      menus[1].findAllByType("a").map((a) => a.props.children),
      [...expected, "Login"],
    );
    assert.equal(
      renderer.root.findAllByType("a").filter((a) => a.props.href === "/login").length,
      2,
    );
    assert.ok(!renderer.root.findAllByType("a").some((a) => a.props.href === "/shop"));
  } finally {
    if (renderer) await act(async () => renderer.unmount());
  }
});

test("direct shop access waits for player auth and does not accept admin-only auth", async () => {
  for (const auth of [
    { ready: false, isAuthenticated: false },
    { ready: true, isAuthenticated: false },
    { ready: true, isAuthenticated: false, isAdmin: true },
    { ready: true, isAuthenticated: true, player: { playFabId: "ABC" } },
  ]) {
    const navigations = [],
      queries = [];
    const { Route } = load("../src/routes/dashboard.tsx", auth, navigations, queries);
    assert.equal(Route.ssr, false);
    let renderer;
    try {
      await act(async () => {
        renderer = create(React.createElement(Route.component));
      });
      if (auth.isAuthenticated) {
        assert.equal(navigations.length, 0);
        assert.equal(queries.length, 2);
      } else {
        assert.equal(queries.length, 0, "Shop queries must not mount before player authentication");
        assert.equal(navigations.length, auth.ready ? 1 : 0);
        if (auth.ready) assert.equal(navigations[0].to, "/login");
      }
    } finally {
      if (renderer) await act(async () => renderer.unmount());
    }
  }
});

test("admin products inherits the admin-only direct route guard", async () => {
  for (const session of [null, { authenticated: false }, { authenticated: true }]) {
    const { Route } = load("../src/routes/admin.tsx", {}, [], [], session);
    const run = () => Route.beforeLoad({ location: { pathname: "/admin/products" } });
    if (session?.authenticated) await assert.doesNotReject(run);
    else await assert.rejects(run, (e) => e.to === "/admin/login");
  }
});

test("legacy shop and checkout callbacks redirect into the dashboard without losing the order", () => {
  const shop = load("../src/routes/shop.tsx", {}, []).Route;
  assert.throws(
    () => shop.beforeLoad(),
    (e) => e.to === "/dashboard/shop" && e.replace,
  );
  for (const kind of ["success", "cancel"]) {
    const route = load(`../src/routes/payment.${kind}.tsx`, {}, []).Route;
    const search = route.validateSearch({ order_id: "order-123" });
    assert.throws(
      () => route.beforeLoad({ search }),
      (e) => e.to === `/dashboard/payment/${kind}` && e.search.order_id === "order-123",
    );
  }
});
