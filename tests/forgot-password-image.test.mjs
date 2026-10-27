import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import React from "react";
import { act, create } from "react-test-renderer";
import ts from "typescript";

const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
test("Forgot Password imports the existing screenshot, keeps its frame/layout and recovery form", async () => {
  const asset = "../../InGameSS/828830518_1064869809875079_8504090739041572536_n.jpg";
  assert.ok(
    existsSync(
      new URL("../InGameSS/828830518_1064869809875079_8504090739041572536_n.jpg", import.meta.url),
    ),
  );
  const source = readFileSync(
    new URL("../src/routes/forgot-password.tsx", import.meta.url),
    "utf8",
  );
  const exports = {};
  const wrap =
    (tag) =>
    ({ children, ...props }) =>
      React.createElement(tag, props, children);
  let requests = 0;
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      exports,
      require: (name) =>
        ({
          [asset]: { default: "/existing-original-scene.jpg" },
          "@tanstack/react-router": { createFileRoute: () => (config) => config, Link: wrap("a") },
          "lucide-react": { KeyRound: wrap("svg"), MailCheck: wrap("svg") },
          sonner: { toast: {} },
          "@/components/common/DemoBadge": { IntegrationNotice: wrap("aside") },
          "@/components/site/PublicLayout": { PublicLayout: wrap("main") },
          "@/components/site/BrandMark": { BrandMark: wrap("span") },
          "@/components/ui/button": { Button: wrap("button") },
          "@/components/ui/input": { Input: wrap("input") },
          "@/components/ui/label": { Label: wrap("label") },
          "@/lib/auth": {
            useAuth: () => ({
              requestPasswordReset: async () => {
                requests++;
              },
            }),
          },
        })[name] ?? require(name),
    },
  );
  let view;
  await act(async () => {
    view = create(React.createElement(exports.Route.component));
  });
  assert.equal(view.root.findByType("img").props.src, "/existing-original-scene.jpg");
  assert.match(
    view.root.findByType("img").props.className,
    /h-full w-full object-cover object-center/,
  );
  assert.equal(view.root.findByType("img").parent.props.className, "game-frame hidden lg:block");
  assert.ok(
    view.root.findAllByType("div").some((node) => node.props.className?.includes("lg:grid-cols-2")),
  );
  assert.equal(view.root.findByType("input").props.id, "recovery-email");
  assert.equal(typeof view.root.findByType("form").props.onSubmit, "function");
  assert.equal(requests, 0);
  await act(async () => view.unmount());
});
