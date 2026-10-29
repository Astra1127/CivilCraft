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
const imageResponse = () =>
  new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), {
    headers: { "content-type": "image/png" },
  });

function load(relative, dependencies = {}, globals = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(relative, import.meta.url), "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  runInNewContext(source, {
    exports,
    require: (name) => dependencies[name] ?? require(name),
    ...globals,
  });
  return exports;
}

function completedLevel({ result = "a".repeat(32), privatePng = false, noPhoto = false } = {}) {
  return {
    levelId: "ReedsContract",
    regionId: "canyon-crossing",
    levelName: "Reed's Contract",
    completion: {
      bridgeTypeId: "truss",
      completedAt: "2026-10-29T10:00:00Z",
      resultId: result,
      score: 2,
      ...(noPhoto
        ? {}
        : privatePng
          ? { snapshotFileName: `bridge-${result}.png` }
          : {
              snapshotFileName: "bridge-photos-v1.zip",
              snapshotAlbum: {
                storage: "archive-v1",
                fileName: "bridge-photos-v1.zip",
                contractId: "ReedsContract",
                regionId: "canyon-crossing",
                resultId: result,
                entryName: `bridge-${result}.png`,
                sha256: "b".repeat(64),
              },
            }),
    },
  };
}

function photoRuntime(fetchPhoto = async () => imageResponse()) {
  let player = { playFabId: "ACCOUNT_A" };
  let session = { identity: { playFabId: "ACCOUNT_A" }, sessionTicket: "private-ticket-A" };
  const calls = [];
  const revoked = [];
  let serial = 0;
  const useAuth = () => ({ player });
  const hook = load(
    "../src/components/dashboard/almanac/useBridgeSnapshot.ts",
    {
      "@/lib/auth": { useAuth },
      "@/lib/playfab/client": {
        readSession: () => session,
        playerFetch: async (path, init) => {
          calls.push({ path, init });
          return fetchPhoto(path, init, calls.length);
        },
      },
    },
    {
      AbortController,
      URLSearchParams,
      URL: {
        createObjectURL: () => `blob:private-photo-${++serial}`,
        revokeObjectURL: (url) => revoked.push(url),
      },
    },
  );
  const cover = ({ label }) => React.createElement("div", { role: "img", "aria-label": label });
  const icons = new Proxy(
    {},
    {
      get: (_, name) => (props) =>
        React.createElement("svg", { ...props, "data-icon": String(name) }),
    },
  );
  const component = load("../src/components/dashboard/RecentBuildPhoto.tsx", {
    "./almanac/useBridgeSnapshot": hook,
    "@/components/dashboard/almanac/useBridgeSnapshot": hook,
    "@/components/common/BrandedCover": { BrandedCover: cover },
    "@/lib/utils": { cn: (...values) => values.filter(Boolean).join(" ") },
    "lucide-react": icons,
  });
  return {
    hook,
    Component: component.RecentBuildPhoto,
    useAuth,
    calls,
    revoked,
    account(id, ticket = `private-ticket-${id}`) {
      player = id ? { playFabId: id } : null;
      session = id ? { identity: { playFabId: id }, sessionTicket: ticket } : null;
    },
    mismatch() {
      session = { identity: { playFabId: "OTHER_ACCOUNT" }, sessionTicket: "other-private-ticket" };
    },
  };
}

async function hookProbe(runtime, level = completedLevel()) {
  let value;
  function Probe(props) {
    value = runtime.hook.useBridgeSnapshotState(props.level, props.refreshKey);
    return null;
  }
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(Probe, { level, refreshKey: 0 }));
  });
  return {
    get value() {
      return value;
    },
    async update(nextLevel = level, refreshKey = 0) {
      await act(async () =>
        renderer.update(React.createElement(Probe, { level: nextLevel, refreshKey })),
      );
    },
    async unmount() {
      await act(async () => renderer.unmount());
    },
  };
}

test("recent photo loader reads archive and legacy private PNG through the authenticated owner endpoint", async () => {
  for (const privatePng of [false, true]) {
    const runtime = photoRuntime();
    const probe = await hookProbe(runtime, completedLevel({ privatePng }));
    try {
      assert.equal(probe.value.status, "ready");
      assert.equal(probe.value.url, "blob:private-photo-1");
      assert.equal(runtime.calls.length, 1);
      const { path, init } = runtime.calls[0];
      const url = new URL(path, "https://civil-craft.example");
      assert.equal(url.pathname, "/api/player/bridge-snapshot");
      assert.equal(url.searchParams.get("contractId"), "ReedsContract");
      assert.equal(url.searchParams.get("regionId"), "canyon-crossing");
      assert.doesNotMatch(path, /private-ticket|ACCOUNT_A|Authorization/);
      assert.equal(init.headers.Authorization, "Bearer private-ticket-A");
      assert.equal(init.cache, "no-store");
    } finally {
      await probe.unmount();
    }
    assert.deepEqual(runtime.revoked, ["blob:private-photo-1"]);
  }
});

