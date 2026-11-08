import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";
import {
  handleLeaderboardRequest,
  overallLeaderboardPage,
} from "../src/lib/playfab/leaderboard.server.ts";
import { LEADERBOARD_STATISTIC } from "../src/lib/playfab/leaderboard-shared.ts";

const origin = "https://civilcraft.test";
const endpoint = "/api/leaderboard/public/overall";
const canary = "test-only-overall-server-secret";
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
    StatValue: 12500,
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
      assert.deepEqual(body["StatisticNames"], ["BridgesCompleted", "ChallengesCompleted"]);
      data = records.get(String(body["PlayFabId"])) ?? { Statistics: [] };
    } else if (operation === "Server/GetLeaderboardAroundUser") {
      data = board;
    } else if (operation === "Server/AuthenticateSessionTicket") {
      data = {
        IsSessionTicketExpired: false,
        UserInfo: { PlayFabId: "A11FACE1" },
      };
    } else assert.fail(`Unexpected operation: ${operation}`);
    return Response.json({ code: 200, data });
  };
});

afterEach(() => {
  assert.ok(
    calls.every((c) =>
      [
        "Server/GetLeaderboard",
        "Server/GetPlayerStatistics",
        "Server/GetLeaderboardAroundUser",
        "Server/AuthenticateSessionTicket",
      ].includes(c.operation),
    ),
  );
});

