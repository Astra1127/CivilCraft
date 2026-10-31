import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import React from "react";
import { act, create } from "react-test-renderer";
import { renderToString } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function setup(initial, blocked = false) {
  const data = new Map(initial);
  const writes = [];
  const storage = {
    getItem(key) {
      if (blocked) throw new Error("Storage blocked");
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      if (blocked) throw new Error("Storage blocked");
      writes.push(key);
      data.set(key, value);
    },
  };
  const context = { window: { localStorage: storage } };
  function load(path, modules = {}) {
    const exports = {};
    vm.runInNewContext(
      ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
      }).outputText,
      { ...context, exports, require: (name) => modules[name] ?? require(name) },
    );
    return exports;
  }
  const helpers = load("../src/lib/cookie-notice.ts");
  const { CookieNotice } = load("../src/components/site/CookieNotice.tsx", {
    "@/lib/cookie-notice": helpers,
  });
  return { helpers, CookieNotice, data, writes };
}

test("first visit notice is accessible, links to policy, and acknowledges locally without changing sessions", async () => {
  const session = '{"sessionTicket":"untouched"}';
  const { CookieNotice, helpers, data, writes } = setup([
    ["civilcraft.session.player.v1", session],
  ]);
  assert.equal(
    renderToString(React.createElement(CookieNotice)),
    "",
    "SSR starts hidden for hydration",
  );
  let view;
  await act(() => {
    view = create(React.createElement(CookieNotice));
  });
  assert.equal(
    view.root.findByType("aside").props["aria-label"],
    "Cookies and browser storage notice",
  );
  assert.equal(view.root.findByType("a").props.href, "/cookies");
  const button = view.root.findByType("button");
  assert.equal(button.props.type, "button");
  assert.equal(button.children.join(""), "Got It");
  assert.doesNotMatch(JSON.stringify(view.toJSON()), /fixed|sticky|aria-modal|autoFocus/);
  await act(() => button.props.onClick());
  assert.equal(view.toJSON(), null);
  assert.deepEqual(writes, [helpers.COOKIE_NOTICE_KEY]);
  assert.equal(data.get("civilcraft.session.player.v1"), session);
  const saved = JSON.parse(data.get(helpers.COOKIE_NOTICE_KEY));
  assert.deepEqual(Object.keys(saved).sort(), ["acknowledgedAt", "policyVersion"]);
  assert.equal(saved.policyVersion, helpers.COOKIE_NOTICE_VERSION);
  assert.ok(Number.isFinite(Date.parse(saved.acknowledgedAt)));
  await act(() => view.unmount());
  await act(() => {
    view = create(React.createElement(CookieNotice));
  });
  assert.equal(view.toJSON(), null, "acknowledgment survives remount");
  await act(() => view.unmount());
});

test("missing, malformed, outdated and invalid-timestamp records require acknowledgment", () => {
  for (const raw of [
    undefined,
    "broken",
    "null",
    "{}",
    JSON.stringify({ policyVersion: "old", acknowledgedAt: new Date().toISOString() }),
    JSON.stringify({ policyVersion: "2026-10-30", acknowledgedAt: "invalid" }),
  ]) {
    const { helpers } = setup(raw === undefined ? [] : [["civilcraft.cookie-notice.v1", raw]]);
    assert.equal(helpers.hasCookieNoticeAcknowledgment(), false);
  }
});

test("blocked storage still allows dismissal without breaking the page", async () => {
  const { CookieNotice, writes } = setup([], true);
  let view;
  await act(() => {
    view = create(React.createElement(CookieNotice));
  });
  await act(() => view.root.findByType("button").props.onClick());
  assert.equal(view.toJSON(), null);
  assert.deepEqual(writes, []);
  await act(() => view.unmount());
});

test("storage helpers are safe without a browser", () => {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(new URL("../src/lib/cookie-notice.ts", import.meta.url), "utf8"),
      { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    ).outputText,
    { exports },
  );
  assert.equal(exports.hasCookieNoticeAcknowledgment(), false);
  assert.doesNotThrow(() => exports.acknowledgeCookieNotice());
});
