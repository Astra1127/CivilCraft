import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import { act, create } from "react-test-renderer";
import {
  equipmentRecord,
  equipmentSnapshot,
  resolveEquipment,
} from "../src/lib/playfab/equipment.ts";
import {
  playerActivity,
  filterSortPlayers,
  defaultDirectoryOptions,
} from "../src/lib/playfab/directory-filters.ts";

test("activity thresholds and filters agree independently of bans", () => {
  const now = Date.parse("2026-10-01T12:00:00Z");
  for (const [age, key] of [
    [0, "recent"],
    [7, "recent"],
    [7.001, "other"],
    [30, "other"],
    [30.001, "inactive"],
  ]) {
    const lastActive = new Date(now - age * 86400000).toISOString();
    assert.equal(playerActivity(lastActive, now).key, key);
    for (const accountStatus of ["active", "banned", null]) {
      const player = { lastActive, accountStatus };
      for (const activity of ["recent", "inactive"]) {
        assert.equal(
          filterSortPlayers([player], { ...defaultDirectoryOptions, activity }, now).length,
          key === activity ? 1 : 0,
        );
        assert.equal(player.accountStatus, accountStatus);
      }
    }
  }
  assert.equal(playerActivity(null, now).key, "inactive");
  assert.equal(playerActivity("bad", now).key, "unknown");
  assert.equal(playerActivity(new Date(now + 1).toISOString(), now).key, "unknown");
});

test("missing, unsupported, and explicitly empty equipment are distinct", () => {
  assert.equal(equipmentSnapshot(undefined).status, "missing");
  for (const raw of ["broken", "null", '{"unknownSlot":"id"}', '{"helmet":42}'])
    assert.equal(equipmentSnapshot(raw).status, "invalid");
  assert.deepEqual(equipmentSnapshot("{}"), { status: "synced", items: [] });
  assert.deepEqual(equipmentSnapshot('{"helmet":"","hair":null}'), { status: "synced", items: [] });
  const snapshot = equipmentSnapshot(
    '{"helmet":"hat_123","top":{"itemId":"shirt_1","name":"Published shirt"}}',
  );
  const items = resolveEquipment(snapshot.items, [
    { ItemId: "hat_123", DisplayName: "Catalog hat", ItemImageUrl: "https://cdn.example/hat.png" },
  ]);
  assert.equal(items[0].name, "Catalog hat");
  assert.equal(items[0].imageUrl, "https://cdn.example/hat.png");
  assert.equal(items[1].name, "Published shirt");
  assert.equal(items.length, 2, "Catalog metadata must not equip extra items");
  assert.equal(
    resolveEquipment(snapshot.items, [{ ItemId: "hat_123", ItemImageUrl: "javascript:bad()" }])[0]
      .imageUrl,
    undefined,
  );
});

