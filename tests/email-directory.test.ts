import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { randomUUID } from "node:crypto";
import {
  filterSortPlayers,
  defaultDirectoryOptions,
} from "../src/lib/playfab/directory-filters.ts";
import { mapIdentity } from "../src/lib/playfab/admin-players.server.ts";
import {
  handleEmailRequest,
  dispatchNotifications,
  recoverAccount,
  recoveryMessage,
} from "../src/lib/email/api.server.ts";
import { emailDelivery } from "../src/lib/email/delivery.server.ts";
import { readExportPage } from "../src/lib/playfab/admin-directory.server.ts";
import { changeUpdate } from "../src/lib/cms/content.server.ts";

const now = Date.parse("2026-09-15T00:00:00Z"),
  day = 86400000;
const players = Array.from({ length: 53 }, (_, i) => ({
  ...mapIdentity({
    PlayFabId: (i + 1).toString(16),
    TitleInfo: {
      DisplayName: `Engineer ${String(52 - i).padStart(2, "0")}`,
      Created: new Date(now - i * day).toISOString(),
      LastLogin: new Date(now - i * day).toISOString(),
      isBanned: i % 2 === 0,
    },
  }),
}));
test("full directory sorts/filter before 20-row pagination", () => {
  const source = [...players].reverse();
  const recent = filterSortPlayers(source, defaultDirectoryOptions, now);
  assert.deepEqual(
    recent.slice(0, 20).map((p) => p.playFabId),
    players.slice(0, 20).map((p) => p.playFabId),
  );
  assert.deepEqual(
    recent.slice(20, 40).map((p) => p.playFabId),
    players.slice(20, 40).map((p) => p.playFabId),
  );
  assert.equal(
    filterSortPlayers(source, { ...defaultDirectoryOptions, sort: "newest" }, now)[0]!.playFabId,
    players[0]!.playFabId,
  );
  assert.equal(
    filterSortPlayers(source, { ...defaultDirectoryOptions, sort: "oldest" }, now)[0]!.playFabId,
    players[52]!.playFabId,
  );
  assert.equal(
    filterSortPlayers(source, { ...defaultDirectoryOptions, sort: "nameAsc" }, now)[0]!.displayName,
    "Engineer 00",
  );
  assert.equal(
    filterSortPlayers(source, { ...defaultDirectoryOptions, sort: "nameDesc" }, now)[0]!
      .displayName,
    "Engineer 52",
  );
  assert.equal(
    filterSortPlayers(source, { ...defaultDirectoryOptions, status: "active" }, now).length,
    26,
  );
  assert.equal(
    filterSortPlayers(source, { ...defaultDirectoryOptions, status: "banned" }, now).length,
    27,
  );
  assert.equal(
    filterSortPlayers(source, { ...defaultDirectoryOptions, activity: "recent" }, now).length,
    8,
  );
  assert.equal(
    filterSortPlayers(source, { ...defaultDirectoryOptions, activity: "inactive" }, now).length,
    22,
  );
  assert.equal(
    filterSortPlayers(
      source,
      { ...defaultDirectoryOptions, status: "banned", activity: "recent" },
      now,
    ).length,
    4,
  );
});
test("missing dates sort last and never-login inactivity does not imply banned", () => {
  const unknown = {
    ...players[0]!,
    playFabId: "FFFF",
    lastActive: null,
    createdAt: "invalid",
    accountStatus: null,
  };
  for (const sort of ["recent", "newest", "oldest"] as const)
    assert.equal(
      filterSortPlayers([unknown, ...players], { ...defaultDirectoryOptions, sort }, now).at(-1)!
        .playFabId,
      "FFFF",
    );
  assert.equal(
    filterSortPlayers([unknown], { ...defaultDirectoryOptions, activity: "inactive" }, now).length,
    1,
  );
  assert.equal(
    filterSortPlayers([unknown], { ...defaultDirectoryOptions, status: "active" }, now).length,
    0,
  );
});
test("export ban flags and real statistics are retained without row enrichment", () => {
  const rows = readExportPage(
    Buffer.from(
      'PlayerId\tDisplayName\tisBanned\tPlayerStatistics\nAA\tA\ttrue\t[{"Name":"CurrentLevel","StatisticValue":3}]\nBB\tB\tfalse\tnull\n',
    ),
    true,
    null,
  ).players;
  assert.equal(rows[0]!.accountStatus, "banned");
  assert.equal(rows[1]!.accountStatus, "active");
  assert.equal(rows[0]!.level, 3);
  assert.equal(rows[1]!.level, null);
});

