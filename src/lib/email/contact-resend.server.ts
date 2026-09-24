import { z } from "zod";

export interface ContactResendContent {
  name: string;
  email: string;
  subject: string;
  message: string;
  inquiryType?: string;
  createdAt?: string;
  originalMessage?: string;
  replyMessage?: string;
  replyCreatedAt?: string;
}

const escapeHtml = (value: string) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );

function formatDate(isoString?: string): string {
  if (!isoString) return new Date().toUTCString();
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toUTCString();
  } catch {
    return isoString;
  }
}

function resolveDashboardUrl(origin?: string): string {
  const candidate = origin?.trim() || process.env["ADMIN_AUTH_ORIGIN"]?.trim() || "";
  if (candidate) {
    try {
      const url = new URL(candidate);
      if (url.protocol === "https:" || url.protocol === "http:") {
        return new URL("/admin/messages", url).href;
      }
    } catch {
      // fallback
    }
  }
  return "https://civilcraft.org/admin/messages";
}

function resolveWebsiteUrl(origin?: string): string {
  const candidate = origin?.trim() || process.env["ADMIN_AUTH_ORIGIN"]?.trim() || "";
  if (candidate) {
    try {
      const url = new URL(candidate);
      if (url.protocol === "https:" || url.protocol === "http:") {
        return url.origin;
      }
    } catch {
      // fallback
    }
  }
  return "https://civilcraft.org";
}

