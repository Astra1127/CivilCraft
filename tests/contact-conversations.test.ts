import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { messageRequest } from "../src/lib/cms/messages.server.ts";
import { contactSettingsRequest } from "../src/lib/cms/contact-settings.server.ts";
import { handlePlayFabAdminRequest } from "../src/lib/playfab/admin-api.server.ts";
import { getAdminAuthConfig } from "../src/lib/admin-auth/config.server.ts";
import { cookieName, issueAdminSession } from "../src/lib/admin-auth/session.server.ts";
import { hashAdminPassword } from "../src/lib/admin-auth/password.server.ts";
import { contactSmtp, renderContactEmail } from "../src/lib/email/contact-smtp.server.ts";
import nodemailer from "nodemailer";

const origin = "https://contact.test";
const env = {
  SMTP_HOST: "",
  SMTP_PORT: "",
  SMTP_USER: "",
  SMTP_PASSWORD: "",
  SMTP_FROM: "",
  ADMIN_AUTH_ORIGIN: origin,
  ADMIN_SESSION_SECRET: "contact-conversation-test-session-secret",
  ADMIN_USERS_JSON: JSON.stringify([
    {
      email: "admin@example.test",
      displayName: "Admin",
      passwordHash: await hashAdminPassword("conversation-test-password"),
    },
  ]),
  VITE_PLAYFAB_TITLE_ID: "17FA03",
  PLAYFAB_SECRET_KEY: "test-secret-canary",
  PLAYFAB_CONTACT_ADMIN_PLAYER_ID: "BEEF",
  PLAYFAB_CONTACT_ADMIN_EMAIL_TEMPLATE_ID: "admin-template",
  PLAYFAB_CONTACT_REPLY_EMAIL_TEMPLATE_ID: "reply-template",
};
const oldEnv = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]])),
  oldFetch = globalThis.fetch;
let data: Record<string, string> = {},
  emails: Record<string, unknown>[] = [],
  failEmail = false;
