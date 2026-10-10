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
      ...globals,
    },
  );
  return exports;
}

const validation = load("lib/cms/apk.ts");
const element =
  (tag) =>
  ({ children, ...props }) =>
    React.createElement(tag, props, children);
const icons = new Proxy({}, { get: (_, name) => element(`icon-${String(name)}`) });
const formatBytes = (size) => `${size / (1024 * 1024)} MB`;
const { ApkUpload } = load("components/admin/ApkUpload.tsx", {
  "lucide-react": icons,
  "@/components/ui/button": { Button: element("button") },
  "@/lib/cms/apk": validation,
  "@/lib/cms/store": { formatBytes },
  "@/lib/utils": { cn: (...values) => values.filter(Boolean).join(" ") },
});

const savedRelease = () => ({
  id: "saved-build",
  version: "1.0",
  build: "10",
  title: "",
  platform: "Android",
  minAndroid: "10",
  minRequirements: ["3 GB RAM"],
  recommendedRequirements: ["4 GB RAM"],
  notes: "",
  releaseDate: "2026-10-01",
  published: false,
  status: "current",
  fileName: "current.apk",
  fileSizeBytes: 20 * 1024 * 1024,
  fileUrl: "https://example.test/current.apk",
  downloads: 7,
});

// File-like metadata exercises selection without allocating an APK-sized buffer.
const file = (overrides = {}) => ({
  name: "Civil Craft.APK",
  size: 51 * 1024 * 1024,
  ...overrides,
});
const files = (...items) => ({ length: items.length, ...items });
const text = (node) =>
  typeof node === "string" ? node : (node?.children ?? []).map(text).join("");
const button = (renderer, label) =>
  renderer.root.findAllByType("button").find((node) => text(node) === label);
const dropZone = (renderer) =>
  renderer.root.findAllByType("button").find((node) => node.props.onDrop);
const fileInput = (renderer) => renderer.root.findByType("input");
const hasText = (renderer, value) => text(renderer.root).includes(value);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

async function mountUpload(t, props = {}) {
  let renderer;
  const inputNode = {
    value: "",
    clicks: 0,
    click() {
      this.clicks += 1;
    },
  };
  await act(() => {
    renderer = create(
      React.createElement(ApkUpload, {
        release: savedRelease(),
        onUpload: async () => {},
        ...props,
      }),
      {
        createNodeMock: (node) => (node.type === "input" ? inputNode : null),
      },
    );
  });
  t.after(async () => {
    await act(() => renderer.unmount());
  });
  return { renderer, inputNode };
}

async function pick(renderer, ...items) {
  const target = { files: files(...items), value: "C:\\fakepath\\civilcraft.apk" };
  await act(() => fileInput(renderer).props.onChange({ target }));
  assert.equal(target.value, "", "clearing the picker allows reselecting the same APK");
}

async function drop(renderer, ...items) {
  let prevented = false;
  await act(() =>
    dropZone(renderer).props.onDrop({
      preventDefault() {
        prevented = true;
      },
      dataTransfer: { files: files(...items) },
    }),
  );
  assert.equal(prevented, true);
}

test("single APK picker accepts a 51 MB file with generic MIME and uses a native keyboard button", async (t) => {
  const selected = file({ type: "application/octet-stream" });
  const uploads = [];
  const { renderer, inputNode } = await mountUpload(t, {
    onUpload: async (value) => {
      uploads.push(value);
    },
  });
  assert.equal(dropZone(renderer).type, "button");
  assert.equal(dropZone(renderer).props.type, "button");
  assert.equal(fileInput(renderer).props.accept, ".apk");
  assert.equal(fileInput(renderer).props.multiple, undefined);
  await act(() => dropZone(renderer).props.onClick());
  assert.equal(inputNode.clicks, 1);
  await pick(renderer, selected);
  assert.equal(hasText(renderer, "Civil-Craft.apk · 51 MB"), true);
  assert.equal(button(renderer, "Upload APK").props.disabled, false);
  await act(async () => {
    await button(renderer, "Upload APK").props.onClick();
  });
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0], selected);
  assert.equal(hasText(renderer, "APK verified and attached"), true);
});

test("APK drag and drop accepts missing MIME and clears drag highlighting", async (t) => {
  const { renderer } = await mountUpload(t);
  const event = { preventDefault() {}, dataTransfer: { dropEffect: "none" } };
  await act(() => dropZone(renderer).props.onDragEnter(event));
  assert.match(dropZone(renderer).props.className, /border-gold/);
  await act(() => dropZone(renderer).props.onDragOver(event));
  assert.equal(event.dataTransfer.dropEffect, "copy");
  await drop(renderer, file());
  assert.equal(hasText(renderer, "Civil-Craft.apk · 51 MB"), true);
  assert.doesNotMatch(dropZone(renderer).props.className, /border-gold/);
});

