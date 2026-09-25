import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import {
  renderResendEmail,
  resendConfigured,
  sendContactResendEmail,
  type ContactResendContent,
} from "../src/lib/email/contact-resend.server.ts";
import { notifyContact } from "../src/lib/email/contact-notifications.server.ts";

const origin = "https://civilcraft.test";
const testApiKey = "re_test_mock_api_key_123456789";
const adminEmail = "admin@civilcraft.test";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

beforeEach(() => {
  delete process.env["RESEND_API_KEY"];
  delete process.env["ADMIN_EMAIL"];
  delete process.env["RESEND_FROM"];
  delete process.env["SMTP_HOST"];
  delete process.env["SMTP_USER"];
  delete process.env["SMTP_PASS"];
  delete process.env["SMTP_PASSWORD"];
  delete process.env["GMAIL_SMTP_USER"];
  delete process.env["GMAIL_SMTP_APP_PASSWORD"];
  delete process.env["PLAYFAB_CONTACT_ADMIN_PLAYER_ID"];
  process.env["ADMIN_AUTH_ORIGIN"] = origin;
});

after(() => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

test("renderResendEmail: admin notification contains all required fields, branding, and dashboard CTA", () => {
  const content: ContactResendContent = {
    name: "Jane Doe",
    email: "jane@example.test",
    subject: "Bridge Construction Inquiry",
    inquiryType: "Educational",
    message: "Can we build arched stone bridges in survival mode?\nThank you!",
    createdAt: "2026-09-24T10:00:00.000Z",
  };

  const rendered = renderResendEmail("admin", content, origin);

  // Subject
  assert.equal(rendered.subject, "[Civil Craft] Contact (Educational): Bridge Construction Inquiry");

  // Plain text checks
  assert.ok(rendered.text.includes("Sender Name:    Jane Doe"));
  assert.ok(rendered.text.includes("Sender Email:   jane@example.test"));
  assert.ok(rendered.text.includes("Subject:        Bridge Construction Inquiry"));
  assert.ok(rendered.text.includes("Inquiry Type:   Educational"));
  assert.ok(rendered.text.includes("Can we build arched stone bridges in survival mode?"));
  assert.ok(rendered.text.includes("Open Admin Dashboard: https://civilcraft.test/admin/messages"));

  // HTML checks
  assert.ok(rendered.html.includes("Civil Craft"));
  assert.ok(rendered.html.includes("New Contact Submission"));
  assert.ok(rendered.html.includes("Jane Doe"));
  assert.ok(rendered.html.includes("jane@example.test"));
  assert.ok(rendered.html.includes("Bridge Construction Inquiry"));
  assert.ok(rendered.html.includes("Educational"));
  assert.ok(rendered.html.includes("Can we build arched stone bridges in survival mode?<br>Thank you!"));
  assert.ok(rendered.html.includes("href=\"https://civilcraft.test/admin/messages\""));
  assert.ok(rendered.html.includes("Open Admin Dashboard &rarr;"));
});

test("renderResendEmail: escapes HTML to prevent XSS injection in admin notification", () => {
  const content: ContactResendContent = {
    name: "<script>alert('xss')</script>",
    email: "malicious@example.test",
    subject: "<h1>Injection</h1>",
    inquiryType: "General",
    message: "Test <img src=x onerror=alert(1)> & 'quote'",
  };

  const rendered = renderResendEmail("admin", content, origin);

  assert.ok(!rendered.html.includes("<script>"));
  assert.ok(rendered.html.includes("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;"));
  assert.ok(!rendered.html.includes("<h1>Injection</h1>"));
  assert.ok(rendered.html.includes("&lt;h1&gt;Injection&lt;/h1&gt;"));
  assert.ok(!rendered.html.includes("<img src=x"));
  assert.ok(rendered.html.includes("&lt;img src=x onerror=alert(1)&gt; &amp; &#39;quote&#39;"));
});

test("renderResendEmail: player reply email contains original inquiry, admin reply, and website link", () => {
  const content: ContactResendContent = {
    name: "Alex Builder",
    email: "alex@example.test",
    subject: "Pillar Placement Question",
    inquiryType: "Technical Support",
    message: "Our team has examined the column spacing guidelines. Stone arch columns require a 4-block span.",
    originalMessage: "How far apart can stone columns be placed before collapsing?",
    replyMessage: "Our team has examined the column spacing guidelines. Stone arch columns require a 4-block span.",
    createdAt: "2026-09-24T08:00:00.000Z",
    replyCreatedAt: "2026-09-24T09:30:00.000Z",
  };

  const rendered = renderResendEmail("player", content, origin);

  // Subject
  assert.equal(rendered.subject, "Re: Pillar Placement Question - Civil Craft Support");

  // Plain text
  assert.ok(rendered.text.includes("Hello Alex Builder,"));
  assert.ok(rendered.text.includes("--- ADMIN REPLY ---"));
  assert.ok(rendered.text.includes("Stone arch columns require a 4-block span."));
  assert.ok(rendered.text.includes("--- ORIGINAL INQUIRY ---"));
  assert.ok(rendered.text.includes("How far apart can stone columns be placed before collapsing?"));
  assert.ok(rendered.text.includes("Visit Civil Craft: https://civilcraft.test"));

  // HTML
  assert.ok(rendered.html.includes("Response from Civil Craft Team"));
  assert.ok(rendered.html.includes("Hello <strong>Alex Builder</strong>"));
  assert.ok(rendered.html.includes("Stone arch columns require a 4-block span."));
  assert.ok(rendered.html.includes("How far apart can stone columns be placed before collapsing?"));
  assert.ok(rendered.html.includes("Visit Civil Craft Website &rarr;"));
});

test("sendContactResendEmail: calls Resend REST API with default testing sender onboarding@resend.dev", async () => {
  process.env["RESEND_API_KEY"] = testApiKey;

  let requestUrl = "";
  let requestInit: RequestInit | undefined;

  globalThis.fetch = async (url, init) => {
    requestUrl = String(url);
    requestInit = init;
    return Response.json({ id: "resend_msg_test_123" }, { status: 200 });
  };

  const content: ContactResendContent = {
    name: "Tester",
    email: "tester@example.test",
    subject: "Test Subject",
    message: "Hello world!",
  };

  await sendContactResendEmail("admin", adminEmail, content, origin);

  assert.equal(requestUrl, "https://api.resend.com/emails");
  assert.equal(requestInit?.method, "POST");

  const headers = new Headers(requestInit?.headers);
  assert.equal(headers.get("Authorization"), `Bearer ${testApiKey}`);
  assert.equal(headers.get("Content-Type"), "application/json");

  const body = JSON.parse(String(requestInit?.body));
  assert.equal(body.from, "Civil Craft <onboarding@resend.dev>");
  assert.deepEqual(body.to, [adminEmail]);
  assert.equal(body.subject, "[Civil Craft] Contact (General): Test Subject");
  assert.ok(body.html.includes("Hello world!"));
});

test("sendContactResendEmail: respects configured RESEND_FROM", async () => {
  process.env["RESEND_API_KEY"] = testApiKey;
  process.env["RESEND_FROM"] = "Civil Craft Support <no-reply@civilcraft.org>";

  let requestBody: Record<string, unknown> = {};

  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(String(init?.body));
    return Response.json({ id: "resend_msg_test_456" }, { status: 200 });
  };

  await sendContactResendEmail("admin", adminEmail, {
    name: "Tester",
    email: "tester@example.test",
    subject: "Custom From Test",
    message: "Testing custom sender",
  });

  assert.equal(requestBody["from"], "Civil Craft Support <no-reply@civilcraft.org>");
});

