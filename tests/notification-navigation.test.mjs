import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import React from "react";
import { act, create } from "react-test-renderer";
import ts from "typescript";
import * as navigation from "../src/lib/playfab/notification-navigation.ts";
const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const achievement = { id: "cost-efficient", name: "Cost Efficient", unlocked: true };
const level = {
  levelId: "ShopKeeperContract",
  regionId: "region-1",
  order: 4,
  status: "completed",
  engineeringConceptIds: [],
  completion: { playerId: "player-a", completedAt: "2026-10-01", score: 100 },
};
const journey = {
  regions: [{ regionId: "region-1", levels: [level] }],
  discoveredMaterials: [],
  discoveredBridgeTypeIds: [],
  levelsCompleted: 1,
};
const note = {
  id: "ach-cost-efficient",
  kind: "achievement",
  title: "Achievement unlocked",
  description: "renamed",
  read: false,
  target: { achievementId: achievement.id },
};
const load = (path, mocks, globals = {}) => {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL("../" + path, import.meta.url), "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  runInNewContext(source, {
    exports,
    require: (n) => (n in mocks ? mocks[n] : require(n)),
    ...globals,
  });
  return exports;
};
const el =
  (tag) =>
  ({ children, ...props }) =>
    React.createElement(tag, props, children);
const icons = new Proxy({}, { get: () => el("svg") });
const baseMocks = {
  "lucide-react": icons,
  "@/lib/auth": { useAuth: () => ({ player: { playFabId: "player-a" } }) },
  "@/lib/utils": { cn: (...v) => v.filter(Boolean).join(" ") },
  "@/lib/playfab/notification-navigation": navigation,
  "@/components/common/DemoBadge": { DemoBadge: el("span") },
  "@/components/common/PageHeader": { SectionHeading: el("header") },
  "@/components/common/States": { LoadingState: el("p"), ErrorState: el("p"), EmptyState: el("p") },
  "@/components/ui/button": { Button: el("button") },
  "@/components/ui/progress": { Progress: el("progress") },
  "@/components/dashboard/AchievementDetailsDialog": { AchievementDetailsDialog: el("dialog") },
};
const text = (node) =>
  node.root
    .findAll((n) => typeof n.type === "string")
    .flatMap((n) => n.children.filter((c) => typeof c === "string"))
    .join(" ");
