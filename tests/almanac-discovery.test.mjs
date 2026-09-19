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
function load(path, dependencies = {}, extra = "") {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  runInNewContext(source + extra, {
    exports,
    require: (name) => dependencies[name] ?? require(name),
  });
  return exports;
}

// Use the production JSON reader; no network or player writes are available.
const player = load("../src/lib/playfab/player.ts", {
  "./client": {},
  "./statistics": {},
  "./leaderboard-shared": {},
});
async function journeyFrom(record) {
  let reads = 0;
  const service = load("../src/lib/playfab/almanac.ts", {
    "./player": {
      jsonFrom: player.jsonFrom,
      getPlayerData: async (keys) => {
        reads++;
        assert.deepEqual(Array.from(keys), ["AlmanacProgress", "MapProgress"]);
        return record === undefined ? {} : { AlmanacProgress: record };
      },
    },
  });
  const journey = await service.getJourney();
  assert.equal(reads, 1);
  return JSON.parse(JSON.stringify(journey));
}

test("legacy, missing and malformed discovery never unlock materials", async () => {
  for (const raw of [
    undefined,
    "{",
    "null",
    "[]",
    "12",
    JSON.stringify({ regions: [] }),
    ...[null, "wood_beam", 1, {}].map((discoveredMaterials) =>
      JSON.stringify({ regions: [], discoveredMaterials }),
    ),
  ]) {
    assert.deepEqual((await journeyFrom(raw)).discoveredMaterials, []);
  }
});

test("game-written discoveries work before any project and are deduplicated", async () => {
  const journey = await journeyFrom(
    JSON.stringify({
      discoveredMaterials: ["wood_beam", "wood_road", "wood_beam", null, 12, {}, "unknown"],
    }),
  );
  assert.deepEqual(journey.discoveredMaterials, ["wood_beam", "wood_road", "unknown"]);
  assert.deepEqual(journey.regions, []);
});

test("material field does not alter existing project or bridge progression", async () => {
  const record = {
    regions: [
      { regionId: "canyon", status: "current", levels: [{ completion: { bridgeTypeId: "beam" } }] },
    ],
    levelsCompleted: 7,
    levelsTotal: 37,
    journeyPercent: 24,
    discoveredMaterials: ["wood_support"],
  };
  const journey = await journeyFrom(JSON.stringify(record));
  assert.deepEqual(journey.regions, record.regions);
  assert.equal(journey.levelsCompleted, 7);
  assert.equal(journey.levelsTotal, 37);
  assert.equal(journey.journeyPercent, 24);
  assert.deepEqual(journey.discoveredBridgeTypeIds, ["beam"]);
});

const content = load("../src/lib/almanac/content.ts");
const wrap =
  (tag) =>
  ({ children, ...props }) =>
    React.createElement(tag, props, children);
const widgets = new Proxy({}, { get: (_, name) => wrap(name) });

test("Materials UI reveals only exact game-written entries and preserves empty states", async () => {
  for (const [ids, expected] of [
    [undefined, []],
    [[], []],
    [["unknown", "wood", "WOOD_BEAM", " wood_beam"], []],
    [["wood_beam"], ["Wood Beam"]],
    [
      ["wood_road", "wood_support"],
      ["Wood Support / Pier", "Wood Road"],
    ],
  ]) {
    const journey = {
      regions: [],
      levelsCompleted: 0,
      levelsTotal: 20,
      journeyPercent: 0,
      discoveredBridgeTypeIds: [],
      discoveredMaterials: ids,
    };
    const component = load("../src/components/dashboard/almanac/AlmanacJournal.tsx", {
      "@tanstack/react-query": {
        useQuery: ({ queryKey }) => ({
          data: queryKey[0] === "almanac-journey" ? journey : undefined,
        }),
      },
      "lucide-react": widgets,
      "@/components/common/DemoBadge": widgets,
      "@/components/common/States": widgets,
      "@/components/ui/avatar": widgets,
      "@/components/ui/badge": widgets,
      "@/components/ui/progress": widgets,
      "@/components/ui/tabs": widgets,
      "@/components/dashboard/almanac/LevelEntryDialog": widgets,
      "@/lib/almanac/content": content,
      "@/lib/auth": { useAuth: () => ({ player: { playFabId: "test" } }) },
      "@/lib/playfab": { almanacService: {}, profileService: {} },
      "@/lib/utils": { cn: (...values) => values.join(" ") },
    });
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(component.AlmanacJournal));
    });
    try {
      const tab = renderer.root.findAll(
        (node) => node.type === "TabsContent" && node.props.value === "materials",
      )[0];
      assert.deepEqual(
        tab.findAllByType("h3").map((node) => node.children.join("")),
        expected,
      );
      assert.equal(tab.findAllByType("EmptyState").length, expected.length ? 0 : 1);
      assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /Levels completed|0 \/ 20/);
      assert.match(JSON.stringify(renderer.toJSON()), /Projects completed|Regions completed/);
    } finally {
      await act(async () => renderer.unmount());
    }
  }
});
