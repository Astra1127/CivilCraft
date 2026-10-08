import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import { act, create } from "react-test-renderer";
import { handleCharacterPortrait } from "../src/lib/playfab/character-portrait.server.ts";
import { playerNameDependencies } from "./helpers/player-name-ui.mjs";
const require = createRequire(import.meta.url);
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
process.env.PLAYFAB_SECRET_KEY = "server-secret";
const envelope = (data) => Response.json({ code: 200, data });
function request(query = "", authenticated = true) {
  return new Request("https://website.example/api/player/character-portrait" + query, {
    headers: authenticated ? { Authorization: "Bearer player-ticket" } : {},
  });
}
async function flow(options = {}) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("AuthenticateSessionTicket")) {
      if (options.expired)
        return Response.json({ code: 400, error: "InvalidSessionTicket" }, { status: 400 });
      return envelope({ UserInfo: { PlayFabId: "ABC123" } });
    }
    if (String(url).endsWith("GetEntityToken"))
      return envelope({
        Entity: { Id: "owner-entity", Type: options.type ?? "title_player_account" },
        EntityToken: "private-entity-token",
      });
    if (String(url).endsWith("GetFiles")) {
      if (options.failure) throw new Error("private-entity-token server-secret");
      return envelope({
        Metadata: options.missing
          ? {}
          : {
              "characterPortrait.png": {
                DownloadUrl:
                  options.url ?? "https://files.blob.core.windows.net/entity/portrait?sig=private",
              },
              "playerSaveData.json": {
                DownloadUrl: "https://files.blob.core.windows.net/private-save",
              },
            },
      });
    }
    return new Response(png);
  };
  try {
    return {
      response: await handleCharacterPortrait(
        request(options.query ?? "", options.authenticated ?? true),
      ),
      calls,
    };
  } finally {
    globalThis.fetch = original;
  }
}
test("authenticated portrait returns PNG only, resolves own title player entity, never forwards credentials to storage", async () => {
  const { response, calls } = await flow();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), png);
  assert.deepEqual(JSON.parse(calls[2].init.body), {
    Entity: { Id: "owner-entity", Type: "title_player_account" },
  });
  assert.equal(calls[3].init.headers, undefined);
  assert.ok(!JSON.stringify(calls).includes("private-save"));
  assert.ok(
    !/private-entity-token|server-secret|player-ticket|sig=/.test(
      JSON.stringify([...response.headers]),
    ),
  );
});
test("missing portrait and temporary failure have empty safe responses", async () => {
  for (const [options, status] of [
    [{ missing: true }, 404],
    [{ failure: true }, 503],
    [{ type: "master_player_account" }, 503],
    [{ url: "https://localhost/private" }, 503],
  ]) {
    const { response } = await flow(options);
    assert.equal(response.status, status);
    assert.equal(await response.text(), "");
  }
});
test("unauthenticated, expired and arbitrary player ID requests rejected", async () => {
  for (const [options, status] of [
    [{ authenticated: false }, 401],
    [{ expired: true }, 401],
    [{ query: "?playFabId=OTHER" }, 400],
  ]) {
    const { response, calls } = await flow(options);
    assert.equal(response.status, status);
    assert.ok(!calls.some((c) => c.url.endsWith("GetFiles")));
  }
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
function preview(url) {
  const exports = {};
  const source = ts.transpileModule(
    readFileSync(
      new URL("../src/components/dashboard/CharacterPreview.tsx", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    },
  ).outputText;
  runInNewContext(source, {
    exports,
    require: (name) => {
      if (playerNameDependencies[name]) return playerNameDependencies[name];
      if (name === "react" || name === "react/jsx-runtime") return require(name);
      if (name === "./useCharacterPortrait") return { useCharacterPortrait: () => url };
      if (name === "./portrait-bounds")
        return {
          portraitBounds: () => ({ width: 0.25, height: 0.5, centerX: 0.5, centerY: 0.6 }),
        };
      if (name === "@/lib/utils") return { cn: (...args) => args.filter(Boolean).join(" ") };
      if (name.includes("chibi-engineer")) return { default: "fallback.png" };
      return {};
    },
  });
  return exports.CharacterPreview;
}
test("real portrait displays with and without dashboard snapshot; notice hidden after load", async () => {
  for (const character of [undefined, { syncedAt: "2026-10-03", equipped: [] }]) {
    let renderer;
    await act(async () => {
      renderer = create(
        React.createElement(preview("blob:portrait"), { displayName: "<#BF40BF>Player", character }),
      );
    });
    const image = renderer.root.findByType("img");
    assert.equal(image.props.src, "blob:portrait");
    assert.equal(image.props.alt, "Player's Civil Craft character with their equipped cosmetics");
    assert.ok(image.props.className.includes("object-contain"));
    await act(async () =>
      image.props.onLoad({ currentTarget: { naturalWidth: 512, naturalHeight: 512 } }),
    );
    assert.equal(renderer.root.findByType("img").props.style.width, "min(400cqw, 200cqh)");
    assert.equal(renderer.root.findByType("img").props.style.transform, "translate(-50%, -60%)");
    assert.ok(!JSON.stringify(renderer.toJSON()).includes("Awaiting character snapshot"));
    await act(async () => renderer.unmount());
  }
});
test("missing/service-failed portrait and image decode failure use existing fallback without broken image", async () => {
  for (const url of [undefined, "blob:portrait"]) {
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(preview(url), { displayName: "Player" }));
    });
    if (url) await act(async () => renderer.root.findByType("img").props.onError());
    assert.equal(renderer.root.findByType("img").props.src, "fallback.png");
    assert.ok(JSON.stringify(renderer.toJSON()).includes("Awaiting character snapshot"));
    await act(async () => renderer.unmount());
  }
});

