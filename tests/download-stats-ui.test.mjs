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

function load(file, modules = {}) {
  const exports = {};
  runInNewContext(
    ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    { exports, require: (name) => modules[name] ?? require(name) },
  );
  return exports;
}

const element =
  (tag) =>
  ({ children, ...props }) =>
    React.createElement(tag, props, children);
const primitives = new Proxy({}, { get: (cache, name) => (cache[name] ??= element(String(name))) });
const icons = new Proxy(
  {},
  { get: (cache, name) => (cache[name] ??= element(`icon-${String(name)}`)) },
);
const text = (node) =>
  typeof node === "string" ? node : (node?.children ?? []).map(text).join("");

const stats = () => ({
  available: true,
  total: 1_257,
  byRelease: { active: 126, "deleted-build": 1_131 },
  trackingSince: "2026-10-20T02:30:00.000Z",
});
const release = () => ({
  id: "active",
  version: "1.0",
  build: "1",
  title: "Current",
  platform: "Android",
  minAndroid: "10",
  minRequirements: [],
  recommendedRequirements: [],
  notes: "",
  releaseDate: "2026-10-20",
  published: true,
  status: "current",
  fileName: "game.apk",
  fileSizeBytes: 10,
  fileUrl: "/api/releases/active/download",
  apkHosted: true,
  // Deliberately contradictory metadata must never be presented as a counter.
  downloads: 987_654_321,
});

