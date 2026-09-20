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
function load(file, state) {
  const exports = {};
  const element =
    (tag) =>
    ({ children, ...props }) =>
      React.createElement(tag, props, children);
  runInNewContext(
    ts.transpileModule(readFileSync(new URL("../src/" + file, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      exports,
      crypto: { randomUUID: () => "new-post" },
      require: (name) => {
        if (name === "@tanstack/react-router") return { createFileRoute: () => (config) => config };
        if (name === "@/lib/cms/releases")
          return {
            useReleasePosts: () => ({
              data: {
                initialized: true,
                current: state.current,
                latest:
                  state.releases
                    .filter((r) => r.published)
                    .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate))[0] ?? null,
              },
              isPending: false,
              isError: false,
            }),
          };
        if (name === "@/lib/cms/store")
          return {
            useCms: (selector) =>
              selector({ releases: [state.current], settings: { installSteps: [] }, faq: [] }),
            formatDate: (value) => value,
            formatBytes: () => "10 MB",
          };
        if (name === "sonner") return { toast: { success: () => {}, error: () => {} } };
        if (name.startsWith("@/components/") || name === "lucide-react" || name === "./ui")
          return new Proxy({}, { get: (_, key) => element(key) });
        if (name.endsWith(".jpg")) return { default: "image.jpg" };
        return require(name);
      },
    },
  );
  return exports;
}
test("quick component workflow: create draft, edit and publish; public Download shows post without changing APK", async () => {
  const current = {
    id: "r1",
    version: "0.1",
    build: "100",
    title: "Current build",
    releaseDate: "2026-01-01",
    fileUrl: "https://example.test/current.apk",
    notes: "",
    platform: "Android",
    minRequirements: [],
    recommendedRequirements: [],
  };
  const state = { current, releases: [] };
  const Editor = load("components/admin/ReleasePosts.tsx", state).ReleasePosts;
  const Download = load("routes/download.tsx", state).Route.component;
  const save = async (release) => {
    const index = state.releases.findIndex((r) => r.id === release.id);
    if (index < 0) state.releases.push(release);
    else state.releases[index] = release;
  };
  let editor, page;
  await act(() => {
    editor = create(React.createElement(Editor, { releases: state.releases, save }));
    page = create(React.createElement(Download));
  });
  const button = (text) =>
    editor.root.findAll((n) => n.type === "Button" && n.props.children === text)[0];
  const field = (id) =>
    editor.root.findAll((n) => typeof n.type === "string" && n.props.id === id)[0];
  await act(() => button("Create update").props.onClick());
  for (const [id, value] of Object.entries({
    "update-title": "Bridge improvements",
    "update-version": "0.2",
    "update-build": "200",
    "update-date": "2026-09-20",
    "update-notes": "Improved load testing.",
  })) {
    await act(() => field(id).props.onChange({ target: { value } }));
  }
  await act(() => editor.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  // The submit handler starts the async save; flush the resulting state update.
  await act(async () => {});
  assert.equal(state.releases[0].published, false);
  await act(() => page.update(React.createElement(Download)));
  assert.equal(
    page.root.findAll((n) => n.type === "h3" && n.children.includes("Bridge improvements")).length,
    0,
  );
  await act(() => button("Edit update").props.onClick());
  await act(() =>
    field("update-notes").props.onChange({ target: { value: "Edited load testing notes." } }),
  );
  await act(() => button("Publish update").props.onClick());
  await act(() => page.update(React.createElement(Download)));
  assert.equal(state.releases[0].published, true);
  assert.equal(
    page.root.findAll((n) => n.type === "h3" && n.children.includes("Bridge improvements")).length,
    1,
  );
  assert.equal(
    page.root.findAll((n) => n.type === "p" && n.children.includes("Edited load testing notes."))
      .length,
    1,
  );
  assert.equal(
    page.root.findAll((n) => n.type === "time" && n.props.dateTime === "2026-09-20").length,
    1,
  );
  assert.equal(
    page.root.findAll((n) => n.type === "a" && n.props.download === true)[0].props.href,
    current.fileUrl,
  );
  assert.equal(current.build, "100");
  await act(() => {
    editor.unmount();
    page.unmount();
  });
});
