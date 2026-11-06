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
const hosted = "/api/releases/current-build/download";
const fileName = "CivilCraft.apk";
const signed =
  `https://test.private.blob.vercel-storage.com/civilcraft/releases/current-build/upload/${fileName}` +
  "?vercel-blob-signature=test-signature&vercel-blob-delegation=test-delegation&download=1";
const prepared = (change = {}) =>
  Response.json({ url: signed, fileName, fileSizeBytes: 123456, ...change });
const text = (node) =>
  typeof node === "string" ? node : (node?.children ?? []).map(text).join("");
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => (resolve = yes));
  return { promise, resolve };
};

function load(relative, modules = {}, globals = {}) {
  const exports = {};
  runInNewContext(
    ts.transpileModule(readFileSync(new URL(relative, import.meta.url), "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    { exports, require: (name) => modules[name] ?? require(name), ...globals },
  );
  return exports;
}

async function mount(fetchResponse = async () => prepared(), props = {}) {
  const calls = [],
    navigations = [];
  const helper = load(
    "../src/lib/cms/apk-download.ts",
    {},
    {
      URL,
      Error,
      fetch: async (path, init) => {
        calls.push({ path, init });
        return fetchResponse(path, init, calls.length);
      },
    },
  );
  const component = load(
    "../src/components/common/ApkDownloadButton.tsx",
    {
      "@/lib/cms/apk-download": helper,
      "@/components/ui/button": {
        Button: ({ children, asChild, variant, size, ...rest }) =>
          asChild
            ? React.cloneElement(React.Children.only(children), rest)
            : React.createElement("button", rest, children),
      },
      "lucide-react": {
        LoaderCircle: (props) => React.createElement("svg", props),
      },
    },
    { AbortController, Error, window: { location: { assign: (url) => navigations.push(url) } } },
  );
  const baseProps = { url: hosted, fileName, children: "Download APK", ...props };
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(component.ApkDownloadButton, baseProps));
  });
  return {
    helper,
    renderer,
    calls,
    navigations,
    button: () => renderer.root.findAllByType("button")[0],
    async click() {
      await act(async () => renderer.root.findAllByType("button")[0].props.onClick());
    },
    async update(props) {
      await act(async () =>
        renderer.update(
          React.createElement(component.ApkDownloadButton, { ...baseProps, ...props }),
        ),
      );
    },
    async close() {
      await act(async () => renderer.unmount());
    },
  };
}

test("hosted APK preparation uses a first-party POST and navigates only to the validated signed file", async () => {
  const runtime = await mount();
  try {
    assert.equal(runtime.renderer.root.findAllByType("a").length, 0);
    await runtime.click();
    assert.equal(runtime.calls.length, 1);
    assert.equal(runtime.calls[0].path, "/api/releases/current-build/download-link");
    assert.equal(runtime.calls[0].init.method, "POST");
    assert.equal(runtime.calls[0].init.credentials, "same-origin");
    assert.equal(runtime.calls[0].init.cache, "no-store");
    assert.equal(runtime.calls[0].init.redirect, "error");
    assert.deepEqual(runtime.navigations, [signed]);
    assert.equal(runtime.renderer.root.findAllByProps({ role: "alert" }).length, 0);
  } finally {
    await runtime.close();
  }
});

test("JSON download failures stay on the page with retry and never save or navigate to JSON", async () => {
  for (const status of [404, 503]) {
    const runtime = await mount(async (_, __, attempt) =>
      attempt === 1
        ? Response.json({ error: "The APK download is temporarily unavailable." }, { status })
        : prepared(),
    );
    try {
      await runtime.click();
      assert.equal(runtime.navigations.length, 0);
      assert.match(text(runtime.renderer.root), /temporarily unavailable/);
      const retry = runtime.renderer.root
        .findAllByType("button")
        .find((button) => text(button) === "Retry download");
      await act(async () => retry.props.onClick());
      assert.equal(runtime.calls.length, 2);
      assert.deepEqual(runtime.navigations, [signed]);
    } finally {
      await runtime.close();
    }
  }
});

test("non-JSON, malformed JSON and unsafe error bodies produce a safe visible error", async () => {
  for (const response of [
    () => new Response("<html>Private provider failure</html>", { status: 503 }),
    () =>
      new Response("{bad json", { status: 503, headers: { "content-type": "application/json" } }),
    () => Response.json({ error: "<script>private-service-details</script>" }, { status: 503 }),
    () => new Response("some file", { status: 200 }),
  ]) {
    const runtime = await mount(response);
    try {
      await runtime.click();
      assert.equal(runtime.navigations.length, 0);
      assert.match(text(runtime.renderer.root), /temporarily unavailable/);
      assert.doesNotMatch(
        text(runtime.renderer.root),
        /Private provider|private-service-details|bad json/,
      );
    } finally {
      await runtime.close();
    }
  }
});

