import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";
import { AdminApiError } from "../src/lib/playfab/admin-client.server.ts";
import { handleLeaderboardRequest } from "../src/lib/playfab/leaderboard.server.ts";
import { multiplayerLeaderboardPage } from "../src/lib/playfab/multiplayer-leaderboard.server.ts";

// Every request is intercepted: no live PlayFab traffic or score writes.
const origin = "https://civilcraft.test";
const endpoint = "/api/leaderboard/public/multiplayer";
const canary = "test-only-multiplayer-server-secret";
const environment = {
  VITE_PLAYFAB_TITLE_ID: "17FA03",
  PLAYFAB_SECRET_KEY: canary,
  ADMIN_SESSION_SECRET: "",
  ADMIN_USERS_JSON: "",
};
const previousEnvironment = Object.fromEntries(
  Object.keys(environment).map((key) => [key, process.env[key]]),
);
const previousFetch = globalThis.fetch;
type Call = { operation: string; body: Record<string, unknown> };
let calls: Call[] = [];
let board: unknown;
let records = new Map<string, unknown>();
let failure: ((operation: string) => Response | undefined) | null = null;

function row(overrides: Record<string, unknown> = {}) {
  return {
    PlayFabId: "A11FACE1",
    Position: 0,
    StatValue: 12,
    DisplayName: "Engineer",
    ...overrides,
  };
}

beforeEach(() => {
  Object.assign(process.env, environment);
  calls = [];
  board = { Version: 3, Leaderboard: [] };
  records = new Map();
  failure = null;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    assert.ok(url.startsWith("https://17FA03.playfabapi.com/"), "Unexpected external request");
    assert.equal(init?.method, "POST");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal instanceof AbortSignal);
    assert.equal(headers.get("Content-Type"), "application/json");
    assert.equal(headers.get("X-SecretKey"), canary);
    assert.equal(headers.get("Authorization"), null);
    const operation = url.split(".com/")[1]!;
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ operation, body });
    const failed = failure?.(operation);
    if (failed) return failed;
    let data: unknown;
    if (operation === "Server/GetLeaderboard") data = board;
    else if (operation === "Server/GetPlayerStatistics") {
      assert.deepEqual(body["StatisticNames"], ["CC_MP_Losses", "CC_MP_Draws"]);
      data = records.get(String(body["PlayFabId"])) ?? { Statistics: [] };
    } else assert.fail(`Unexpected operation: ${operation}`);
    return Response.json({ code: 200, data });
  };
});

afterEach(() => {
  assert.ok(
    calls.every(({ operation }) =>
      ["Server/GetLeaderboard", "Server/GetPlayerStatistics"].includes(operation),
    ),
    "Multiplayer ranking must never write statistics, fetch private saves, or change authorization",
  );
});

