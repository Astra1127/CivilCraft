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

/**
 * Normalizes a URL by trimming whitespace, verifying http/https protocol,
 * and stripping any trailing slashes.
 */
export function normalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";
  try {
    const withProtocol =
      trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? trimmed
        : `https://${trimmed}`;
    const parsed = new URL(withProtocol);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      // Remove trailing slashes from pathname (keep clean pathname)
      const cleanPath = parsed.pathname.replace(/\/+$/, "");
      return `${parsed.origin}${cleanPath}`;
    }
  } catch {
    // invalid URL format
  }
  return "";
}

/**
 * Resolves the public site URL for user-facing links in outgoing emails.
 *
 * Priority:
 * 1. process.env["PUBLIC_SITE_URL"] || process.env["SITE_URL"]
 * 2. Vercel deployment variables (VERCEL_PROJECT_PRODUCTION_URL or VERCEL_URL) if in production
 * 3. Passed origin argument (if valid and not localhost in production)
 * 4. process.env["ADMIN_AUTH_ORIGIN"] (if valid and not localhost in production)
 * 5. Production fallback: "https://civilcraft.org"
 * 6. Local development fallback: "http://localhost:5173"
 */
export function resolvePublicSiteUrl(origin?: string): string {
  // 1. Explicit public site URL configuration
  const configured =
    process.env["PUBLIC_SITE_URL"]?.trim() || process.env["SITE_URL"]?.trim();
  if (configured) {
    const normalized = normalizeUrl(configured);
    if (normalized) return normalized;
  }

  const isProd =
    process.env["NODE_ENV"] === "production" ||
    process.env["VERCEL_ENV"] === "production" ||
    process.env["VERCEL"] === "1";

  // 2. Vercel deployment system variables in production
  if (isProd) {
    const vercelProdUrl =
      process.env["VERCEL_PROJECT_PRODUCTION_URL"]?.trim() ||
      process.env["VERCEL_URL"]?.trim();
    if (vercelProdUrl) {
      const normalized = normalizeUrl(vercelProdUrl);
      if (normalized) return normalized;
    }
  }

  // 3. Candidate from passed origin or ADMIN_AUTH_ORIGIN
  const candidate = origin?.trim() || process.env["ADMIN_AUTH_ORIGIN"]?.trim() || "";
  if (candidate) {
    const normalized = normalizeUrl(candidate);
    if (normalized) {
      const isLocal = /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/i.test(normalized);
      if (!isProd || !isLocal) {
        return normalized;
      }
    }
  }

  // 4. Default fallbacks: strictly non-localhost in production
  return isProd ? "https://civilcraft.org" : "http://localhost:5173";
}

export function resolveWebsiteUrl(origin?: string): string {
  return resolvePublicSiteUrl(origin);
}

