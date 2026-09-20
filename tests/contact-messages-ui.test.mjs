import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { act, create } from "react-test-renderer";
import ts from "typescript";
import { contactSchema, inquiryTypes } from "../src/lib/cms/message-types.ts";

const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const fields = {
  name: "Contact Tester",
  email: "contact@example.test",
  subject: "New inbox message",
  message: "Please verify this message in the admin inbox.",
};
function load(file, messages, notifications) {
  const exports = {};
  const element =
    (tag) =>
    ({ children, ...props }) =>
      React.createElement(tag, props, children);
  runInNewContext(
    ts.transpileModule(readFileSync(new URL("../src/routes/" + file, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      exports,
      require: (name) => {
        if (name === "@tanstack/react-router") return { createFileRoute: () => (config) => config };
        if (name === "@/lib/cms/messages") return messages;
        if (name === "@/lib/cms/contact-settings")
          return {
            useContactSettings: () => ({ data: { social: {} } }),
            emptyContactSettings: { social: {} },
          };
        if (name.endsWith("/MessageConversation"))
          return {
            MessageConversation: ({ message }) => React.createElement("p", null, message.message),
          };
        if (name === "@/lib/cms/message-types") return { contactSchema, inquiryTypes };
        if (name === "@/lib/cms/content-types") return { isRealText: () => false };
        if (name === "@/lib/cms/store")
          return {
            useCms: (selector) => selector({ settings: { social: {} }, faq: [] }),
            formatDate: (value) => value,
            logActivity: () => {},
          };
        if (name === "sonner")
          return {
            toast: {
              success: (text) => notifications.push(["success", text]),
              error: (text) => notifications.push(["error", text]),
            },
          };
        if (name === "@/lib/utils") return { cn: (...values) => values.join(" ") };
        if (name.startsWith("@/components/") || name === "lucide-react")
          return new Proxy({}, { get: (_, key) => element(key) });
        return require(name);
      },
    },
  );
  return exports.Route.component;
}

test("form waits for persistence, then a freshly mounted admin inbox displays the message", async () => {
  const notifications = [],
    saved = [];
  let resolve;
  const messages = {
    messageService: {
      submit: (input) =>
        new Promise((done) => {
          resolve = () => {
            saved.push({
              ...input,
              id: "test-id",
              createdAt: "2026-09-20T00:00:00Z",
              status: "New",
            });
            done({ id: "test-id" });
          };
        }),
    },
    useMessages: () => ({ data: { messages: saved }, isPending: false, isError: false }),
  };
  let form, inbox;
  await act(() => {
    form = create(React.createElement(load("contact.tsx", messages, notifications)));
  });
  for (const [id, value] of Object.entries(fields)) {
    await act(() =>
      form.root
        .findAll((node) => typeof node.type === "string" && node.props.id === id)[0]
        .props.onChange({ target: { value } }),
    );
  }
  let submission;
  await act(() => {
    submission = form.root.findByType("form").props.onSubmit({ preventDefault() {} });
  });
  assert.equal(
    form.root.findAll((node) => node.type === "Button" && node.props.type === "submit")[0].props
      .disabled,
    true,
  );
  assert.deepEqual(notifications, []);
  await act(async () => {
    resolve();
    await submission;
  });
  assert.equal(notifications[0][0], "success");
  assert.equal(
    form.root.findAll((node) => node.type === "Input" && node.props.id === "name")[0].props.value,
    "",
  );
  await act(() => {
    inbox = create(React.createElement(load("admin.messages.tsx", messages, notifications)));
  });
  assert.ok(
    inbox.root.findAll((node) => node.type === "p" && node.children.includes(fields.subject))
      .length > 0,
  );
  assert.ok(
    inbox.root.findAll((node) => node.type === "p" && node.children.includes(fields.message))
      .length > 0,
  );
  await act(() => {
    form.unmount();
    inbox.unmount();
  });
});

test("failed submission preserves typed fields and never displays success", async () => {
  const notifications = [];
  const messages = {
    messageService: {
      submit: async () => {
        throw new Error("Save unavailable");
      },
    },
  };
  let form;
  await act(() => {
    form = create(React.createElement(load("contact.tsx", messages, notifications)));
  });
  for (const [id, value] of Object.entries(fields)) {
    await act(() =>
      form.root
        .findAll((node) => typeof node.type === "string" && node.props.id === id)[0]
        .props.onChange({ target: { value } }),
    );
  }
  await act(() => form.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0][0], "error");
  assert.equal(
    form.root.findAll((node) => node.type === "Input" && node.props.id === "name")[0].props.value,
    fields.name,
  );
  assert.equal(
    form.root.findAll((node) => node.type === "Button" && node.props.type === "submit")[0].props
      .disabled,
    false,
  );
  await act(() => form.unmount());
});
