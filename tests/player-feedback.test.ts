import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { messageRequest } from "../src/lib/cms/messages.server.ts";
import { BRIDGE_STATISTICS } from "../src/lib/playfab/leaderboard-config.server.ts";
import { limitFeedback } from "../src/lib/cms/feedback-eligibility.server.ts";

const originalFetch = globalThis.fetch;
const env = {
  VITE_PLAYFAB_TITLE_ID: "17FA03",
  PLAYFAB_SECRET_KEY: "feedback-test-canary",
  PLAYFAB_CONTACT_ADMIN_PLAYER_ID: "",
  RESEND_API_KEY: "",
  GMAIL_SMTP_USER: "",
  GMAIL_SMTP_APP_PASSWORD: "",
  SMTP_HOST: "",
  SMTP_PORT: "",
  SMTP_USER: "",
  SMTP_PASSWORD: "",
  SMTP_FROM: "",
};
const savedEnv = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
let statistics: unknown = [],
  storage: Record<string, string> = {},
  outage = false,
  serial = 0,
  owner = "";
const names = Object.values(BRIDGE_STATISTICS).flatMap((pair) => Object.values(pair));
const input = {
  action: "feedback",
  inquiryType: "Gameplay Feedback",
  subject: "Bridge feedback",
  message: "I enjoyed building this bridge.",
};
beforeEach(() => {
  Object.assign(process.env, env);
  statistics = [];
  storage = {};
  outage = false;
  owner = (++serial).toString(16).toUpperCase();
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(new Headers(init?.headers).get("X-SecretKey"), env.PLAYFAB_SECRET_KEY);
    let data: unknown = {};
    if (String(url).endsWith("AuthenticateSessionTicket")) {
      if (body.SessionTicket !== "valid")
        return Response.json({ code: 401, error: "InvalidSessionTicket" }, { status: 401 });
      data = { UserInfo: { PlayFabId: owner } };
    } else if (String(url).endsWith("GetPlayerStatistics")) {
      assert.equal(body.PlayFabId, owner);
      assert.deepEqual(body.StatisticNames, names);
      if (outage) throw new Error("offline");
      data = { Statistics: statistics };
    } else if (String(url).endsWith("GetPlayerProfile")) {
      assert.equal(body.PlayFabId, owner);
      data = { PlayerProfile: { DisplayName: "Test Engineer" } };
    } else if (String(url).endsWith("SetTitleInternalData")) {
      if (body.Value === null) delete storage[body.Key];
      else storage[body.Key] = body.Value;
    } else if (String(url).endsWith("GetTitleInternalData")) data = { Data: { ...storage } };
    else throw new Error("Unexpected upstream operation");
    return Response.json({ code: 200, data });
  };
});
after(() => {
  globalThis.fetch = originalFetch;
  for (const [k, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[k];
    else process.env[k] = value;
  }
});
async function request(
  body?: unknown,
  ticket: string | null = "valid",
  path = "/api/player/messages",
  origin = "https://feedback.test",
) {
  return (await messageRequest(
    new Request("https://feedback.test" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        origin,
        "Content-Type": "application/json",
        ...(ticket ? { Authorization: "Bearer " + ticket } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  ))!;
}
for (const count of [1, 4])
  test(`${count} accepted stored records permit feedback and retain sender/category`, async () => {
    statistics = names
      .slice(0, count)
      .map((StatisticName) => ({ StatisticName, Value: 2147483647 }));
    const response = await request(input);
    assert.equal(response.status, 201);
    const history = await (await request()).json();
    assert.equal(history.messages.length, 1);
    assert.equal(history.messages[0].ownerId, owner);
    assert.equal(history.messages[0].inquiryType, input.inquiryType);
    assert.equal(history.messages[0].name, "Test Engineer");
  });
test("anonymous and invalid sessions cannot create feedback", async () => {
  assert.equal((await request(input, null)).status, 401);
  assert.equal((await request(input, "bad")).status, 401);
  assert.deepEqual(storage, {});
});
test("no records (whether registered or played) deny direct creation", async () => {
  assert.deepEqual(
    await (await request(undefined, "valid", "/api/player/messages?action=eligibility")).json(),
    { eligible: false },
  );
  assert.equal((await request(input)).status, 403);
  assert.deepEqual(storage, {});
});
test("zero, invalid, unknown, and synthetic AroundUser-shaped entries do not qualify", async () => {
  for (const raw of [
    { StatisticName: names[0], Value: 0 },
    { StatisticName: names[0], Value: 1146482646 },
    { StatisticName: names[0], Value: 2147483648 },
    { StatisticName: names[0], Value: 2147483646.5 },
    { StatisticName: names[0], Value: "2147483647" },
    { StatisticName: "TotalScore", Value: 2147483647 },
    { PlayFabId: owner, Position: 0, StatValue: 0 },
  ]) {
    statistics = [raw];
    assert.equal(
      (await (await request(undefined, "valid", "/api/player/messages?action=eligibility")).json())
        .eligible,
      false,
    );
  }
});
test("lower encoded boundary is accepted", async () => {
  statistics = [{ StatisticName: names[0], Value: 1146482647 }];
  assert.equal((await request(input)).status, 201);
});
test("PlayFab outage/malformed statistics fail closed with retry message", async () => {
  outage = true;
  const result = await request(input);
  assert.equal(result.status, 503);
  assert.match((await result.json()).error, /couldn't verify/);
  assert.deepEqual(storage, {});
  outage = false;
  statistics = null;
  assert.equal((await request(input)).status, 503);
});
test("forged ownership, invalid category/length, and cross-origin requests are rejected", async () => {
  statistics = [{ StatisticName: names[0], Value: 2147483647 }];
  for (const body of [
    { ...input, ownerId: "BEEF" },
    { ...input, eligible: true },
    { ...input, inquiryType: "General" },
    { ...input, message: "short" },
  ])
    assert.equal((await request(body)).status, 400);
  assert.equal(
    (await request(input, "valid", "/api/player/messages", "https://evil.test")).status,
    403,
  );
  assert.deepEqual(storage, {});
});
test("public endpoint rejects all old/new feedback categories and accepts general inquiries", async () => {
  const contact = {
    name: "Visitor",
    email: "visitor@example.test",
    subject: input.subject,
    message: input.message,
    inquiryType: "General",
  };
  for (const inquiryType of [
    "Feedback",
    "Bug Report",
    "Gameplay Feedback",
    "Suggestion",
    "Other Game Feedback",
  ])
    assert.equal((await request({ ...contact, inquiryType }, null, "/api/contact")).status, 400);
  assert.equal((await request(contact, null, "/api/contact")).status, 201);
});
test("history/replies/status remain accessible without run records, including during outage", async () => {
  statistics = [{ StatisticName: names[0], Value: 2147483647 }];
  const { id } = await (await request(input)).json();
  statistics = [];
  outage = true;
  assert.equal((await request({ action: "reply", id, message: "Another detail" })).status, 201);
  assert.equal(
    (await messageRequest(
      new Request("https://feedback.test/api/admin/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reply", id, message: "Team response" }),
      }),
      true,
    ))!.status,
    201,
  );
  assert.equal(
    (await messageRequest(
      new Request("https://feedback.test/api/admin/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status", id, status: "Resolved" }),
      }),
      true,
    ))!.status,
    200,
  );
  const history = await (await request()).json();
  assert.equal(history.messages[0].replies.length, 2);
  assert.equal(history.messages[0].status, "Resolved");
  owner = "FFFF";
  assert.equal((await (await request()).json()).messages.length, 0);
  assert.equal((await request({ action: "reply", id, message: "Unauthorized" })).status, 404);
});
test("feedback creation attempts are rate limited independently per account", async () => {
  for (let i = 0; i < 5; i++) assert.equal((await request(input)).status, 403);
  assert.equal((await request(input)).status, 429);
  owner = "EEEE";
  assert.equal((await request(input)).status, 403);
});
test("rate limit expires after its window", () => {
  for (let i = 0; i < 5; i++) limitFeedback("expiry-test", 100);
  assert.throws(() => limitFeedback("expiry-test", 101));
  assert.doesNotThrow(() => limitFeedback("expiry-test", 900101));
});