after(() => {
  globalThis.fetch = previousFetch;
  for (const [key, value] of Object.entries(previousEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function request(path = endpoint, method = "GET") {
  const response = await handleLeaderboardRequest(new Request(origin + path, { method }));
  assert.ok(response);
  return response;
}

async function invalidData() {
  await assert.rejects(multiplayerLeaderboardPage(), (error: unknown) => {
    assert.ok(error instanceof AdminApiError);
    assert.equal(error.status, 502);
    return true;
  });
}

test("maps server order and one-based ranks using the exact multiplayer read-only contract", async () => {
  const coloredName = "<#BF40BF>.dev_hyakkimaru";
  const unsafeName = '<img src=x onerror="alert(1)">';
  board = {
    Version: 3,
    Leaderboard: [
      row({
        Position: 7,
        DisplayName: coloredName,
        Email: "private@example.test",
        SessionTicket: "private-ticket",
      }),
      row({
        PlayFabId: "B22FACE2",
        Position: 8,
        StatValue: 30,
        DisplayName: " ",
        Profile: { DisplayName: "Profile Name" },
      }),
      row({ PlayFabId: "C33FACE3", Position: 9, StatValue: 0, DisplayName: null }),
      row({ PlayFabId: "D44FACE4", Position: 10, StatValue: 2147483647, DisplayName: unsafeName }),
    ],
  };
  records.set("A11FACE1", {
    Statistics: [
      { StatisticName: "CC_MP_Losses", Value: 3, Version: 2 },
      { StatisticName: "CC_MP_Draws", Value: 4, Version: 9 },
      { StatisticName: "UnrelatedStatistic", Value: "ignored" },
    ],
  });
  records.set("D44FACE4", { Statistics: [{ StatisticName: "CC_MP_Losses", Value: 2147483647 }] });
  const result = await multiplayerLeaderboardPage();
  assert.deepEqual(result, {
    entries: [
      { rank: 8, displayName: coloredName, wins: 12, losses: 3, draws: 4 },
      { rank: 9, displayName: "Profile Name", wins: 30, losses: 0, draws: 0 },
      { rank: 10, displayName: "Engineer", wins: 0, losses: 0, draws: 0 },
      { rank: 11, displayName: unsafeName, wins: 2147483647, losses: 2147483647, draws: 0 },
    ],
  });
  assert.deepEqual(calls[0], {
    operation: "Server/GetLeaderboard",
    body: {
      StatisticName: "CC_MP_Wins",
      StartPosition: 0,
      MaxResultsCount: 15,
      ProfileConstraints: { ShowDisplayName: true },
    },
  });
  assert.deepEqual(
    calls.slice(1).map(({ body }) => body),
    ["A11FACE1", "B22FACE2", "C33FACE3", "D44FACE4"].map((id) => ({
      PlayFabId: id,
      StatisticNames: ["CC_MP_Losses", "CC_MP_Draws"],
    })),
  );
  assert.doesNotMatch(
    JSON.stringify(result),
    /playFabId|PlayFabId|A11FACE1|B22FACE2|Email|SessionTicket|private-ticket/,
  );
});

test("is bounded to exactly the top 15 and never asks for arbitrary statistics", async () => {
  board = {
    Version: 0,
    Leaderboard: Array.from({ length: 15 }, (_, position) =>
      row({
        PlayFabId: (position + 1).toString(16),
        Position: position,
        StatValue: 15 - position,
      }),
    ),
  };
  const result = await multiplayerLeaderboardPage();
  assert.equal(result.entries.length, 15);
  assert.deepEqual(
    result.entries.map(({ rank }) => rank),
    Array.from({ length: 15 }, (_, index) => index + 1),
  );
  assert.equal(calls.length, 16);
  assert.equal(calls[0]!.body["MaxResultsCount"], 15);
});

test("an empty valid board performs no per-player reads", async () => {
  board = { Version: 0, Leaderboard: [] };
  assert.deepEqual(await multiplayerLeaderboardPage(), { entries: [] });
  assert.equal(calls.length, 1);
});

test("missing named counts become zero and unrelated statistics are ignored", async () => {
  board = { Version: 3, Leaderboard: [row({ StatValue: 0 })] };
  records.set("A11FACE1", { Statistics: [{ StatisticName: "CC_MP_Wins", Value: 999 }] });
  assert.deepEqual(await multiplayerLeaderboardPage(), {
    entries: [{ rank: 1, displayName: "Engineer", wins: 0, losses: 0, draws: 0 }],
  });
});

test("malformed board containers, oversized responses, and versions fail closed", async () => {
  for (const raw of [undefined, null, {}, "invalid", 3]) {
    board = { Version: 3, Leaderboard: raw };
    await invalidData();
  }
  for (const version of [
    undefined,
    null,
    "3",
    -1,
    0.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    board = { Version: version, Leaderboard: [] };
    await invalidData();
  }
  board = {
    Version: 3,
    Leaderboard: Array.from({ length: 16 }, (_, position) =>
      row({
        PlayFabId: (position + 1).toString(16),
        Position: position,
      }),
    ),
  };
  await invalidData();
  assert.ok(calls.every(({ operation }) => operation === "Server/GetLeaderboard"));
});

test("malformed rows and invalid private IDs, positions, or wins fail closed before record reads", async () => {
  const badRows: unknown[] = [null, [], {}, "invalid"];
  for (const id of [undefined, null, "", "not-hex", "A".repeat(33), "A B", 1])
    badRows.push(row({ PlayFabId: id }));
  for (const position of [undefined, null, "0", -1, 0.5, NaN, Infinity, 2147483648])
    badRows.push(row({ Position: position }));
  for (const wins of [undefined, null, "1", -1, 0.5, NaN, Infinity, 2147483648])
    badRows.push(row({ StatValue: wins }));
  for (const badRow of badRows) {
    board = { Version: 3, Leaderboard: [badRow] };
    await invalidData();
  }
  assert.ok(calls.every(({ operation }) => operation === "Server/GetLeaderboard"));
});

test("duplicate player IDs, case-insensitive IDs, and duplicate positions fail closed", async () => {
  for (const second of [
    row({ Position: 1 }),
    row({ PlayFabId: "a11face1", Position: 1 }),
    row({ PlayFabId: "B22FACE2" }),
  ]) {
    board = { Version: 3, Leaderboard: [row(), second] };
    await invalidData();
  }
  assert.ok(calls.every(({ operation }) => operation === "Server/GetLeaderboard"));
});

test("malformed statistics containers fail closed instead of inventing a zero record", async () => {
  board = { Version: 3, Leaderboard: [row()] };
  for (const value of [
    {},
    { Statistics: null },
    { Statistics: {} },
    { Statistics: "invalid" },
    [],
  ]) {
    records.set("A11FACE1", value);
    await invalidData();
  }
  for (const stat of [null, [], {}, { StatisticName: null }, { StatisticName: "" }]) {
    records.set("A11FACE1", { Statistics: [stat] });
    await invalidData();
  }
});

test("known loss and draw statistics require integer bounded values and reject duplicates", async () => {
  board = { Version: 3, Leaderboard: [row()] };
  for (const name of ["CC_MP_Losses", "CC_MP_Draws"]) {
    for (const value of [undefined, null, "1", -1, 0.5, NaN, Infinity, 2147483648]) {
      records.set("A11FACE1", { Statistics: [{ StatisticName: name, Value: value }] });
      await invalidData();
    }
    records.set("A11FACE1", {
      Statistics: [
        { StatisticName: name, Value: 1 },
        { StatisticName: name, Value: 1 },
      ],
    });
    await invalidData();
  }
});

test("the exact public multiplayer route allows anonymous GET and exposes only public fields", async () => {
  board = { Version: 3, Leaderboard: [row({ DisplayName: "<#BF40BF>.dev_hyakkimaru" })] };
  const response = await request();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    entries: [{ rank: 1, displayName: "<#BF40BF>.dev_hyakkimaru", wins: 12, losses: 0, draws: 0 }],
  });
  assert.match(response.headers.get("Cache-Control") ?? "", /no-store/);
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(calls.length, 2);
});

test("all query parameters and non-GET methods are rejected before any PlayFab request", async () => {
  for (const query of [
    "pageSize=50",
    "start=15",
    "version=3",
    "contractId=ShopKeeper",
    "mode=strongest",
    "StatisticName=TotalScore",
    "anything=",
    "a=1&a=2",
  ]) {
    assert.equal((await request(`${endpoint}?${query}`)).status, 400);
  }
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
    assert.equal((await request(endpoint, method)).status, 405);
  }
  assert.equal(calls.length, 0);
});

test("anonymous access does not spread to existing authenticated or lookalike routes", async () => {
  for (const path of [
    "/api/leaderboard",
    "/api/leaderboard/me",
    "/api/leaderboard/standing",
    `${endpoint}/`,
    `${endpoint}-extra`,
  ]) {
    assert.equal((await request(path)).status, 401);
  }
  assert.equal(await handleLeaderboardRequest(new Request(origin + "/api/unrelated")), null);
  assert.equal(calls.length, 0);
});

test("missing secret and malformed title configuration return sanitized 503 without traffic", async () => {
  delete process.env["PLAYFAB_SECRET_KEY"];
  let response = await request();
  assert.equal(response.status, 503);
  assert.match(await response.text(), /not configured/);
  process.env["PLAYFAB_SECRET_KEY"] = canary;
  process.env["VITE_PLAYFAB_TITLE_ID"] = "invalid.example/secret";
  response = await request();
  assert.equal(response.status, 503);
  const body = await response.text();
  assert.ok(!body.includes(canary) && !body.includes("invalid.example"));
  assert.equal(calls.length, 0);
});

test("malformed upstream results return a sanitized 502 through the public endpoint", async () => {
  board = { Version: -1, Leaderboard: [row()] };
  const response = await request();
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "Unable to load the leaderboard." });
});

test("upstream errors, invalid JSON, and network exceptions never expose server details", async () => {
  board = { Version: 3, Leaderboard: [row()] };
  for (const operation of ["Server/GetLeaderboard", "Server/GetPlayerStatistics"]) {
    for (const mode of ["api", "json", "network"]) {
      failure = (current) => {
        if (current !== operation) return undefined;
        if (mode === "network") throw new Error(`${canary} private@example.test A11FACE1`);
        if (mode === "json") return new Response(`${canary} not-json`, { status: 200 });
        return Response.json(
          {
            code: 400,
            errorMessage: canary,
            errorDetails: { email: "private@example.test", player: "A11FACE1" },
          },
          { status: 400 },
        );
      };
      const response = await request();
      assert.equal(response.status, 503);
      const body = await response.text();
      assert.ok(
        !body.includes(canary) &&
          !body.includes("private@example.test") &&
          !body.includes("A11FACE1"),
      );
      assert.deepEqual(JSON.parse(body), { error: "Unable to load the leaderboard." });
    }
  }
});