beforeEach(() => {
  Object.assign(process.env, env);
  data = {};
  emails = [];
  failEmail = false;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(new Headers(init?.headers).get("X-SecretKey"), env.PLAYFAB_SECRET_KEY);
    if (String(url).endsWith("GetPlayerProfile"))
      return Response.json({
        code: 200,
        data: {
          PlayerProfile: {
            ContactEmailAddresses: [
              {
                EmailAddress:
                  body.PlayFabId === "BEEF" ? "admin@example.test" : "owner@example.test",
              },
            ],
          },
        },
      });
    if (String(url).endsWith("AuthenticateSessionTicket"))
      return Response.json({
        code: 200,
        data:
          body.SessionTicket === "ticket-a"
            ? { UserInfo: { PlayFabId: "AAA" } }
            : body.SessionTicket === "ticket-b"
              ? { UserInfo: { PlayFabId: "BBB" } }
              : { IsSessionTicketExpired: true },
      });
    if (String(url).endsWith("SetTitleInternalData")) {
      if (body.Value === null) delete data[body.Key];
      else data[body.Key] = body.Value;
    }
    if (String(url).endsWith("SendEmailFromTemplate")) {
      assert.ok(
        Object.keys(data).some((k) => k.startsWith("civilcraft.website.v1.messages.")),
        "message is durable before email",
      );
      if (body.EmailTemplateId === "reply-template")
        assert.ok(
          Object.keys(data).some((k) => k.startsWith("civilcraft.website.v1.message-replies.")),
          "reply is durable before email",
        );
      emails.push(body);
      if (failEmail)
        return Response.json({ code: 503, error: "ServiceUnavailable" }, { status: 503 });
    }
    const selected = body.Keys
      ? Object.fromEntries(
          body.Keys.filter((k: string) => data[k] != null).map((k: string) => [k, data[k]]),
        )
      : { ...data };
    return Response.json({ code: 200, data: { Data: selected } });
  };
});
after(() => {
  globalThis.fetch = oldFetch;
  for (const [k, v] of Object.entries(oldEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
async function admin(path: string, body?: unknown, authenticated = true) {
  const config = getAdminAuthConfig()!;
  const headers: Record<string, string> = { origin, "Content-Type": "application/json" };
  if (authenticated)
    headers["cookie"] =
      cookieName(config) + "=" + (await issueAdminSession(config, config.users[0]!));
  return (await handlePlayFabAdminRequest(
    new Request(origin + "/api/admin/" + path, {
      method: body === undefined ? "GET" : "POST",
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  ))!;
}
async function player(ticket: string | null, body?: unknown, id?: string) {
  return (await messageRequest(
    new Request(origin + "/api/player/messages" + (id ? "?id=" + id : ""), {
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
async function submit(ticket: string | null = null, extra: Record<string, unknown> = {}) {
  return (await messageRequest(
    new Request(origin + "/api/contact", {
      method: "POST",
      headers: {
        origin,
        "Content-Type": "application/json",
        ...(ticket ? { Authorization: "Bearer " + ticket } : {}),
      },
      body: JSON.stringify({
        name: "Player A",
        email: "a@example.test",
        subject: "Conversation test",
        inquiryType: "General",
        message: "Please help with this test message.",
        ...extra,
      }),
    }),
  ))!;
}
test("shared contact settings survive independent public requests; empty fields are blank with no local fallback", async () => {
  const settings = {
    siteName: "Civil Craft",
    supportEmail: "support@example.test",
    phone: "",
    address: "Shared address",
    officeHours: "",
    social: { facebook: "", youtube: "", discord: "" },
  };
  assert.equal((await admin("contact-settings", settings)).status, 200);
  for (let browser = 0; browser < 2; browser++) {
    const response = (await contactSettingsRequest(new Request(origin + "/api/contact-settings")))!;
    assert.deepEqual(await response.json(), settings);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal((await admin("contact-settings", settings, false)).status, 401);
  assert.equal(
    (await contactSettingsRequest(
      new Request(origin + "/api/contact-settings", { method: "POST" }),
    ))!.status,
    405,
  );
  assert.equal(
    (
      await admin("contact-settings", {
        ...settings,
        social: { ...settings.social, facebook: "javascript:alert(1)" },
      })
    ).status,
    400,
  );
});
test("full conversation and email flow: player submits, admin replies, player replies, admin resolves", async () => {
  const created = await submit("ticket-a");
  assert.equal(created.status, 201);
  const { id, notificationStatus } = await created.json();
  assert.equal(notificationStatus, "sent");
  assert.deepEqual(emails[0], { PlayFabId: "BEEF", EmailTemplateId: "admin-template" });
  assert.equal((await (await admin("messages")).json()).messages[0].ownerId, "AAA");
  assert.equal(
    (await admin("messages", { action: "reply", id, message: "The team has replied." })).status,
    201,
  );
  assert.deepEqual(emails[1], { PlayFabId: "AAA", EmailTemplateId: "reply-template" });
  const refreshed = (await (await player("ticket-a", undefined, id)).json()).messages[0];
  assert.equal(refreshed.replies[0].message, "The team has replied.");
  assert.equal(
    (await player("ticket-a", { action: "reply", id, message: "Thanks, here are more details." }))
      .status,
    201,
  );
  assert.deepEqual(emails[2], { PlayFabId: "BEEF", EmailTemplateId: "admin-template" });
  await admin("messages", { action: "status", id, status: "Resolved" });
  const final = (await (await player("ticket-a", undefined, id)).json()).messages[0];
  assert.equal(final.status, "Resolved");
  assert.equal(final.replies.length, 2);
});
test("ownership comes only from verified ticket, never email or body; other players cannot read/reply/change status", async () => {
  const { id } = await (
    await submit("ticket-a", { ownerId: "BBB", playFabId: "BBB", email: "b@example.test" })
  ).json();
  assert.equal((await (await player("ticket-a")).json()).messages[0].ownerId, "AAA");
  assert.deepEqual((await (await player("ticket-b")).json()).messages, []);
  assert.equal((await player("ticket-b", undefined, id)).status, 404);
  assert.equal(
    (await player("ticket-b", { action: "reply", id, message: "Intrusion" })).status,
    404,
  );
  assert.equal(
    (await player("ticket-a", { action: "status", id, status: "Resolved" })).status,
    400,
  );
  assert.equal((await player(null, undefined, id)).status, 401);
  assert.equal((await player("expired", undefined, id)).status, 401);
  assert.equal((await submit("expired")).status, 401);
  assert.equal(emails.length, 1);
});
test("guest messages never become public or email-matched player threads", async () => {
  const { id } = await (await submit(null, { email: "a@example.test", ownerId: "AAA" })).json();
  assert.deepEqual((await (await player("ticket-a")).json()).messages, []);
  assert.equal((await player("ticket-a", undefined, id)).status, 404);
  const reply = await admin("messages", {
    action: "reply",
    id,
    message: "Guest note for the team.",
  });
  assert.equal((await reply.json()).notificationStatus, "not_applicable");
  assert.equal(emails.length, 1);
});
test("email failure or missing config never loses a message or reply", async () => {
  failEmail = true;
  const created = await submit("ticket-a");
  const { id, notificationStatus } = await created.json();
  assert.equal(created.status, 201);
  assert.equal(notificationStatus, "failed");
  const reply = await admin("messages", {
    action: "reply",
    id,
    message: "Saved despite email failure.",
  });
  assert.equal(reply.status, 201);
  assert.equal((await reply.json()).notificationStatus, "failed");
  assert.equal((await (await player("ticket-a")).json()).messages[0].replies.length, 1);
  process.env["PLAYFAB_CONTACT_REPLY_EMAIL_TEMPLATE_ID"] = "";
  assert.equal(
    (
      await (
        await admin("messages", { action: "reply", id, message: "Saved without a template." })
      ).json()
    ).notificationStatus,
    "not_configured",
  );
  assert.equal((await (await player("ticket-a")).json()).messages[0].replies.length, 2);
});
test("concurrent replies do not overwrite each other; deleted conversations cannot be read or resurrected", async () => {
  const { id } = await (await submit("ticket-a")).json();
  const results = await Promise.all([
    admin("messages", { action: "reply", id, message: "Team reply" }),
    player("ticket-a", { action: "reply", id, message: "Player reply" }),
  ]);
  assert.ok(results.every((r) => r.status === 201));
  assert.equal((await (await player("ticket-a")).json()).messages[0].replies.length, 2);
  await admin("messages", { action: "delete", id });
  assert.equal((await player("ticket-a", undefined, id)).status, 404);
  assert.equal(
    (await player("ticket-a", { action: "reply", id, message: "Resurrect" })).status,
    404,
  );
  assert.deepEqual((await (await admin("messages")).json()).messages, []);
});

test("SMTP copies contain full submitted and reply text, route to account recipients, and send only after saving", async (t) => {
  process.env["SMTP_HOST"] = "smtp.example.test";
  const sent: { recipient: string; content: ReturnType<typeof renderContactEmail> }[] = [];
  t.mock.method(
    contactSmtp,
    "send",
    async (recipient: string, content: ReturnType<typeof renderContactEmail>) => {
      assert.ok(
        Object.values(data).some((raw) => {
          const record = JSON.parse(raw);
          return typeof record?.message === "string" && content.text.includes(record.message);
        }),
        "exact email message already persisted",
      );
      sent.push({ recipient, content });
    },
  );
  const message = "I cannot access my account";
  const created = await submit("ticket-a", { message, email: "different@example.test" });
  assert.equal(created.status, 201);
  const { id, notificationStatus } = await created.json();
  assert.equal(notificationStatus, "sent");
  assert.equal(sent[0]!.recipient, "admin@example.test");
  for (const text of [
    message,
    "Player A",
    "different@example.test",
    "Conversation test",
    "Open Admin Messages",
    origin + "/admin/messages",
  ]) {
    assert.ok(sent[0]!.content.html.includes(text));
    assert.ok(sent[0]!.content.text.includes(text));
  }
  const reply = "We checked your account, please try signing in again.";
  const response = await admin("messages", { action: "reply", id, message: reply });
  assert.equal((await response.json()).notificationStatus, "sent");
  assert.equal(
    sent[1]!.recipient,
    "owner@example.test",
    "never uses submitted email for private reply",
  );
  for (const text of [reply, "View Conversation", origin + "/dashboard/messages"]) {
    assert.ok(sent[1]!.content.html.includes(text));
    assert.ok(sent[1]!.content.text.includes(text));
  }
  assert.equal((await (await player("ticket-a")).json()).messages[0].replies[0].message, reply);
  assert.equal((await player("ticket-b", undefined, id)).status, 404);
  await player("ticket-a", { action: "reply", id, message: "Thanks for checking my account." });
  assert.ok(sent[2]!.content.html.includes("Thanks for checking my account."));
  assert.equal(emails.length, 0, "SMTP does not also send a generic template");
});

test("SMTP failure never loses saved messages or replies and never retries via templates", async (t) => {
  process.env["SMTP_HOST"] = "smtp.example.test";
  t.mock.method(contactSmtp, "send", async () => {
    throw new Error("SMTP failed");
  });
  const created = await submit("ticket-a");
  const { id, notificationStatus } = await created.json();
  assert.equal(created.status, 201);
  assert.equal(notificationStatus, "failed");
  const reply = await admin("messages", { action: "reply", id, message: "Durable reply" });
  assert.equal(reply.status, 201);
  assert.equal((await reply.json()).notificationStatus, "failed");
  assert.equal(
    (await (await player("ticket-a")).json()).messages[0].replies[0].message,
    "Durable reply",
  );
  assert.equal(emails.length, 0);
});

test("email HTML escapes every user field, preserves full text and rejects unsafe link origins", () => {
  const attack = "<img src=x onerror=\"alert(1)\"> & 'quoted'\nSecond line";
  const content = { name: attack, email: attack, subject: attack, message: attack };
  for (const kind of ["admin", "player"] as const) {
    const rendered = renderContactEmail(kind, content, origin);
    assert.ok(!rendered.html.includes("<img"));
    assert.ok(
      rendered.html.includes(
        "&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;quoted&#39;",
      ),
    );
    assert.ok(rendered.html.includes("<br>Second line"));
    assert.ok(rendered.text.includes(attack));
    assert.ok(!rendered.subject.includes(attack));
    assert.throws(() => renderContactEmail(kind, content, "javascript:alert(1)"));
  }
});

test("SMTP transport uses existing credentials, enforces TLS, sends both bodies and closes", async (t) => {
  Object.assign(process.env, {
    SMTP_HOST: "smtp.example.test",
    SMTP_USER: "smtp-user",
    SMTP_PASSWORD: "test-only-password",
    SMTP_FROM: "notify@example.test",
  });
  let closed = 0;
  const content = renderContactEmail(
    "player",
    { name: "Player", email: "form@example.test", subject: "Help", message: "Full reply" },
    origin,
  );
  t.mock.method(nodemailer, "createTransport", (options: Record<string, unknown>) => {
    assert.equal(options["host"], "smtp.example.test");
    assert.equal(options["requireTLS"], true);
    assert.equal(options["secure"], options["port"] === 465);
    assert.deepEqual(options["auth"], { user: "smtp-user", pass: "test-only-password" });
    assert.equal(options["disableFileAccess"], true);
    assert.equal(options["disableUrlAccess"], true);
    return {
      sendMail: async (mail: unknown) => {
        assert.deepEqual(mail, {
          from: "notify@example.test",
          to: "owner@example.test",
          ...content,
        });
      },
      close: () => {
        closed++;
      },
    };
  });
  await contactSmtp.send("owner@example.test", content);
  process.env["SMTP_PORT"] = "465";
  await contactSmtp.send("owner@example.test", content);
  assert.equal(closed, 2);
  process.env["SMTP_PASSWORD"] = "";
  await assert.rejects(contactSmtp.send("owner@example.test", content));
});
