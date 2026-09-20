import { emailDelivery } from "./delivery.server.ts";
import {
  contactRecipient,
  contactSmtp,
  contactSmtpConfigured,
  renderContactEmail,
  type ContactEmailContent,
} from "./contact-smtp.server.ts";

export type ContactNotificationStatus = "sent" | "not_configured" | "failed" | "not_applicable";
/** Messages/replies are already durable before this best-effort notification runs. */
export async function notifyContact(
  kind: "admin" | "player",
  content: ContactEmailContent,
  ownerId?: string | null,
): Promise<ContactNotificationStatus> {
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
      const rendered = renderContactEmail(kind, content, process.env["ADMIN_AUTH_ORIGIN"] || "");
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