test("stable IDs drive navigation, with no display-name inference", () => {
  assert.equal(navigation.notificationDestination(note).search.achievementId, "cost-efficient");
  assert.equal(
    navigation.notificationDestination({
      ...note,
      kind: "level",
      target: { levelId: level.levelId, regionId: level.regionId },
    }).search.levelId,
    "ShopKeeperContract",
  );
  assert.equal(navigation.notificationDestination({ ...note, target: undefined }), null);
  assert.equal(navigation.notificationDestination({ ...note, kind: "announcement" }), null);
  assert.equal(navigation.targetSearch({ levelId: ["bad"] }, "levelId"), undefined);
});
test("unknown, ambiguous, locked, generated and other-player targets never resolve", () => {
  assert.equal(navigation.findNotificationAchievement([achievement], "missing"), undefined);
  assert.equal(
    navigation.findNotificationAchievement([achievement, achievement], achievement.id),
    undefined,
  );
  assert.equal(
    navigation.findNotificationAchievement([{ ...achievement, unlocked: false }], achievement.id),
    undefined,
  );
  assert.equal(
    navigation.findNotificationAchievement([{ ...achievement, stableId: false }], achievement.id),
    undefined,
  );
  assert.equal(
    navigation.findNotificationLevel(journey, "player-a", level.levelId, level.regionId),
    level,
  );
  assert.equal(
    navigation.findNotificationLevel(journey, "player-b", level.levelId, level.regionId),
    undefined,
  );
  assert.equal(
    navigation.findNotificationLevel(journey, "player-a", level.levelId, "wrong-region"),
    undefined,
  );
  assert.equal(
    navigation.findNotificationLevel(
      { ...journey, regions: [{ levels: [{ ...level, completion: undefined }] }] },
      "player-a",
      level.levelId,
      level.regionId,
    ),
    undefined,
  );
});
test("read storage is player-scoped, merges Mark All Read and ignores stale account mutations", async () => {
  let player = "a";
  const storage = new Map();
  const file = readFileSync(new URL("../src/lib/playfab/index.ts", import.meta.url), "utf8");
  const section = file.slice(
    file.indexOf("const notificationReadKey"),
    file.indexOf("/* ------------------------------------------------------------- inventory */"),
  );
  const exports = {};
  runInNewContext(
    ts.transpileModule(section, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      exports,
      getStoredPlayer: () => ({ playFabId: player }),
      window: {
        localStorage: { getItem: (k) => storage.get(k), setItem: (k, v) => storage.set(k, v) },
      },
      demoMode: false,
      achievementsService: {
        getAchievements: async () => [{ ...achievement, unlockedAt: "2026-10-01" }],
      },
      almanacService: { getJourney: async () => journey },
    },
  );
  const service = exports.notificationService;
  await service.markRead([note.id], "a");
  await service.markRead(["lvl-ShopKeeperContract"], "a");
  assert.ok((await service.getNotifications()).every((n) => n.read));
  player = "b";
  assert.ok((await service.getNotifications()).every((n) => !n.read));
  await service.markRead([note.id], "a");
  assert.ok((await service.getNotifications()).every((n) => !n.read));
  await service.markRead([note.id], "b");
  player = "a";
  assert.ok((await service.getNotifications()).every((n) => n.read));
});
test("bell navigates and dismisses; unknown targets remain unread; Mark All Read still works", async () => {
  const calls = [];
  let items = [note];
  const menu = {
    DropdownMenu: el("menu"),
    DropdownMenuTrigger: el("div"),
    DropdownMenuContent: el("section"),
    DropdownMenuLabel: el("label"),
    DropdownMenuSeparator: el("hr"),
    DropdownMenuItem: el("div"),
  };
  const { NotificationBell } = load("src/components/dashboard/NotificationBell.tsx", {
    ...baseMocks,
    "@/components/ui/dropdown-menu": menu,
    "@tanstack/react-router": { useNavigate: () => async (d) => calls.push(d) },
    "@tanstack/react-query": {
      useQuery: () => ({ data: items }),
      useQueryClient: () => ({ invalidateQueries: () => {} }),
      useMutation: (options) => ({ mutate: (ids) => options.mutationFn(ids) }),
    },
    "@/lib/playfab": { notificationService: { markRead: (...args) => calls.push(args) } },
  });
  let view;
  await act(async () => {
    view = create(React.createElement(NotificationBell));
  });
  await act(async () => view.root.findByType("menu").props.onOpenChange(true));
  await act(async () =>
    view.root
      .findAllByType("button")
      .find((b) => b.props.type === "button")
      .props.onClick(),
  );
  assert.equal(view.root.findByType("menu").props.open, false);
  assert.equal(calls[0].search.achievementId, achievement.id);
  assert.match(view.root.findByType("section").props.className, /max-w-\[calc\(100vw-1rem\)\]/);
  assert.equal(
    view.root.findAllByType("div").filter((n) => n.props.asChild && n.props.onSelect).length,
    1,
  );
  calls.length = 0;
  items = [{ ...note, target: undefined }];
  await act(async () => view.update(React.createElement(NotificationBell)));
  await act(async () =>
    view.root
      .findAllByType("button")
      .find((b) => b.props.type === "button")
      .props.onClick(),
  );
  assert.equal(calls.length, 0);
  assert.match(text(view), /no available destination/);
  await act(async () =>
    view.root
      .findAllByType("button")
      .find((b) => React.Children.toArray(b.props.children).includes("Mark all read"))
      .props.onClick(),
  );
  assert.equal(calls[0][0][0], note.id);
  assert.equal(calls[0][1], "player-a");
  await act(async () => view.unmount());
});
test("achievement deep links focus/highlight real records and survive search/back changes", async () => {
  let search = { achievementId: achievement.id };
  const navigations = [];
  const read = [];
  let focused = 0,
    scrolled = 0;
  const { Route } = load("src/routes/dashboard.achievements.tsx", {
    ...baseMocks,
    "@tanstack/react-router": {
      createFileRoute: () => (config) => ({
        ...config,
        useSearch: () => search,
        useNavigate: () => (value) => navigations.push(value),
      }),
    },
    "@tanstack/react-query": { useQuery: () => ({ data: [achievement] }) },
    "@/lib/playfab": { achievementsService: {} },
    "@/components/dashboard/useNotificationRead": { useNotificationRead: (id) => read.push(id) },
  });
  let view;
  await act(async () => {
    view = create(React.createElement(Route.component), {
      createNodeMock: () => ({ focus: () => focused++, scrollIntoView: () => scrolled++ }),
    });
  });
  assert.ok(scrolled);
  assert.equal(view.root.findByType("dialog").props.achievement, achievement);
  await act(async () => view.root.findByType("dialog").props.onClose());
  assert.equal(navigations.at(-1).search.achievementId, undefined);
  await act(async () => view.root.findByType("dialog").props.onRestoreFocus());
  assert.ok(focused);
  const card = view.root.findAllByType("button").find((b) => b.props["aria-haspopup"] === "dialog");
  await act(async () => card.props.onClick({ currentTarget: { focus() {} } }));
  assert.equal(navigations.at(-1).search.achievementId, achievement.id);
  assert.match(view.root.findByType("li").props.className, /ring-2/);
  assert.equal(read.at(-1), note.id);
  search = { achievementId: "outdated" };
  await act(async () => view.update(React.createElement(Route.component)));
  assert.match(text(view), /unavailable/);
  assert.equal(read.at(-1), undefined);
  search = { achievementId: achievement.id };
  await act(async () => view.update(React.createElement(Route.component)));
  assert.equal(read.at(-1), note.id);
  await act(async () => view.unmount());
});
test("journal opens linked completion, closes via URL callback, and follows browser back", async () => {
  const read = [],
    changes = [];
  const Dialog = el("dialog");
  const { AlmanacJournal } = load("src/components/dashboard/almanac/AlmanacJournal.tsx", {
    ...baseMocks,
    "@tanstack/react-query": {
      useQuery: (options) => ({
        data: options.queryKey[0] === "almanac-journey" ? journey : undefined,
      }),
    },
    "@/lib/playfab": { almanacService: {}, profileService: {} },
    "@/lib/player-name": { parsePlayerName: () => ({ text: "Engineer" }) },
    "@/components/common/PlayerName": { PlayerName: el("span") },
    "@/components/ui/avatar": {
      Avatar: el("div"),
      AvatarFallback: el("span"),
      AvatarImage: el("img"),
    },
    "@/components/ui/badge": { Badge: el("span") },
    "@/components/ui/tabs": Object.fromEntries(
      ["Tabs", "TabsContent", "TabsList", "TabsTrigger"].map((k) => [k, el("section")]),
    ),
    "@/lib/almanac/content": {
      materials: [],
      bridgeTypes: [],
      engineeringConcepts: [],
      getBridgeType: () => undefined,
    },
    "@/components/dashboard/almanac/LevelEntryDialog": {
      LevelEntryDialog: Dialog,
      CompletionScreenshot: el("figure"),
    },
    "@/components/dashboard/useNotificationRead": { useNotificationRead: (id) => read.push(id) },
  });
  const props = {
    levelId: level.levelId,
    regionId: level.regionId,
    onLevelChange: (l) => changes.push(l),
  };
  let view;
  await act(async () => {
    view = create(React.createElement(AlmanacJournal, props));
  });
  assert.equal(view.root.findByType("dialog").props.level, level);
  assert.equal(read.at(-1), "lvl-ShopKeeperContract");
  await act(async () => view.root.findByType("dialog").props.onOpenChange(false));
  assert.equal(changes.at(-1), null);
  await act(async () =>
    view.update(React.createElement(AlmanacJournal, { ...props, levelId: undefined })),
  );
  assert.equal(view.root.findByType("dialog").props.open, false);
  await act(async () => view.update(React.createElement(AlmanacJournal, props)));
  assert.equal(view.root.findByType("dialog").props.open, true);
  await act(async () =>
    view.update(React.createElement(AlmanacJournal, { ...props, levelId: "unknown" })),
  );
  assert.match(text(view), /unavailable/);
  assert.equal(read.at(-1), undefined);
  await act(async () => view.unmount());
});

