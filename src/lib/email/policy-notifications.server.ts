import nodemailer from "nodemailer";
import { z } from "zod";
import {
  AdminApiError,
  adminGameConfig,
  object,
  playFabAdmin,
} from "../playfab/admin-client.server.ts";
import { getGmailSmtpConfig, isGmailSmtpConfigured } from "./gmail-smtp.server.ts";
import { emailDelivery } from "./delivery.server.ts";
import { maskEmail } from "../playfab/player-verification.server.ts";

export interface RecipientResult {
  playerId: string;
  maskedEmail: string;
  status: "pending" | "sent" | "failed" | "skipped";
  error?: string;
  sentAt?: string;
}

export interface PolicyNotificationJob {
  id: string; // e.g. "privacy:2026-11-10"
  policyId: "privacy" | "terms";
  policyTitle: string;
  policyVersion: string;
  changeSummary: string;
  publishedAt: string;
  publishedBy: string;
  status: "completed" | "processing" | "failed" | "unconfigured" | "pending";
  statusMessage: string;
  totalEligible: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  pendingCount: number;
  recipients: RecipientResult[];
  createdAt: string;
  updatedAt: string;
}

const jobPrefix = "civilcraft.website.v1.policy-job.";
const preferencePrefix = "civilcraft.email.preference.";

