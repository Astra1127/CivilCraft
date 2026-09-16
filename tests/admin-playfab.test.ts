import { summarizePlayers } from "../src/lib/playfab/analytics.server.ts";
import { mapIdentity } from "../src/lib/playfab/admin-players.server.ts";
import { handleLeaderboardRequest, mapLeaderboard } from "../src/lib/playfab/leaderboard.server.ts";
import { handlePlayerBugRequest } from "../src/lib/playfab/bug-reports.server.ts";
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
let reports: Record<string, unknown> = {};
let rankingRows: Record<string, unknown>[] = [];
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
let exportSerial = 0;
let fragmentFiles: string[] | null = null;
beforeEach(() => {
  env.ADMIN_SESSION_SECRET = "test-admin-session-credential-" + ++exportSerial + "-long-enough";
  fragmentFiles = null;
  Object.assign(process.env, env);
  calls = [];
  reports = {};
  rankingRows = [];
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
          fragmentFiles
            ? fragmentFiles
                .map((_, i) => "https://exports.blob.core.windows.net/fragment/" + i)
                .join("\n")
            : "https://exports.blob.core.windows.net/fragment?sig=private-export-url",
        );
      const bytes = Buffer.from(
          fragmentFiles ? fragmentFiles[Number(url.split("/").at(-1))]! : tsv,
        ),
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
      case "Server/GetLeaderboard":
        assert.equal(body["StatisticName"], "TotalScore");
        result = {
          Version: 3,
          Leaderboard: rankingRows.slice(
            Number(body["StartPosition"]),
            Number(body["StartPosition"]) + Number(body["MaxResultsCount"]),
          ),
        };
        break;
      case "Server/GetLeaderboardAroundUser":
        result = {
          Version: 3,
          Leaderboard: [
            rankingRows.find((r) => r["PlayFabId"] === body["PlayFabId"]) ?? {
              PlayFabId: body["PlayFabId"],
              Position: 0,
              StatValue: 0,
            },
          ],
        };
        break;
      case "Server/AuthenticateSessionTicket":
        result = ["valid-player", "second-player"].includes(String(body["SessionTicket"]))
          ? {
              UserInfo: {
                PlayFabId: body["SessionTicket"] === "second-player" ? "DEF456" : "ABC123",
                TitleInfo: { DisplayName: "Real Player" },
              },
            }
          : { IsSessionTicketExpired: true };
        break;
      case "Admin/GetTitleInternalData":
        result = { Data: { ...reports } };
        break;
      case "Admin/SetTitleInternalData":
        if (body["Value"] === null) delete reports[String(body["Key"])];
        else reports[String(body["Key"])] = body["Value"];
        result = {};
        break;
      case "Admin/GetAllSegments":
        result = { Segments: [{ Id: "ALL", Name: "All Players" }] };
        break;
      case "Admin/ExportPlayersInSegment":
        result = { ExportId: "private-export-id-" + exportSerial };
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
    "/api/admin/analytics",
    "/api/admin/bug-reports",
    "/api/admin/players",
    "/api/admin/playfab/status",
    "/api/admin/transactions",
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
test("integration configuration reports safe statuses without exposing service credentials", async () => {
  const names = [
    "BLOB_READ_WRITE_TOKEN",
    "PLAYFAB_RECOVERY_EMAIL_TEMPLATE_ID",
    "PLAYFAB_RELEASE_EMAIL_TEMPLATE_ID",
    "CRON_SECRET",
  ];
  const previous = names.map((name) => process.env[name]);
  try {
    const cookie = await session();
    for (const name of names) delete process.env[name];
    const missing = await (await request("/api/admin/playfab/status", cookie)).json();
    assert.deepEqual(Object.values(missing.services), Array(4).fill("Not configured"));
    for (const name of names) process.env[name] = "private-integration-canary-" + name;
    const response = await request("/api/admin/playfab/status", cookie);
    const text = await response.text();
    assert.deepEqual(Object.values(JSON.parse(text).services), Array(4).fill("Configured"));
    assert.ok(!text.includes("private-integration-canary"));
    assert.ok(!text.includes(env.PLAYFAB_SECRET_KEY));
    assert.ok(!text.includes(env.ADMIN_SESSION_SECRET));
  } finally {
    names.forEach((name, index) => {
      if (previous[index] === undefined) delete process.env[name];
      else process.env[name] = previous[index];
    });
  }
});
test("transactions distinguish missing access, empty history and provider failure", async () => {
  const cookie = await session();
  delete process.env["PLAYFAB_SECRET_KEY"];
  const missing = await request("/api/admin/transactions", cookie);
  assert.equal(missing.status, 200);
  assert.deepEqual(await missing.json(), { configured: false, records: [] });
  assert.equal(calls.length, 0);

  process.env["PLAYFAB_SECRET_KEY"] = env.PLAYFAB_SECRET_KEY;
  const empty = await request("/api/admin/transactions", cookie);
  assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), { configured: true, records: [] });
  assert.deepEqual(
    calls.map((call) => call.operation),
    ["Admin/GetAllSegments"],
  );

  failOperation = "Admin/GetAllSegments";
  const failed = await request("/api/admin/transactions", cookie);
  assert.equal(failed.status, 503);
  assert.ok(!(await failed.text()).includes(env.PLAYFAB_SECRET_KEY));
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

async function submitBug(ticket = "valid-player", extra: Record<string, unknown> = {}) {
  return handlePlayerBugRequest(
    new Request(origin + "/api/player/bug-reports", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + ticket },
      body: JSON.stringify({
        category: "Gameplay",
        description: "Bridge fails to load after opening.",
        ...extra,
      }),
    }),
  );
}
test("separate player and admin sessions share persistent reports; identity is verified", async () => {
  const response = await submitBug("valid-player", {
    playFabId: "FAKE",
    player: "Spoof",
    status: "Closed",
    createdAt: "fake",
  });
  assert.equal(response?.status, 201);
  const cookie = await session();
  const list = await (await request("/api/admin/bug-reports", cookie)).json();
  assert.equal(list.length, 1);
  assert.equal(list[0].playFabId, "ABC123");
  assert.equal(list[0].player, "Real Player");
  assert.equal(list[0].status, "New");
  assert.ok(Number.isFinite(Date.parse(list[0].createdAt)));
  const id = list[0].id;
  assert.equal(
    (await request("/api/admin/bug-reports", cookie, { id, status: "Resolved" })).status,
    200,
  );
  assert.equal(
    (await (await request("/api/admin/bug-reports", await session())).json())[0].status,
    "Resolved",
  );
  assert.equal(
    (await request("/api/admin/bug-reports", cookie, { id, action: "delete" })).status,
    200,
  );
  assert.deepEqual(await (await request("/api/admin/bug-reports", cookie)).json(), []);
});
test("bug validation, authentication, CSRF and storage failures never report success", async () => {
  assert.equal((await submitBug("expired"))?.status, 401);
  assert.equal((await submitBug("valid-player", { description: "short" }))?.status, 400);
  assert.equal((await submitBug("valid-player", { category: "invalid" }))?.status, 400);
  assert.deepEqual(reports, {});
  failOperation = "Admin/SetTitleInternalData";
  const failed = await submitBug();
  assert.equal(failed?.status, 503);
  assert.ok(!(await failed!.text()).includes(env.PLAYFAB_SECRET_KEY));
  assert.equal(
    (await request("/api/admin/bug-reports", await session(), {}, "https://evil.test")).status,
    403,
  );
});
test("concurrent submissions preserve each report without a shared list overwrite", async () => {
  await Promise.all([submitBug(), submitBug()]);
  const list = await (await request("/api/admin/bug-reports", await session())).json();
  assert.equal(list.length, 2);
  assert.notEqual(list[0].id, list[1].id);
});