test("portrait loader uses existing bearer session, falls back on missing/outage, refreshes and revokes URLs", async () => {
  for (const status of [200, 404, 503, 401]) {
    const exports = {};
    let timer,
      cleared = false,
      value;
    const revoked = [],
      calls = [];
    const source = ts.transpileModule(
      readFileSync(
        new URL("../src/components/dashboard/useCharacterPortrait.ts", import.meta.url),
        "utf8",
      ),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS },
      },
    ).outputText;
    runInNewContext(source, {
      exports,
      AbortController,
      URL: { createObjectURL: () => "blob:loaded", revokeObjectURL: (url) => revoked.push(url) },
      window: {
        setInterval: (callback, ms) => {
          assert.equal(ms, 60000);
          timer = callback;
          return 1;
        },
        clearInterval: () => {
          cleared = true;
        },
      },
      require: (name) =>
        name === "react"
          ? React
          : name === "@/lib/auth"
            ? { useAuth: () => ({ player: { playFabId: "ABC123" } }) }
            : {
                readSession: () => ({
                  identity: { playFabId: "ABC123" },
                  sessionTicket: "existing-ticket",
                }),
                playerFetch: async (path, init) => {
                  calls.push({ path, init });
                  if (status === 401) throw new Error("session expired");
                  return status === 200
                    ? new Response(png, { headers: { "content-type": "image/png" } })
                    : new Response(null, { status });
                },
              },
    });
    function Harness() {
      value = exports.useCharacterPortrait();
      return null;
    }
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(Harness));
    });
    assert.equal(value, status === 200 ? "blob:loaded" : undefined);
    assert.equal(calls[0].path, "/api/player/character-portrait");
    assert.equal(calls[0].init.headers.Authorization, "Bearer existing-ticket");
    assert.equal(calls[0].init.cache, "no-store");
    await act(async () => {
      await timer();
    });
    assert.equal(calls.length, 2);
    await act(async () => renderer.unmount());
    assert.ok(cleared);
    if (status === 200) assert.equal(revoked.length, 2);
  }
});
import { portraitBounds } from "../src/components/dashboard/portrait-bounds.ts";

test("visible pixel bounds retain edge accessories and fit overview/profile/mobile frames", () => {
  const original = globalThis.document;
  const width = 100,
    height = 100;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 20; y <= 79; y++) for (let x = 40; x <= 59; x++) data[(y * width + x) * 4 + 3] = 255;
  data[(50 * width + 20) * 4 + 3] = 1; // faint equipment at the left edge
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: () => {}, getImageData: () => ({ data }) }),
  };
  globalThis.document = { createElement: () => canvas };
  try {
    const bounds = portraitBounds({ naturalWidth: width, naturalHeight: height });
    assert.deepEqual(bounds, { width: 0.44, height: 0.64, centerX: 0.4, centerY: 0.5 });
    for (const [frameWidth, frameHeight] of [
      [128, (128 * 4) / 3],
      [144, 192],
      [280, (280 * 4) / 3],
      [320, 280],
    ]) {
      const areaWidth = frameWidth * 0.88,
        areaHeight = frameHeight * 0.88;
      const imageWidth = Math.min(areaWidth / bounds.width, areaHeight / bounds.height);
      assert.ok(imageWidth * bounds.width <= areaWidth + 0.00001);
      assert.ok(imageWidth * bounds.height <= areaHeight + 0.00001);
      assert.ok(Math.abs((imageWidth * bounds.height) / frameHeight - 0.88) < 0.00001);
    }
    data.fill(0);
    assert.equal(portraitBounds({ naturalWidth: width, naturalHeight: height }), undefined);
    canvas.getContext = () => {
      throw new Error("pixel access denied");
    };
    assert.equal(portraitBounds({ naturalWidth: width, naturalHeight: height }), undefined);
  } finally {
    globalThis.document = original;
  }
});
