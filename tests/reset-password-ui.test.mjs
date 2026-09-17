import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { act, create } from "react-test-renderer";
import ts from "typescript";
import * as reset from "../src/lib/playfab/reset-password.ts";

const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const source = ts.transpileModule(
  readFileSync(new URL("../src/routes/reset-password.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;

async function mount(token, response = Response.json({ success: true })) {
  let search = { token };
  let url = token ? "/reset-password?token=test-token&lang=en" : "/reset-password";
  const listeners = new Set();
  const calls = [];
  const exports = {};
  const element =
    (tag) =>
    ({ children, asChild, ...props }) =>
      React.createElement(tag, props, children);
  const router = {
    Link: ({ to, children }) => React.createElement("a", { href: to }, children),
    createFileRoute: () => (config) => ({
      ...config,
      useSearch: () =>
        React.useSyncExternalStore(
          (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
          () => search,
        ),
    }),
  };
  runInNewContext(source, {
    exports,
    require: (name) => {
      if (name === "@tanstack/react-router") return router;
      if (name === "@/lib/playfab/reset-password") return reset;
      if (name === "lucide-react")
        return Object.fromEntries(
          ["CheckCircle2", "Eye", "EyeOff", "KeyRound"].map((key) => [key, element("svg")]),
        );
      if (name.endsWith("PublicLayout")) return { PublicLayout: element("main") };
      if (name.endsWith("BrandMark")) return { BrandMark: element("span") };
      if (name.endsWith("/button")) return { Button: element("button") };
      if (name.endsWith("/input")) return { Input: element("input") };
      if (name.endsWith("/label")) return { Label: element("label") };
      if (name.endsWith(".jpg")) return { default: "test.jpg" };
      return require(name);
    },
    fetch: async (path, options) => {
      calls.push({ path, ...options });
      return response;
    },
    window: {
      location: { pathname: "/reset-password" },
      history: {
        state: {},
        replaceState: (_state, _unused, path) => {
          url = path;
          // TanStack observes replaceState and updates useSearch, changing the form key.
          search = {};
          listeners.forEach((listener) => listener());
        },
      },
    },
  });
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(exports.Route.component));
  });
  return {
    get root() {
      return renderer.root;
    },
    get url() {
      return url;
    },
    calls,
    text: () => JSON.stringify(renderer.toJSON()),
    submit: async () => {
      await act(async () => {
        renderer.root
          .findAllByType("input")
          .forEach((input) => input.props.onChange({ target: { value: "NewPassword123!" } }));
      });
      await act(async () => {
        await renderer.root.findByType("form").props.onSubmit({ preventDefault() {} });
      });
    },
    rerender: async () => {
      await act(async () => renderer.update(React.createElement(exports.Route.component)));
    },
    close: async () => {
      await act(async () => renderer.unmount());
    },
  };
}

test("successful reset survives token-keyed remount and subsequent rerenders", async () => {
  const page = await mount("test-token");
  try {
    assert.equal(page.root.findAllByType("input").length, 2);
    await page.submit();
    assert.equal(page.calls.length, 1);
    assert.deepEqual(JSON.parse(page.calls[0].body), {
      token: "test-token",
      password: "NewPassword123!",
    });
    assert.equal(page.url, "/reset-password");
    await page.rerender();
    assert.match(page.text(), /Password Updated/);
    assert.match(page.text(), /Your Civil Craft password has been successfully changed\./);
    assert.match(page.text(), /You can now sign in using your new password\./);
    assert.equal(page.root.findAllByType("input").length, 0);
    assert.equal(page.root.findAllByType("form").length, 0);
    assert.doesNotMatch(page.text(), /incomplete|expired|test-token/);
    assert.equal(page.root.findByType("a").props.href, "/login");
  } finally {
    await page.close();
  }
});

test("fresh visit without token shows the incomplete link screen", async () => {
  const page = await mount(undefined);
  try {
    assert.match(page.text(), /This password reset link is incomplete\./);
    assert.equal(page.root.findAllByType("input").length, 0);
    assert.doesNotMatch(page.text(), /Password Updated/);
  } finally {
    await page.close();
  }
});

test("expired or used token has a separate recovery screen", async () => {
  const page = await mount(
    "test-token",
    Response.json({ error: reset.expiredResetLink }, { status: 410 }),
  );
  try {
    await page.submit();
    assert.match(page.text(), /This password reset link has expired or has already been used\./);
    assert.equal(page.root.findAllByType("input").length, 0);
    assert.equal(page.root.findAllByType("a")[0].props.href, "/forgot-password");
    assert.doesNotMatch(page.text(), /Password Updated|incomplete/);
  } finally {
    await page.close();
  }
});

test("service failure keeps the form and does not mislabel the link as expired", async () => {
  const page = await mount(
    "test-token",
    Response.json({ error: reset.resetFailure }, { status: 503 }),
  );
  try {
    await page.submit();
    assert.match(page.text(), /Unable to reset your password/);
    assert.equal(page.root.findAllByType("input").length, 2);
    assert.doesNotMatch(page.text(), /Password Updated|already been used|incomplete/);
  } finally {
    await page.close();
  }
});