test("invalid extension, size and multiple selection are rejected before an upload", async (t) => {
  for (const [name, selected, message, method] of [
    ["ZIP", [file({ name: "build.zip" })], /Android \.apk file/, pick],
    ["AAB", [file({ name: "build.aab" })], /Android \.apk file/, drop],
    ["oversize", [file({ size: validation.MAX_APK_BYTES + 1 })], /512 MB/, pick],
    ["empty", [file({ size: 0 })], /between 1 byte/, drop],
    ["multiple", [file(), file({ name: "second.apk" })], /one APK file at a time/, drop],
  ]) {
    await t.test(name, async (subtest) => {
      let uploads = 0;
      const { renderer } = await mountUpload(subtest, {
        onUpload: async () => {
          uploads += 1;
        },
      });
      await method(renderer, ...selected);
      assert.match(text(renderer.root.findByProps({ role: "alert" })), message);
      assert.equal(button(renderer, "Upload APK"), undefined);
      assert.equal(uploads, 0);
      assert.equal(hasText(renderer, "https://example.test/current.apk"), true);
    });
  }
});

test("saved attachment remains through transfer and 100% verification until finalization resolves", async (t) => {
  const finish = deferred();
  let reportProgress, attempt;
  const release = { ...savedRelease(), apkHosted: true };
  const onUpload = (_selected, progress) => {
    reportProgress = progress;
    return finish.promise;
  };
  const { renderer } = await mountUpload(t, { release, onUpload });
  await pick(renderer, file());
  await act(() => {
    attempt = button(renderer, "Upload APK").props.onClick();
  });
  assert.equal(dropZone(renderer).props.disabled, true);
  assert.equal(fileInput(renderer).props.disabled, true);
  assert.equal(button(renderer, "Clear").props.disabled, true);
  await act(() => reportProgress(38));
  assert.equal(renderer.root.findByProps({ role: "progressbar" }).props["aria-valuenow"], 38);
  assert.equal(hasText(renderer, "Uploading APK: 38%"), true);
  assert.equal(hasText(renderer, "Uploaded APK: current.apk · 20 MB"), true);
  assert.equal(hasText(renderer, release.fileUrl), true);
  await act(() => reportProgress(100));
  assert.equal(button(renderer, "Verifying…").props.disabled, true);
  assert.equal(renderer.root.findByProps({ role: "progressbar" }).props["aria-valuenow"], 100);
  assert.match(
    renderer.root.findByProps({ role: "progressbar" }).props["aria-valuetext"],
    /verifying/,
  );
  assert.equal(renderer.root.findAllByProps({ role: "status" }).length, 0);
  assert.equal(hasText(renderer, release.fileUrl), true);
  assert.equal(hasText(renderer, "Upload sent. Verifying the APK"), true);

  await act(async () => {
    finish.resolve();
    await attempt;
  });
  assert.equal(renderer.root.findAllByProps({ role: "status" }).length, 1);
  assert.equal(renderer.root.findAllByProps({ role: "progressbar" }).length, 0);
  assert.equal(button(renderer, "Clear"), undefined);
  assert.equal(dropZone(renderer).props.disabled, false);
  assert.equal(
    hasText(renderer, release.fileUrl),
    true,
    "attachment remains server-owned even after local completion",
  );
  const attached = {
    ...release,
    fileName: "verified.apk",
    fileSizeBytes: 51 * 1024 * 1024,
    fileUrl: "https://example.test/verified.apk",
  };
  await act(() => renderer.update(React.createElement(ApkUpload, { release: attached, onUpload })));
  assert.equal(hasText(renderer, "Uploaded APK: verified.apk · 51 MB"), true);
  assert.equal(hasText(renderer, attached.fileUrl), true);
  assert.equal(hasText(renderer, release.fileUrl), false);
});

test("failed upload retains the selected file and retries it without selecting again", async (t) => {
  const finish = deferred();
  const selected = file();
  const uploads = [];
  const onUpload = (value, progress) => {
    uploads.push(value);
    if (uploads.length === 1) return Promise.reject(new Error("Storage upload interrupted."));
    progress(100);
    return finish.promise;
  };
  const { renderer } = await mountUpload(t, { onUpload });
  await pick(renderer, selected);
  await act(async () => {
    await button(renderer, "Upload APK").props.onClick();
  });
  assert.equal(text(renderer.root.findByProps({ role: "alert" })), "Storage upload interrupted.");
  assert.equal(hasText(renderer, "Civil-Craft.apk · 51 MB"), true);
  assert.equal(button(renderer, "Retry upload").props.disabled, false);
  assert.equal(renderer.root.findAllByProps({ role: "status" }).length, 0);
  let retry;
  await act(() => {
    retry = button(renderer, "Retry upload").props.onClick();
  });
  assert.equal(uploads.length, 2);
  assert.equal(uploads[0], selected);
  assert.equal(uploads[1], selected);
  assert.equal(renderer.root.findAllByProps({ role: "alert" }).length, 0);
  assert.equal(button(renderer, "Verifying…").props.disabled, true);
  await act(async () => {
    finish.resolve();
    await retry;
  });
  assert.equal(hasText(renderer, "APK verified and attached"), true);
});

