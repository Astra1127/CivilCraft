import { emailDelivery } from "./delivery.server.ts";
import {
  contactRecipient,
  contactSmtp,
  contactSmtpConfigured,
  renderContactEmail,
  type ContactEmailContent,
} from "./contact-smtp.server.ts";
import {
  resendConfigured,
  sendContactResendEmail,
  type ContactResendContent,
} from "./contact-resend.server.ts";
import { isGmailSmtpConfigured, sendGmailReplyEmail } from "./gmail-smtp.server.ts";

export type ContactNotificationStatus = "sent" | "not_configured" | "failed" | "not_applicable";

/**
 * Dispatches contact notifications and replies:
 * 1. VISITOR -> ADMIN notification: delivered via Resend
 * 2. ADMIN -> VISITOR reply: delivered via Gmail SMTP (Nodemailer)
 */
export async function notifyContact(
  kind: "admin" | "player",
  content: ContactResendContent & ContactEmailContent,
  ownerId?: string | null,
): Promise<ContactNotificationStatus> {
  const origin = process.env["ADMIN_AUTH_ORIGIN"] || "";

  // 1. VISITOR -> ADMIN NOTIFICATION (delivered via Resend)
  if (kind === "admin") {
    if (resendConfigured()) {
      try {
        let adminRecipient =
          process.env["ADMIN_EMAIL"]?.trim() ||
          process.env["GMAIL_SMTP_USER"]?.trim() ||
          process.env["SMTP_USER"]?.trim();
        if (!adminRecipient && process.env["PLAYFAB_CONTACT_ADMIN_PLAYER_ID"]?.trim()) {
          try {
            adminRecipient = await contactRecipient(
              process.env["PLAYFAB_CONTACT_ADMIN_PLAYER_ID"]!.trim(),
            );
          } catch {
            // fallback lookup failure
          }
        }
        if (!adminRecipient) {
          console.warn("[contact/resend] Missing ADMIN_EMAIL for contact notification");
          return "not_configured";
        }
        await sendContactResendEmail("admin", adminRecipient, content, origin);
        return "sent";
      } catch {
        console.warn("[contact/resend] Notification failed", { kind });
        return "failed";
      }
    }

    // Fallback for admin notification if Resend is not configured: check legacy SMTP or PlayFab template
    const recipient = process.env["PLAYFAB_CONTACT_ADMIN_PLAYER_ID"]?.trim();
    const template = process.env["PLAYFAB_CONTACT_ADMIN_EMAIL_TEMPLATE_ID"]?.trim();
    if (!recipient || !/^[a-f0-9]{1,32}$/i.test(recipient)) return "not_configured";
    try {
      if (contactSmtpConfigured()) {
        const rendered = renderContactEmail(kind, content, origin);
        await contactSmtp.send(await contactRecipient(recipient), rendered);
      } else {
        if (!template) return "not_configured";
        await emailDelivery.send(recipient, template);
      }
      return "sent";
    } catch {
      console.warn("[contact/email] Notification failed", { kind });
      return "failed";
    }
  }

  // 2. ADMIN -> VISITOR REPLY (delivered via Gmail SMTP)
  if (kind === "player") {
    console.log("[contact/gmail] notifyContact player branch");
    const isConfigured = isGmailSmtpConfigured();
    console.log(`[contact/gmail] SMTP configured: ${isConfigured}`);

    if (isConfigured) {
      try {
        let playerRecipient = content.email?.trim();
        if (!playerRecipient && ownerId) {
          try {
            playerRecipient = await contactRecipient(ownerId);
          } catch {
            // fallback lookup failure
          }
        }
        if (!playerRecipient) {
          console.warn("[contact/gmail] Missing recipient email for player reply");
          return "not_configured";
        }
        await sendGmailReplyEmail({
          to: playerRecipient,
          content,
          origin,
        });
        return "sent";
      } catch (err: unknown) {
        // Gmail SMTP failed to deliver. Return failed status to update UI. Never silently fall back to Resend.
        console.warn("[contact/gmail] Delivery failed for player reply", {
          recipient: content.email?.trim(),
          error: (err as Error)?.message || "Unknown error",
        });
        return "failed";
      }
    }

    const missingVars: string[] = [];
    if (!process.env["GMAIL_SMTP_USER"]?.trim() && !process.env["SMTP_USER"]?.trim()) {
      missingVars.push("GMAIL_SMTP_USER (or SMTP_USER)");
    }
    if (
      !process.env["GMAIL_SMTP_APP_PASSWORD"]?.trim() &&
      !process.env["SMTP_PASS"]?.trim() &&
      !process.env["SMTP_PASSWORD"]?.trim()
    ) {
      missingVars.push("GMAIL_SMTP_APP_PASSWORD (or SMTP_PASS)");
    }
    console.warn(`[contact/gmail] Missing required configuration: ${missingVars.join(", ")}`);

    // Fallback for player reply if Gmail SMTP is not configured: check legacy SMTP or PlayFab template
    if (!ownerId) return "not_applicable";
    const recipient = ownerId;
    const template = process.env["PLAYFAB_CONTACT_REPLY_EMAIL_TEMPLATE_ID"]?.trim();
    if (!recipient || !/^[a-f0-9]{1,32}$/i.test(recipient)) return "not_configured";
    try {
      if (contactSmtpConfigured()) {
        const rendered = renderContactEmail(kind, content, origin);
        await contactSmtp.send(await contactRecipient(recipient), rendered);
      } else {
        if (!template) return "not_configured";
        await emailDelivery.send(recipient, template);
      }
      return "sent";
    } catch {
      console.warn("[contact/email] Notification failed", { kind });
      return "failed";
    }
  }

  return "not_configured";
}