const require = createRequire(import.meta.url);
function accountModule({ loginId = "PLAYER", failure, changeSession = false } = {}) {
  let session = { sessionTicket: "original", identity: { playFabId: "PLAYER" } };
  const calls = [];
  const source = ts.transpileModule(
    readFileSync(new URL("../src/lib/playfab/account-settings.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  const exports = {};
  runInNewContext(source, {
    exports,
    require: (name) =>
      name === "zod"
        ? require("zod")
        : {
            requireSessionTicket: () => session.sessionTicket,
            readSession: () => session,
            callPlayFab: async (path, body, options) => {
              calls.push({ path, body, options });
              if (path === failure) throw new Error("Temporary API failure");
              if (path.endsWith("GetAccountInfo"))
                return {
                  AccountInfo: {
                    PlayFabId: "PLAYER",
                    Username: "LoginName",
                    PrivateInfo: { Email: "login@example.com" },
                    TitleInfo: { DisplayName: "Engineer" },
                  },
                };
              if (path.endsWith("GetPlayerProfile"))
                return {
                  PlayerProfile: {
                    PlayerId: "PLAYER",
                    ContactEmailAddresses: [
                      { EmailAddress: "contact@example.com", VerificationStatus: "Confirmed" },
                    ],
                  },
                };
              if (path.endsWith("LoginWithPlayFab")) {
                if (changeSession) session = { ...session, sessionTicket: "another-tab" };
                return { PlayFabId: loginId, SessionTicket: "reauthenticated" };
              }
              return {};
            },
          },
  });
  return { ...exports, calls, session: () => session };
}

test("account fields remain distinct and contact update reauthenticates the same player", async () => {
  const m = accountModule();
  const details = await m.getAccountSettings();
  assert.equal(details.username, "LoginName");
  assert.equal(details.displayName, "Engineer");
  assert.equal(details.loginEmail, "login@example.com");
  assert.equal(details.contacts[0].EmailAddress, "contact@example.com");
  await m.updateContactEmail("new@example.com", "ephemeral-password");
  const update = m.calls.at(-1);
  assert.equal(update.path, "/Client/AddOrUpdateContactEmail");
  assert.equal(update.body.EmailAddress, "new@example.com");
  assert.equal(update.options.sessionTicket, "reauthenticated");
  assert.equal(m.session().sessionTicket, "original");
  assert.ok(!JSON.stringify(m.session()).includes("ephemeral-password"));
  assert.ok(
    !m.calls.some((c) =>
      /UpdateUserData|UpdateUserTitleDisplayName|AddUsernamePassword/.test(c.path),
    ),
  );
});

test("failed password, wrong account, changed session, and service failure never write contact data", async () => {
  for (const options of [
    { failure: "/Client/LoginWithPlayFab" },
    { loginId: "OTHER" },
    { changeSession: true },
    { failure: "/Client/GetAccountInfo" },
  ]) {
    const m = accountModule(options);
    await assert.rejects(() => m.updateContactEmail("new@example.com", "password"));
    assert.ok(!m.calls.some((c) => c.path.endsWith("AddOrUpdateContactEmail")));
    assert.ok(m.session(), "Temporary failures must not clear the session");
  }
  const m = accountModule();
  await assert.rejects(() => m.updateContactEmail("invalid", "password"));
  await assert.rejects(() => m.updateContactEmail("new@example.com", ""));
  assert.equal(m.calls.length, 0);
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
function uiModule(path, overrides = {}) {
  const exports = {};
  const component = (props) => React.createElement("div", null, props?.children);
  const generic = new Proxy({}, { get: () => component });
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(source, {
    exports,
    require: (name) =>
      overrides[name] ??
      (name === "react" || name === "react/jsx-runtime"
        ? require(name)
        : name === "@tanstack/react-router"
          ? { createFileRoute: () => (config) => config }
          : generic),
  });
  return exports;
}

test("account badges clearly distinguish active, banned, and unknown", async () => {
  const { AccountStatusBadge } = uiModule("../src/components/admin/PlayerRecordModal.tsx");
  for (const [status, label] of [
    ["active", "Active"],
    ["banned", "Banned"],
    [null, "Not available"],
  ]) {
    let renderer;
    try {
      await act(async () => {
        renderer = create(React.createElement(AccountStatusBadge, { status }));
      });
      assert.ok(JSON.stringify(renderer.toJSON()).includes(label));
    } finally {
      if (renderer) await act(async () => renderer.unmount());
    }
  }
});

test("PlayerRecordModal shows Ban Player for active accounts and Unban Player for banned accounts", async () => {
  const { PlayerRecordModal } = uiModule("../src/components/admin/PlayerRecordModal.tsx");

  const activePlayer = {
    playFabId: "ACT123",
    displayName: "Active Player",
    accountStatus: "active",
    bans: [],
    unavailable: [],
  };
  let activeRenderer;
  await act(async () => {
    activeRenderer = create(
      React.createElement(PlayerRecordModal, {
        player: activePlayer,
        onOpenChange: () => {},
        onModerate: async () => {},
        moderationEnabled: true,
      }),
    );
  });
  const activeJson = JSON.stringify(activeRenderer.toJSON());
  assert.ok(activeJson.includes("Ban Player"));
  assert.ok(!activeJson.includes("Unban Player"));
  assert.ok(activeJson.includes("Active"));
  await act(async () => activeRenderer.unmount());

  const bannedPlayer = {
    playFabId: "BAN123",
    displayName: "Banned Player",
    accountStatus: "banned",
    bans: [{ active: true, reason: "Griefing", expiresAt: null }],
    unavailable: [],
  };
  let bannedRenderer;
  await act(async () => {
    bannedRenderer = create(
      React.createElement(PlayerRecordModal, {
        player: bannedPlayer,
        onOpenChange: () => {},
        onModerate: async () => {},
        moderationEnabled: true,
      }),
    );
  });
  const bannedJson = JSON.stringify(bannedRenderer.toJSON());
  assert.ok(bannedJson.includes("Unban Player"));
  assert.ok(bannedJson.includes("Banned"));
  assert.ok(!bannedJson.includes("Ban Player"));
  await act(async () => bannedRenderer.unmount());
});

test("profile removes Current Region and never renders empty slots for missing or failed synchronization", async () => {
  for (const state of ["missing", "invalid", "error", "synced", "native"]) {
    const sample = JSON.parse(
      readFileSync(new URL("../docs/sync-dashboard-v1.example.json", import.meta.url), "utf8"),
    );
    const snapshot = equipmentSnapshot(sample.FunctionParameter.equippedCosmetics);
    const slot = ({ item }) => React.createElement("li", null, item?.itemId ?? "Empty");
    const { Route } = uiModule("../src/routes/dashboard.profile.tsx", {
      "@/lib/auth": { useAuth: () => ({ player: { playFabId: "PLAYER" } }) },
      "@tanstack/react-query": {
        useQuery: ({ queryKey }) => {
          if (queryKey[0] === "profile")
            return {
              data: {
                playFabId: "PLAYER",
                displayName: "Engineer",
                level: 1,
                xp: 0,
                xpToNextLevel: 10,
                totalScore: null,
                bridgesCompleted: null,
                challengesCompleted: null,
              },
            };
          if (queryKey[0] === "character")
            return {
              isError: state === "error",
              data:
                state === "native"
                  ? {
                      equipped: snapshot.items,
                      syncStatus: snapshot.status,
                      equipmentSlots: snapshot.slots,
                    }
                  : { equipped: [], syncStatus: state },
              refetch: () => {},
            };
          return { data: [] };
        },
      },
      "@/components/dashboard/CharacterPreview": {
        CharacterPreview: () => null,
        EquipmentSlot: slot,
        SLOT_ORDER: ["helmet", "hair", "top", "vest", "pants", "gloves", "shoes", "accessory"],
      },
      "@/components/common/States": {
        ErrorState: ({ description }) => React.createElement("p", null, description),
      },
    });
    let renderer;
    try {
      await act(async () => {
        renderer = create(React.createElement(Route.component));
      });
      assert.equal(
        renderer.root.findAllByType("li").length,
        state === "native" ? 6 : state === "synced" ? 8 : 0,
      );
      const content = JSON.stringify(renderer.toJSON());
      assert.ok(!content.toLowerCase().includes("current region"));
      if (state === "missing") assert.ok(content.includes("Awaiting game sync"));
      if (state === "error") assert.ok(content.includes("Unable to load equipment"));
      if (state === "native") {
        assert.ok(content.includes("EngineeringHardHat"));
        assert.ok(content.includes("Accessory_SafetyVest"));
        assert.ok(!content.includes("Empty"));
      }
    } finally {
      if (renderer) await act(async () => renderer.unmount());
    }
  }
});

test("inspected game loadout supports multiple accessories, legacy migration, and explicit empty equipment", () => {
  const sample = JSON.parse(
    readFileSync(new URL("../docs/sync-dashboard-v1.example.json", import.meta.url), "utf8"),
  );
  const loadout = JSON.parse(sample.FunctionParameter.equippedCosmetics);
  const snapshot = equipmentSnapshot(JSON.stringify(loadout));
  assert.equal(snapshot.status, "synced");
  assert.equal(snapshot.items.length, 6);
  assert.deepEqual(equipmentRecord(snapshot.items).accessory, [
    "EngineeringHardHat",
    "Accessory_SafetyVest",
  ]);
  assert.deepEqual(snapshot.slots, ["accessory", "hair", "top", "pants", "shoes"]);
  const blank = {
    accessoryIDs: [],
    accessoriesID: "Accessory_None",
    hairID: "",
    shirtID: "",
    pantsID: "",
    shoesID: "",
  };
  assert.deepEqual(equipmentSnapshot(JSON.stringify(blank)).items, []);
  const legacy = equipmentSnapshot(
    JSON.stringify({ ...blank, accessoriesID: "EngineeringHardHat" }),
  );
  assert.equal(legacy.items[0].itemId, "EngineeringHardHat");
  assert.equal(legacy.items[0].slot, "accessory");
  assert.deepEqual(
    equipmentSnapshot(
      JSON.stringify({
        ...blank,
        accessoryIDs: ["Accessory_None", "Accessory_SafetyVest", "Accessory_SafetyVest"],
        accessoriesID: "EngineeringHardHat",
      }),
    ).items.map((i) => i.itemId),
    ["Accessory_SafetyVest"],
  );
  for (const malformed of [
    { accessoryIDs: [] },
    { ...blank, accessoryIDs: "hat" },
    { ...blank, accessoryIDs: [42] },
    { ...blank, hairID: null },
    { ...blank, helmet: "unknown-projection" },
  ])
    assert.equal(equipmentSnapshot(JSON.stringify(malformed)).status, "invalid");
});

test("overview awaiting sync does not invent level, XP, counts, region or progress", async () => {
  const { Route } = uiModule("../src/routes/dashboard.index.tsx", {
    "@/lib/auth": { useAuth: () => ({ player: { playFabId: "PLAYER" } }) },
    "@tanstack/react-router": {
      createFileRoute: () => (config) => config,
      Link: ({ children }) => React.createElement("a", null, children),
    },
    "@/components/common/StatCard": {
      StatCard: ({ label, value }) => React.createElement("p", null, `${label}: ${value}`),
    },
    "@/components/ui/progress": { Progress: () => React.createElement("progress") },
    "@tanstack/react-query": {
      useQuery: ({ queryKey }) => ({
        data:
          queryKey[0] === "profile"
            ? {
                playFabId: "PLAYER",
                displayName: "Engineer",
                level: null,
                xp: null,
                xpToNextLevel: null,
                totalScore: null,
                bridgesCompleted: null,
                challengesCompleted: null,
                bestSingleBuildScore: null,
              }
            : queryKey[0] === "progress"
              ? { overallPercent: 0, currentRegion: null }
              : [],
        refetch: async () => {},
      }),
    },
  });
  let renderer;
  try {
    await act(async () => {
      renderer = create(React.createElement(Route.component));
    });
    const content = JSON.stringify(renderer.toJSON());
    assert.ok(content.includes("Awaiting game sync"));
    assert.ok(!content.includes("Pine Valley"));
    assert.ok(!content.includes("No achievements yet"));
    assert.ok(!content.includes("No completed builds yet"));
    assert.ok(content.includes("Total Score: —"));
    assert.equal(renderer.root.findAllByType("progress").length, 0);
  } finally {
    if (renderer) await act(async () => renderer.unmount());
  }
});