test("missing references and mismatched sessions never fetch private photos", async () => {
  for (const mode of ["missing", "mismatch", "signed-out"]) {
    const runtime = photoRuntime();
    if (mode === "mismatch") runtime.mismatch();
    if (mode === "signed-out") runtime.account(null);
    const probe = await hookProbe(runtime, completedLevel({ noPhoto: mode === "missing" }));
    try {
      assert.equal(runtime.calls.length, 0);
      assert.equal(probe.value.url, undefined);
      assert.notEqual(probe.value.status, "ready");
      if (mode === "missing") assert.equal(probe.value.status, "missing");
    } finally {
      await probe.unmount();
    }
  }
});

test("missing, unavailable, expired and non-image responses expose no image or service details", async () => {
  for (const result of [404, 503, 401, "html", "throws"]) {
    const runtime = photoRuntime(async () => {
      if (result === "throws") throw new Error("private-ticket-A private-storage-url");
      if (result === "html")
        return new Response("not a PNG", { headers: { "content-type": "text/html" } });
      return new Response(null, { status: result });
    });
    const probe = await hookProbe(runtime);
    try {
      assert.equal(probe.value.status, "unavailable");
      assert.equal(probe.value.url, undefined);
      assert.doesNotMatch(JSON.stringify(probe.value), /private-ticket|storage-url|not a PNG/);
    } finally {
      await probe.unmount();
    }
  }
});

test("refresh retries the same snapshot after a temporary outage", async () => {
  const runtime = photoRuntime(async (_path, _init, count) =>
    count === 1 ? new Response(null, { status: 503 }) : imageResponse(),
  );
  const level = completedLevel();
  const probe = await hookProbe(runtime, level);
  try {
    assert.equal(probe.value.status, "unavailable");
    await probe.update(level, 1);
    assert.equal(runtime.calls.length, 2);
    assert.equal(probe.value.status, "ready");
    assert.equal(probe.value.url, "blob:private-photo-1");
  } finally {
    await probe.unmount();
  }
});

test("an older account response cannot appear after switching accounts", async () => {
  let finishA;
  const runtime = photoRuntime((_path, _init, count) =>
    count === 1
      ? new Promise((resolve) => {
          finishA = resolve;
        })
      : Promise.resolve(imageResponse()),
  );
  const level = completedLevel();
  const probe = await hookProbe(runtime, level);
  try {
    assert.equal(probe.value.status, "loading");
    runtime.account("ACCOUNT_B");
    await probe.update(level);
    assert.equal(probe.value.url, "blob:private-photo-1");
    assert.equal(runtime.calls[1].init.headers.Authorization, "Bearer private-ticket-ACCOUNT_B");
    assert.equal(runtime.calls[0].init.signal.aborted, true);
    await act(async () => finishA(imageResponse()));
    assert.equal(probe.value.url, "blob:private-photo-1");
    assert.equal(probe.value.status, "ready");
  } finally {
    await probe.unmount();
  }
  assert.deepEqual(runtime.revoked, ["blob:private-photo-1"]);
});

test("a newer design reloads the fixed album and revokes the obsolete object URL", async () => {
  const runtime = photoRuntime();
  const probe = await hookProbe(runtime);
  try {
    assert.equal(probe.value.url, "blob:private-photo-1");
    await probe.update(completedLevel({ result: "c".repeat(32) }));
    assert.equal(runtime.calls.length, 2);
    assert.equal(probe.value.url, "blob:private-photo-2");
    assert.deepEqual(runtime.revoked, ["blob:private-photo-1"]);
  } finally {
    await probe.unmount();
  }
  assert.deepEqual(runtime.revoked, ["blob:private-photo-1", "blob:private-photo-2"]);
});

test("recent build thumbnail displays private photos and removes broken image elements", async () => {
  const runtime = photoRuntime();
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(runtime.Component, { level: completedLevel() }));
  });
  try {
    const photo = renderer.root.findByType("img");
    assert.equal(photo.props.src, "blob:private-photo-1");
    assert.match(photo.props.alt, /Reed/);
    await act(async () => photo.props.onError());
    assert.equal(renderer.root.findAllByType("img").length, 0);
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /private-ticket/);
    assert.match(JSON.stringify(renderer.toJSON()), /unavailable|not available|couldn.t|unable/i);
  } finally {
    await act(async () => renderer.unmount());
  }
});