async function board(path = "", ticket = "", cookie = "") {
  return handleLeaderboardRequest(
    new Request(origin + "/api/leaderboard" + path, {
      headers: { cookie, ...(ticket ? { authorization: "Bearer " + ticket } : {}) },
    }),
  );
}
test("player A, player B and admin retrieve identical all-time pages independent of sessions", async () => {
  rankingRows = Array.from({ length: 23 }, (_, i) => ({
    PlayFabId: i === 0 ? "ABC123" : i === 1 ? "DEF456" : (i + 1).toString(16),
    Position: i,
    StatValue: 24000 - i,
  }));
  const cookie = await session();
  const a = await (await board("", "valid-player"))!.json();
  const b = await (await board("", "second-player"))!.json();
  const admin = await (await board("", "", cookie))!.json();
  assert.deepEqual(a, b);
  assert.deepEqual(a, admin);
  assert.equal(a.entries.length, 20);
  assert.equal(a.entries[0].level, null);
  assert.equal(a.entries[0].displayName, "Engineer");
  const second = await (await board("?start=10&version=3&pageSize=10", "", cookie))!.json();
  assert.equal(second.entries[0].rank, 11);
  assert.equal(second.nextStart, 20);
  const last = await (await board("?start=20&version=3", "valid-player"))!.json();
  assert.equal(last.entries[0].rank, 21);
  assert.equal(last.nextStart, null);
  assert.equal((await (await board("/me?version=3", "valid-player"))!.json()).rank, 1);
  assert.equal((await (await board("/me?version=3", "second-player"))!.json()).rank, 2);
  assert.deepEqual(await (await board("", "", cookie))!.json(), admin);
  assert.ok(
    calls
      .filter((c) => c.operation === "Server/GetLeaderboard")
      .every((c) => !c.body["PlayFabId"] && c.body["StatisticName"] === "TotalScore"),
  );
});
test("leaderboard distinguishes empty, failure, missing access and unranked users", async () => {
  const cookie = await session();
  assert.equal((await board())!.status, 401);
  assert.equal((await board("", "expired"))!.status, 401);
  assert.deepEqual((await (await board("", "", cookie))!.json()).entries, []);
  assert.equal(await (await board("/me", "valid-player"))!.json(), null);
  rankingRows = [{ PlayFabId: "DEF456", Position: 0, StatValue: 10 }];
  assert.equal(
    await (await board("/me", "valid-player"))!.json(),
    null,
    "AroundUser synthetic position zero is not rank one",
  );
  assert.equal((await board("?start=-1", "", cookie))!.status, 400);
  assert.equal((await board("?version=wrong", "", cookie))!.status, 400);
  assert.equal((await board("?version=4", "", cookie))!.status, 502);
  failOperation = "Server/GetLeaderboard";
  assert.equal((await board("", "", cookie))!.status, 503);
  process.env["PLAYFAB_SECRET_KEY"] = "";
  assert.equal(
    (await (await board("", "", cookie))!.json()).error,
    "PlayFab administrative access is not configured.",
  );
});
test("leaderboard ranks come from backend positions and malformed rows fail closed", () => {
  assert.equal(
    mapLeaderboard([
      {
        PlayFabId: "ABC123",
        Position: 42,
        StatValue: 18240,
        Profile: { DisplayName: "Engineer A" },
      },
    ])[0]!.rank,
    43,
  );
  assert.throws(() => mapLeaderboard([{ PlayFabId: "ABC123", Position: -1, StatValue: 1 }]));
});