export function resolveDashboardUrl(origin?: string): string {
  const candidate = process.env["ADMIN_AUTH_ORIGIN"]?.trim() || origin?.trim() || "";
  if (candidate) {
    const normalized = normalizeUrl(candidate);
    if (normalized) {
      return `${normalized}/admin/messages`;
    }
  }
  const base = resolvePublicSiteUrl(origin);
  return `${base}/admin/messages`;
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
<body style="margin: 0; padding: 0; background-color: #F3E7D1; font-family: 'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #4E372C;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F3E7D1; padding: 40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #FCF6EC; border: 1px solid #4A3428; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(74, 52, 40, 0.08);">
          <!-- Top Gold Accent Bar -->
          <tr>
            <td style="height: 5px; background-color: #C58A42; line-height: 5px; font-size: 5px;">&nbsp;</td>
          </tr>
          <!-- Header -->
          <tr>
            <td style="padding: 28px 32px 20px 32px; border-bottom: 1px solid #E8DAC6;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="font-size: 11px; font-weight: 700; color: #C58A42; letter-spacing: 2px; text-transform: uppercase;">Civil Craft</div>
                    <h1 style="margin: 6px 0 0 0; font-size: 22px; font-weight: 700; color: #4E372C; line-height: 1.3;">New Contact Submission</h1>
                  </td>
                  <td align="right" valign="middle">
                    <span style="display: inline-block; background-color: #FAF2E6; color: #C58A42; border: 1px solid #C58A42; padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
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
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #FAF2E6; border: 1px solid #D6C4B2; border-radius: 8px; font-size: 14px;">
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #E8DAC6; color: #7A6658; width: 120px; font-weight: 700;">From:</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #E8DAC6; color: #4E372C; font-weight: 600;">${escapeHtml(content.name)}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #E8DAC6; color: #7A6658; font-weight: 700;">Email:</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #E8DAC6;">
                    <a href="mailto:${escapeHtml(content.email)}" style="color: #C58A42; text-decoration: underline; font-weight: 600;">${escapeHtml(content.email)}</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #E8DAC6; color: #7A6658; font-weight: 700;">Subject:</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #E8DAC6; color: #4E372C; font-weight: 600;">${escapeHtml(content.subject)}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; color: #7A6658; font-weight: 700;">Date &amp; Time:</td>
                  <td style="padding: 12px 16px; color: #4E372C;">${escapeHtml(formattedSubmissionDate)}</td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Message Body -->
          <tr>
            <td style="padding: 4px 32px 24px 32px;">
              <div style="font-size: 11px; font-weight: 700; color: #7A6658; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px;">Message:</div>
              <div style="background-color: #FAF2E6; border: 1px solid #D6C4B2; border-left: 4px solid #C58A42; border-radius: 8px; padding: 18px 20px; color: #4E372C; font-size: 15px; line-height: 1.65; white-space: pre-wrap; word-break: break-word;">${escapeHtml(content.message).replace(/\r\n|\r|\n/g, "<br>")}</div>
            </td>
          </tr>
          <!-- Action CTA -->
          <tr>
            <td style="padding: 4px 32px 28px 32px;">
              <table border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="border-radius: 6px; background-color: #C58A42;">
                    <a href="${escapeHtml(dashboardUrl)}" target="_blank" style="display: inline-block; background-color: #C58A42; color: #FFFFFF; text-decoration: none; padding: 12px 26px; border-radius: 6px; font-size: 14px; font-weight: 700; letter-spacing: 0.5px; border: 1px solid #A87332;">
                      Open Admin Dashboard &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 18px 32px; background-color: #F5ECE0; border-top: 1px solid #E8DAC6; font-size: 12px; color: #7A6658; line-height: 1.5;">
              This notification was generated by the Civil Craft contact system. This message is safely stored in Title Internal Data.
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
      `Our team has reviewed your message regarding "${content.subject}":`,
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
      "This is a notification email from Civil Craft.",
      "Please do not reply directly to this email address.",
      "If you have additional questions, please reach out through the Civil Craft website.",
    ].join("\n");

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(emailSubject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F3E7D1; font-family: 'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #4E372C;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F3E7D1; padding: 40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #FCF6EC; border: 1px solid #4A3428; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(74, 52, 40, 0.08);">
          <!-- Top Gold Accent Bar -->
          <tr>
            <td style="height: 5px; background-color: #C58A42; line-height: 5px; font-size: 5px;">&nbsp;</td>
          </tr>
          <!-- Header -->
          <tr>
            <td style="padding: 28px 32px 20px 32px; border-bottom: 1px solid #E8DAC6;">
              <div style="font-size: 11px; font-weight: 700; color: #C58A42; letter-spacing: 2px; text-transform: uppercase;">Civil Craft Support</div>
              <h1 style="margin: 6px 0 0 0; font-size: 22px; font-weight: 700; color: #4E372C; line-height: 1.3;">Response from Civil Craft Team</h1>
            </td>
          </tr>
          <!-- Greeting & Admin Reply -->
          <tr>
            <td style="padding: 24px 32px 16px 32px;">
              <p style="margin: 0 0 14px 0; font-size: 15px; color: #4E372C; line-height: 1.5;">
                Hello <strong>${escapeHtml(content.name)}</strong>,
              </p>
              <p style="margin: 0 0 14px 0; font-size: 14px; color: #7A6658; line-height: 1.5;">
                Our team has reviewed your message regarding <em>"${escapeHtml(content.subject)}"</em>:
              </p>
              <!-- Reply Box -->
              <div style="background-color: #FAF2E6; border: 1px solid #D6C4B2; border-left: 4px solid #C58A42; border-radius: 8px; padding: 18px 20px; color: #4E372C; font-size: 15px; line-height: 1.65; white-space: pre-wrap; word-break: break-word;">${escapeHtml(adminReplyText).replace(/\r\n|\r|\n/g, "<br>")}</div>
            </td>
          </tr>
          ${
            originalMessageText
              ? `<!-- Original Message Context Box -->
          <tr>
            <td style="padding: 4px 32px 24px 32px;">
              <div style="font-size: 11px; font-weight: 700; color: #7A6658; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px;">
                Your Original Inquiry (${escapeHtml(formattedSubmissionDate)}):
              </div>
              <div style="background-color: #F2E5D3; border: 1px solid #D6C4B2; border-radius: 8px; padding: 14px 16px; color: #7A6658; font-size: 13px; line-height: 1.6; white-space: pre-wrap; word-break: break-word;">${escapeHtml(originalMessageText).replace(/\r\n|\r|\n/g, "<br>")}</div>
            </td>
          </tr>`
              : ""
          }
          <!-- Website Action Link -->
          <tr>
            <td style="padding: 8px 32px 28px 32px;">
              <table border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="border-radius: 6px; background-color: #C58A42;">
                    <a href="${escapeHtml(websiteUrl)}" target="_blank" style="display: inline-block; background-color: #C58A42; color: #FFFFFF; text-decoration: none; padding: 12px 26px; border-radius: 6px; font-size: 14px; font-weight: 700; letter-spacing: 0.5px; border: 1px solid #A87332;">
                      Visit Civil Craft Website &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #F5ECE0; border-top: 1px solid #E8DAC6; font-size: 12px; color: #7A6658; line-height: 1.6;">
              <p style="margin: 0 0 6px 0;">This is a notification email from Civil Craft.</p>
              <p style="margin: 0 0 6px 0;">Please do not reply directly to this email address.</p>
              <p style="margin: 0;">If you have additional questions, please reach out through the <a href="${escapeHtml(websiteUrl)}" style="color: #C58A42; text-decoration: underline; font-weight: 600;">Civil Craft website</a>.</p>
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