function getJobKey(policyId: string, version: string): string {
  const safeVersion = version.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${jobPrefix}${policyId}.${safeVersion}`;
}

function siteOrigin(): string {
  try {
    const url = new URL(
      process.env["PUBLIC_SITE_URL"]?.trim() || process.env["ADMIN_AUTH_ORIGIN"]?.trim() || "",
    );
    if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
  } catch {
    // fallback
  }
  return "https://civilcraft.game";
}

/**
 * Builds the Civil Craft branded email HTML and plain-text body for policy updates.
 */
export function renderPolicyUpdateEmail(input: {
  policyTitle: string;
  policyId: "privacy" | "terms";
  changeSummary: string;
  publishedDate: string;
}): { html: string; text: string; subject: string } {
  const origin = siteOrigin();
  const policyUrl = `${origin}/${input.policyId === "privacy" ? "privacy" : "terms"}`;
  const subject = `Civil Craft — ${input.policyTitle} Updated`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 24px 12px; background-color: #F3E7D1; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #4A3428;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #FCF6EC; border: 2px solid #4A3428; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(74, 52, 40, 0.15);">
    <!-- Header Banner -->
    <tr>
      <td style="padding: 24px 32px 16px 32px; background-color: #4A3428; text-align: left;">
        <span style="font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: #C58A42; font-weight: 700;">Legal &amp; Account Notice</span>
        <h1 style="margin: 6px 0 0 0; font-size: 22px; color: #FCF6EC; font-weight: 700;">Civil Craft: Bridge Edition</h1>
      </td>
    </tr>
    <!-- Content Body -->
    <tr>
      <td style="padding: 32px;">
        <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.5; color: #4A3428;">
          Hello Engineer,
        </p>
        <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #4E372C;">
          We have updated the Civil Craft <strong>${input.policyTitle}</strong>. As part of our commitment to transparency, data protection, and fair play, we are notifying all registered players of this update.
        </p>

        <!-- Change Summary Box -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px 0; background-color: #FAF2E6; border-left: 4px solid #C58A42; border-radius: 6px;">
          <tr>
            <td style="padding: 16px 20px;">
              <p style="margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #A87332; font-weight: 700;">What's Changed</p>
              <p style="margin: 0 0 12px 0; font-size: 14px; line-height: 1.6; color: #4A3428; font-weight: 600;">
                ${input.changeSummary}
              </p>
              <div style="font-size: 12px; color: #786154;">
                <span><strong>Policy:</strong> ${input.policyTitle}</span> &bull; 
                <span><strong>Effective Date:</strong> ${input.publishedDate}</span>
              </div>
            </td>
          </tr>
        </table>

        <!-- Primary Action Button -->
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 0 24px 0;">
          <tr>
            <td style="background-color: #C58A42; border-radius: 8px; text-align: center;">
              <a href="${policyUrl}" style="display: inline-block; padding: 12px 28px; font-size: 14px; font-weight: 700; color: #FFFFFF; text-decoration: none; border-radius: 8px;">
                View Updated ${input.policyTitle} &rarr;
              </a>
            </td>
          </tr>
        </table>

        <p style="margin: 0 0 8px 0; font-size: 12px; color: #786154; line-height: 1.5;">
          Direct link: <a href="${policyUrl}" style="color: #A87332; word-break: break-all;">${policyUrl}</a>
        </p>

        <p style="margin: 24px 0 0 0; font-size: 14px; color: #4A3428;">
          Thank you for building with Civil Craft!<br>
          <strong>The Civil Craft Team</strong>
        </p>
      </td>
    </tr>
    <!-- Footer -->
    <tr>
      <td style="padding: 20px 32px; background-color: #F5ECE0; border-top: 1px solid #E8DAC6; font-size: 11px; color: #786154; line-height: 1.5;">
        You received this mandatory legal notification because you have an active, verified Civil Craft player account. This is not a marketing email.
        <br><br>
        &copy; 2026 Civil Craft: Bridge Edition. Academic Capstone Research Project, Republic of the Philippines.
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `CIVIL CRAFT — ${input.policyTitle.toUpperCase()} UPDATED

Hello Engineer,

We have updated the Civil Craft ${input.policyTitle}.

WHAT'S CHANGED:
${input.changeSummary}

Policy: ${input.policyTitle}
Effective Date: ${input.publishedDate}

Please review the updated policy at:
${policyUrl}

Thank you for building with Civil Craft!
The Civil Craft Team

---
You received this mandatory legal notification because you have an active, verified Civil Craft player account.
(c) 2026 Civil Craft: Bridge Edition.`;

  return { html, text, subject };
}

/**
 * Discovers verified player accounts eligible for policy update notifications.
 */
async function discoverEligiblePlayers(): Promise<{
  eligible: { playerId: string; email: string; maskedEmail: string }[];
  skipped: { playerId: string; reason: string }[];
}> {
  // Query Title Internal Data keys starting with civilcraft.email.preference.
  const rawData = object((await playFabAdmin("Admin/GetTitleInternalData"))["Data"]);
  const playerIds = new Set<string>();

  for (const key of Object.keys(rawData)) {
    if (key.startsWith(preferencePrefix)) {
      const id = key.slice(preferencePrefix.length).trim();
      if (/^[a-f0-9]{1,32}$/i.test(id)) {
        playerIds.add(id);
      }
    }
  }

  const eligible: { playerId: string; email: string; maskedEmail: string }[] = [];
  const skipped: { playerId: string; reason: string }[] = [];

  for (const id of playerIds) {
    try {
      const result = await playFabAdmin("Server/GetPlayerProfile", {
        PlayFabId: id,
        ProfileConstraints: { ShowContactEmailAddresses: true },
      });
      const profile = object(result["PlayerProfile"]);
      const contacts = profile["ContactEmailAddresses"];

      if (
        Array.isArray(contacts) &&
        contacts.length > 0 &&
        contacts.some((c) => object(c)["VerificationStatus"] === "Confirmed")
      ) {
        const confirmed = contacts.find((c) => object(c)["VerificationStatus"] === "Confirmed");
        const email = String(object(confirmed)["EmailAddress"] ?? "").trim();
        if (z.string().email().safeParse(email).success) {
          eligible.push({ playerId: id, email, maskedEmail: maskEmail(email) });
          continue;
        }
      }
      skipped.push({ playerId: id, reason: "Unverified email address" });
    } catch {
      skipped.push({ playerId: id, reason: "Profile lookup failed" });
    }
  }

  return { eligible, skipped };
}

/**
 * Creates and dispatches a durable policy notification job.
 */
export async function createPolicyNotificationJob(input: {
  policyId: "privacy" | "terms";
  policyTitle: string;
  policyVersion: string;
  changeSummary: string;
  publishedAt: string;
  publishedBy: string;
}): Promise<PolicyNotificationJob> {
  const jobId = `${input.policyId}:${input.policyVersion}`;
  const key = getJobKey(input.policyId, input.policyVersion);
  const now = new Date().toISOString();

  // Discover eligible verified players
  const { eligible, skipped } = await discoverEligiblePlayers();

  const recipients: RecipientResult[] = [
    ...eligible.map((e) => ({
      playerId: e.playerId,
      maskedEmail: e.maskedEmail,
      status: "pending" as const,
    })),
    ...skipped.map((s) => ({
      playerId: s.playerId,
      maskedEmail: "unverified player",
      status: "skipped" as const,
      error: s.reason,
    })),
  ];

  const initialJob: PolicyNotificationJob = {
    id: jobId,
    policyId: input.policyId,
    policyTitle: input.policyTitle,
    policyVersion: input.policyVersion,
    changeSummary: input.changeSummary,
    publishedAt: input.publishedAt,
    publishedBy: input.publishedBy,
    status: "processing",
    statusMessage: "Preparing email dispatch...",
    totalEligible: eligible.length,
    sentCount: 0,
    failedCount: 0,
    skippedCount: skipped.length,
    pendingCount: eligible.length,
    recipients,
    createdAt: now,
    updatedAt: now,
  };

  // Check email provider readiness
  const isSmtpReady = isGmailSmtpConfigured();
  const playFabTemplateId = process.env["PLAYFAB_POLICY_NOTIFICATION_EMAIL_TEMPLATE_ID"]?.trim();

  if (!isSmtpReady && !playFabTemplateId) {
    initialJob.status = "unconfigured";
    initialJob.statusMessage =
      "Email provider is not configured. Policy was published successfully, but notification emails were not dispatched.";
    await playFabAdmin("Admin/SetTitleInternalData", {
      Key: key,
      Value: JSON.stringify(initialJob),
    });
    return initialJob;
  }

  // Save initial job state before sending
  await playFabAdmin("Admin/SetTitleInternalData", {
    Key: key,
    Value: JSON.stringify(initialJob),
  });

  // Execute dispatch in batches
  return executeNotificationDispatch(initialJob, eligible);
}

/**
 * Dispatches notifications in batches of 20 with idempotency protection.
 */
async function executeNotificationDispatch(
  job: PolicyNotificationJob,
  eligible: { playerId: string; email: string; maskedEmail: string }[],
): Promise<PolicyNotificationJob> {
  const key = getJobKey(job.policyId, job.policyVersion);
  const emailContent = renderPolicyUpdateEmail({
    policyTitle: job.policyTitle,
    policyId: job.policyId,
    changeSummary: job.changeSummary,
    publishedDate: new Date(job.publishedAt).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
  });

  const smtpConfig = getGmailSmtpConfig();
  const playFabTemplateId = process.env["PLAYFAB_POLICY_NOTIFICATION_EMAIL_TEMPLATE_ID"]?.trim();

  let transport: ReturnType<typeof nodemailer.createTransport> | null = null;
  if (smtpConfig) {
    transport = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: { user: smtpConfig.user, pass: smtpConfig.pass },
    });
  }

  const batchSize = 20;
  for (let i = 0; i < eligible.length; i += batchSize) {
    const batch = eligible.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (player) => {
        const recipient = job.recipients.find((r) => r.playerId === player.playerId);
        if (!recipient || recipient.status === "sent") return;

        try {
          if (transport && smtpConfig) {
            await transport.sendMail({
              from: smtpConfig.from,
              to: player.email,
              subject: emailContent.subject,
              text: emailContent.text,
              html: emailContent.html,
            });
          } else if (playFabTemplateId) {
            await emailDelivery.send(player.playerId, playFabTemplateId);
          } else {
            throw new Error("No available email transport.");
          }

          recipient.status = "sent";
          recipient.sentAt = new Date().toISOString();
          job.sentCount += 1;
          job.pendingCount = Math.max(0, job.pendingCount - 1);
        } catch (error) {
          recipient.status = "failed";
          recipient.error = error instanceof Error ? error.message : "Delivery failed";
          job.failedCount += 1;
          job.pendingCount = Math.max(0, job.pendingCount - 1);
        }
      }),
    );
  }

  if (transport) {
    transport.close();
  }

  job.status = job.failedCount > 0 ? (job.sentCount > 0 ? "completed" : "failed") : "completed";
  job.statusMessage =
    job.failedCount > 0
      ? `Completed with ${job.failedCount} delivery issue${job.failedCount === 1 ? "" : "s"}.`
      : `Successfully sent ${job.sentCount} notification email${job.sentCount === 1 ? "" : "s"}.`;
  job.updatedAt = new Date().toISOString();

  await playFabAdmin("Admin/SetTitleInternalData", {
    Key: key,
    Value: JSON.stringify(job),
  });

  return job;
}

/**
 * Retries failed notification deliveries for an existing job without duplicating successful ones.
 */
export async function retryPolicyNotificationJob(
  policyId: "privacy" | "terms",
  version: string,
): Promise<PolicyNotificationJob> {
  const key = getJobKey(policyId, version);
  const rawData = object(
    (await playFabAdmin("Admin/GetTitleInternalData", { Keys: [key] }))["Data"],
  );
  const stored = rawData[key];

  if (!stored) {
    throw new AdminApiError(404, "Notification job not found.");
  }

  const job = JSON.parse(String(stored)) as PolicyNotificationJob;
  const failedRecipients = job.recipients.filter(
    (r) => r.status === "failed" || r.status === "pending",
  );

  if (failedRecipients.length === 0) {
    return job;
  }

  // Lookup actual email addresses for failed recipients
  const retryEligible: { playerId: string; email: string; maskedEmail: string }[] = [];
  for (const r of failedRecipients) {
    try {
      const res = await playFabAdmin("Server/GetPlayerProfile", {
        PlayFabId: r.playerId,
        ProfileConstraints: { ShowContactEmailAddresses: true },
      });
      const profile = object(res["PlayerProfile"]);
      const contacts = profile["ContactEmailAddresses"];
      if (Array.isArray(contacts) && contacts.length > 0) {
        const confirmed = contacts.find((c) => object(c)["VerificationStatus"] === "Confirmed");
        const email = String(object(confirmed)["EmailAddress"] ?? "").trim();
        if (email) {
          retryEligible.push({ playerId: r.playerId, email, maskedEmail: r.maskedEmail });
        }
      }
    } catch {
      // Keep as failed
    }
  }

  job.status = "processing";
  job.statusMessage = "Retrying failed deliveries...";
  job.pendingCount = retryEligible.length;
  job.failedCount = Math.max(0, job.failedCount - retryEligible.length);

  return executeNotificationDispatch(job, retryEligible);
}

/**
 * Loads the latest notification job for a policy from Title Internal Data.
 */
export async function getLatestPolicyNotificationJob(
  policyId: "privacy" | "terms",
  version?: string,
): Promise<PolicyNotificationJob | null> {
  const rawData = object((await playFabAdmin("Admin/GetTitleInternalData"))["Data"]);

  if (version) {
    const key = getJobKey(policyId, version);
    if (rawData[key]) {
      try {
        return JSON.parse(String(rawData[key])) as PolicyNotificationJob;
      } catch {
        return null;
      }
    }
  }

  // Scan all jobs for policyId and return the newest
  const matchingKeys = Object.keys(rawData).filter((k) => k.startsWith(`${jobPrefix}${policyId}.`));
  if (matchingKeys.length === 0) return null;

  let latestJob: PolicyNotificationJob | null = null;
  for (const key of matchingKeys) {
    try {
      const job = JSON.parse(String(rawData[key])) as PolicyNotificationJob;
      if (!latestJob || Date.parse(job.createdAt) > Date.parse(latestJob.createdAt)) {
        latestJob = job;
      }
    } catch {
      // skip corrupt
    }
  }

  return latestJob;
}