test("rapid clicks prepare only one request and show an accessible loading state", async () => {
  const pending = deferred();
  const runtime = await mount(() => pending.promise);
  try {
    const click = runtime.button().props.onClick;
    let first, second;
    await act(async () => {
      first = click();
      second = click();
    });
    assert.equal(runtime.calls.length, 1);
    assert.equal(runtime.button().props.disabled, true);
    assert.equal(runtime.button().props["aria-busy"], true);
    assert.match(text(runtime.renderer.root), /Preparing download/);
    await act(async () => {
      pending.resolve(prepared());
      await Promise.all([first, second]);
    });
    assert.deepEqual(runtime.navigations, [signed]);
    assert.equal(runtime.button().props.disabled, false);
  } finally {
    await runtime.close();
  }
});

test("changed releases and unmounted buttons discard obsolete preparation responses", async () => {
  for (const change of ["release", "unmount"]) {
    const pending = deferred();
    const runtime = await mount(() => pending.promise);
    let request;
    await act(async () => {
      request = runtime.button().props.onClick();
    });
    if (change === "release") await runtime.update({ url: "/api/releases/next/download" });
    else await runtime.close();
    assert.equal(runtime.calls[0].init.signal.aborted, true);
    await act(async () => {
      pending.resolve(prepared());
      await request;
    });
    assert.equal(runtime.navigations.length, 0);
    if (change === "release") await runtime.close();
  }
});

test("admin preview prepares through the admin endpoint with same-origin session credentials", async () => {
  const runtime = await mount(undefined, {
    url: "/api/admin/releases/current-build/download",
    children: "Preview APK download",
  });
  try {
    await runtime.click();
    assert.equal(runtime.calls[0].path, "/api/admin/releases/current-build/download-link");
    assert.equal(runtime.calls[0].init.credentials, "same-origin");
    assert.equal(runtime.calls[0].init.method, "POST");
    assert.deepEqual(runtime.navigations, [signed]);
  } finally {
    await runtime.close();
  }
});

test("unexpected storage URLs, filenames, signatures and file sizes cannot start downloads", async () => {
  for (const mutation of [
    { url: "https://evil.example/CivilCraft.apk" },
    { url: signed.replace("https:", "http:") },
    { url: signed.replace("test.private", "user:password@test.private") },
    { url: signed.replace("CivilCraft.apk", "Different.apk") },
    { url: signed.replace("vercel-blob-signature", "missing-signature") },
    { fileName: "Wrong.apk" },
    { fileName: "../CivilCraft.apk" },
    { fileSizeBytes: 0 },
    { fileSizeBytes: "123" },
  ]) {
    const runtime = await mount(async () => prepared(mutation));
    try {
      await runtime.click();
      assert.equal(runtime.navigations.length, 0);
      assert.match(text(runtime.renderer.root), /temporarily unavailable/);
    } finally {
      await runtime.close();
    }
  }
});

test("legacy external links remain normal navigation without a forced file download", async () => {
  const runtime = await mount(undefined, { url: "https://example.test/legacy.apk" });
  try {
    const anchor = runtime.renderer.root.findByType("a");
    assert.equal(anchor.props.href, "https://example.test/legacy.apk");
    assert.equal(anchor.props.download, undefined);
    assert.equal(runtime.calls.length, 0);
    assert.equal(runtime.navigations.length, 0);
  } finally {
    await runtime.close();
  }
});

test("prepared GitHub APK starts a direct asset download without a GitHub page or login", async () => {
  const url =
    "https://github.com/Astra1127/CivilCraft/releases/download/android-2026-10-29/CivilCraft.apk";
  const runtime = await mount(async () => prepared({ url }));
  try {
    await runtime.click();
    assert.deepEqual(runtime.navigations, [url]);
    assert.equal(runtime.calls.length, 1);
  } finally {
    await runtime.close();
  }
});

test("GitHub download preparation rejects other repositories, pages, query strings and credentials", async () => {
  for (const url of [
    "https://github.com/Someone/CivilCraft/releases/download/test/CivilCraft.apk",
    "https://github.com/Astra1127/CivilCraft/releases/tag/test",
    "https://github.com/Astra1127/CivilCraft/releases/download/test/CivilCraft.apk?token=bad",
    "https://user@github.com/Astra1127/CivilCraft/releases/download/test/CivilCraft.apk",
    "https://github.com.evil.test/Astra1127/CivilCraft/releases/download/test/CivilCraft.apk",
  ]) {
    const runtime = await mount(async () => prepared({ url }));
    try {
      await runtime.click();
      assert.equal(runtime.navigations.length, 0);
      assert.match(text(runtime.renderer.root), /temporarily unavailable/);
    } finally {
      await runtime.close();
    }
  }
});

test("private GitHub draft previews accept a signed file only through the staff endpoint", async () => {
  const url =
    "https://release-assets.githubusercontent.com/github-production-release-asset/123/00000000-0000-4000-8000-000000000001?sig=temporary&response-content-disposition=attachment%3B%20filename%3DCivilCraft.apk";
  for (const admin of [false, true]) {
    const runtime = await mount(
      async () => prepared({ url }),
      admin ? { url: "/api/admin/releases/current-build/download" } : {},
    );
    try {
      await runtime.click();
      assert.equal(runtime.navigations.length, admin ? 1 : 0);
      if (admin) assert.equal(runtime.navigations[0], url);
    } finally {
      await runtime.close();
    }
  }
});