test("parent busy state disables file selection, drop, upload and clear", async (t) => {
  let uploads = 0;
  const props = {
    release: savedRelease(),
    onUpload: async () => {
      uploads += 1;
    },
  };
  const { renderer } = await mountUpload(t, props);
  await pick(renderer, file());
  await act(() => renderer.update(React.createElement(ApkUpload, { ...props, disabled: true })));
  assert.equal(fileInput(renderer).props.disabled, true);
  assert.equal(
    renderer.root.findAllByType("button").every((node) => node.props.disabled),
    true,
  );
  const drag = { preventDefault() {}, dataTransfer: { dropEffect: "copy" } };
  await act(() => dropZone(renderer).props.onDragOver(drag));
  assert.equal(drag.dataTransfer.dropEffect, "none");
  await drop(renderer, file({ name: "unwanted.apk" }));
  assert.equal(hasText(renderer, "Civil-Craft.apk · 51 MB"), true);
  assert.equal(hasText(renderer, "unwanted.apk"), false);
  await act(async () => {
    await button(renderer, "Upload APK").props.onClick();
  });
  assert.equal(uploads, 0);
});

async function mountRoute(t, overrides = {}) {
  const state = {
    initialized: true,
    releases: [savedRelease()],
    localReleases: [savedRelease()],
    mutations: [],
    uploads: [],
    ...overrides,
  };
  const query = {
    get data() {
      return {
        initialized: state.initialized,
        releases: state.releases,
        emailNotifications: { configured: true, provider: "PlayFab", message: "Ready to queue." },
      };
    },
    isPending: false,
    isError: false,
    mutate: async (body) => {
      state.mutations.push(body);
      if (body.action === "initialize") {
        state.initialized = true;
        state.releases = body.releases.map((release) => ({ ...release, published: false }));
      } else if (body.action === "save") {
        const index = state.releases.findIndex((release) => release.id === body.release.id);
        if (index < 0) state.releases.push(body.release);
        else state.releases[index] = body.release;
      } else if (body.action === "current") {
        state.releases = state.releases.map((release) => ({
          ...release,
          status:
            release.id === body.id
              ? "current"
              : release.status === "current"
                ? "archived"
                : release.status,
        }));
      }
      return { success: true };
    },
    uploadApk: async (...args) => {
      state.uploads.push(args);
      await state.upload?.(...args);
    },
  };
  const primitives = new Proxy({}, { get: (_, name) => element(String(name)) });
  class BrowserDate extends Date {
    constructor() {
      super("2026-10-09T23:30:00.000Z");
    }
    getFullYear() {
      return 2026;
    }
    getMonth() {
      return 9;
    }
    getDate() {
      return 10;
    }
  }
  const { Route } = load(
    "routes/admin.releases.tsx",
    {
      "@/components/admin/ReleasePosts": { ReleasePosts: element("ReleasePosts") },
      "@/components/admin/ApkUpload": { ApkUpload: element("ApkUpload") },
      "@/lib/cms/releases": { useAdminReleases: () => query },
      "@/components/common/States": primitives,
      "@tanstack/react-router": { createFileRoute: () => (config) => config },
      "lucide-react": icons,
      sonner: { toast: { success() {}, error() {} } },
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
    },
    { Date: BrowserDate, crypto: { randomUUID: () => "new-draft" } },
  );
  let renderer;
  await act(() => {
    renderer = create(React.createElement(Route.component));
  });
  t.after(async () => {
    await act(() => renderer.unmount());
  });
  return { renderer, state };
}

const field = (renderer, id) =>
  renderer.root.findAllByType("input").find((node) => node.props.id === id);
const change = async (renderer, id, value) => {
  await act(() => field(renderer, id).props.onChange({ target: { value } }));
};

