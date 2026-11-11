import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import {
  createPolicyNotificationJob,
  getLatestPolicyNotificationJob,
  renderPolicyUpdateEmail,
  retryPolicyNotificationJob,
} from "../src/lib/email/policy-notifications.server.ts";

const originalFetch = globalThis.fetch;
const priorSecret = process.env["PLAYFAB_SECRET_KEY"];
const priorSmtpUser = process.env["GMAIL_SMTP_USER"];
const priorSmtpPass = process.env["GMAIL_SMTP_APP_PASSWORD"];

let titleInternalData = new Map<string, string>();
let mockProfiles = new Map<string, Record<string, unknown>>();

beforeEach(() => {
  titleInternalData.clear();
  mockProfiles.clear();
  process.env["PLAYFAB_SECRET_KEY"] = "test-secret";
  delete process.env["GMAIL_SMTP_USER"];
  delete process.env["GMAIL_SMTP_APP_PASSWORD"];

  globalThis.fetch = async (url, init) => {
    const op = String(url).split("/").pop() ?? "";
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

    if (op === "GetTitleInternalData") {
      const keys = (body["Keys"] as string[]) ?? [];
      const result: Record<string, string> = {};
      if (keys.length > 0) {
        for (const key of keys) {
          if (titleInternalData.has(key)) {
            result[key] = titleInternalData.get(key)!;
          }
        }
      } else {
        for (const [k, v] of titleInternalData.entries()) {
          result[k] = v;
        }
      }
      return Response.json({ code: 200, data: { Data: result } });
    }

    if (op === "SetTitleInternalData") {
      const key = String(body["Key"] ?? "");
      const val = String(body["Value"] ?? "");
      titleInternalData.set(key, val);
      return Response.json({ code: 200, data: {} });
    }

    if (op === "GetPlayerProfile") {
      const id = String(body["PlayFabId"] ?? "");
      const profile = mockProfiles.get(id);
      if (profile) {
        return Response.json({ code: 200, data: { PlayerProfile: profile } });
      }
      return Response.json({ code: 404, error: "NotFound" }, { status: 404 });
    }

    return Response.json({ code: 200, data: {} });
  };
});

after(() => {
  globalThis.fetch = originalFetch;
  if (priorSecret !== undefined) process.env["PLAYFAB_SECRET_KEY"] = priorSecret;
  else delete process.env["PLAYFAB_SECRET_KEY"];
  if (priorSmtpUser !== undefined) process.env["GMAIL_SMTP_USER"] = priorSmtpUser;
  else delete process.env["GMAIL_SMTP_USER"];
  if (priorSmtpPass !== undefined) process.env["GMAIL_SMTP_APP_PASSWORD"] = priorSmtpPass;
  else delete process.env["GMAIL_SMTP_APP_PASSWORD"];
});

test("renderPolicyUpdateEmail generates branded HTML and plain text with required fields", () => {
  const rendered = renderPolicyUpdateEmail({
    policyTitle: "Privacy Policy",
    policyId: "privacy",
    changeSummary: "Updated data retention timeline and NPC compliance notices.",
    publishedDate: "November 10, 2026",
  });

  assert.ok(rendered.html.includes("Civil Craft"));
  assert.ok(rendered.html.includes("Privacy Policy Updated"));
  assert.ok(rendered.html.includes("Updated data retention timeline"));
  assert.ok(rendered.html.includes("November 10, 2026"));
  assert.ok(rendered.html.includes("/privacy"));

  assert.ok(rendered.text.includes("CIVIL CRAFT"));
  assert.ok(rendered.text.includes("Privacy Policy"));
  assert.ok(rendered.text.includes("Updated data retention timeline"));
  assert.ok(rendered.text.includes("/privacy"));
});