test("destination acknowledgment checks the signed-in player and only marks resolved targets", async () => {
  let current = "player-a";
  const calls = [];
  const qc = { invalidateQueries: (value) => calls.push(value) };
  const { useNotificationRead } = load("src/components/dashboard/useNotificationRead.ts", {
    ...baseMocks,
    "@tanstack/react-query": { useQueryClient: () => qc },
    "@/lib/playfab": {
      authService: { getCurrentUser: () => ({ playFabId: current }) },
      notificationService: { markRead: async (...args) => calls.push(args) },
    },
  });
  function Harness({ id }) {
    useNotificationRead(id);
    return null;
  }
  let view;
  await act(async () => {
    view = create(React.createElement(Harness, { id: undefined }));
  });
  assert.equal(calls.length, 0);
  await act(async () => view.update(React.createElement(Harness, { id: note.id })));
  assert.equal(calls[0][0][0], note.id);
  assert.equal(calls[0][1], "player-a");
  assert.equal(calls[1].queryKey[1], "player-a");
  calls.length = 0;
  current = "player-b";
  await act(async () =>
    view.update(React.createElement(Harness, { id: "lvl-ShopKeeperContract" })),
  );
  assert.equal(calls.length, 0);
  await act(async () => view.unmount());
});

test("journal route validates direct-link IDs and removes level selection when dismissed", async () => {
  const calls = [];
  const Journal = el("main");
  const search = { tab: "journey", levelId: level.levelId, regionId: level.regionId };
  const { Route } = load("src/routes/dashboard.almanac.tsx", {
    "@tanstack/react-router": {
      createFileRoute: () => (config) => ({
        ...config,
        useSearch: () => search,
        useNavigate: () => (value) => calls.push(value),
      }),
    },
    "@/lib/playfab/notification-navigation": navigation,
    "@/components/dashboard/almanac/AlmanacJournal": { AlmanacJournal: Journal },
  });
  assert.equal(Route.validateSearch(search).levelId, level.levelId);
  assert.equal(Route.validateSearch({ levelId: { invalid: true } }).levelId, undefined);
  let view;
  await act(async () => {
    view = create(React.createElement(Route.component));
  });
  await act(async () => view.root.findByType("main").props.onLevelChange(null));
  assert.equal(calls[0].search.levelId, undefined);
  await act(async () => view.root.findByType("main").props.onLevelChange(level));
  assert.equal(calls[1].search.regionId, level.regionId);
  await act(async () => view.unmount());
});

