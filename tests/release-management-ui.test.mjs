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

function load(file, modules = {}, globals = {}) {
  const exports = {};
  runInNewContext(
    ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      exports,
      Error,
      require: (name) => modules[name] ?? require(name),
      crypto: { randomUUID: () => "new-draft" },
      ...globals,
    },
  );
  return exports;
}

const element =
  (tag) =>
  ({ children, ...props }) =>
    React.createElement(tag, props, children);
// Stable component identities let the actual APK component retain local state
// across route renders, just as the production layout components do.
const primitives = new Proxy(
  {},
  {
    get: (cache, name) => (cache[name] ??= element(String(name))),
  },
);
const icons = new Proxy(
  {},
  {
    get: (cache, name) => (cache[name] ??= element(`icon-${String(name)}`)),
  },
);
const formatBytes = (size) => `${size / (1024 * 1024)} MB`;
const text = (node) =>
  typeof node === "string" ? node : (node?.children ?? []).map(text).join("");
const button = (node, label) => node.findAllByType("button").find((item) => text(item) === label);
const field = (node, id) => node.findAllByType("input").find((item) => item.props.id === id);
const card = (renderer, id) =>
  renderer.root.findAllByType("li").find((node) => node.props["data-release-id"] === id);
const cards = (renderer) =>
  renderer.root.findAllByType("li").filter((node) => node.props["data-release-id"]);
const details = (renderer, id) =>
  renderer.root.findAll(
    (node) => typeof node.type === "string" && node.props.id === `build-details-${id}`,
  )[0];
const toggle = (renderer, id) =>
  card(renderer, id)
    .findAllByType("button")
    .find((node) => node.props["aria-controls"] === `build-details-${id}`);
const deleteButton = (renderer, id) =>
  card(renderer, id)
    .findAllByType("button")
    .find((node) => /^Delete(?: build)?$/.test(text(node)));
const dialog = (renderer, confirmLabel) =>
  renderer.root
    .findAllByType("ConfirmDialog")
    .find((node) => node.props.confirmLabel === confirmLabel);
