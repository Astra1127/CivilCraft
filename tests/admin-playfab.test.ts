import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { hashAdminPassword } from "../src/lib/admin-auth/password.server.ts";
import { after, beforeEach, test } from "node:test";
import { getAdminAuthConfig } from "../src/lib/admin-auth/config.server.ts";
import { cookieName, issueAdminSession } from "../src/lib/admin-auth/session.server.ts";
import { handlePlayFabAdminRequest } from "../src/lib/playfab/admin-api.server.ts";
import { exportUrl, readExportPage } from "../src/lib/playfab/admin-directory.server.ts";
import { mapAchievements, mapBans } from "../src/lib/playfab/admin-players.server.ts";

// All network calls are intercepted; no real players, credentials or moderation are used.
const origin = "https://civilcraft.test";
const generatedHash = await hashAdminPassword(randomBytes(32).toString("base64url"));
const accounts = [
  { email: "staff@example.test", displayName: "Staff", passwordHash: generatedHash },
  { email: "second@example.test", displayName: "Second", passwordHash: generatedHash },
];
const env = {
  ADMIN_AUTH_ORIGIN: origin,
  ADMIN_USERS_JSON: JSON.stringify(accounts),
  ADMIN_SESSION_SECRET: "test-session-credential-at-least-32-bytes",
  VITE_PLAYFAB_TITLE_ID: "17FA03",
  PLAYFAB_SECRET_KEY: "test-only-privileged-canary",
};
const prior = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
const fetchBefore = globalThis.fetch;
let calls: { operation: string; body: Record<string, unknown> }[] = [];
let data: Record<string, unknown> = {},
  stats: unknown[] = [],
  bans: unknown[] = [];
let failOperation = "",
  exportPending = false,
  malformedAccount = false;
const tsv =
  "TitleId\tPlayerId\tDisplayName\tCreated\tLastLogin\tPlayerStatistics\n" +
  Array.from(
    { length: 25 },
    (_, i) =>
      `17FA03\t${(i + 1).toString(16).toUpperCase()}\tEngineer ${i}\t2026-01-01 00:00:00\t2026-09-01 00:00:00\t[{"Name":"TotalScore","StatisticValue":${i}}]`,
  ).join("\n");