after(() => {
  globalThis.fetch = previousFetch;
  for (const [key, value] of Object.entries(previousEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("queries TotalScore leaderboard and returns enriched career statistics", async () => {
  board = {
    Version: 2,
    Leaderboard: [
      row({ PlayFabId: "1111", Position: 0, StatValue: 25000, DisplayName: "MasterBuilder" }),
      row({ PlayFabId: "2222", Position: 1, StatValue: 18000, DisplayName: "ArchNovice" }),
    ],
  };
  records.set("1111", {
    Statistics: [
      { StatisticName: "BridgesCompleted", Value: 12 },
      { StatisticName: "ChallengesCompleted", Value: 8 },
    ],
  });
  records.set("2222", {
    Statistics: [
      { StatisticName: "BridgesCompleted", Value: 5 },
      { StatisticName: "ChallengesCompleted", Value: 2 },
    ],
  });

  const page = await overallLeaderboardPage(0, 20, 2);

  assert.ok(calls[0]);
  assert.equal(calls[0].operation, "Server/GetLeaderboard");
  assert.equal(calls[0].body["StatisticName"], LEADERBOARD_STATISTIC);
  assert.equal(calls[0].body["StartPosition"], 0);
  assert.equal(calls[0].body["MaxResultsCount"], 20);
  assert.equal(calls[0].body["Version"], 2);

  assert.equal(page.version, 2);
  assert.equal(page.nextStart, null); // less than pageSize
  assert.equal(page.entries.length, 2);

  assert.ok(page.entries[0]);
  assert.deepEqual(page.entries[0], {
    rank: 1,
    displayName: "MasterBuilder",
    totalScore: 25000,
    bridgesCompleted: 12,
    challengesCompleted: 8,
  });
  assert.ok(page.entries[1]);
  assert.deepEqual(page.entries[1], {
    rank: 2,
    displayName: "ArchNovice",
    totalScore: 18000,
    bridgesCompleted: 5,
    challengesCompleted: 2,
  });
});

test("handles empty overall leaderboard without per-player reads", async () => {
  board = { Version: 1, Leaderboard: [] };
  const page = await overallLeaderboardPage(0, 20);
  assert.equal(page.entries.length, 0);
  assert.equal(page.version, 1);
  assert.equal(page.nextStart, null);
  assert.equal(calls.length, 1);
  assert.ok(calls[0]);
  assert.equal(calls[0].operation, "Server/GetLeaderboard");
});

test("deduplicates duplicate player IDs or duplicate positions", async () => {
  board = {
    Version: 1,
    Leaderboard: [
      row({ PlayFabId: "AAAA", Position: 0, StatValue: 3000, DisplayName: "PlayerOne" }),
      row({ PlayFabId: "aaaa", Position: 1, StatValue: 2000, DisplayName: "PlayerOneDupe" }),
      row({ PlayFabId: "BBBB", Position: 0, StatValue: 1500, DisplayName: "PositionDupe" }),
      row({ PlayFabId: "CCCC", Position: 2, StatValue: 1000, DisplayName: "PlayerTwo" }),
    ],
  };

  const page = await overallLeaderboardPage(0, 20);
  assert.equal(page.entries.length, 2);
  assert.ok(page.entries[0]);
  assert.ok(page.entries[1]);
  assert.equal(page.entries[0].displayName, "PlayerOne");
  assert.equal(page.entries[1].displayName, "PlayerTwo");
});

test("calculates nextStart when full page is returned", async () => {
  const rows = [];
  for (let i = 0; i < 10; i++) {
    rows.push(row({ PlayFabId: `100${i}`, Position: i, StatValue: 1000 - i * 10 }));
  }
  board = { Version: 5, Leaderboard: rows };

  const page = await overallLeaderboardPage(0, 10, 5);
  assert.equal(page.entries.length, 10);
  assert.equal(page.nextStart, 10);
});

test("public overall endpoint allows anonymous GET with valid parameters", async () => {
  board = {
    Version: 4,
    Leaderboard: [
      row({ PlayFabId: "A11FACE1", Position: 0, StatValue: 9999, DisplayName: "StarEngineer" }),
    ],
  };
  records.set("A11FACE1", {
    Statistics: [
      { StatisticName: "BridgesCompleted", Value: 15 },
      { StatisticName: "ChallengesCompleted", Value: 6 },
    ],
  });

  const request = new Request(`${origin}${endpoint}?start=0&pageSize=10&version=4`, {
    method: "GET",
  });
  const response = await handleLeaderboardRequest(request);
  assert.ok(response);
  assert.equal(response.status, 200);

  const data = (await response.json()) as {
    entries: Array<Record<string, unknown>>;
    version: number;
    nextStart: number | null;
  };
  assert.equal(data.version, 4);
  assert.equal(data.entries.length, 1);
  assert.ok(data.entries[0]);
  assert.deepEqual(data.entries[0], {
    rank: 1,
    displayName: "StarEngineer",
    totalScore: 9999,
    bridgesCompleted: 15,
    challengesCompleted: 6,
  });

  // Ensure no sensitive fields like playFabId or email are leaked
  const first = data.entries[0] as Record<string, unknown>;
  assert.equal(first["playFabId"], undefined);
  assert.equal(first["email"], undefined);
});

test("public overall endpoint rejects non-GET and unsupported query parameters", async () => {
  const postReq = new Request(`${origin}${endpoint}`, { method: "POST" });
  const postRes = await handleLeaderboardRequest(postReq);
  assert.ok(postRes);
  assert.equal(postRes.status, 405);

  const badParamReq = new Request(`${origin}${endpoint}?contractId=ShopKeeper`, {
    method: "GET",
  });
  const badParamRes = await handleLeaderboardRequest(badParamReq);
  assert.ok(badParamRes);
  assert.equal(badParamRes.status, 400);

  const badPageSizeReq = new Request(`${origin}${endpoint}?pageSize=15`, {
    method: "GET",
  });
  const badPageSizeRes = await handleLeaderboardRequest(badPageSizeReq);
  assert.ok(badPageSizeRes);
  assert.equal(badPageSizeRes.status, 400);

  const badStartReq = new Request(`${origin}${endpoint}?start=abc`, {
    method: "GET",
  });
  const badStartRes = await handleLeaderboardRequest(badStartReq);
  assert.ok(badStartRes);
  assert.equal(badStartRes.status, 400);
});

test("authenticated standing endpoint supports type=overall", async () => {
  board = {
    Version: 3,
    Leaderboard: [
      row({ PlayFabId: "A11FACE1", Position: 4, StatValue: 12000, DisplayName: "MyPlayer" }),
    ],
  };
  records.set("A11FACE1", {
    Statistics: [
      { StatisticName: "BridgesCompleted", Value: 7 },
      { StatisticName: "ChallengesCompleted", Value: 3 },
    ],
  });

  const request = new Request(`${origin}/api/leaderboard/standing?type=overall&version=3`, {
    method: "GET",
    headers: { Authorization: "Bearer valid-ticket" },
  });
  const response = await handleLeaderboardRequest(request);
  assert.ok(response);
  assert.equal(response.status, 200);

  const data = (await response.json()) as {
    rank: number;
    totalScore: number;
    bridgesCompleted: number;
  };
  assert.deepEqual(data, {
    rank: 5,
    totalScore: 12000,
    bridgesCompleted: 7,
  });
});