test("parsers flag position-based fallback IDs rather than treating them as stable targets", async () => {
  const { parseAchievementProgress } = await import("../src/lib/playfab/player.ts");
  const { parseAlmanacProgress } = await import("../src/lib/playfab/almanac.ts");
  assert.equal(
    parseAchievementProgress(JSON.stringify([{ name: "Cost Efficient", unlocked: true }]))[0]
      .stableId,
    false,
  );
  assert.equal(
    parseAchievementProgress(
      JSON.stringify([{ achievementId: "cost-efficient", unlocked: true }]),
    )[0].stableId,
    true,
  );
  const parse = (region) =>
    parseAlmanacProgress(JSON.stringify({ regions: [region] })).regions[0].levels[0];
  assert.equal(parse({ regionId: "r1", levels: [{ levelId: "l4" }] }).stableId, true);
  assert.equal(parse({ levels: [{ levelId: "l4" }] }).stableId, false);
  assert.equal(
    parse({ regionId: "r1", levels: [{ levelName: "ShopKeeperContract" }] }).stableId,
    false,
  );
});

test("achievement details use real fields, optional progress and accessible responsive dialog controls", async () => {
  const calls = [];
  const dialogMocks = {
    Dialog: el("dialog"),
    DialogContent: el("article"),
    DialogHeader: el("header"),
    DialogTitle: el("h2"),
    DialogDescription: el("p"),
  };
  const { AchievementDetailsDialog } = load(
    "src/components/dashboard/AchievementDetailsDialog.tsx",
    {
      ...baseMocks,
      "@/components/ui/dialog": dialogMocks,
    },
  );
  const real = {
    ...achievement,
    description: "Finish within the recorded budget.",
    unlockedAt: "2026-10-01T12:00:00Z",
    progress: 4,
    progressTarget: 5,
  };
  const props = {
    achievement: real,
    onClose: () => calls.push("close"),
    onRestoreFocus: () => calls.push("focus"),
  };
  let view;
  await act(async () => {
    view = create(React.createElement(AchievementDetailsDialog, props));
  });
  assert.equal(view.root.findByType("h2").children.join(""), real.name);
  assert.match(text(view), /Finish within the recorded budget/);
  assert.match(text(view), /Unlocked/);
  assert.match(text(view), /2026/);
  assert.match(text(view), /4\s+\/\s+5/);
  const content = view.root.findByType("article");
  assert.match(content.props.className, /max-h-\[90dvh\]/);
  assert.match(content.props.className, /overflow-y-auto/);
  assert.match(content.props.className, /w-\[calc\(100%-2rem\)\]/);
  assert.match(content.props.className, /max-w-lg/);
  await act(async () => view.root.findByType("button").props.onClick());
  await act(async () => view.root.findByType("dialog").props.onOpenChange(false));
  let prevented = false;
  await act(async () =>
    content.props.onCloseAutoFocus({
      preventDefault() {
        prevented = true;
      },
    }),
  );
  assert.equal(calls.filter((c) => c === "close").length, 2);
  assert.ok(prevented);
  assert.equal(calls.at(-1), "focus");
  await act(async () =>
    view.update(
      React.createElement(AchievementDetailsDialog, {
        ...props,
        achievement: {
          ...achievement,
          description: "Actual description",
          unlockedAt: "invalid",
          progressTarget: 10,
        },
      }),
    ),
  );
  assert.match(text(view), /Unlock date unavailable/);
  assert.doesNotMatch(text(view), /Invalid Date|Progress|Rewards/);
  await act(async () =>
    view.update(
      React.createElement(AchievementDetailsDialog, { ...props, achievement: undefined }),
    ),
  );
  assert.equal(view.toJSON(), null);
  await act(async () => view.unmount());
});

