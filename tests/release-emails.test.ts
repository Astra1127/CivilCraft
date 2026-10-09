import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { BlobError, BlobNotFoundError } from "@vercel/blob";
import nodemailer from "nodemailer";
import { handleEmailRequest } from "../src/lib/email/api.server.ts";
import { emailDelivery } from "../src/lib/email/delivery.server.ts";
import {
  createVersionAnnouncement,
  dispatchVersionNotifications,
  releaseEmailReadiness,
  releaseEmailStorage,
  renderVersionEmail,
  versionAnnouncementSchema,
  versionEmailDelivery,
  type VersionAnnouncement,
} from "../src/lib/email/release-notifications.server.ts";

const configKey = "civilcraft.website.v1.release-config";
const releasePrefix = "civilcraft.website.v1.releases.";
const preferencePrefix = "civilcraft.email.preference.";
const smtpKeys = [
  "GMAIL_SMTP_HOST",
  "GMAIL_SMTP_PORT",
  "GMAIL_SMTP_SECURE",
  "GMAIL_SMTP_USER",
  "GMAIL_SMTP_APP_PASSWORD",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_PASSWORD",
  "SMTP_FROM",
  "EMAIL_FROM",
];
const env = {
  VITE_PLAYFAB_TITLE_ID: "17FA03",
  PLAYFAB_SECRET_KEY: "release-email-server-test-secret",
  CRON_SECRET: "release-email-cron-test-secret",
  BLOB_STORE_ID: "store_release_test",
  VERCEL_OIDC_TOKEN: "release-test-oidc-placeholder",
  PUBLIC_SITE_URL: "https://releases.test",
  ADMIN_AUTH_ORIGIN: "https://releases.test",
  PLAYFAB_RELEASE_EMAIL_TEMPLATE_ID: "release-template-test",
  GMAIL_SMTP_USER: "sender@example.test",
  GMAIL_SMTP_APP_PASSWORD: "test-app-password",
};
const envKeys = [...new Set([...Object.keys(env), ...smtpKeys, "BLOB_READ_WRITE_TOKEN"])];
const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
const originalNow = Date.now;
const originalDelivery = { ...versionEmailDelivery };
const originalStorage = { ...releaseEmailStorage };
const originalLegacySend = emailDelivery.send;
const requestContextSymbol = Symbol.for("@vercel/request-context");
const originalRequestContext = Object.getOwnPropertyDescriptor(globalThis, requestContextSymbol);
let records: Record<string, string> = {};
let claims = new Set<string>();
let sent: { event: VersionAnnouncement; player: string; email: string }[] = [];
let dataReads = 0;
let profileReads = 0;
let profiles = new Map<string, unknown[]>();
let onProfile: (() => void) | undefined;