for (const count of [0, 1, 5, 20, 21, 53])
  test("directory joins one-row export fragments: " + count + " players", async () => {
    const lines = tsv.split("\n");
    fragmentFiles = Array.from(
      { length: count },
      (_, i) =>
        lines[0] +
        "\n" +
        [
          "17FA03",
          (i + 1).toString(16),
          "Engineer " + i,
          "2026-01-01 00:00:00",
          "2026-09-01 00:00:00",
          "[]",
        ].join("\t"),
    );
    const cookie = await session();
    const first = await (await request("/api/admin/players?page=1", cookie)).json();
    assert.equal(first.players.length, Math.min(20, count));
    assert.equal(first.totalPlayers, count);
    for (const size of [10, 20, 50]) {
      const ids: string[] = [];
      for (let page = 1; page <= Math.max(1, Math.ceil(count / size)); page++) {
        const result = await (
          await request(
            "/api/admin/players?page=" +
              page +
              "&pageSize=" +
              size +
              "&cursor=" +
              first.snapshotCursor,
            cookie,
          )
        ).json();
        assert.equal(result.players.length, Math.min(size, Math.max(0, count - (page - 1) * size)));
        ids.push(...result.players.map((p: { playFabId: string }) => p.playFabId));
      }
      assert.equal(new Set(ids).size, count);
    }
    assert.deepEqual(
      (
        await (
          await request("/api/admin/players?page=1&cursor=" + first.snapshotCursor, await session())
        ).json()
      ).players,
      first.players,
    );
    assert.equal((await request("/api/admin/players?pageSize=1", cookie)).status, 400);
  });