const openDialog = (renderer, confirmLabel) => {
  const value = dialog(renderer, confirmLabel);
  assert.ok(value?.props.open, `${confirmLabel} must require an open confirmation`);
  return value;
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

const validation = load("lib/cms/apk.ts");
const { ApkUpload } = load("components/admin/ApkUpload.tsx", {
  "lucide-react": icons,
  "@/components/ui/button": { Button: element("button") },
  "@/lib/cms/apk": validation,
  "@/lib/cms/store": { formatBytes },
  "@/lib/utils": { cn: (...values) => values.filter(Boolean).join(" ") },
});

const release = (id, overrides = {}) => ({
  id,
  version: "1.0",
  build: "10",
  title: `Build ${id}`,
  platform: "Android",
  minAndroid: "10",
  minRequirements: ["3 GB RAM"],
  recommendedRequirements: ["4 GB RAM"],
  notes: `Release notes for ${id}`,
  releaseDate: "2026-10-01",
  published: false,
  status: "draft",
  fileName: `${id}.apk`,
  fileSizeBytes: 20 * 1024 * 1024,
  fileUrl: `/api/releases/${id}/download`,
  apkHosted: true,
  downloads: 7,
  ...overrides,
});
const current = () => release("active", { status: "current", published: true });
const draft = () => release("draft", { version: "2.0", build: "20" });
const publishedBackup = () =>
  release("backup", { version: "0.9", build: "9", status: "archived", published: true });

async function mountRoute(t, overrides = {}) {
  const state = {
    initialized: true,
    releases: [draft(), current(), publishedBackup()],
    localReleases: [],
    emailNotifications: {
      configured: true,
      provider: "SMTP",
      message: "Subscriber emails are ready for new public versions.",
    },
    notifications: {},
    mutations: [],
    uploads: [],
    toasts: [],
    ...overrides,
  };
  const query = {
    get data() {
      return {
        initialized: state.initialized,
        releases: state.releases,
        emailNotifications: state.emailNotifications,
      };
    },
    isPending: false,
    isError: false,
    mutate: async (value) => {
      const body = JSON.parse(JSON.stringify(value));
      state.mutations.push(body);
      const result = await state.mutate?.(body);
      if (body.action === "delete")
        state.releases = state.releases.filter((item) => item.id !== body.id);
      else if (body.action === "current")
        state.releases = state.releases.map((item) => ({
          ...item,
          status:
            item.id === body.id ? "current" : item.status === "current" ? "archived" : item.status,
        }));
      else if (body.action === "save") {
        const index = state.releases.findIndex((item) => item.id === body.release.id);
        if (index < 0) state.releases = [...state.releases, body.release];
        else state.releases = state.releases.map((item, i) => (i === index ? body.release : item));
      } else if (body.action === "initialize") {
        state.initialized = true;
        state.releases = body.releases;
      }
      return (
        result ?? {
          success: true,
          ...(state.notifications[body.action]
            ? { notification: state.notifications[body.action] }
            : {}),
        }
      );
    },
    uploadApk: async (...args) => {
      state.uploads.push(args);
      await state.upload?.(...args);
    },
  };
  const { Route } = load("routes/admin.releases.tsx", {
    "@/components/admin/ReleasePosts": { ReleasePosts: element("ReleasePosts") },
    "@/components/admin/ApkUpload": { ApkUpload },
    "@/lib/cms/releases": { useAdminReleases: () => query },
    "@/components/common/States": primitives,
    "@tanstack/react-router": { createFileRoute: () => (config) => config },
    "lucide-react": icons,
    sonner: {
      toast: {
        success: (message) => state.toasts.push({ kind: "success", message }),
        error: (message) => state.toasts.push({ kind: "error", message }),
      },
    },
    "@/components/admin/ui": primitives,
    "@/components/ui/button": { Button: element("button") },
    "@/components/ui/input": { Input: element("input") },
    "@/components/ui/label": { Label: element("label") },
    "@/components/ui/textarea": { Textarea: element("textarea") },
    "@/lib/cms/store": {
      useCms: (selector) =>
        selector({ releases: state.localReleases, settings: { installSteps: [] } }),
      formatBytes,
      formatDate: (value) => value,
      logActivity() {},
      setCmsState() {},
    },
  });
  let renderer;
  await act(() => {
    renderer = create(React.createElement(Route.component));
  });
  t.after(async () => {
    await act(() => renderer.unmount());
  });
  return { renderer, state };
}

test("current build appears first and remains expanded while other builds collapse by default", async (t) => {
  const { renderer } = await mountRoute(t);
  assert.equal(cards(renderer)[0].props["data-release-id"], "active");
  assert.equal(details(renderer, "active").props.hidden, false);
  assert.equal(toggle(renderer, "active"), undefined);
  assert.equal(deleteButton(renderer, "active"), undefined);
  for (const id of ["draft", "backup"]) {
    assert.equal(details(renderer, id).props.hidden, true);
    assert.equal(toggle(renderer, id).type, "button");
    assert.equal(toggle(renderer, id).props["aria-expanded"], false);
    await act(() => toggle(renderer, id).props.onClick());
    assert.equal(details(renderer, id).props.hidden, false);
    assert.equal(toggle(renderer, id).props["aria-expanded"], true);
  }
});

test("collapsing a backup preserves its selected APK and unsaved build edits", async (t) => {
  const { renderer, state } = await mountRoute(t);
  await act(() => toggle(renderer, "draft").props.onClick());
  const selected = { name: "Selected Backup.APK", size: 51 * 1024 * 1024 };
  const input = card(renderer, "draft")
    .findAllByType("input")
    .find((node) => node.props.type === "file");
  await act(() =>
    input.props.onChange({ target: { files: { 0: selected, length: 1 }, value: "fakepath" } }),
  );
  await act(() =>
    field(card(renderer, "draft"), "v-draft").props.onChange({ target: { value: "2.1" } }),
  );
  await act(() => toggle(renderer, "draft").props.onClick());
  assert.equal(details(renderer, "draft").props.hidden, true);
  assert.ok(text(card(renderer, "draft")).includes("Selected-Backup.apk · 51 MB"));
  await act(() => toggle(renderer, "draft").props.onClick());
  assert.equal(field(card(renderer, "draft"), "v-draft").props.value, "2.1");
  assert.ok(button(card(renderer, "draft"), "Upload APK"));
  assert.deepEqual(state.mutations, []);
  assert.deepEqual(state.uploads, []);
});

test("delete confirmation explains removed notes and retained APK; cancel performs no mutation", async (t) => {
  const { renderer, state } = await mountRoute(t);
  await act(() => deleteButton(renderer, "backup").props.onClick());
  const confirmation = openDialog(renderer, "Delete build");
  assert.match(confirmation.props.description, /notes/i);
  assert.match(confirmation.props.description, /APK/i);
  assert.match(confirmation.props.description, /retain|keep|remain|preserv/i);
  assert.deepEqual(state.mutations, []);
  await act(() => confirmation.props.onOpenChange(false));
  assert.equal(dialog(renderer, "Delete build").props.open, false);
  assert.deepEqual(state.mutations, []);
  assert.equal(state.releases.length, 3);
});

test("confirmed deletion removes draft and published backups while protecting the current build", async (t) => {
  for (const id of ["draft", "backup"]) {
    await t.test(id, async (subtest) => {
      const { renderer, state } = await mountRoute(subtest);
      const active = state.releases.find((item) => item.id === "active");
      await act(() => deleteButton(renderer, id).props.onClick());
      await act(async () => openDialog(renderer, "Delete build").props.onConfirm());
      await act(async () => {});
      assert.deepEqual(state.mutations, [{ action: "delete", id }]);
      assert.equal(card(renderer, id), undefined);
      assert.equal(
        state.releases.find((item) => item.id === "active"),
        active,
      );
      assert.equal(active.status, "current");
      assert.equal(active.fileUrl, "/api/releases/active/download");
      assert.equal(deleteButton(renderer, "active"), undefined);
      assert.ok(
        state.toasts.some((item) => item.kind === "success" && /delet/i.test(item.message)),
      );
    });
  }
});

test("pending deletion locks competing actions and failure keeps the saved release", async (t) => {
  const finish = deferred();
  const { renderer, state } = await mountRoute(t, { mutate: () => finish.promise });
  await act(() => deleteButton(renderer, "draft").props.onClick());
  await act(() => {
    openDialog(renderer, "Delete build").props.onConfirm();
  });
  assert.equal(deleteButton(renderer, "backup").props.disabled, true);
  assert.equal(button(card(renderer, "backup"), "Make current").props.disabled, true);
  assert.equal(renderer.root.findByType("ReleasePosts").props.disabled, true);
  await act(async () => {
    finish.reject(new Error("The build became current before deletion."));
  });
  assert.ok(card(renderer, "draft"));
  assert.equal(state.releases.length, 3);
  assert.equal(deleteButton(renderer, "draft").props.disabled, false);
  assert.ok(
    state.toasts.some((item) => item.kind === "error" && /became current/.test(item.message)),
  );
});

test("making another version current requires confirmation and cancel leaves selection untouched", async (t) => {
  const { renderer, state } = await mountRoute(t);
  await act(() => button(card(renderer, "draft"), "Make current").props.onClick());
  const confirmation = openDialog(renderer, "Make current");
  assert.match(confirmation.props.title, /2\.0/);
  assert.match(confirmation.props.title, /20/);
  assert.match(confirmation.props.description, /email|subscriber/i);
  assert.deepEqual(state.mutations, []);
  await act(() => confirmation.props.onOpenChange(false));
  assert.deepEqual(state.mutations, []);
  assert.equal(state.releases.find((item) => item.id === "active").status, "current");
});

test("same-version activation confirmation does not promise another subscriber announcement", async (t) => {
  const { renderer } = await mountRoute(t, {
    releases: [current(), draft(), release("same-version", { version: "1.0", build: "11" })],
  });
  await act(() => button(card(renderer, "same-version"), "Make current").props.onClick());
  const confirmation = openDialog(renderer, "Make current");
  assert.doesNotMatch(
    confirmation.props.description,
    /will.*(?:email|notif)|(?:email|notif).*will/i,
  );
});

test("activation success and queued subscriber-email result are reported separately", async (t) => {
  const notification = {
    status: "queued",
    message: "Subscriber email for version 2.0 was queued.",
  };
  const { renderer, state } = await mountRoute(t, { notifications: { current: notification } });
  assert.ok(text(renderer.root).includes(state.emailNotifications.message));
  await act(() => button(card(renderer, "draft"), "Make current").props.onClick());
  await act(async () => openDialog(renderer, "Make current").props.onConfirm());
  await act(async () => {});
  assert.deepEqual(state.mutations, [{ action: "current", id: "draft" }]);
  assert.equal(cards(renderer)[0].props["data-release-id"], "draft");
  assert.equal(details(renderer, "draft").props.hidden, false);
  const result = renderer.root.findByProps({ "data-testid": "release-email-result" });
  assert.equal(result.props.role, "status");
  assert.ok(text(result).includes(notification.message));
  assert.ok(
    state.toasts.some((item) => item.kind === "success" && /public build/.test(item.message)),
  );
});

test("an unavailable email provider does not make a successful activation look failed", async (t) => {
  const notification = {
    status: "not-configured",
    message: "The public build changed. Subscriber email is not configured.",
  };
  const { renderer, state } = await mountRoute(t, {
    emailNotifications: {
      configured: false,
      provider: "Unavailable",
      message: "Subscriber email is not configured. Build publication still works.",
    },
    notifications: { current: notification },
  });
  assert.ok(text(renderer.root).includes(state.emailNotifications.message));
  await act(() => button(card(renderer, "draft"), "Make current").props.onClick());
  await act(async () => openDialog(renderer, "Make current").props.onConfirm());
  await act(async () => {});
  assert.equal(state.releases.find((item) => item.id === "draft").status, "current");
  assert.ok(
    text(renderer.root.findByProps({ "data-testid": "release-email-result" })).includes(
      notification.message,
    ),
  );
  assert.equal(
    state.toasts.some((item) => item.kind === "error"),
    false,
  );
  assert.ok(
    state.toasts.some((item) => item.kind === "success" && /public build/.test(item.message)),
  );
});

test("failed activation keeps the current build and does not claim an email was queued", async (t) => {
  const { renderer, state } = await mountRoute(t, {
    mutate: async () => {
      throw new Error("Build selection could not be saved.");
    },
  });
  await act(() => button(card(renderer, "draft"), "Make current").props.onClick());
  await act(async () => openDialog(renderer, "Make current").props.onConfirm());
  await act(async () => {});
  assert.equal(state.releases.find((item) => item.id === "active").status, "current");
  assert.equal(renderer.root.findAllByProps({ "data-testid": "release-email-result" }).length, 0);
  assert.ok(
    state.toasts.some((item) => item.kind === "error" && /could not be saved/.test(item.message)),
  );
});

test("saving an active version change displays the returned subscriber-email result", async (t) => {
  const notification = { status: "queued", message: "Version 1.1 subscriber email is queued." };
  const { renderer, state } = await mountRoute(t, { notifications: { save: notification } });
  await act(() =>
    field(card(renderer, "active"), "v-active").props.onChange({ target: { value: "1.1" } }),
  );
  await act(async () => button(card(renderer, "active"), "Save build").props.onClick());
  assert.equal(state.mutations.length, 1);
  assert.equal(state.mutations[0].action, "save");
  assert.equal(state.mutations[0].release.version, "1.1");
  assert.equal(state.releases.find((item) => item.id === "active").status, "current");
  assert.ok(
    text(renderer.root.findByProps({ "data-testid": "release-email-result" })).includes(
      notification.message,
    ),
  );
});

test("What's New deletion is optional, disables with the page and protects current posts", async (t) => {
  const deleted = [];
  const { ReleasePosts } = load("components/admin/ReleasePosts.tsx", {
    "@/components/ui/button": { Button: element("button") },
    "@/components/ui/input": { Input: element("input") },
    "@/components/ui/label": { Label: element("label") },
    "@/components/ui/textarea": { Textarea: element("textarea") },
    "./ui": primitives,
    "@/lib/cms/store": { formatDate: (value) => value },
    "lucide-react": icons,
    sonner: { toast: { success() {}, error() {} } },
  });
  const props = { releases: [current(), publishedBackup()], save: async () => {} };
  let renderer;
  await act(() => {
    renderer = create(React.createElement(ReleasePosts, props));
  });
  t.after(async () => {
    await act(() => renderer.unmount());
  });
  assert.equal(
    renderer.root.findAllByType("button").filter((node) => /Delete/.test(text(node))).length,
    0,
  );
  const withDelete = { ...props, onDelete: (value) => deleted.push(value) };
  await act(() => renderer.update(React.createElement(ReleasePosts, withDelete)));
  const deleteActions = renderer.root
    .findAllByType("button")
    .filter((node) => /Delete/.test(text(node)));
  assert.equal(deleteActions.length, 1, "Only the noncurrent published backup may be deleted");
  await act(() => deleteActions[0].props.onClick());
  assert.equal(deleted.length, 1);
  assert.equal(deleted[0].id, "backup");
  await act(() =>
    renderer.update(React.createElement(ReleasePosts, { ...withDelete, disabled: true })),
  );
  assert.ok(renderer.root.findAllByType("button").every((node) => node.props.disabled));
});