beforeEach(() => {
  Reflect.deleteProperty(globalThis, requestContextSymbol);
  for (const key of envKeys) delete process.env[key];
  Object.assign(process.env, env);
  records = {};
  claims = new Set();
  sent = [];
  dataReads = 0;
  profileReads = 0;
  profiles = new Map();
  onProfile = undefined;
  globalThis.fetch = async (input, init) => {
    const path = String(input);
    assert.match(
      path,
      /^https:\/\/17FA03\.playfabapi\.com\/(Admin\/(GetTitleInternalData|SetTitleInternalData)|Server\/GetPlayerProfile)$/,
    );
    const body = JSON.parse(String(init?.body));
    if (path.endsWith("SetTitleInternalData")) {
      records[body.Key] = body.Value;
      return Response.json({ code: 200, data: {} });
    }
    if (path.endsWith("GetPlayerProfile")) {
      profileReads++;
      onProfile?.();
      return Response.json({
        code: 200,
        data: {
          PlayerProfile: {
            ContactEmailAddresses: profiles.get(body.PlayFabId) ?? [
              { EmailAddress: "player@example.test", VerificationStatus: "Confirmed" },
            ],
          },
        },
      });
    }
    dataReads++;
    const result = body.Keys
      ? Object.fromEntries(
          body.Keys.filter((key: string) => key in records).map((key: string) => [
            key,
            records[key],
          ]),
        )
      : { ...records };
    return Response.json({ code: 200, data: { Data: result } });
  };
  versionEmailDelivery.claim = async (event, player) => {
    const key = `${event.titleId.toUpperCase()}:${event.version}:${player.toUpperCase()}`;
    if (claims.has(key)) return false;
    claims.add(key);
    return true;
  };
  versionEmailDelivery.send = async (event, player, email) => {
    sent.push({ event, player, email });
  };
});
afterEach(() => {
  if (originalRequestContext)
    Object.defineProperty(globalThis, requestContextSymbol, originalRequestContext);
  else Reflect.deleteProperty(globalThis, requestContextSymbol);
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
  Object.assign(versionEmailDelivery, originalDelivery);
  Object.assign(releaseEmailStorage, originalStorage);
  emailDelivery.send = originalLegacySend;
});
after(() => {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function announce(version = "1.2.0", releaseId = "release-1", build = "120") {
  const event = createVersionAnnouncement({ releaseId, version, build });
  records[configKey] = JSON.stringify({ currentId: releaseId, notification: event });
  records[releasePrefix + releaseId] = JSON.stringify({
    id: releaseId,
    version,
    build,
    fileUrl: "https://legacy.test/game.apk",
    notes: "private-draft-notes-canary",
  });
  return event;
}
function subscribe(id = "AAA", enabled = true, subscribedAt = "2026-01-01T00:00:00.000Z") {
  records[preferencePrefix + id] = JSON.stringify({ emailUpdates: enabled, subscribedAt });
}
async function request(method = "GET", authorization?: string) {
  const response = await handleEmailRequest(
    new Request("https://releases.test/api/email/releases/dispatch", {
      method,
      ...(authorization ? { headers: { Authorization: authorization } } : {}),
    }),
  );
  assert.ok(response);
  return response;
}

test("announcement identities are server-owned, per-title/version, and reject forged or invalid records", () => {
  const event = createVersionAnnouncement({ releaseId: "r1", version: " 1.2.0 ", build: "120" });
  const sameVersion = createVersionAnnouncement({
    releaseId: "r2",
    version: "1.2.0",
    build: "121",
  });
  assert.equal(event.id, sameVersion.id);
  assert.equal(event.version, "1.2.0");
  assert.notEqual(
    event.id,
    createVersionAnnouncement({ releaseId: "r1", version: "1.3.0", build: "130" }).id,
  );
  process.env["VITE_PLAYFAB_TITLE_ID"] = "ABC123";
  assert.notEqual(
    event.id,
    createVersionAnnouncement({ releaseId: "r1", version: "1.2.0", build: "120" }).id,
  );
  for (const invalid of [
    { ...event, id: "0".repeat(64) },
    { ...event, announcedAtISO: "not-a-date" },
    { ...event, releaseId: "../draft" },
    { ...event, recipient: "forged@example.test" },
  ])
    assert.equal(versionAnnouncementSchema.safeParse(invalid).success, false);
});

test("readiness requires worker authentication, PlayFab access, OIDC storage and valid SMTP settings", () => {
  assert.deepEqual(releaseEmailReadiness(), {
    configured: true,
    provider: "Gmail SMTP",
    message: "Version notifications are ready for the authenticated worker.",
  });
  for (const key of ["CRON_SECRET", "PLAYFAB_SECRET_KEY", "BLOB_STORE_ID", "VERCEL_OIDC_TOKEN"]) {
    delete process.env[key];
    assert.equal(releaseEmailReadiness().configured, false, key);
    Object.assign(process.env, env);
  }
  for (const [key, value] of [
    ["GMAIL_SMTP_PORT", "not-a-port"],
    ["GMAIL_SMTP_PORT", "65536"],
    ["GMAIL_SMTP_SECURE", "yes"],
    ["GMAIL_SMTP_USER", "bad-address"],
    ["GMAIL_SMTP_HOST", "https://smtp.test"],
  ]) {
    process.env[key!] = value!;
    assert.equal(releaseEmailReadiness().configured, false, key);
    for (const name of smtpKeys) delete process.env[name];
    Object.assign(process.env, env);
  }
});

test("readiness detects request-context OIDC without an environment token or network calls", () => {
  delete process.env["VERCEL_OIDC_TOKEN"];
  assert.equal(releaseEmailReadiness().configured, false);
  globalThis.fetch = async () => {
    throw new Error("Readiness must not make network requests");
  };
  Object.defineProperty(globalThis, requestContextSymbol, {
    configurable: true,
    value: { get: () => ({ headers: { "x-vercel-oidc-token": "context-token-test-canary" } }) },
  });
  const readiness = releaseEmailReadiness();
  assert.equal(readiness.configured, true);
  assert.ok(!JSON.stringify(readiness).includes("context-token-test-canary"));
  assert.equal(dataReads, 0);
  assert.equal(profileReads, 0);
  Object.defineProperty(globalThis, requestContextSymbol, {
    configurable: true,
    value: {
      get: () => {
        throw new Error("private-context-error-canary");
      },
    },
  });
  const unavailable = releaseEmailReadiness();
  assert.equal(unavailable.configured, false);
  assert.ok(!JSON.stringify(unavailable).includes("private-context-error-canary"));
});

test("partial SMTP settings fail closed; PlayFab fallback is selected only when SMTP is entirely absent", async () => {
  announce();
  subscribe();
  delete process.env["GMAIL_SMTP_APP_PASSWORD"];
  assert.equal(releaseEmailReadiness().configured, false);
  await assert.rejects(dispatchVersionNotifications(), /incomplete or invalid/);
  assert.equal(dataReads, 0);
  assert.equal(claims.size, 0);
  for (const key of smtpKeys) delete process.env[key];
  assert.equal(releaseEmailReadiness().provider, "PlayFab template");
  assert.equal(releaseEmailReadiness().configured, true);
  delete process.env["PLAYFAB_RELEASE_EMAIL_TEMPLATE_ID"];
  assert.equal(releaseEmailReadiness().configured, false);
});

test("version email escapes labels, uses canonical website links and never includes draft notes", () => {
  const event = createVersionAnnouncement({
    releaseId: "r1",
    version: '<b>1.2</b> & "X"',
    build: "<script>bad</script>",
  });
  const message = renderVersionEmail({
    ...event,
    notes: "private-draft-notes-canary",
  } as VersionAnnouncement);
  assert.match(message.html, /&lt;b&gt;1\.2&lt;\/b&gt; &amp; &quot;X&quot;/);
  assert.doesNotMatch(message.html, /<script>|private-draft-notes-canary/);
  assert.match(message.html, /https:\/\/releases\.test\/download/);
  assert.match(message.html, /https:\/\/releases\.test\/dashboard\/settings/);
  assert.match(message.text, /Version:.*1\.2/);
  for (const origin of [
    "http://releases.test",
    "https://user:password@releases.test",
    "https://releases.test/path",
    "https://releases.test/?tracking=1",
  ]) {
    process.env["PUBLIC_SITE_URL"] = origin;
    assert.equal(releaseEmailReadiness().configured, false);
    assert.throws(() => renderVersionEmail(event), /canonical HTTPS/);
  }
});

test("the dedicated GET/POST worker authenticates before reads and never dispatches legacy news", async () => {
  for (const method of ["GET", "POST"]) {
    assert.equal((await request(method)).status, 401);
    assert.equal((await request(method, "Bearer wrong-secret")).status, 401);
  }
  assert.equal(dataReads, 0);
  assert.equal((await request("DELETE", `Bearer ${env.CRON_SECRET}`)).status, 405);
  assert.equal(dataReads, 0);
  records["civilcraft.website.v1.updates.legacy"] = JSON.stringify({
    id: "legacy",
    status: "published",
    notificationPublishedAt: "2026-01-01T00:00:00.000Z",
  });
  subscribe();
  for (const method of ["GET", "POST"]) {
    const response = await request(method, `Bearer ${env.CRON_SECRET}`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      sent: 0,
      skipped: 0,
      uncertain: 0,
      nextOffset: 0,
      remaining: 0,
    });
  }
  assert.equal(sent.length, 0);
  const cron = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.deepEqual(cron.crons, [{ path: "/api/email/releases/dispatch", schedule: "0 1 * * *" }]);
});

test("only current-version opted-in players with confirmed contact addresses receive email", async () => {
  const event = announce();
  subscribe("AAA");
  subscribe("BBB", false);
  subscribe("CCC", true, "2099-01-01T00:00:00.000Z");
  subscribe("DDD");
  subscribe("EEE");
  profiles.set("DDD", [{ EmailAddress: "unverified@example.test", VerificationStatus: "Pending" }]);
  profiles.set("EEE", [{ EmailAddress: "not-an-email", VerificationStatus: "Confirmed" }]);
  const result = await dispatchVersionNotifications();
  assert.equal(result.sent, 1);
  assert.equal(result.skipped, 2);
  assert.equal(result.remaining, 0);
  assert.deepEqual(sent, [{ event, player: "AAA", email: "player@example.test" }]);
  assert.equal(profileReads, 3);
});

test("concurrent workers, retries, and another build of the same version never duplicate delivery", async () => {
  announce();
  subscribe();
  await Promise.all([dispatchVersionNotifications(), dispatchVersionNotifications()]);
  await dispatchVersionNotifications();
  assert.equal(sent.length, 1);
  announce("1.2.0", "another-build", "121");
  await dispatchVersionNotifications();
  assert.equal(sent.length, 1);
  announce("1.3.0", "another-build", "130");
  await dispatchVersionNotifications();
  assert.equal(sent.length, 2);
});

test("ambiguous delivery failures retain claims and expose only aggregate counts", async () => {
  announce();
  subscribe();
  let attempts = 0;
  versionEmailDelivery.send = async () => {
    attempts++;
    throw new Error("private-address@example.test provider-password-canary");
  };
  const response = await request("POST", `Bearer ${env.CRON_SECRET}`);
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.equal(JSON.parse(text).uncertain, 1);
  assert.doesNotMatch(text, /private-address|provider-password|player@example/);
  assert.equal(claims.size, 1);
  await dispatchVersionNotifications();
  assert.equal(attempts, 1);
});

test("recipient bounds resume deterministically even when a previously processed player opts out", async () => {
  announce();
  subscribe("1");
  subscribe("2");
  subscribe("3");
  const first = await dispatchVersionNotifications({ maxRecipients: 1 });
  assert.equal(first.remaining, 2);
  subscribe("1", false);
  const second = await dispatchVersionNotifications({ maxRecipients: 1 });
  assert.equal(second.remaining, 1);
  await dispatchVersionNotifications({ maxRecipients: 1 });
  assert.deepEqual(
    sent.map((mail) => mail.player),
    ["1", "2", "3"],
  );
  assert.equal(
    JSON.parse(records[configKey]!).currentId,
    "release-1",
    "The cursor must never rewrite release configuration",
  );
});

test("reactivating a version resets its cursor for new subscribers while permanent claims protect previous recipients", async () => {
  const first = announce();
  first.announcedAtISO = "2026-01-10T00:00:00.000Z";
  records[configKey] = JSON.stringify({ currentId: first.releaseId, notification: first });
  subscribe("BBB");
  subscribe("AAA", true, "2026-02-01T00:00:00.000Z");
  assert.equal((await dispatchVersionNotifications()).sent, 1);
  assert.deepEqual(
    sent.map((mail) => mail.player),
    ["BBB"],
  );
  const reactivated = announce("1.2.0", "reactivated", "121");
  reactivated.announcedAtISO = "2026-03-10T00:00:00.000Z";
  records[configKey] = JSON.stringify({
    currentId: reactivated.releaseId,
    notification: reactivated,
  });
  assert.equal(reactivated.id, first.id);
  const result = await dispatchVersionNotifications();
  assert.equal(result.sent, 1);
  assert.equal(result.skipped, 1);
  assert.deepEqual(
    sent.map((mail) => mail.player),
    ["BBB", "AAA"],
  );
  assert.equal(claims.size, 2);
  const cursor = JSON.parse(records["civilcraft.email.version-cursor." + reactivated.id]!);
  assert.equal(cursor.announcedAtISO, reactivated.announcedAtISO);
});

test("switching builds within the same announcement keeps its timestamp-bound cursor", async () => {
  const first = announce();
  subscribe("BBB");
  subscribe("CCC");
  assert.equal((await dispatchVersionNotifications({ maxRecipients: 1 })).remaining, 1);
  const switched = announce("1.2.0", "another-build", "121");
  switched.announcedAtISO = first.announcedAtISO;
  records[configKey] = JSON.stringify({ currentId: switched.releaseId, notification: switched });
  const result = await dispatchVersionNotifications({ maxRecipients: 1 });
  assert.equal(result.sent, 1);
  assert.equal(result.skipped, 0);
  assert.equal(result.remaining, 0);
  assert.deepEqual(
    sent.map((mail) => mail.player),
    ["BBB", "CCC"],
  );
  assert.equal(profileReads, 2);
});

test("a time budget exhausted by a profile lookup leaves the recipient unclaimed for the next batch", async () => {
  announce();
  subscribe();
  let clock = originalNow();
  Date.now = () => clock;
  onProfile = () => {
    clock += 1000;
  };
  const stopped = await dispatchVersionNotifications({ timeBudgetMs: 100 });
  assert.equal(stopped.sent, 0);
  assert.equal(stopped.remaining, 1);
  assert.equal(claims.size, 0);
  onProfile = undefined;
  assert.equal((await dispatchVersionNotifications()).sent, 1);
});

test("superseded, deleted, missing, future and wrong-title announcements do not send", async () => {
  subscribe();
  for (const scenario of ["superseded", "deleted", "missing", "future", "wrong-title"]) {
    records = { [preferencePrefix + "AAA"]: records[preferencePrefix + "AAA"]! };
    const event = announce();
    if (scenario === "superseded")
      records[releasePrefix + event.releaseId] = JSON.stringify({
        id: event.releaseId,
        version: "newer",
        build: event.build,
        fileUrl: "https://legacy.test/game.apk",
      });
    if (scenario === "deleted")
      records["civilcraft.website.v1.release-deleted." + event.releaseId] = JSON.stringify({
        deletedAt: new Date().toISOString(),
      });
    if (scenario === "missing") delete records[releasePrefix + event.releaseId];
    if (scenario === "future")
      records[configKey] = JSON.stringify({
        currentId: event.releaseId,
        notification: { ...event, announcedAtISO: "2099-01-01T00:00:00.000Z" },
      });
    if (scenario === "wrong-title") {
      process.env["VITE_PLAYFAB_TITLE_ID"] = "ABC123";
      const wrongTitle = createVersionAnnouncement({
        releaseId: event.releaseId,
        version: event.version,
        build: event.build,
      });
      process.env["VITE_PLAYFAB_TITLE_ID"] = env.VITE_PLAYFAB_TITLE_ID;
      records[configKey] = JSON.stringify({ currentId: event.releaseId, notification: wrongTitle });
    }
    assert.equal((await dispatchVersionNotifications()).sent, 0, scenario);
    process.env["VITE_PLAYFAB_TITLE_ID"] = env.VITE_PLAYFAB_TITLE_ID;
  }
  assert.equal(profileReads, 0);
  assert.equal(claims.size, 0);
});

test("consent and release state are rechecked after profile lookup and after the durable claim", async () => {
  const event = announce();
  subscribe();
  onProfile = () => subscribe("AAA", false);
  await dispatchVersionNotifications();
  assert.equal(sent.length, 0);
  assert.equal(claims.size, 0);
  records = {};
  announce();
  subscribe();
  onProfile = undefined;
  const memoryClaim = versionEmailDelivery.claim;
  versionEmailDelivery.claim = async (announcement, player) => {
    const claimed = await memoryClaim(announcement, player);
    records["civilcraft.website.v1.release-deleted." + event.releaseId] = "deleted";
    return claimed;
  };
  await dispatchVersionNotifications();
  assert.equal(sent.length, 0);
  assert.equal(claims.size, 1, "Cancellation after claiming must not remove duplicate protection");
  records = {};
  const next = announce("1.3.0");
  subscribe();
  versionEmailDelivery.claim = async (announcement, player) => {
    const claimed = await memoryClaim(announcement, player);
    subscribe(player, false);
    return claimed;
  };
  await dispatchVersionNotifications();
  assert.equal(sent.length, 0);
  assert.equal(claims.size, 2);
  assert.equal(
    await memoryClaim(next, "AAA"),
    false,
    "An opt-out during the claim must retain the permanent claim",
  );
});

test("real claim adapter uses private create-only OIDC SDK options and verifies typed duplicate failures", async () => {
  const event = announce();
  const writes: { pathname: string; options: unknown }[] = [];
  let duplicate = false;
  releaseEmailStorage.put = async (pathname, _body, options) => {
    writes.push({ pathname, options });
    if (duplicate) throw new BlobError("Provider conflict message is deliberately not interpreted");
    return { pathname } as Awaited<ReturnType<typeof releaseEmailStorage.put>>;
  };
  releaseEmailStorage.head = async (pathname) =>
    ({ pathname, contentType: "application/json", size: 40 }) as Awaited<
      ReturnType<typeof releaseEmailStorage.head>
    >;
  assert.equal(await originalDelivery.claim(event, "AAA"), true);
  duplicate = true;
  assert.equal(await originalDelivery.claim(event, "AAA"), false);
  assert.equal(writes[0]!.pathname, writes[1]!.pathname);
  const options = writes[0]!.options as Record<string, unknown>;
  assert.equal(options["access"], "private");
  assert.equal(options["allowOverwrite"], false);
  assert.equal(options["addRandomSuffix"], false);
  assert.equal(Object.hasOwn(options, "token"), false);
  releaseEmailStorage.head = async () => {
    throw new BlobNotFoundError();
  };
  await assert.rejects(originalDelivery.claim(event, "BBB"), BlobError);
  let lookup = false;
  releaseEmailStorage.put = async () => {
    throw new Error("already exists");
  };
  releaseEmailStorage.head = async () => {
    lookup = true;
    throw new Error("must not inspect untyped errors");
  };
  await assert.rejects(originalDelivery.claim(event, "CCC"), /already exists/);
  assert.equal(lookup, false);
});

test("SMTP sender uses version branding, closes transport, and never falls back after provider failure", async (t) => {
  const event = announce();
  const mails: Record<string, unknown>[] = [];
  let closed = 0;
  let failed = false;
  let fallback = 0;
  emailDelivery.send = async () => {
    fallback++;
  };
  t.mock.method(nodemailer, "createTransport", () => ({
    sendMail: async (mail: Record<string, unknown>) => {
      mails.push(mail);
      if (failed) throw new Error("SMTP provider timeout");
    },
    close: () => {
      closed++;
    },
  }));
  await originalDelivery.send(event, "AAA", "verified@example.test");
  assert.equal(mails[0]!["to"], "verified@example.test");
  assert.match(String(mails[0]!["subject"]), /1\.2\.0/);
  assert.doesNotMatch(String(mails[0]!["html"]), /private-draft-notes-canary/);
  failed = true;
  await assert.rejects(
    originalDelivery.send(event, "AAA", "verified@example.test"),
    /SMTP provider timeout/,
  );
  assert.equal(closed, 2);
  assert.equal(fallback, 0);
  for (const key of smtpKeys) delete process.env[key];
  await originalDelivery.send(event, "AAA", "verified@example.test");
  assert.equal(fallback, 1);
});