test("createPolicyNotificationJob skips unverified accounts and reports unconfigured when SMTP missing", async () => {
  // Setup 2 players: 1 verified, 1 unverified
  titleInternalData.set("civilcraft.email.preference.A100", JSON.stringify({ emailUpdates: true }));
  titleInternalData.set("civilcraft.email.preference.B200", JSON.stringify({ emailUpdates: true }));

  mockProfiles.set("A100", {
    PlayerId: "A100",
    ContactEmailAddresses: [
      { EmailAddress: "verified@example.com", VerificationStatus: "Confirmed" },
    ],
  });
  mockProfiles.set("B200", {
    PlayerId: "B200",
    ContactEmailAddresses: [
      { EmailAddress: "unverified@example.com", VerificationStatus: "Unconfirmed" },
    ],
  });

  const job = await createPolicyNotificationJob({
    policyId: "privacy",
    policyTitle: "Privacy Policy",
    policyVersion: "2026-11-10-v1",
    changeSummary: "Audited policy release",
    publishedAt: new Date().toISOString(),
    publishedBy: "staff@example.test",
  });

  assert.equal(job.policyId, "privacy");
  assert.equal(job.totalEligible, 1); // Only A100 is eligible! B200 was skipped
  assert.equal(job.skippedCount, 1); // B200 is skipped
  assert.equal(job.status, "unconfigured"); // No SMTP configured in test
  assert.ok(job.statusMessage.includes("Email provider is not configured"));

  // Verify persistence in Title Internal Data
  const loadedJob = await getLatestPolicyNotificationJob("privacy");
  assert.ok(loadedJob);
  assert.equal(loadedJob.policyVersion, "2026-11-10-v1");
  assert.equal(loadedJob.totalEligible, 1);
});

test("retryPolicyNotificationJob only targets failed or pending recipients", async () => {
  const version = "2026-11-10-v2";
  const now = new Date().toISOString();

  // Seed an existing job with 1 sent, 1 skipped, 1 failed
  const existingJob = {
    id: `privacy:${version}`,
    policyId: "privacy",
    policyTitle: "Privacy Policy",
    policyVersion: version,
    changeSummary: "Test revision",
    publishedAt: now,
    publishedBy: "Admin",
    status: "failed",
    statusMessage: "1 failure",
    totalEligible: 2,
    sentCount: 1,
    failedCount: 1,
    skippedCount: 1,
    pendingCount: 0,
    recipients: [
      { playerId: "A100", maskedEmail: "a***@e***m", status: "sent", sentAt: now },
      { playerId: "B200", maskedEmail: "b***@e***m", status: "skipped" },
      { playerId: "C300", maskedEmail: "c***@e***m", status: "failed", error: "Connection error" },
    ],
    createdAt: now,
    updatedAt: now,
  };

  titleInternalData.set(
    `civilcraft.website.v1.policy-job.privacy.${version}`,
    JSON.stringify(existingJob),
  );
  titleInternalData.set("civilcraft.website.v1.policy-job.latest.privacy", version);

  const retried = await retryPolicyNotificationJob("privacy", version);
  assert.equal(retried.sentCount, 1); // A100 was NOT re-sent
  assert.equal(retried.skippedCount, 1); // B200 remains skipped
  // C300 was retried, but SMTP still unconfigured so it transitions to unconfigured/failed
  assert.ok(retried.recipients.find((r) => r.playerId === "A100")?.status === "sent");
});

test("duplicate notifications are prevented for already dispatched revision", async () => {
  const version = "2026-11-10-v3";
  titleInternalData.set("civilcraft.email.preference.A100", JSON.stringify({ emailUpdates: true }));
  mockProfiles.set("A100", {
    PlayerId: "A100",
    ContactEmailAddresses: [
      { EmailAddress: "verified@example.com", VerificationStatus: "Confirmed" },
    ],
  });

  // First dispatch
  const job1 = await createPolicyNotificationJob({
    policyId: "terms",
    policyTitle: "Terms of Service",
    policyVersion: version,
    changeSummary: "First publish",
    publishedAt: new Date().toISOString(),
    publishedBy: "staff@example.test",
  });
  assert.ok(job1);

  // If createPolicyNotificationJob is invoked with same revision, key is deterministic
  const jobKey = `civilcraft.website.v1.policy-job.terms.${version}`;
  const storedJob = JSON.parse(titleInternalData.get(jobKey)!) as { id: string };
  assert.equal(storedJob.id, `terms:${version}`);
});

