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

export type ContactNotificationStatus = "sent" | "not_configured" | "failed" | "not_applicable";
/** Messages/replies are already durable before this best-effort notification runs. */
export async function notifyContact(
  kind: "admin" | "player",
  content: ContactResendContent & ContactEmailContent,
  ownerId?: string | null,
): Promise<ContactNotificationStatus> {
  const origin = process.env["ADMIN_AUTH_ORIGIN"] || "";

  // 1. Resend delivery path (used when RESEND_API_KEY is configured)
  if (resendConfigured()) {
    try {
      if (kind === "admin") {
        let adminRecipient = process.env["ADMIN_EMAIL"]?.trim();
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
      } else {
        // Player / visitor reply notification (handles both registered players and guests)
        let playerRecipient = content.email?.trim();
        if (!playerRecipient && ownerId) {
          try {
            playerRecipient = await contactRecipient(ownerId);
          } catch {
            // fallback lookup failure
          }
        }
        if (!playerRecipient) {
          console.warn("[contact/resend] Missing recipient email for player reply");
          return "not_configured";
        }
        await sendContactResendEmail("player", playerRecipient, content, origin);
        return "sent";
      }
    } catch {
      console.warn("[contact/resend] Notification failed", { kind });
      return "failed";
    }
  }

  // 2. Fallback to existing direct SMTP or PlayFab templates
  if (kind === "player" && !ownerId) return "not_applicable";
  const recipient =
    kind === "admin" ? process.env["PLAYFAB_CONTACT_ADMIN_PLAYER_ID"]?.trim() : ownerId;
  const template =
    process.env[
      kind === "admin"
        ? "PLAYFAB_CONTACT_ADMIN_EMAIL_TEMPLATE_ID"
        : "PLAYFAB_CONTACT_REPLY_EMAIL_TEMPLATE_ID"
    ]?.trim();
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