test("analytics counts full snapshots, keeps missing values distinct and isolates failures", async () => {
  const cookie = await session();
  const result = await (await request("/api/admin/analytics", cookie)).json();
  assert.equal(result.players.data.total, 25);
  assert.equal(result.players.data.progression[1].value, 12);
  assert.equal(result.players.data.progression[0].value, null);
  assert.equal(result.bugs.data.open, 0);
  assert.deepEqual(result.leaderboard.data, []);
  assert.equal(result.backend, "Connected");
  assert.ok(
    !calls.some(
      (c) => c.operation === "Admin/GetUserAccountInfo" || c.operation === "Server/GetUserData",
    ),
  );
  failOperation = "Admin/GetTitleInternalData";
  const partial = await (await request("/api/admin/analytics", cookie)).json();
  assert.equal(partial.bugs.status, "error");
  assert.equal(partial.players.status, "ready");
});
test("registration UTC buckets and activity boundaries do not invent missing history", () => {
  const players = [
    mapIdentity({
      PlayFabId: "A",
      TitleInfo: { Created: "2026-09-12T00:00:00Z", LastLogin: "2026-09-05T12:00:00Z" },
    }),
    mapIdentity({
      PlayFabId: "B",
      TitleInfo: { Created: "2026-09-01T00:00:00Z", LastLogin: "2026-08-13T12:00:00Z" },
    }),
    mapIdentity({ PlayFabId: "C", TitleInfo: { LastLogin: "2026-01-01T00:00:00Z" } }),
    mapIdentity({ PlayFabId: "D" }),
  ];
  players[0]!.totalScore = 0;
  players[1]!.totalScore = 20;
  const result = summarizePlayers(players, "2026-09-12T12:00:00Z");
  assert.equal(result.total, 4);
  assert.equal(result.recentlyActive, 1);
  assert.deepEqual(
    result.activity.map((b) => b.count),
    [1, 1, 1, 1],
  );
  assert.equal(
    result.registrations.reduce((n, b) => n + b.count, 0),
    2,
  );
  assert.equal(result.registrationUnknown, 2);
  assert.equal(result.progression[1]!.value, 10);
  assert.equal(result.progression[1]!.available, 2);
  assert.equal(result.progression[0]!.value, null);
});

test("weekly is explicitly empty for both consumers and never borrows lifetime scores", async () => {
  rankingRows = [{ PlayFabId: "ABC123", Position: 0, StatValue: 18240 }];
  const cookie = await session();
  const player = await (await board("?period=weekly", "valid-player"))!.json();
  const admin = await (await board("?period=weekly", "", cookie))!.json();
  assert.deepEqual(player, { entries: [], version: null, nextStart: null });
  assert.deepEqual(admin, player);
  assert.equal(await (await board("/me?period=weekly", "valid-player"))!.json(), null);
  assert.ok(!calls.some((c) => c.operation.startsWith("Server/GetLeaderboard")));
  assert.equal(
    (await (await board("?period=all-time", "", cookie))!.json()).entries[0].score,
    18240,
  );
  assert.equal((await board("?period=local", "", cookie))!.status, 400);
  assert.equal((await board("?period=monthly", "", cookie))!.status, 400);
  assert.equal((await board("?pageSize=1", "", cookie))!.status, 400);
});
test("leaderboard supports 10, 20 and 50 backend entries per page", async () => {
  rankingRows = Array.from({ length: 55 }, (_, i) => ({
    PlayFabId: (i + 1).toString(16),
    Position: i,
    StatValue: 100 - i,
  }));
  const cookie = await session();
  for (const size of [10, 20, 50]) {
    const first = await (await board("?period=all-time&pageSize=" + size, "", cookie))!.json();
    assert.equal(first.entries.length, size);
    assert.equal(first.nextStart, size);
    const second = await (await board(
      "?period=all-time&pageSize=" + size + "&start=" + size + "&version=3",
      "",
      cookie,
    ))!.json();
    assert.equal(second.entries[0].rank, size + 1);
  }
});

test("directory filters and sorts the full 53-player snapshot before pagination without per-row calls", async () => {
  const time = Date.now();
  fragmentFiles = [
    "PlayerId\tDisplayName\tCreated\tLastLogin\tisBanned\n" +
      Array.from({ length: 53 }, (_, i) =>
        [
          (i + 1).toString(16).toUpperCase(),
          "Engineer " + String(52 - i).padStart(2, "0"),
          new Date(time - i * 86400000).toISOString(),
          new Date(time - i * 86400000).toISOString(),
          String(i % 2 === 0),
        ].join("\t"),
      )
        .reverse()
        .join("\n") +
      "\n",
  ];
  const auth = await session();
  const first = await (
    await request("/api/admin/players?sort=newest&status=banned&pageSize=20&page=1", auth)
  ).json();
  assert.equal(first.totalPlayers, 27);
  assert.equal(first.players.length, 20);
  assert.equal(first.players[0].playFabId, "1");
  const second = await (
    await request(
      "/api/admin/players?sort=newest&status=banned&pageSize=20&page=2&cursor=" +
        encodeURIComponent(first.snapshotCursor),
      auth,
    )
  ).json();
  assert.equal(second.players.length, 7);
  assert.equal(second.players[0].playFabId, "29");
  assert.ok(calls.every((call) => call.operation !== "Admin/GetUserAccountInfo"));
  const oldest = await (await request("/api/admin/players?sort=oldest&pageSize=10", auth)).json();
  assert.equal(oldest.players[0].playFabId, "35");
});