export function renderResendEmail(
  kind: "admin" | "player",
  content: ContactResendContent,
  origin?: string,
) {
  const formattedSubmissionDate = formatDate(content.createdAt);
  const inquiryType = content.inquiryType || "General";

  if (kind === "admin") {
    const dashboardUrl = resolveDashboardUrl(origin);
    const emailSubject = `[Civil Craft] Contact (${inquiryType}): ${content.subject}`;
    const plainText = [
      "=== CIVIL CRAFT: NEW CONTACT MESSAGE ===",
      "",
      `Sender Name:    ${content.name}`,
      `Sender Email:   ${content.email}`,
      `Subject:        ${content.subject}`,
      `Inquiry Type:   ${inquiryType}`,
      `Submitted:      ${formattedSubmissionDate}`,
      "",
      "--- MESSAGE BODY ---",
      content.message,
      "",
      "--------------------",
      `Open Admin Dashboard: ${dashboardUrl}`,
      "",
      "This is an automated notification from Civil Craft. The message has been securely recorded in the database.",
    ].join("\n");

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(emailSubject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0b0f19; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 620px; background-color: #131b2e; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);">
          <!-- Top Gold Accent Bar -->
          <tr>
            <td style="height: 4px; background: #c49b5c; line-height: 4px; font-size: 4px;">&nbsp;</td>
          </tr>
          <!-- Header -->
          <tr>
            <td style="padding: 28px 32px 20px 32px; border-bottom: 1px solid #1e293b;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="font-size: 11px; font-weight: 700; color: #c49b5c; letter-spacing: 2px; text-transform: uppercase;">Civil Craft</div>
                    <h1 style="margin: 6px 0 0 0; font-size: 20px; font-weight: 700; color: #f8fafc; line-height: 1.3;">New Contact Submission</h1>
                  </td>
                  <td align="right" valign="middle">
                    <span style="display: inline-block; background-color: rgba(196, 155, 92, 0.15); color: #c49b5c; border: 1px solid rgba(196, 155, 92, 0.35); padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                      ${escapeHtml(inquiryType)}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Metadata Table -->
          <tr>
            <td style="padding: 24px 32px 16px 32px;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0b0f19; border: 1px solid #1e293b; border-radius: 8px; font-size: 14px;">
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #1e293b; color: #94a3b8; width: 120px; font-weight: 600;">From:</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #1e293b; color: #f8fafc; font-weight: 500;">${escapeHtml(content.name)}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #1e293b; color: #94a3b8; font-weight: 600;">Email:</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #1e293b;">
                    <a href="mailto:${escapeHtml(content.email)}" style="color: #60a5fa; text-decoration: none;">${escapeHtml(content.email)}</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #1e293b; color: #94a3b8; font-weight: 600;">Subject:</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #1e293b; color: #f8fafc; font-weight: 500;">${escapeHtml(content.subject)}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; color: #94a3b8; font-weight: 600;">Date & Time:</td>
                  <td style="padding: 12px 16px; color: #cbd5e1;">${escapeHtml(formattedSubmissionDate)}</td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Message Body (Directly readable in email) -->
          <tr>
            <td style="padding: 8px 32px 24px 32px;">
              <div style="font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px;">Message:</div>
              <div style="background-color: #0b0f19; border: 1px solid #1e293b; border-left: 4px solid #c49b5c; border-radius: 6px; padding: 18px 20px; color: #f1f5f9; font-size: 15px; line-height: 1.65; white-space: pre-wrap; word-break: break-word;">${escapeHtml(content.message).replace(/\r\n|\r|\n/g, "<br>")}</div>
            </td>
          </tr>
          <!-- Action CTA -->
          <tr>
            <td style="padding: 0 32px 32px 32px;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="left">
                    <a href="${escapeHtml(dashboardUrl)}" style="display: inline-block; background-color: #a77b43; color: #ffffff; text-decoration: none; padding: 12px 26px; border-radius: 6px; font-size: 14px; font-weight: 600; letter-spacing: 0.5px;">
                      Open Admin Dashboard &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 18px 32px; background-color: #0b0f19; border-top: 1px solid #1e293b; font-size: 12px; color: #64748b; line-height: 1.5;">
              This notification was generated by the Civil Craft contact system. This message is already safely stored in Title Internal Data.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    return { subject: emailSubject, text: plainText, html };
  } else {
    // Player / User reply email
    const websiteUrl = resolveWebsiteUrl(origin);
    const replyDate = formatDate(content.replyCreatedAt);
    const adminReplyText = content.replyMessage || content.message;
    const originalMessageText = content.originalMessage || "";
    const emailSubject = `Re: ${content.subject} - Civil Craft Support`;

    const plainText = [
      "=== CIVIL CRAFT TEAM REPLY ===",
      "",
      `Hello ${content.name},`,
      "",
      "The Civil Craft team has responded to your inquiry:",
      "",
      "--- ADMIN REPLY ---",
      adminReplyText,
      "",
      "--- ORIGINAL INQUIRY ---",
      `Subject: ${content.subject}`,
      `Date:    ${formattedSubmissionDate}`,
      "",
      originalMessageText,
      "",
      "------------------------",
      `Visit Civil Craft: ${websiteUrl}`,
      "",
      "Please note: This email was sent from an automated notification address. Replies to this email are not monitored. To continue the conversation, please submit another inquiry on the website.",
    ].join("\n");

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(emailSubject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0b0f19; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 620px; background-color: #131b2e; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);">
          <!-- Top Gold Accent Bar -->
          <tr>
            <td style="height: 4px; background: #c49b5c; line-height: 4px; font-size: 4px;">&nbsp;</td>
          </tr>
          <!-- Header -->
          <tr>
            <td style="padding: 28px 32px 20px 32px; border-bottom: 1px solid #1e293b;">
              <div style="font-size: 11px; font-weight: 700; color: #c49b5c; letter-spacing: 2px; text-transform: uppercase;">Civil Craft Support</div>
              <h1 style="margin: 6px 0 0 0; font-size: 20px; font-weight: 700; color: #f8fafc; line-height: 1.3;">Response from Civil Craft Team</h1>
            </td>
          </tr>
          <!-- Greeting & Admin Reply -->
          <tr>
            <td style="padding: 24px 32px 16px 32px;">
              <p style="margin: 0 0 16px 0; font-size: 15px; color: #e2e8f0; line-height: 1.5;">
                Hello <strong>${escapeHtml(content.name)}</strong>,
              </p>
              <p style="margin: 0 0 12px 0; font-size: 14px; color: #94a3b8; line-height: 1.5;">
                Our team has reviewed your message regarding <em>"${escapeHtml(content.subject)}"</em>:
              </p>
              <!-- Reply Box -->
              <div style="background-color: #0b0f19; border: 1px solid #1e293b; border-left: 4px solid #38bdf8; border-radius: 6px; padding: 18px 20px; color: #f8fafc; font-size: 15px; line-height: 1.65; white-space: pre-wrap; word-break: break-word;">${escapeHtml(adminReplyText).replace(/\r\n|\r|\n/g, "<br>")}</div>
            </td>
          </tr>
          ${
            originalMessageText
              ? `<!-- Original Message Context Box -->
          <tr>
            <td style="padding: 8px 32px 24px 32px;">
              <div style="font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
                Your Original Inquiry (${escapeHtml(formattedSubmissionDate)}):
              </div>
              <div style="background-color: #0f1626; border: 1px solid #1e293b; border-radius: 6px; padding: 14px 16px; color: #94a3b8; font-size: 13px; line-height: 1.6; white-space: pre-wrap; word-break: break-word;">${escapeHtml(originalMessageText).replace(/\r\n|\r|\n/g, "<br>")}</div>
            </td>
          </tr>`
              : ""
          }
          <!-- Website Action Link -->
          <tr>
            <td style="padding: 0 32px 32px 32px;">
              <a href="${escapeHtml(websiteUrl)}" style="display: inline-block; background-color: #a77b43; color: #ffffff; text-decoration: none; padding: 11px 22px; border-radius: 6px; font-size: 13px; font-weight: 600; letter-spacing: 0.5px;">
                Visit Civil Craft Website &rarr;
              </a>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 18px 32px; background-color: #0b0f19; border-top: 1px solid #1e293b; font-size: 12px; color: #64748b; line-height: 1.5;">
              This is a notification email from Civil Craft. Please do not reply directly to this email address. If you have additional questions, please reach out via the contact form on our website.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    return { subject: emailSubject, text: plainText, html };
  }
}

/** Determines if Resend email delivery is configured. */
export function resendConfigured(): boolean {
  return Boolean(process.env["RESEND_API_KEY"]?.trim());
}

/**
 * Sends a contact notification or reply email using the Resend REST API via native fetch.
 * Uses RESEND_FROM if configured; otherwise defaults to the documented Resend test sender onboarding@resend.dev.
 */
export async function sendContactResendEmail(
  kind: "admin" | "player",
  recipient: string,
  content: ContactResendContent,
  origin?: string,
): Promise<void> {
  const apiKey = process.env["RESEND_API_KEY"]?.trim();
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

  // Validate recipient email
  const validRecipient = z.string().trim().email().parse(recipient);

  // Sender address: user-configured RESEND_FROM or standard Resend testing sender
  const configuredFrom = process.env["RESEND_FROM"]?.trim();
  const from = configuredFrom || "Civil Craft <onboarding@resend.dev>";

  const rendered = renderResendEmail(kind, content, origin);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [validRecipient],
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "unknown");
    // Ensure we log useful diagnostics without leaking any API keys or secrets
    console.warn("[contact/resend] Dispatch failed", {
      status: response.status,
      kind,
      response: errorBody.slice(0, 300),
    });
    throw new Error(`Resend delivery failed with status ${response.status}`);
  }
}

