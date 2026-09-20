import { emailDelivery } from "./delivery.server.ts";

export type ContactNotificationStatus = "sent" | "not_configured" | "failed" | "not_applicable";
/** Messages/replies are already durable before this best-effort notification runs. */
export async function notifyContact(
  kind: "admin" | "player",
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
  if (!recipient || !/^[a-f0-9]{1,32}$/i.test(recipient) || !template) return "not_configured";
  try {
    await emailDelivery.send(recipient, template);
    return "sent";
  } catch {
    console.warn("[contact/email] Notification failed", { kind });
    return "failed";
  }
}
