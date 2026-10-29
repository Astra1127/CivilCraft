import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { act, create } from "react-test-renderer";
import ts from "typescript";
import { playerNameDependencies } from "./helpers/player-name-ui.mjs";
import * as levelRecords from "../src/lib/playfab/level-records.ts";
import * as education from "../src/lib/playfab/almanac-education.ts";
import * as navigation from "../src/lib/playfab/notification-navigation.ts";
import * as playerLevel from "../src/lib/playfab/player-level.ts";
import * as materialOrder from "../src/lib/almanac/material-order.ts";
import * as lessonCatalog from "../src/lib/almanac/lesson-catalog.ts";
import * as lessonNavigation from "../src/lib/almanac/lesson-navigation.ts";
import * as actualContent from "../src/lib/almanac/content.ts";
import catalog from "../src/lib/almanac/game-catalog.json" with { type: "json" };

const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
function load(path, dependencies = {}, extra = "", globals = {}) {
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
    require: (name) =>
      dependencies[name] ??
      {
        "./almanac-education.ts": education,
        "./player-level.ts": playerLevel,
        "@/lib/almanac/material-order": materialOrder,
        "@/lib/almanac/lesson-catalog": lessonCatalog,
        "@/lib/almanac/lesson-navigation": lessonNavigation,
        "@/lib/almanac/content": actualContent,
        "./ConceptIllustrations":
          name === "./ConceptIllustrations"
            ? load("../src/components/dashboard/almanac/ConceptIllustrations.tsx")
            : undefined,
        "./LessonIllustration":
          name === "./LessonIllustration"
            ? load("../src/components/dashboard/almanac/LessonIllustration.tsx")
            : undefined,
        "./level-records.ts": levelRecords,
        "@/lib/playfab/level-records": levelRecords,
        "@/lib/playfab/notification-navigation": navigation,
        "./useBridgeSnapshot": { useBridgeSnapshot: () => undefined },
        "./IllustrationPreview": { IllustrationPreview: ({ children }) => children },
        "@/components/dashboard/useNotificationRead": { useNotificationRead: () => {} },
      }[name] ??
      require(name),
    ...globals,
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
  assert.equal(journey.regions[0].levels[0].completion, undefined);
  assert.equal(journey.levelsCompleted, 7);
  assert.equal(journey.levelsTotal, 37);
  assert.equal(journey.journeyPercent, 24);
  assert.deepEqual(journey.discoveredBridgeTypeIds, []);
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

test("lesson illustration handles missing and broken assets without broken images", async () => {
  const { LessonIllustration } = load("../src/components/dashboard/almanac/LessonIllustration.tsx");
  let view;
  for (const id of ["What is Tension", "What is Compression", "What is Equilibrium"]) {
    await act(async () => {
      view = create(React.createElement(LessonIllustration, { id, title: id }));
    });
    assert.equal(view.root.findAllByType("svg").length, 1);
    assert.match(view.root.findByType("svg").props["aria-label"], /forces|loads/);
    await act(async () => view.unmount());
  }
  await act(async () => {
    view = create(
      React.createElement(LessonIllustration, {
        id: "LESSON002",
        title: "BEAM BRIDGE",
        image: "/missing.png",
      }),
    );
  });
  await act(async () => view.root.findByType("img").props.onError());
  assert.equal(view.root.findAllByType("img").length, 0);
  assert.match(JSON.stringify(view.toJSON()), /Illustration unavailable/);
  await act(async () =>
    view.update(React.createElement(LessonIllustration, { id: "unknown", title: "Unknown" })),
  );
  assert.match(JSON.stringify(view.toJSON()), /Illustration unavailable/);
  await act(async () => view.unmount());
});

test("lesson previews do not grant unlocks; full notes need records; quiz results are unchanged", async () => {
  const { GameLessons, QuizRecords } = load(
    "../src/components/dashboard/almanac/GameEducation.tsx",
    {
      "@/lib/almanac/game-catalog.json": { default: catalog },
      "@/components/common/States": widgets,
    },
  );
  let view;
  await act(async () => {
    view = create(React.createElement(GameLessons, { journey: {} }));
  });
  assert.equal(view.root.findAllByType("img").length, 2);
  assert.equal(view.root.findAllByType("svg").length, 6);
  assert.equal(view.root.findAllByType("details").length, 0);
  assert.equal(
    view.root.findAllByType("h4").length,
    lessonCatalog.lessons.filter((l) => l.category === "engineering").length,
  );
  for (const img of view.root.findAllByType("img"))
    assert.match(img.props.className, /h-28 sm:h-32/);
  for (const card of view.root.findAllByType("li")) {
    const lesson = lessonCatalog.lessons.find(
      (l) => l.title === card.findByType("h4").children.join(""),
    );
    assert.ok(
      card
        .findAllByType("p")
        .some((p) => p.children.join("") === lessonCatalog.lessonPreview(lesson)),
    );
  }
  assert.match(JSON.stringify(view.toJSON()), /Lesson state not yet synchronized/);
  await act(async () => {
    view.update(
      React.createElement(GameLessons, {
        journey: { lessonRecords: [{ lessonId: "deadload", state: "discovered" }] },
      }),
    );
  });
  assert.match(JSON.stringify(view.toJSON()), /permanent components of a structure/);
  assert.equal(view.root.findAllByType("img").length, 2);
  assert.equal(view.root.findAllByType("details").length, 1);
  await act(async () => {
    view.update(React.createElement(QuizRecords, { journey: {} }));
  });
  assert.equal(view.root.findByType("EmptyState").props.title, "No quiz records synchronized");
  await act(async () => {
    view.update(
      React.createElement(QuizRecords, {
        journey: {
          quizAttempts: [
            {
              quizId: "beam",
              attemptId: "a1",
              title: "Actual published quiz",
              score: 0,
              totalQuestions: 1,
            },
          ],
        },
      }),
    );
  });
  assert.match(view.root.findAllByType("p")[0].children.join(""), /0\/1.*0%/);
  assert.match(JSON.stringify(view.toJSON()), /Completion date unavailable/);
  assert.equal(view.root.findAllByType("details").length, 0);
  await act(async () => {
    view.update(
      React.createElement(QuizRecords, {
        journey: {
          quizAttempts: [
            {
              quizId: "beam",
              attemptId: "a2",
              title: "Actual published quiz",
              score: 1,
              totalQuestions: 1,
              answers: [
                {
                  questionId: "q",
                  question: "Actual question",
                  choices: ["Actual A", "Actual B"],
                  selectedIndex: 0,
                  correctIndex: 0,
                },
              ],
            },
          ],
        },
      }),
    );
  });
  assert.equal(view.root.findAllByType("details").length, 1);
  assert.match(JSON.stringify(view.toJSON()), /Actual question/);
  assert.match(JSON.stringify(view.toJSON()), /Your answer/);
  await act(async () => view.unmount());
});

test("Engineering cards require lesson sync even after tutorial completion and preserve pre-contract unlocks", async () => {
  const { GameLessons } = load("../src/components/dashboard/almanac/GameEducation.tsx", {
    "@/lib/almanac/game-catalog.json": { default: catalog },
    "@/components/common/States": widgets,
  });
  const levels = ["TUT_CONTRACT1", "TUT_CONTRACT2"].map((levelId) => ({
    levelId,
    regionId: "r",
    stableId: true,
    status: "completed",
    engineeringConceptIds: ["load", "bending", "support"],
    completion: { levelId, regionId: "r", playerId: "p", status: "success" },
  }));
  const journey = {
    regions: [{ regionId: "r", levels }],
    lessonRecords: [{ lessonId: "What is Tension", state: "discovered" }],
  };
  let view;
  await act(async () => {
    view = create(React.createElement(GameLessons, { journey, playerId: "p" }));
  });
  const states = () =>
    view.root
      .findAll((node) => node.type === "p" && node.props["data-lesson-state"])
      .map((node) => node.props["data-lesson-state"]);
  assert.deepEqual(states(), [
    "pending",
    "pending",
    "pending",
    "pending",
    "unlocked",
    "pending",
    "pending",
    "pending",
    "pending",
    "pending",
    "pending",
    "pending",
    "pending",
  ]);
  assert.equal(view.root.findAllByType("details").length, 1);
  assert.doesNotMatch(
    JSON.stringify(view.toJSON()),
    /Recorded tutorial concepts|Encountered in completed tutorial/,
  );
  assert.match(JSON.stringify(view.toJSON()), /Introduced in Tutorial/);
  assert.match(JSON.stringify(view.toJSON()), /Introduced in Level 02/);
  await act(async () => {
    view.update(React.createElement(GameLessons, { journey, playerId: "another-player" }));
  });
  assert.equal(states().filter((state) => state === "encountered").length, 0);
  assert.equal(view.root.findAllByType("details").length, 1);
  await act(async () => view.unmount());
});

test("Engineering direct targets scroll, focus and briefly highlight the real card without granting progress", async () => {
  const frames = [],
    timers = [],
    scrolled = [],
    focused = [],
    lookedUp = [];
  const { GameLessons } = load(
    "../src/components/dashboard/almanac/GameEducation.tsx",
    {
      "@/lib/almanac/game-catalog.json": { default: catalog },
      "@/components/common/States": widgets,
    },
    "",
    {
      window: {
        requestAnimationFrame: (fn) => {
          frames.push(fn);
          return frames.length;
        },
        cancelAnimationFrame: () => {},
        matchMedia: () => ({ matches: true }),
      },
      document: {
        getElementById: (id) => {
          lookedUp.push(id);
          return {
            scrollIntoView: (options) => scrolled.push(options),
            focus: (options) => focused.push(options),
          };
        },
      },
      setTimeout: (fn) => {
        timers.push(fn);
        return timers.length;
      },
      clearTimeout: () => {},
    },
  );
  let view;
  await act(async () => {
    view = create(React.createElement(GameLessons, { journey: {}, selectedLessonId: "deadload" }));
  });
  await act(async () => frames.shift()());
  assert.equal(lookedUp[0], "engineering-lesson-deadload");
  assert.equal(scrolled[0].behavior, "auto", "Respect reduced motion");
  assert.equal(focused[0].preventScroll, true);
  const card = () => view.root.findByProps({ id: "engineering-lesson-deadload" });
  assert.match(card().props.className, /ring-2 ring-gold/);
  assert.equal(view.root.findAllByType("details").length, 0);
  await act(async () => timers.shift()());
  assert.doesNotMatch(card().props.className, /ring-2 ring-gold/);
  await act(async () =>
    view.update(
      React.createElement(GameLessons, { journey: {}, selectedLessonId: "What is Tension" }),
    ),
  );
  await act(async () => frames.shift()());
  assert.equal(lookedUp[1], "engineering-lesson-What%20is%20Tension");
  await act(async () =>
    view.update(React.createElement(GameLessons, { journey: {}, selectedLessonId: "unknown" })),
  );
  assert.match(JSON.stringify(view.toJSON()), /unavailable in the current catalog/);
  assert.equal(frames.length, 0);
  await act(async () => view.unmount());
});

test("broken bridge photos fall back to a clearly identified placeholder", async () => {
  const { CompletionScreenshot } = load(
    "../src/components/dashboard/almanac/LevelEntryDialog.tsx",
    {
      "lucide-react": widgets,
      "@/components/common/BrandedCover": widgets,
      "@/components/ui/badge": widgets,
      "@/components/ui/button": widgets,
      "@/components/ui/dialog": widgets,
      "@/lib/almanac/content": content,
    },
  );
  let view;
  await act(async () => {
    view = create(
      React.createElement(CompletionScreenshot, {
        level: {
          levelId: "ShopKeeper",
          completion: { completionScreenshotUrl: "https://example.test/missing.png" },
        },
      }),
    );
  });
  assert.equal(view.root.findAllByType("img").length, 1);
  await act(async () => view.root.findByType("img").props.onError());
  assert.equal(view.root.findAllByType("img").length, 0);
  assert.match(JSON.stringify(view.toJSON()), /Placeholder/);
  assert.match(view.root.findByType("BrandedCover").props.label, /unavailable or not synchronized/);
  await act(async () => view.unmount());
});

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

test("level popup uses compact verified lesson links and pending entries, preserving Tutorial 1 exclusions", async () => {
  const component = load("../src/components/dashboard/almanac/LevelEntryDialog.tsx", {
    "lucide-react": widgets,
    "@/components/common/BrandedCover": widgets,
    "@/components/ui/badge": widgets,
    "@/components/ui/button": widgets,
    "@/components/ui/dialog": widgets,
    "@/lib/almanac/content": content,
  });
  const level = {
    levelId: "TUT_CONTRACT1",
    levelName:
      "Tutorial with a very long challenge title that must remain fully readable on narrow screens",
    regionId: "canyon",
    engineeringConceptIds: ["load", "bending", "support"],
    completion: { score: 3, completedAt: "", bridgeTypeId: "beam" },
  };
  let view;
  const selectedLessons = [];
  await act(async () => {
    view = create(
      React.createElement(component.LevelEntryDialog, {
        level,
        open: true,
        onOpenChange: () => {},
        onLessonSelect: (id) => selectedLessons.push(id),
      }),
    );
  });
  assert.deepEqual(
    view.root
      .findAllByType("img")
      .map((img) => img.props.src)
      .sort(),
    ["LESSON002"].map((id) => catalog.lessons.find((l) => l.id === id).image).sort(),
  );
  assert.equal(view.root.findByType("section").findAllByType("img").length, 0);
  assert.equal(view.root.findByType("section").findAllByType("svg").length, 0);
  assert.match(JSON.stringify(view.toJSON()), /Dead Load/);
  assert.match(JSON.stringify(view.toJSON()), /Live Load/);
  assert.match(JSON.stringify(view.toJSON()), /Support/);
  assert.doesNotMatch(JSON.stringify(view.toJSON()), /Bending/);
  assert.deepEqual(level.engineeringConceptIds, ["load", "bending", "support"]);
  assert.match(JSON.stringify(view.toJSON()), /Date unavailable/);
  assert.match(view.root.findByType("DialogContent").props.className, /overflow-x-hidden/);
  assert.match(view.root.findByType("DialogContent").props.className, /min-w-0/);
  assert.match(view.root.findByType("DialogHeader").props.className, /px-6/);
  assert.match(
    view.root.findByType("DialogTitle").props.className,
    /whitespace-normal.*leading-snug/,
  );
  assert.ok(JSON.stringify(view.toJSON()).includes(level.levelName));
  const cover = view.root.findByType("BrandedCover");
  assert.equal(cover.props.compact, true);
  assert.equal(view.root.findAllByProps({ className: "mx-auto w-full max-w-xs" }).length, 1);
  assert.equal(
    view.root
      .findByType("section")
      .findAll((node) => /\btruncate\b/.test(node.props.className ?? "")).length,
    0,
  );
  assert.equal(view.root.findByType("section").findAllByType("button").length, 2);
  await act(async () =>
    view.root.findByProps({ "aria-label": "Read Dead Load in Engineering" }).props.onClick(),
  );
  assert.deepEqual(selectedLessons, ["deadload"]);
  let prevented = false;
  view.root.findByType("DialogContent").props.onCloseAutoFocus({
    preventDefault: () => {
      prevented = true;
    },
  });
  assert.equal(
    prevented,
    true,
    "Lesson navigation must not return focus to the previous level trigger",
  );
  await act(async () => {
    view.update(
      React.createElement(component.LevelEntryDialog, {
        level: { ...level, levelId: "ReedsContract" },
        open: true,
        onOpenChange: () => {},
        onLessonSelect: (id) => selectedLessons.push(id),
      }),
    );
  });
  assert.equal(view.root.findByType("section").findAllByType("button").length, 1);
  assert.match(JSON.stringify(view.toJSON()), /Bending/);
  assert.equal(content.getConcepts(["bending"])[0].name, "Bending");
  await act(async () => {
    view.update(
      React.createElement(component.LevelEntryDialog, {
        level: { ...level, engineeringConceptIds: [] },
        open: true,
        onOpenChange: () => {},
      }),
    );
  });
  assert.equal(view.root.findByType("section").findAllByType("svg").length, 0);
  assert.equal(
    view.root.findAllByType("img").length,
    1,
    "Only the actual beam bridge information remains",
  );
  await act(async () => view.unmount());
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
      "@/lib/auth": {},
    },
    "\nexports.timeAgo = timeAgo;",
  );
  assert.equal(component.timeAgo(""), "Date unavailable");
  assert.equal(component.timeAgo("bad-date"), "Date unavailable");
  assert.notEqual(component.timeAgo("2026-09-01T10:00:00.000Z"), "Date unavailable");
});

test("Materials UI reveals properties only for exact game-written entries", async () => {
  for (const [ids, expected] of [
    [undefined, []],
    [[], []],
    [["unknown", "wood", "WOOD_BEAM", " wood_beam"], []],
    [["wood_beam"], ["Wood Beam"]],
    [
      ["wood_road", "wood_support"],
      ["Wood Pier", "Wood Road"],
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
      "./GameEducation": load("../src/components/dashboard/almanac/GameEducation.tsx", {
        "@/lib/almanac/game-catalog.json": { default: catalog },
        "@/components/common/States": widgets,
      }),
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
        tab
          .findAllByType("li")
          .filter((node) => node.findAllByType("dl").length)
          .map((node) => node.findByType("h3").children.join("")),
        expected,
      );
      assert.equal(tab.findAllByType("dl").length, expected.length);
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