test("notifyContact: routes admin notification to ADMIN_EMAIL via Resend when configured", async () => {
  process.env["RESEND_API_KEY"] = testApiKey;
  process.env["ADMIN_EMAIL"] = adminEmail;

  let sentTo = "";

  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    sentTo = body.to[0];
    return Response.json({ id: "resend_msg_789" }, { status: 200 });
  };

  const status = await notifyContact("admin", {
    name: "Player 1",
    email: "player1@example.test",
    subject: "Need Help",
    message: "Stuck in quarry",
  });

  assert.equal(status, "sent");
  assert.equal(sentTo, adminEmail);
});

test("sendContactResendEmail: routes player reply to user email when ownerId is null", async () => {
  process.env["RESEND_API_KEY"] = testApiKey;
  process.env["ADMIN_EMAIL"] = adminEmail;

  let sentTo = "";
  let sentBody: Record<string, unknown> = {};

  globalThis.fetch = async (_url, init) => {
    sentBody = JSON.parse(String(init?.body));
    sentTo = (sentBody["to"] as string[])[0];
    return Response.json({ id: "resend_msg_reply_999" }, { status: 200 });
  };

  await sendContactResendEmail(
    "player",
    "guest@example.test",
    {
      name: "Guest Visitor",
      email: "guest@example.test",
      subject: "Guest Question",
      message: "Here is the admin answer",
      replyMessage: "Here is the admin answer",
      originalMessage: "Original guest question",
    },
    origin,
  );

  assert.equal(sentTo, "guest@example.test");
  assert.ok(String(sentBody["html"]).includes("Here is the admin answer"));
  assert.ok(String(sentBody["html"]).includes("Original guest question"));
});

test("notifyContact: returns failed status when Resend API returns error", async () => {
  process.env["RESEND_API_KEY"] = testApiKey;
  process.env["ADMIN_EMAIL"] = adminEmail;

  globalThis.fetch = async () => {
    return Response.json(
      { statusCode: 422, message: "Testing domain restriction" },
      { status: 422 },
    );
  };

  const status = await notifyContact("admin", {
    name: "Tester",
    email: "test@example.test",
    subject: "Error Test",
    message: "Should fail gracefully",
  });

  assert.equal(status, "failed");
});

test("notifyContact: falls back to not_configured when no email provider is configured", async () => {
  assert.equal(resendConfigured(), false);

  const status = await notifyContact("admin", {
    name: "Tester",
    email: "test@example.test",
    subject: "Fallback Test",
    message: "No provider configured",
  });

  assert.equal(status, "not_configured");
});
