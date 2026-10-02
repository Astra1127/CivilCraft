import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import React from "react";
import { act, create } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as reactQuery from "@tanstack/react-query";
import ts from "typescript";

const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("moderation reloads authoritative modal state and invalidates directory pages/searches", async () => {
  let status = "active";
  let directoryReads = 0;
  const service = {
    async searchPlayers() {
      directoryReads++;
      return {
        players: [{ playFabId: "ABC123", displayName: "Player", accountStatus: status }],
        pending: false,
        nextCursor: null,
        snapshotAt: null,
      };
    },
    async getPlayer() {
      return { playFabId: "ABC123", accountStatus: status };
    },
    async moderate(_id, action) {
      status = action === "ban" ? "banned" : "active";
    },
  };
  const element =
    (tag = "div") =>
    ({ children }) =>
      React.createElement(tag, null, children);
  const widgets = new Proxy({}, { get: () => element() });
  const source = ts.transpileModule(
    readFileSync(new URL("../src/routes/admin.players.tsx", import.meta.url), "utf8"),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    },
  ).outputText;
  const exports = {};
  runInNewContext(source, {
    exports,
    require(name) {
      if (name === "@tanstack/react-query") return reactQuery;
      if (name === "@tanstack/react-router") return { createFileRoute: () => (config) => config };
      if (name === "@/lib/playfab") return { adminPlayerService: service };
      if (name === "@/lib/cms/store") return { logActivity() {} };
      if (name === "sonner") return { toast: { success() {}, error() {} } };
      if (name === "@/lib/playfab/directory-filters")
        return {
          defaultDirectoryOptions: { sort: "newest", activity: "all", status: "all" },
          directorySorts: { newest: "Newest" },
          playerActivity: () => ({ label: "Recent" }),
        };
      if (name.endsWith("/PlayerRecordModal"))
        return {
          AccountStatusBadge: ({ status }) =>
            React.createElement("span", { "data-directory-status": status }),
          formatDate: () => "",
          PlayerRecordModal: ({ player, onModerate }) =>
            player &&
            React.createElement(
              "button",
              {
                "data-modal-status": player.accountStatus,
                onClick: () =>
                  onModerate(player.accountStatus === "active" ? "banned" : "active", "test", null),
              },
              "Moderate",
            ),
        };
      if (name === "@/components/ui/button")
        return { Button: (props) => React.createElement("button", props) };
      if (name.startsWith("@/components/") || name === "lucide-react") return widgets;
      return require(name);
    },
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const inactiveKey = ["admin-players", "old-search"];
  client.setQueryData(inactiveKey, { players: [{ accountStatus: "active" }] });
  let renderer;
  const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
  try {
    await act(async () => {
      renderer = create(
        React.createElement(
          QueryClientProvider,
          { client },
          React.createElement(exports.Route.component),
        ),
      );
      await settle();
    });
    await act(async () => {
      await settle();
    });
    await act(async () => {
      await renderer.root
        .findAllByType("button")
        .find((b) => b.props.children === "View")
        .props.onClick();
    });
    for (const expected of ["banned", "active"]) {
      const before = directoryReads;
      await act(async () => {
        await renderer.root.findByProps({ "data-modal-status": status }).props.onClick();
        await settle();
      });
      assert.equal(
        renderer.root.findByProps({ "data-modal-status": expected }).props["data-modal-status"],
        expected,
      );
      assert.equal(
        renderer.root.findByProps({ "data-directory-status": expected }).props[
          "data-directory-status"
        ],
        expected,
      );
      assert.ok(directoryReads > before, "Directory must fetch again after moderation");
      assert.equal(
        client.getQueryState(inactiveKey).isInvalidated,
        true,
        "Inactive pages/searches must be invalidated too",
      );
    }
  } finally {
    await act(async () => renderer?.unmount());
    client.clear();
  }
});