test("thumbnail animates during download and image decoding, then clears its loading status", async () => {
  let finish;
  const runtime = photoRuntime(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(runtime.Component, { level: completedLevel() }));
  });
  const statuses = () => renderer.root.findAll((node) => node.props.role === "status");
  try {
    assert.equal(statuses().length, 1);
    assert.match(JSON.stringify(renderer.toJSON()), /animate-spin/);
    assert.equal(renderer.root.findAllByType("img").length, 0);
    await act(async () => finish(imageResponse()));
    assert.equal(statuses().length, 1, "The browser still needs to decode the downloaded image");
    await act(async () => renderer.root.findByType("img").props.onLoad());
    assert.equal(statuses().length, 0);
    assert.equal(renderer.root.findByType("img").props.src, "blob:private-photo-1");
  } finally {
    await act(async () => renderer.unmount());
  }
});

test("recent build thumbnail keeps a valid legacy public URL without a private fetch", async () => {
  const runtime = photoRuntime();
  const level = completedLevel({ noPhoto: true });
  level.completion.completionScreenshotUrl = "https://cdn.example/legacy-bridge.png";
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(runtime.Component, { level }));
  });
  try {
    assert.equal(
      renderer.root.findByType("img").props.src,
      level.completion.completionScreenshotUrl,
    );
    assert.equal(runtime.calls.length, 0);
    await act(async () => renderer.root.findByType("img").props.onError());
    assert.equal(renderer.root.findAllByType("img").length, 0);
  } finally {
    await act(async () => renderer.unmount());
  }
});

test("overview Recent builds requests its private photo and Refresh retries an unchanged reference", async () => {
  const runtime = photoRuntime(async (_path, _init, count) =>
    count === 1 ? new Response(null, { status: 503 }) : imageResponse(),
  );
  const widget = ({ children, ...props }) => React.createElement("div", props, children);
  const widgets = new Proxy({}, { get: () => widget });
  const level = completedLevel();
  const profile = {
    displayName: "Account A",
    characterSyncedAt: "2026-10-29T10:00:00Z",
    xp: 0,
    xpToNextLevel: 100,
    level: 1,
    totalScore: 2,
    bridgesCompleted: 1,
    challengesCompleted: 1,
    bestSingleBuildScore: 2,
  };
  const queryData = {
    profile,
    progress: { overallPercent: 10, currentRegion: "Canyon Crossing" },
    achievements: [],
    character: {},
    "almanac-journey": { regions: [{ levels: [level] }] },
  };
  const route = load("../src/routes/dashboard.index.tsx", {
    "@tanstack/react-router": { createFileRoute: () => (options) => options, Link: widget },
    "@tanstack/react-query": {
      useQuery: ({ queryKey }) => ({
        data: queryData[queryKey[0]],
        isPending: false,
        isError: false,
        refetch: async () => ({ data: queryData[queryKey[0]] }),
      }),
    },
    "lucide-react": widgets,
    "@/components/common/DemoBadge": widgets,
    "@/components/common/PlayerName": {
      PlayerName: ({ name }) => React.createElement("span", null, name),
    },
    "@/components/dashboard/CharacterPreview": widgets,
    "@/components/dashboard/YourRanking": widgets,
    "@/components/common/PageHeader": widgets,
    "@/components/common/StatCard": widgets,
    "@/components/common/States": widgets,
    "@/components/ui/button": {
      Button: ({ children, ...props }) => React.createElement("button", props, children),
    },
    "@/components/ui/progress": widgets,
    "@/components/common/BrandedCover": widgets,
    "@/components/dashboard/RecentBuildPhoto": { RecentBuildPhoto: runtime.Component },
    "@/lib/auth": { useAuth: runtime.useAuth },
    "@/lib/playfab": {
      achievementsService: {},
      almanacService: {},
      profileService: {},
      progressService: {},
    },
    "@/lib/almanac/content": { getBridgeType: () => ({ name: "Truss Bridge" }) },
    "@/lib/utils": { cn: (...values) => values.filter(Boolean).join(" ") },
  });
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(route.Route.component));
  });
  try {
    assert.equal(
      runtime.calls.length,
      1,
      "Overview must invoke the private image reader, not only look for a public screenshot URL",
    );
    assert.equal(renderer.root.findAllByType("img").length, 0);
    const refresh = renderer.root
      .findAllByType("button")
      .find((node) => node.props.title === "Refresh game data from PlayFab");
    assert.ok(refresh);
    await act(async () => refresh.props.onClick());
    assert.equal(runtime.calls.length, 2);
    assert.equal(renderer.root.findByType("img").props.src, "blob:private-photo-1");
  } finally {
    await act(async () => renderer.unmount());
  }
});