test("achievement cards open the URL-selected dialog, close, restore on Back and survive refresh", async () => {
  let search = {};
  const navigations = [],
    read = [];
  const data = [
    achievement,
    { ...achievement, id: "locked", name: "Locked achievement", unlocked: false },
  ];
  const { Route } = load("src/routes/dashboard.achievements.tsx", {
    ...baseMocks,
    "@tanstack/react-router": {
      createFileRoute: () => (config) => ({
        ...config,
        useSearch: () => search,
        useNavigate: () => (value) => {
          navigations.push(value);
          search = value.search;
        },
      }),
    },
    "@tanstack/react-query": { useQuery: () => ({ data }) },
    "@/lib/playfab": { achievementsService: {} },
    "@/components/dashboard/useNotificationRead": { useNotificationRead: (id) => read.push(id) },
  });
  let view;
  await act(async () => {
    view = create(React.createElement(Route.component), {
      createNodeMock: () => ({ focus() {}, scrollIntoView() {} }),
    });
  });
  const cards = view.root
    .findAllByType("button")
    .filter((b) => b.props["aria-haspopup"] === "dialog");
  assert.equal(cards[1].props.disabled, true);
  assert.equal(view.root.findByType("dialog").props.achievement, undefined);
  await act(async () => {
    cards[0].props.onClick({ currentTarget: { focus() {} } });
    view.update(React.createElement(Route.component));
  });
  assert.equal(view.root.findByType("dialog").props.achievement, achievement);
  assert.equal(read.at(-1), note.id);
  await act(async () => {
    view.root.findByType("dialog").props.onClose();
    view.update(React.createElement(Route.component));
  });
  assert.equal(view.root.findByType("dialog").props.achievement, undefined);
  assert.equal(search.achievementId, undefined);
  search = { achievementId: achievement.id };
  await act(async () => view.update(React.createElement(Route.component)));
  assert.equal(view.root.findByType("dialog").props.achievement, achievement);
  await act(async () => view.unmount());
  await act(async () => {
    view = create(React.createElement(Route.component), {
      createNodeMock: () => ({ focus() {}, scrollIntoView() {} }),
    });
  });
  assert.equal(view.root.findByType("dialog").props.achievement, achievement);
  search = { achievementId: "locked" };
  await act(async () => view.update(React.createElement(Route.component)));
  assert.equal(view.root.findByType("dialog").props.achievement, undefined);
  assert.equal(read.at(-1), undefined);
  assert.match(text(view), /unavailable/);
  await act(async () => view.unmount());
});
