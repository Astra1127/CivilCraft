import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import nodemailer from "nodemailer";
import {
  getGmailSmtpConfig,
  isGmailSmtpConfigured,
  sendGmailReplyEmail,
} from "../src/lib/email/gmail-smtp.server.ts";
import { notifyContact } from "../src/lib/email/contact-notifications.server.ts";

const origin = "https://civilcraft.test";
const adminGmail = "civil.craft1234@gmail.com";
const visitorEmail = "visitor.tester@outlook.com";
const mockAppPassword = "abcd efgh ijkl mnop";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

beforeEach(() => {
  delete process.env["RESEND_API_KEY"];
  delete process.env["RESEND_FROM"];
  delete process.env["GMAIL_SMTP_HOST"];
  delete process.env["GMAIL_SMTP_PORT"];
  delete process.env["GMAIL_SMTP_SECURE"];
  delete process.env["GMAIL_SMTP_USER"];
  delete process.env["GMAIL_SMTP_APP_PASSWORD"];
  delete process.env["SMTP_HOST"];
  delete process.env["SMTP_PORT"];
  delete process.env["SMTP_SECURE"];
  delete process.env["SMTP_USER"];
  delete process.env["SMTP_PASS"];
  delete process.env["SMTP_PASSWORD"];
  delete process.env["SMTP_FROM"];
  delete process.env["EMAIL_FROM"];
  delete process.env["ADMIN_EMAIL"];
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

test("isGmailSmtpConfigured: returns true only when user and app password are provided", () => {
  assert.equal(isGmailSmtpConfigured(), false);

  process.env["GMAIL_SMTP_USER"] = adminGmail;
  assert.equal(isGmailSmtpConfigured(), false);

  process.env["GMAIL_SMTP_APP_PASSWORD"] = mockAppPassword;
  assert.equal(isGmailSmtpConfigured(), true);

  const config = getGmailSmtpConfig();
  assert.ok(config);
  assert.equal(config.host, "smtp.gmail.com");
  assert.equal(config.port, 465);
  assert.equal(config.secure, true);
  assert.equal(config.user, adminGmail);
  // Spaces stripped for Google App Password
  assert.equal(config.pass, "abcdefghijklmnop");
  assert.equal(config.from, `Civil Craft <${adminGmail}>`);
});

test("Visitor -> Admin notification: uses Resend for admin notification", async () => {
  process.env["RESEND_API_KEY"] = "re_test_canary_key";
  process.env["ADMIN_EMAIL"] = adminGmail;
  process.env["GMAIL_SMTP_USER"] = adminGmail;
  process.env["GMAIL_SMTP_APP_PASSWORD"] = mockAppPassword;

  let resendPayload: Record<string, unknown> | null = null;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://api.resend.com/emails");
    resendPayload = JSON.parse(String(init?.body));
    return Response.json({ id: "resend_msg_admin_123" }, { status: 200 });
  };

  const status = await notifyContact("admin", {
    name: "Jane Visitor",
    email: visitorEmail,
    subject: "Bridge Arch Query",
    inquiryType: "Technical Support",
    message: "How wide can an unreinforced stone arch span in survival mode?",
    createdAt: "2026-09-25T10:00:00.000Z",
  });

  assert.equal(status, "sent");
  assert.ok(resendPayload);
  assert.deepEqual(resendPayload["to"], [adminGmail]);
  assert.equal(resendPayload["subject"], "[Civil Craft] Contact (Technical Support): Bridge Arch Query");
  const html = String(resendPayload["html"]);
  assert.ok(html.includes("Jane Visitor"));
  assert.ok(html.includes(visitorEmail));
  assert.ok(html.includes("Bridge Arch Query"));
  assert.ok(html.includes("Open Admin Dashboard &rarr;"));
});

test("Admin -> Visitor reply: uses Gmail SMTP to send directly to visitor email address", async (t) => {
  process.env["GMAIL_SMTP_USER"] = adminGmail;
  process.env["GMAIL_SMTP_APP_PASSWORD"] = mockAppPassword;

  let sentMail: Record<string, unknown> | null = null;
  t.mock.method(nodemailer, "createTransport", () => ({
    sendMail: async (mail: Record<string, unknown>) => {
      sentMail = mail;
      return { messageId: "gmail_reply_msg_456" };
    },
    close: () => {},
  }));

  // Guest submission with ownerId = null
  const status = await notifyContact(
    "player",
    {
      name: "Jane Visitor",
      email: visitorEmail, // Visitor's arbitrary email (e.g. Outlook/Yahoo/Gmail)
      subject: "Bridge Arch Query",
      inquiryType: "Technical Support",
      message: "Unreinforced stone arches require keystone pillars every 6 blocks.",
      replyMessage: "Unreinforced stone arches require keystone pillars every 6 blocks.",
      originalMessage: "How wide can an unreinforced stone arch span in survival mode?",
      createdAt: "2026-09-25T10:00:00.000Z",
      replyCreatedAt: "2026-09-25T11:00:00.000Z",
    },
    null, // guest
  );

  assert.equal(status, "sent");
  assert.ok(sentMail);

  // Recipient MUST be the visitor's email, NOT the admin's email
  assert.equal(sentMail["to"], visitorEmail);
  assert.notEqual(sentMail["to"], adminGmail);

  // Sender and replyTo must be the Civil Craft Gmail account
  assert.equal(sentMail["from"], `Civil Craft <${adminGmail}>`);
  assert.equal(sentMail["replyTo"], adminGmail);
  assert.equal(sentMail["subject"], "Re: Bridge Arch Query - Civil Craft Support");

  const html = String(sentMail["html"]);
  assert.ok(html.includes("Response from Civil Craft Team"));
  assert.ok(html.includes("Hello <strong>Jane Visitor</strong>"));
  assert.ok(html.includes("Unreinforced stone arches require keystone pillars every 6 blocks."));
  assert.ok(html.includes("How wide can an unreinforced stone arch span in survival mode?"));
  assert.ok(html.includes("Visit Civil Craft Website &rarr;"));
  assert.ok(html.includes("href=\"https://civilcraft.test\""));
});

test("Admin -> Visitor reply: handles authentication failure gracefully and returns failed", async (t) => {
  process.env["GMAIL_SMTP_USER"] = adminGmail;
  process.env["GMAIL_SMTP_APP_PASSWORD"] = "invalid_app_pass";

  t.mock.method(nodemailer, "createTransport", () => ({
    sendMail: async () => {
      const err = new Error("Invalid login: 535-5.7.8 Username and Password not accepted") as any;
      err.code = "EAUTH";
      err.responseCode = 535;
      throw err;
    },
    close: () => {},
  }));

  const status = await notifyContact("player", {
    name: "Jane",
    email: visitorEmail,
    subject: "Auth Test",
    message: "Admin response",
  });

  assert.equal(status, "failed");
});

test("Admin -> Visitor reply: handles connection timeout gracefully and returns failed", async (t) => {
  process.env["GMAIL_SMTP_USER"] = adminGmail;
  process.env["GMAIL_SMTP_APP_PASSWORD"] = mockAppPassword;

  t.mock.method(nodemailer, "createTransport", () => ({
    sendMail: async () => {
      const err = new Error("ETIMEDOUT: Connection to smtp.gmail.com:465 timed out") as any;
      err.code = "ETIMEDOUT";
      throw err;
    },
    close: () => {},
  }));

  const status = await notifyContact("player", {
    name: "Jane",
    email: visitorEmail,
    subject: "Timeout Test",
    message: "Admin response",
  });

  assert.equal(status, "failed");
});

test("Admin -> Visitor reply: returns not_configured when recipient email is missing", async () => {
  process.env["GMAIL_SMTP_USER"] = adminGmail;
  process.env["GMAIL_SMTP_APP_PASSWORD"] = mockAppPassword;

  const status = await notifyContact(
    "player",
    {
      name: "Jane",
      email: "",
      subject: "Missing Email",
      message: "Admin response",
    },
    null,
  );

  assert.equal(status, "not_configured");
});

test("isGmailSmtpConfigured: returns true when configured via fallback SMTP_USER and SMTP_PASS", () => {
  assert.equal(isGmailSmtpConfigured(), false);

  process.env["SMTP_USER"] = adminGmail;
  process.env["SMTP_PASS"] = mockAppPassword;
  process.env["SMTP_HOST"] = "smtp.gmail.com";
  process.env["SMTP_PORT"] = "465";

  assert.equal(isGmailSmtpConfigured(), true);
  const config = getGmailSmtpConfig();
  assert.ok(config);
  assert.equal(config.user, adminGmail);
  assert.equal(config.pass, "abcdefghijklmnop");
  assert.equal(config.host, "smtp.gmail.com");
  assert.equal(config.port, 465);
});

test("Admin -> Visitor reply: strictly never calls Resend even when RESEND_API_KEY is configured", async (t) => {
  process.env["RESEND_API_KEY"] = "re_test_key";
  process.env["ADMIN_EMAIL"] = adminGmail;
  process.env["GMAIL_SMTP_USER"] = adminGmail;
  process.env["GMAIL_SMTP_APP_PASSWORD"] = mockAppPassword;

  let resendCalled = false;
  globalThis.fetch = async () => {
    resendCalled = true;
    return Response.json({ id: "unexpected_resend_call" }, { status: 200 });
  };

  t.mock.method(nodemailer, "createTransport", () => ({
    sendMail: async () => {
      // Simulate Gmail SMTP failure
      throw new Error("Gmail SMTP delivery error");
    },
    close: () => {},
  }));

  const status = await notifyContact(
    "player",
    {
      name: "Jane Visitor",
      email: visitorEmail,
      subject: "Query",
      message: "Reply text",
    },
    null,
  );

  // Must return failed directly without falling back to Resend
  assert.equal(status, "failed");
  assert.equal(resendCalled, false, "Resend must NEVER be called for player reply");
});