async function mountRoute(t, overrides = {}) {
  const state = {
    releases: [release()],
    downloadQuery: { data: stats(), isPending: false, isError: false, isFetching: false },
    refreshes: 0,
    mutations: [],
    ...overrides,
  };
  const { Route } = load("routes/admin.releases.tsx", {
    "@/components/admin/ReleasePosts": { ReleasePosts: element("ReleasePosts") },
    "@/components/admin/ApkUpload": { ApkUpload: element("ApkUpload") },
    "@/lib/cms/releases": {
      useAdminReleases: () => ({
        data: { initialized: true, releases: state.releases },
        isPending: false,
        isError: false,
        mutate: async (body) => state.mutations.push(body),
      }),
    },
    "@/lib/cms/download-stats": {
      useReleaseDownloadStats: () => ({
        ...state.downloadQuery,
        refetch: async () => {
          state.refreshes += 1;
        },
      }),
    },
    "@/lib/cms/android-version": {
      MAX_ANDROID_VERSION_CODE: 2_100_000_000,
      parseAndroidVersionCode: () => null,
    },
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
      useCms: (selector) => selector({ releases: [], settings: { installSteps: [] } }),
      formatBytes: (value) => `${value} B`,
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
  const row = (label) =>
    renderer.root.findAllByType("DataRow").find((node) => node.props.label === label);
  const refresh = () =>
    renderer.root.findAllByType("button").find((node) => text(node) === "Refresh counts");
  const render = async () => {
    await act(() => renderer.update(React.createElement(Route.component)));
  };
  return { state, renderer, row, refresh, render };
}

test("counter hook fetches the staff endpoint independently and refreshes while its page is visible", async () => {
  let options;
  const requests = [];
  const response = stats();
  const module = load("lib/cms/download-stats.ts", {
    "@tanstack/react-query": {
      useQuery: (value) => {
        options = value;
        return value;
      },
    },
    "./content": {
      contentFetch: async (...args) => {
        requests.push(args);
        return response;
      },
    },
  });
  module.useReleaseDownloadStats();
  assert.deepEqual(Array.from(options.queryKey), ["release-download-stats"]);
  assert.equal(options.staleTime, 0);
  assert.equal(options.refetchInterval, 60_000);
  assert.equal(options.refetchIntervalInBackground, false);
  assert.equal(options.refetchOnWindowFocus, true);
  assert.equal(options.retry, 1);
  assert.equal(await options.queryFn(), response);
  assert.deepEqual(requests, [["/api/admin/releases/download-stats"]]);
});

test("active and cumulative counts come from stats, not editable or local release metadata", async (t) => {
  const { renderer, row, state } = await mountRoute(t);
  assert.equal(row("Downloads").props.value, "126");
  assert.equal(row("Total downloads").props.value, (1_257).toLocaleString());
  assert.ok(text(renderer.root).includes("Tracking since"));
  assert.ok(text(renderer.root).includes("Total includes previously removed builds"));
  assert.ok(text(renderer.root).includes("not completed downloads or installs"));
  assert.ok(text(renderer.root).includes("staff preview links and HEAD requests are excluded"));
  assert.ok(text(renderer.root).includes("Counts start when tracking is first recorded"));
  assert.equal(
    renderer.root.findAllByType("input").filter((node) => /download/i.test(node.props.id ?? ""))
      .length,
    0,
  );
  assert.equal(state.mutations.length, 0);
});

test("an available counter defaults only the new active release to zero and keeps site history", async (t) => {
  const data = stats();
  data.byRelease = { "deleted-build": data.total };
  const { row } = await mountRoute(t, {
    downloadQuery: { data, isPending: false, isError: false, isFetching: false },
  });
  assert.equal(row("Downloads").props.value, "0");
  assert.equal(row("Total downloads").props.value, data.total.toLocaleString());
});

test("prototype-named release IDs require their own numeric counter", async (t) => {
  for (const id of ["constructor", "toString"]) {
    await t.test(id, async (subtest) => {
      const data = { available: true, total: 0, byRelease: {}, trackingSince: null };
      const { row, state, render } = await mountRoute(subtest, {
        releases: [{ ...release(), id }],
        downloadQuery: { data, isPending: false, isError: false, isFetching: false },
      });
      assert.equal(row("Downloads").props.value, "0");
      data.byRelease[id] = 42;
      data.total = 42;
      state.downloadQuery = { ...state.downloadQuery, data };
      await render();
      assert.equal(row("Downloads").props.value, "42");
    });
  }
});

test("empty counters show zero without inventing a tracking start date", async (t) => {
  const { row, renderer } = await mountRoute(t, {
    downloadQuery: {
      data: { available: true, total: 0, byRelease: {}, trackingSince: null },
      isPending: false,
      isError: false,
      isFetching: false,
    },
  });
  assert.equal(row("Downloads").props.value, "0");
  assert.equal(row("Total downloads").props.value, "0");
  assert.ok(text(renderer.root).includes("No download requests recorded yet"));
  assert.equal(text(renderer.root).includes("Tracking since"), false);
});

test("external legacy links do not pretend to be tracked hosted APKs", async (t) => {
  const { row } = await mountRoute(t, {
    releases: [{ ...release(), apkHosted: false, fileUrl: "https://example.test/game.apk" }],
  });
  assert.equal(row("Downloads").props.value, "Not tracked");
  assert.equal(row("Total downloads").props.value, (1_257).toLocaleString());
});

test("unavailable, failed, and loading stats never invent a zero or use stale cached data", async (t) => {
  const { row, renderer, state, render } = await mountRoute(t);
  for (const query of [
    { data: { available: false, total: null, byRelease: {}, trackingSince: null }, isError: false },
    { data: stats(), isError: true },
    { data: undefined, isError: true },
  ]) {
    state.downloadQuery = { ...query, isPending: false, isFetching: false };
    await render();
    assert.equal(row("Downloads").props.value, "Unknown");
    assert.equal(row("Total downloads").props.value, "Unknown");
    assert.ok(text(renderer.root).includes("Download counts are unavailable"));
  }
  state.downloadQuery = { data: undefined, isPending: true, isError: false, isFetching: true };
  await render();
  assert.equal(row("Downloads").props.value, "—");
  assert.equal(row("Total downloads").props.value, "—");
  assert.ok(text(renderer.root).includes("Loading download counts"));
});

test("refresh only reloads counters and cannot change release metadata", async (t) => {
  const { state, refresh, render } = await mountRoute(t);
  await act(async () => refresh().props.onClick());
  assert.equal(state.refreshes, 1);
  assert.deepEqual(state.mutations, []);
  state.downloadQuery.isFetching = true;
  await render();
  assert.equal(refresh().props.disabled, true);
});

test("no active build displays no per-build count without hiding the cumulative history", async (t) => {
  const { row } = await mountRoute(t, { releases: [] });
  assert.equal(row("Downloads").props.value, "—");
  assert.equal(row("Total downloads").props.value, (1_257).toLocaleString());
});