test("release route saves pending metadata without changing the saved attachment before uploading", async (t) => {
  const finish = deferred();
  const { renderer, state } = await mountRoute(t, {
    upload: async () => {
      await finish.promise;
    },
  });
  const saved = { ...state.releases[0] };
  await change(renderer, "v-saved-build", "2.0");
  await change(renderer, "f-saved-build", "unsaved-manual.apk");
  await change(renderer, "u-saved-build", "https://example.test/unsaved-manual.apk");
  let attempt;
  await act(() => {
    attempt = renderer.root.findByType("ApkUpload").props.onUpload(file(), () => {});
  });
  assert.equal(state.mutations.length, 1);
  assert.equal(state.mutations[0].action, "save");
  assert.equal(state.mutations[0].release.version, "2.0");
  assert.equal(state.mutations[0].release.fileUrl, saved.fileUrl);
  assert.equal(state.mutations[0].release.fileName, saved.fileName);
  assert.equal(state.mutations[0].release.fileSizeBytes, saved.fileSizeBytes);
  assert.equal(state.uploads.length, 1);
  assert.equal(state.uploads[0][0], saved.id);
  assert.equal(renderer.root.findByType("ApkUpload").props.release.fileUrl, saved.fileUrl);
  assert.equal(renderer.root.findByType("ApkUpload").props.disabled, true);
  assert.equal(
    renderer.root.findAllByType("fieldset").every((node) => node.props.disabled),
    true,
  );
  assert.equal(
    renderer.root.findAllByType("textarea").find((node) => node.props.rows === 6).props.disabled,
    true,
  );
  await act(async () => {
    finish.resolve();
    await attempt;
  });
  assert.equal(state.releases[0].status, "current");
  assert.equal(state.releases[0].fileUrl, saved.fileUrl);
});

test("Make current requires an attachment and saves pending build edits before changing selection", async (t) => {
  const draft = {
    ...savedRelease(),
    id: "draft-build",
    status: "draft",
    fileUrl: null,
    fileName: null,
    fileSizeBytes: null,
  };
  const { renderer, state } = await mountRoute(t, { releases: [draft] });
  assert.equal(button(renderer, "Make current").props.disabled, true);
  await act(() =>
    renderer.root
      .findAllByType("button")
      .find((node) => node.props["aria-controls"] === "build-details-draft-build")
      .props.onClick(),
  );
  await change(renderer, "u-draft-build", "https://example.test/legacy.apk");
  await change(renderer, "v-draft-build", "1.1");
  assert.equal(button(renderer, "Make current").props.disabled, false);
  await act(async () => {
    await button(renderer, "Make current").props.onClick();
  });
  assert.equal(state.mutations.length, 0, "selection requires confirming the build change");
  const confirmation = renderer.root
    .findAllByType("ConfirmDialog")
    .find((node) => node.props.confirmLabel === "Make current");
  assert.equal(confirmation.props.open, true);
  await act(async () => {
    confirmation.props.onConfirm();
  });
  assert.deepEqual(
    state.mutations.map((mutation) => mutation.action),
    ["save", "current"],
  );
  assert.equal(state.mutations[0].release.version, "1.1");
  assert.equal(state.mutations[0].release.fileUrl, "https://example.test/legacy.apk");
  assert.equal(state.releases[0].status, "current");
});

test("creating the first draft imports local releases, preserves current and uses the browser date", async (t) => {
  const legacy = savedRelease();
  const { renderer, state } = await mountRoute(t, {
    initialized: false,
    releases: [],
    localReleases: [legacy],
  });
  await change(renderer, "draft-build-version", " 2.0 ");
  await change(renderer, "draft-build-number", " 20 ");
  await act(() => renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  await act(async () => {});
  assert.deepEqual(
    state.mutations.map((mutation) => mutation.action),
    ["initialize", "save"],
  );
  assert.equal(state.mutations[0].releases[0], legacy);
  const draft = state.mutations[1].release;
  assert.equal(draft.id, "new-draft");
  assert.equal(draft.version, "2.0");
  assert.equal(draft.build, "20");
  assert.equal(draft.releaseDate, "2026-10-10");
  assert.equal(draft.status, "draft");
  assert.equal(draft.published, false);
  assert.equal(draft.title, "");
  assert.equal(draft.notes, "");
  assert.equal(draft.fileName, null);
  assert.equal(draft.fileUrl, null);
  assert.equal(draft.fileSizeBytes, null);
  assert.equal(draft.minAndroid, legacy.minAndroid);
  assert.deepEqual(Array.from(draft.minRequirements), legacy.minRequirements);
  assert.deepEqual(Array.from(draft.recommendedRequirements), legacy.recommendedRequirements);
  assert.notEqual(draft.minRequirements, legacy.minRequirements);
  assert.equal(
    state.releases.find((release) => release.status === "current").fileUrl,
    legacy.fileUrl,
  );
  assert.equal(state.uploads.length, 0);
});

test("hosted APK filename and download URL are read-only in the build editor", async (t) => {
  const { renderer } = await mountRoute(t, { releases: [{ ...savedRelease(), apkHosted: true }] });
  assert.equal(field(renderer, "f-saved-build").props.readOnly, true);
  assert.equal(field(renderer, "u-saved-build").props.readOnly, true);
});
