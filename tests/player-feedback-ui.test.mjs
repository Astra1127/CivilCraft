import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { act, create } from "react-test-renderer";
import ts from "typescript";
import { feedbackSchema, feedbackCategories } from "../src/lib/cms/message-types.ts";
const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
function load(query, submit, notifications) {
  const exports = {};
  runInNewContext(
    ts.transpileModule(
      readFileSync(
        new URL("../src/components/dashboard/FeedbackForm.tsx", import.meta.url),
        "utf8",
      ),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
      },
    ).outputText,
    {
      exports,
      Error,
      require: (name) => {
        if (name === "@/lib/cms/messages")
          return { useFeedbackEligibility: () => query, submitPlayerFeedback: submit };
        if (name === "@/lib/cms/message-types") return { feedbackSchema, feedbackCategories };
        if (name === "sonner") return { toast: { success: (text) => notifications.push(text) } };
        if (name === "@tanstack/react-router")
          return { Link: ({ children, to }) => React.createElement("a", { href: to }, children) };
        if (name.startsWith("@/components/ui/"))
          return new Proxy(
            {},
            {
              get:
                (_, key) =>
                ({ children, ...props }) =>
                  React.createElement(key, props, children),
            },
          );
        return require(name);
      },
    },
  );
  return exports.FeedbackForm;
}
test("locked/outage states show distinct guidance and no feedback form", async () => {
  for (const isError of [false, true]) {
    let tree;
    await act(() => {
      tree = create(
        React.createElement(
          load(
            { data: { eligible: false }, isPending: false, isError, refetch() {} },
            () => {
              throw Error("must not submit");
            },
            [],
          ),
          { playerId: "AAA", onSubmitted() {} },
        ),
      );
    });
    assert.equal(tree.root.findAllByType("form").length, 0);
    const text = JSON.stringify(tree.toJSON());
    assert.match(text, isError ? /couldn't verify/ : /complete a bridge-building challenge/);
    if (!isError) assert.equal(tree.root.findByType("a").props.href, "/download");
    await act(() => tree.unmount());
  }
});
test("eligible form submits allowed category and refreshes history after persistence", async () => {
  let tree, submitted, selected;
  const notifications = [];
  const Component = load(
    { data: { eligible: true }, isPending: false, isError: false },
    async (input) => {
      submitted = input;
      return { id: "saved-feedback" };
    },
    notifications,
  );
  await act(() => {
    tree = create(
      React.createElement(Component, {
        playerId: "AAA",
        onSubmitted: async (id) => {
          selected = id;
        },
      }),
    );
  });
  assert.equal(tree.root.findAllByType("option").length, 4);
  await act(() =>
    tree.root.findByType("Input").props.onChange({ target: { value: "A bridge suggestion" } }),
  );
  await act(() =>
    tree.root
      .findByType("Textarea")
      .props.onChange({ target: { value: "Please improve the bridge controls." } }),
  );
  await act(() =>
    tree.root.findByType("select").props.onChange({ target: { value: "Suggestion" } }),
  );
  await act(() => tree.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  assert.equal(submitted.inquiryType, "Suggestion");
  assert.equal(submitted.action, "feedback");
  assert.equal(selected, "saved-feedback");
  assert.deepEqual(notifications, ["Feedback sent"]);
  assert.equal(tree.root.findByType("Textarea").props.value, "");
  await act(() => tree.unmount());
});
test("submission failure retains text and shows server retry error", async () => {
  let tree;
  const notifications = [];
  await act(() => {
    tree = create(
      React.createElement(
        load(
          { data: { eligible: true }, refetch() {} },
          async () => {
            throw Error("Service unavailable; retry later");
          },
          notifications,
        ),
        { playerId: "AAA", onSubmitted() {} },
      ),
    );
  });
  await act(() =>
    tree.root.findByType("Input").props.onChange({ target: { value: "Bridge controls" } }),
  );
  await act(() =>
    tree.root
      .findByType("Textarea")
      .props.onChange({ target: { value: "Please improve bridge controls." } }),
  );
  await act(() => tree.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  assert.equal(tree.root.findByType("Textarea").props.value, "Please improve bridge controls.");
  assert.match(JSON.stringify(tree.toJSON()), /retry later/);
  assert.deepEqual(notifications, []);
  await act(() => tree.unmount());
});
