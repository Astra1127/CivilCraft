import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { act, create } from "react-test-renderer";
import ts from "typescript";
import { playerNameDependencies } from "./helpers/player-name-ui.mjs";

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
  "./equipment.ts": {},
  "./client.ts": {},
  "./statistics.ts": {},
  "./leaderboard-shared.ts": {},
});
async function journeyFrom(record) {
  let reads = 0;
  const service = load("../src/lib/playfab/almanac.ts", {
    "./player.ts": {
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
  const { discoveredMaterials, ...withoutMaterials } = record;
  const baseline = await journeyFrom(JSON.stringify(withoutMaterials));
  assert.deepEqual(journey.regions, baseline.regions);
  assert.deepEqual(journey.discoveredMaterials, discoveredMaterials);
  assert.equal(journey.regions[0].name, "canyon");
  assert.equal(journey.regions[0].levels[0].levelId, "level_0");
  assert.equal(journey.regions[0].levels[0].order, 1);
  assert.deepEqual(journey.regions[0].levels[0].engineeringConceptIds, []);
  assert.equal(journey.regions[0].levels[0].completion.completedAt, "");
  assert.equal(journey.levelsCompleted, 7);
  assert.equal(journey.levelsTotal, 37);
  assert.equal(journey.journeyPercent, 24);
  assert.deepEqual(journey.discoveredBridgeTypeIds, ["beam"]);
});

test("completion dates are game-written, never generated while reading", async () => {
  for (const dateField of ["completedAt", "CompletedAt"]) {
    const completedAt = "2026-09-01T10:00:00.000Z";
    const journey = await journeyFrom(
      JSON.stringify({
        regions: [
          {
            levels: [
              {
                status: "completed",
                completion: { [dateField]: completedAt, score: 123, bridgeTypeId: "arch" },
              },
            ],
          },
        ],
      }),
    );
    const level = journey.regions[0].levels[0];
    assert.equal(level.completion.completedAt, completedAt);
    assert.equal(level.completion.score, 123);
    assert.equal(level.status, "completed");
    assert.equal(journey.levelsCompleted, 1);
    assert.deepEqual(journey.discoveredBridgeTypeIds, ["arch"]);
  }
});

const content = load("../src/lib/almanac/content.ts");
const wrap =
  (tag) =>
  ({ children, ...props }) =>
    React.createElement(tag, props, children);
const widgets = new Proxy({}, { get: (_, name) => wrap(name) });

test("completion dialog keeps undated completions visible without inventing a date", async () => {
  const component = load("../src/components/dashboard/almanac/LevelEntryDialog.tsx", {
    "lucide-react": widgets,
    "@/components/common/BrandedCover": widgets,
    "@/components/ui/badge": widgets,
    "@/components/ui/button": widgets,
    "@/components/ui/dialog": widgets,
    "@/lib/almanac/content": content,
  });
  for (const completedAt of ["", "not-a-date", "2026-09-01T10:00:00.000Z"]) {
    const level = {
      levelId: "beam_1",
      regionId: "canyon",
      order: 1,
      status: "completed",
      engineeringConceptIds: [],
      completion: { completedAt, score: 123, bridgeTypeId: "beam" },
    };
    let renderer;
    await act(async () => {
      renderer = create(
        React.createElement(component.LevelEntryDialog, {
          level,
          open: true,
          onOpenChange: () => {},
        }),
      );
    });
    try {
      const rendered = JSON.stringify(renderer.toJSON());
      assert.equal(
        rendered.includes("Date unavailable"),
        !Number.isFinite(Date.parse(completedAt)),
      );
      assert.ok(!rendered.includes("Invalid Date"));
      assert.ok(rendered.includes("123"));
    } finally {
      await act(async () => renderer.unmount());
    }
  }
});

test("completion notifications label missing and invalid dates as unavailable", () => {
  const component = load(
    "../src/components/dashboard/NotificationBell.tsx",
    {
      "lucide-react": widgets,
      "@/components/ui/button": widgets,
      "@/components/ui/dropdown-menu": widgets,
      "@/lib/playfab": {},
      "@/lib/utils": {},
    },
    "\nexports.timeAgo = timeAgo;",
  );
  assert.equal(component.timeAgo(""), "Date unavailable");
  assert.equal(component.timeAgo("bad-date"), "Date unavailable");
  assert.notEqual(component.timeAgo("2026-09-01T10:00:00.000Z"), "Date unavailable");
});

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
      ...playerNameDependencies,
      "@tanstack/react-query": {
        useQuery: ({ queryKey }) => ({
          data:
            queryKey[0] === "almanac-journey"
              ? journey
              : { displayName: "<#BF40BF>.dev_hyakkimaru" },
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
      assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /<#BF40BF>/);
      assert.equal(renderer.root.findByType("AvatarFallback").children.join(""), ".D");
      const playerLabel = renderer.root
        .findAllByType("span")
        .find((node) => node.children.join("") === ".dev_hyakkimaru");
      assert.equal(playerLabel.props.style.color, "#BF40BF");
    } finally {
      await act(async () => renderer.unmount());
    }
  }
});