const env = {
  VITE_PLAYFAB_TITLE_ID: "17FA03",
  PLAYFAB_SECRET_KEY: "email-test-canary",
  PLAYFAB_RECOVERY_EMAIL_TEMPLATE_ID: "recovery-test",
  PLAYFAB_RELEASE_EMAIL_TEMPLATE_ID: "release-test",
  BLOB_READ_WRITE_TOKEN: "blob-test-only",
  CRON_SECRET: "cron-test-only",
};
const prior = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
const originalFetch = globalThis.fetch,
  originalDelivery = { ...emailDelivery };
let data: Record<string, string> = {},
  claims = new Set<string>(),
  sent: string[] = [],
  recoveryCalls: { body: Record<string, unknown>; headers: Headers }[] = [];
let recoveryCode = 200,
  contacts = true,
  failSend = false;
beforeEach(() => {
  Object.assign(process.env, env);
  data = {};
  claims = new Set();
  sent = [];
  recoveryCalls = [];
  recoveryCode = 200;
  contacts = true;
  failSend = false;
  globalThis.fetch = async (input, init) => {
    const path = String(input),
      body = JSON.parse(String(init?.body));
    if (path.endsWith("SendAccountRecoveryEmail")) {
      recoveryCalls.push({ body, headers: new Headers(init?.headers) });
      return Response.json(
        { code: recoveryCode, errorMessage: "Account does not exist" },
        { status: recoveryCode },
      );
    }
    if (path.endsWith("SetTitleInternalData")) data[body.Key] = body.Value;
    const result = path.endsWith("AuthenticateSessionTicket")
      ? { UserInfo: { PlayFabId: body.SessionTicket === "player-b" ? "BBB" : "AAA" } }
      : path.endsWith("GetPlayerProfile")
        ? {
            PlayerProfile: {
              ContactEmailAddresses: contacts
                ? [{ EmailAddress: "player@example.test", VerificationStatus: "Confirmed" }]
                : [],
            },
          }
        : { Data: { ...data } };
    return Response.json({ code: 200, data: result });
  };
  emailDelivery.claim = async (update, player) => {
    const key = update + ":" + player;
    if (claims.has(key)) return false;
    claims.add(key);
    return true;
  };
  emailDelivery.send = async (player) => {
    sent.push(player);
    if (failSend) throw new Error("ambiguous provider timeout");
  };
});
after(() => {
  globalThis.fetch = originalFetch;
  Object.assign(emailDelivery, originalDelivery);
  for (const [k, v] of Object.entries(prior)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
test("recovery relays Client API title/email/template without a secret and conceals account existence", async () => {
  process.env["PLAYFAB_RECOVERY_EMAIL_TEMPLATE_ID"] = "  recovery-test  ";
  assert.deepEqual(await recoverAccount("player@example.test"), { message: recoveryMessage });
  recoveryCode = 400;
  assert.deepEqual(await recoverAccount("missing@example.test"), { message: recoveryMessage });
  assert.equal(recoveryCalls[0]!.body["TitleId"], "17FA03");
  assert.equal(recoveryCalls[0]!.body["EmailTemplateId"], "recovery-test");
  assert.equal(recoveryCalls[0]!.body["Email"], "player@example.test");
  assert.ok(recoveryCalls.every((call) => call.body["EmailTemplateId"] === "recovery-test"));
  assert.equal(recoveryCalls[0]!.headers.has("X-SecretKey"), false);
  await assert.rejects(recoverAccount(""), /valid email/);
  assert.equal(recoveryCalls.length, 2);
});
test("missing or blank recovery template logs safely and never requests a default email", async () => {
  const originalError = console.error;
  const logs: unknown[][] = [];
  console.error = (...args) => {
    logs.push(args);
  };
  try {
    for (const template of [undefined, "", "   "]) {
      if (template === undefined) delete process.env["PLAYFAB_RECOVERY_EMAIL_TEMPLATE_ID"];
      else process.env["PLAYFAB_RECOVERY_EMAIL_TEMPLATE_ID"] = template;
      const response = await handleEmailRequest(
        new Request("https://site.test/api/email/recovery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "player@example.test" }),
        }),
      );
      assert.equal(response?.status, 200);
      assert.deepEqual(await response!.json(), { message: recoveryMessage });
    }
    assert.equal(recoveryCalls.length, 0);
    assert.equal(logs.length, 3);
    assert.match(JSON.stringify(logs), /not configured/);
    assert.ok(!JSON.stringify(logs).includes("player@example.test"));
    assert.ok(!JSON.stringify(logs).includes(env.PLAYFAB_SECRET_KEY));
  } finally {
    console.error = originalError;
  }
});
async function pref(ticket: string, value?: unknown) {
  return (await handleEmailRequest(
    new Request("https://site.test/api/player/email-preference", {
      method: value === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${ticket}`, "Content-Type": "application/json" },
      ...(value === undefined
        ? {}
        : { body: JSON.stringify({ emailUpdates: value, playFabId: "FORGED" }) }),
    }),
  ))!;
}
test("email preference persists centrally, defaults off and uses verified session identity", async () => {
  assert.deepEqual(await (await pref("player-a")).json(), { emailUpdates: false });
  assert.equal((await pref("player-a", true)).status, 200);
  assert.deepEqual(await (await pref("player-a")).json(), { emailUpdates: true });
  assert.deepEqual(await (await pref("player-b")).json(), { emailUpdates: false });
  assert.equal(data["civilcraft.email.preference.FORGED"], undefined);
  await pref("player-a", false);
  assert.deepEqual(await (await pref("player-a")).json(), { emailUpdates: false });
  assert.equal((await pref("player-a", "true")).status, 400);
  assert.equal(
    (await handleEmailRequest(new Request("https://site.test/api/player/email-preference")))!
      .status,
    401,
  );
});
function article(status = "published", publishedAt = "2026-09-01T00:00:00.000Z") {
  const id = randomUUID();
  data[`civilcraft.website.v1.updates.${id}`] = JSON.stringify({
    id,
    slug: "release-" + id,
    title: "Release",
    category: "Game Updates",
    excerpt: "Real release",
    content: "Real content",
    status,
    publishedAt,
    notificationPublishedAt: publishedAt,
    coverUrl: "",
    coverAlt: "",
  });
  return id;
}
function subscribe(id = "AAA", enabled = true) {
  data[`civilcraft.email.preference.${id}`] = JSON.stringify({
    emailUpdates: enabled,
    subscribedAt: "2026-01-01T00:00:00.000Z",
  });
}
test("worker only sends published updates to opted-in confirmed contacts; retries/concurrency do not duplicate", async () => {
  article();
  article("draft");
  article("published", "2099-01-01T00:00:00.000Z");
  subscribe();
  subscribe("BBB", false);
  await Promise.all([dispatchNotifications(), dispatchNotifications()]);
  await dispatchNotifications();
  assert.deepEqual(sent, ["AAA"]);
});
test("unavailable contact, opt-out and pre-subscription news do not send optional mail", async () => {
  article();
  subscribe();
  contacts = false;
  await dispatchNotifications();
  assert.equal(sent.length, 0);
  contacts = true;
  subscribe("AAA", false);
  await dispatchNotifications();
  assert.equal(sent.length, 0);
  data["civilcraft.email.preference.AAA"] = JSON.stringify({
    emailUpdates: true,
    subscribedAt: "2026-10-01T00:00:00.000Z",
  });
  await dispatchNotifications();
  assert.equal(sent.length, 0);
});
test("uncertain delivery remains claimed and worker rejects unauthenticated triggers", async () => {
  article();
  subscribe();
  failSend = true;
  assert.equal((await dispatchNotifications()).uncertain, 1);
  await dispatchNotifications();
  assert.equal(sent.length, 1);
  assert.equal(
    (await handleEmailRequest(
      new Request("https://site.test/api/email/dispatch", { method: "POST" }),
    ))!.status,
    401,
  );
});

test("only publication transitions create notification eligibility; edits do not reannounce archives", async () => {
  const legacy = article();
  const key = `civilcraft.website.v1.updates.${legacy}`;
  const old = JSON.parse(data[key]!);
  delete old.notificationPublishedAt;
  data[key] = JSON.stringify(old);
  await changeUpdate({ ...old, action: "save", title: "Edited archive" });
  assert.equal(JSON.parse(data[key]!).notificationPublishedAt, undefined);
  const draft = (await changeUpdate({
    ...old,
    id: undefined,
    action: "save",
    status: "draft",
  })) as { id: string };
  const draftKey = `civilcraft.website.v1.updates.${draft.id}`;
  assert.equal(JSON.parse(data[draftKey]!).notificationPublishedAt, undefined);
  await changeUpdate({ ...JSON.parse(data[draftKey]!), action: "save", status: "published" });
  const first = JSON.parse(data[draftKey]!).notificationPublishedAt;
  assert.ok(Number.isFinite(Date.parse(first)));
  await changeUpdate({
    ...JSON.parse(data[draftKey]!),
    action: "save",
    title: "Edited announcement",
  });
  assert.equal(JSON.parse(data[draftKey]!).notificationPublishedAt, first);
});