beforeEach(() => {
  Object.assign(process.env, env);
  calls = [];
  data = {};
  stats = [];
  bans = [];
  failOperation = "";
  exportPending = false;
  malformedAccount = false;
  globalThis.fetch = async (input, init) => {
    const url = String(input),
      headers = new Headers(init?.headers);
    if (url.startsWith("https://exports.blob.core.windows.net/")) {
      assert.equal(
        headers.get("X-SecretKey"),
        null,
        "Never send PlayFab credentials to export storage",
      );
      if (url.includes("index"))
        return new Response(
          "https://exports.blob.core.windows.net/fragment?sig=private-export-url",
        );
      const bytes = Buffer.from(tsv),
        start = Number(headers.get("range")?.match(/bytes=(\d+)/)?.[1] ?? 0);
      return new Response(bytes.subarray(start), {
        status: 206,
        headers: { "content-range": `bytes ${start}-${bytes.length - 1}/${bytes.length}` },
      });
    }
    assert.ok(url.startsWith("https://17FA03.playfabapi.com/"), "Unexpected external request");
    assert.equal(headers.get("X-SecretKey"), env.PLAYFAB_SECRET_KEY);
    assert.equal(init?.redirect, "error");
    const operation = url.split(".com/")[1]!,
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ operation, body });
    if (operation === failOperation)
      return Response.json(
        {
          code: 400,
          errorMessage: env.PLAYFAB_SECRET_KEY,
          errorDetails: { authorization: "sensitive" },
        },
        { status: 400 },
      );
    let result: unknown;
    switch (operation) {
      case "Admin/GetAllSegments":
        result = { Segments: [{ Id: "ALL", Name: "All Players" }] };
        break;
      case "Admin/ExportPlayersInSegment":
        result = { ExportId: "private-export-id" };
        break;
      case "Admin/GetSegmentExport":
        result = exportPending
          ? { State: "Pending" }
          : {
              State: "Complete",
              IndexUrl: "https://exports.blob.core.windows.net/index?sig=private-index-url",
            };
        break;
      case "Admin/GetUserAccountInfo":
        if (body["PlayFabId"] === "DEAD")
          return Response.json({ code: 400, error: "AccountNotFound" }, { status: 400 });
        result = {
          UserInfo: {
            PlayFabId: "ABC123",
            Username: "engineer",
            PrivateInfo: { Email: "hidden@example.test" },
            CustomIdInfo: { CustomId: "hidden-device" },
            ...(malformedAccount
              ? {}
              : {
                  TitleInfo: {
                    DisplayName: "Engineer",
                    Created: "2026-01-01T00:00:00Z",
                    LastLogin: "2026-09-01T00:00:00Z",
                  },
                }),
          },
        };
        break;
      case "Server/GetUserData":
        result = { Data: data };
        break;
      case "Server/GetPlayerStatistics":
        result = { Statistics: stats };
        break;
      case "Server/GetUserInventory":
        result = {
          Inventory: [
            {
              ItemId: "hat",
              DisplayName: "Builder Hat",
              CustomData: { secret: "hidden-inventory" },
            },
          ],
          VirtualCurrency: { CO: 0 },
        };
        break;
      case "Admin/GetUserBans":
        result = { BanData: bans };
        break;
      case "Admin/BanUsers":
        bans = [{ Active: true, Reason: "Test reason", PlayFabId: "ABC123" }];
        result = { BanData: bans };
        break;
      case "Admin/RevokeAllBansForUser":
        bans = [];
        result = {};
        break;
      default:
        throw new Error(`Unexpected operation: ${operation}`);
    }
    return Response.json({ code: 200, data: result });
  };
});
after(() => {
  globalThis.fetch = fetchBefore;
  for (const [k, v] of Object.entries(prior)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
async function session() {
  const config = getAdminAuthConfig()!;
  const token = await issueAdminSession(config, config.users[0]!);
  return cookieName(config, "session") + "=" + token;
}
async function request(path: string, cookie = "", body?: unknown, requestOrigin = origin) {
  const r = await handlePlayFabAdminRequest(
    new Request(origin + path, {
      headers: { cookie, origin: requestOrigin, "content-type": "application/json" },
      ...(body !== undefined ? { method: "POST", body: JSON.stringify(body) } : {}),
    }),
  );
  assert.ok(r);
  assert.equal(r.headers.get("cache-control"), "no-store, private");
  return r;
}
test("all privileged paths reject guests, player tickets, forged cookies before PlayFab", async () => {
  for (const path of [
    "/api/admin/players",
    "/api/admin/playfab/status",
    "/api/admin/players/ABC123",
    "/api/admin/players/ABC123/ban",
    "/api/admin/unknown",
  ]) {
    for (const cookie of [
      "",
      "civilcraft.player=player-ticket",
      "__Host-civilcraft-admin-session=fake",
    ])
      assert.equal((await request(path, cookie)).status, 401);
  }
  assert.equal(calls.length, 0);
});
test("removed administrator account receives 401", async () => {
  const cookie = await session();
  process.env["ADMIN_USERS_JSON"] = JSON.stringify([accounts[1]]);
  assert.equal((await request("/api/admin/players", cookie)).status, 401);
  assert.equal(calls.length, 0);
});
test("missing secret is a safe partial state; live probe checks PlayFab", async () => {
  const cookie = await session();
  delete process.env["PLAYFAB_SECRET_KEY"];
  const partial = await (await request("/api/admin/playfab/status", cookie)).json();
  assert.equal(partial.connection, "Partially configured");
  assert.equal(calls.length, 0);
  assert.equal((await request("/api/admin/players", cookie)).status, 503);
  process.env["PLAYFAB_SECRET_KEY"] = env.PLAYFAB_SECRET_KEY;
  const live = await (await request("/api/admin/playfab/status", cookie)).json();
  assert.equal(live.titleId, "17FA03");
  assert.equal(live.connection, "Connected");
  assert.ok(Date.parse(live.checkedAt));
  failOperation = "Admin/GetAllSegments";
  const down = await (await request("/api/admin/playfab/status", cookie)).text();
  assert.match(down, /Unavailable/);
  assert.ok(!down.includes(env.PLAYFAB_SECRET_KEY));
});
test("details contain only real mapped fields; missing progression stays null", async () => {
  const cookie = await session();
  const missing = await (await request("/api/admin/players/ABC123", cookie)).json();
  for (const key of ["level", "xp", "totalScore", "bridgesCompleted", "achievementsUnlocked"])
    assert.equal(missing[key], null);
  assert.equal(missing.accountStatus, "active");
  assert.equal(missing.currencies[0].balance, 0);
  assert.ok(!JSON.stringify(missing).includes("hidden-"));
  assert.ok(!JSON.stringify(missing).includes("hidden@example"));
  data = {
    CurrentLevel: { Value: "12" },
    XP: { Value: "0" },
    ChallengesCompleted: { Value: "bad" },
    AchievementsUnlocked: { Value: " " },
    CurrentRegion: { Value: "Meadow" },
    AchievementProgress: {
      Value: JSON.stringify([
        { id: "first", name: "First bridge", unlocked: true, ignored: "private" },
      ]),
    },
  };
  stats = [
    { StatisticName: "TotalScore", Value: 123 },
    { StatisticName: "BridgesCompleted", Value: 2 },
  ];
  const real = await (await request("/api/admin/players/ABC123", cookie)).json();
  assert.equal(real.level, 12);
  assert.equal(real.xp, 0);
  assert.equal(real.totalScore, 123);
  assert.equal(real.bridgesCompleted, 2);
  assert.equal(real.challengesCompleted, null);
  assert.equal(real.achievementsUnlocked, null);
  assert.equal(real.achievements[0].unlocked, true);
  failOperation = "Admin/GetUserBans";
  const partial = await (await request("/api/admin/players/ABC123", cookie)).json();
  assert.equal(partial.accountStatus, null);
  assert.ok(partial.unavailable.includes("Ban status"));
});
test("unsupported master accounts and missing players are not game records", async () => {
  const cookie = await session();
  assert.equal((await request("/api/admin/players/DEAD", cookie)).status, 404);
  malformedAccount = true;
  assert.equal((await request("/api/admin/players/ABC123", cookie)).status, 404);
});
test("search uses exact supported identifiers and rejects arbitrary fields", async () => {
  const cookie = await session();
  for (const kind of ["PlayFabId", "Username", "TitleDisplayName"]) {
    assert.equal((await request(`/api/admin/players?q=ABC123&kind=${kind}`, cookie)).status, 200);
    assert.ok(
      calls.some((c) => c.operation === "Admin/GetUserAccountInfo" && c.body[kind] === "ABC123"),
    );
  }
  assert.equal((await request("/api/admin/players?q=ABC123&kind=Email", cookie)).status, 400);
  assert.equal((await request("/api/admin/players?q=not-an-id", cookie)).status, 400);
});
test("export pagination returns 20 then 5 without exposing URLs, raw records, or credentials", async () => {
  const cookie = await session();
  exportPending = true;
  const preparing = await (await request("/api/admin/players", cookie)).json();
  assert.equal(preparing.pending, true);
  exportPending = false;
  const first = await (
    await request(`/api/admin/players?cursor=${preparing.nextCursor}`, cookie)
  ).json();
  assert.equal(first.players.length, 20);
  assert.equal(first.players[0].totalScore, 0);
  assert.equal(first.players[0].level, null);
  assert.equal(first.players[0].accountStatus, null);
  assert.ok(!JSON.stringify(first).includes("private-"));
  assert.ok(!JSON.stringify(first).includes("blob.core"));
  const next = await (
    await request(`/api/admin/players?cursor=${first.nextCursor}`, cookie)
  ).json();
  assert.equal(next.players.length, 5);
  assert.equal(next.nextCursor, null);
  assert.notEqual(first.players[0].playFabId, next.players[0].playFabId);
  assert.equal(calls.filter((c) => c.operation === "Admin/ExportPlayersInSegment").length, 1);
  assert.equal((await request("/api/admin/players?cursor=forged", cookie)).status, 410);
});
test("export parser bounds pages and rejects unsafe download targets", () => {
  const page = readExportPage(Buffer.from(tsv), true, null);
  assert.equal(page.players.length, 20);
  assert.throws(() => readExportPage(Buffer.from("Wrong\tHeader\n"), true, null));
  for (const url of [
    "http://exports.blob.core.windows.net/x",
    "https://127.0.0.1/x",
    "https://exports.blob.core.windows.net.evil.test/x",
    "https://user:pass@exports.blob.core.windows.net/x",
  ])
    assert.throws(() => exportUrl(url));
});
test("expiry, malformed bans and malformed achievements never fabricate state", () => {
  assert.equal(mapBans([{ Active: true, Expires: "2020-01-01T00:00:00Z" }])[0]!.active, false);
  assert.equal(mapBans([{ Active: true }])[0]!.active, true);
  assert.throws(() => mapBans([{ Active: true, Expires: "bad" }]));
  assert.equal(mapAchievements("bad"), null);
  assert.equal(mapAchievements("{}"), null);
});
test("moderation enforces CSRF, confirmation, reason, duration and existence before mutation", async () => {
  const cookie = await session(),
    path = "/api/admin/players/ABC123/ban";
  assert.equal(
    (await request(path, cookie, { confirm: true, reason: "test" }, "https://attacker.test"))
      .status,
    403,
  );
  for (const body of [
    { reason: "test" },
    { confirm: true, reason: "" },
    { confirm: true, reason: "x".repeat(141) },
    { confirm: true, reason: "test", durationHours: 0 },
    { confirm: true, reason: "test", durationHours: "24" },
  ])
    assert.equal((await request(path, cookie, body)).status, 400);
  assert.equal(
    (await request("/api/admin/players/DEAD/ban", cookie, { confirm: true, reason: "test" }))
      .status,
    404,
  );
  assert.equal(calls.filter((c) => c.operation === "Admin/BanUsers").length, 0);
});
test("ban and revoke mutate PlayFab, preserve authoritative state and sanitize failures", async () => {
  const cookie = await session(),
    path = "/api/admin/players/ABC123";
  assert.equal(
    (
      await request(path + "/ban", cookie, {
        confirm: true,
        reason: "Test reason",
        durationHours: 24,
      })
    ).status,
    200,
  );
  const ban = calls.find((c) => c.operation === "Admin/BanUsers")!;
  assert.deepEqual(ban.body, {
    Bans: [{ PlayFabId: "ABC123", Reason: "Test reason", DurationInHours: 24 }],
  });
  assert.equal((await (await request(path, cookie)).json()).accountStatus, "banned");
  assert.equal(
    (await request(path + "/ban", cookie, { confirm: true, reason: "duplicate" })).status,
    409,
  );
  assert.equal((await request(path + "/unban", cookie, { confirm: true })).status, 200);
  assert.equal((await (await request(path, cookie)).json()).accountStatus, "active");
  failOperation = "Admin/BanUsers";
  const failed = await request(path + "/ban", cookie, { confirm: true, reason: "Test reason" });
  assert.equal(failed.status, 503);
  const safe = await failed.text();
  assert.ok(!safe.includes(env.PLAYFAB_SECRET_KEY));
  assert.match(safe, /Refresh/);
});

test("encrypted cursors survive a fresh instance and reject tampering, other owners and expiry", async () => {
  const config = getAdminAuthConfig()!;
  const cookie = await session();
  const first = await (await request("/api/admin/players", cookie)).json();
  const modulePath = "../src/lib/playfab/admin-directory.server.ts";
  const fresh = await import(modulePath + "?instance=" + Date.now());
  const page = await fresh.directoryPage(config, config.users[0]!.id, first.nextCursor);
  assert.equal(page.players.length, 5);
  await assert.rejects(fresh.directoryPage(config, config.users[1]!.id, first.nextCursor), {
    status: 403,
  });
  await assert.rejects(
    fresh.directoryPage(config, config.users[0]!.id, first.nextCursor + "corrupt"),
    { status: 410 },
  );
  const previousNow = Date.now;
  try {
    Date.now = () => previousNow() + 16 * 60 * 1000;
    await assert.rejects(fresh.directoryPage(config, config.users[0]!.id, first.nextCursor), {
      status: 410,
    });
  } finally {
    Date.now = previousNow;
  }
});
