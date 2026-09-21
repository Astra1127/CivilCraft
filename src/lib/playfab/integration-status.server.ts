import { z } from "zod";
import { imageStorage } from "../cms/images.server.ts";
import type { AdminIntegrationStatus } from "./admin-types.ts";

/** Safe configuration labels and a read-only Blob capability check. No mutations. */
export async function integrationServices(): Promise<AdminIntegrationStatus["services"]> {
  const configured = (name: string) =>
    process.env[name]?.trim() ? ("Configured" as const) : ("Not configured" as const);
  const smtpSelected = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"].some(
    (key) => Boolean(process.env[key]),
  );
  const port = Number(process.env["SMTP_PORT"] || "587");
  let safeOrigin = false;
  try {
    const origin = new URL(process.env["ADMIN_AUTH_ORIGIN"] || "");
    safeOrigin = origin.protocol === "https:" && !origin.username && !origin.password;
  } catch {
    /* missing/invalid trusted email link origin */
  }
  const smtpReady =
    Boolean(
      process.env["SMTP_HOST"]?.trim() &&
      process.env["SMTP_USER"]?.trim() &&
      process.env["SMTP_PASSWORD"],
    ) &&
    Number.isInteger(port) &&
    port >= 1 &&
    port <= 65535 &&
    z.string().email().safeParse(process.env["SMTP_FROM"]?.trim()).success;
  return {
    imageStorage: await imageStorage.configuration(),
    recoveryTemplate: configured("PLAYFAB_RECOVERY_EMAIL_TEMPLATE_ID"),
    releaseTemplate: configured("PLAYFAB_RELEASE_EMAIL_TEMPLATE_ID"),
    emailWorker: configured("CRON_SECRET"),
    contactSmtp: smtpSelected
      ? smtpReady
        ? "Configured"
        : "Incomplete or invalid"
      : "Not configured",
    contactDelivery: smtpSelected ? "Direct SMTP" : "PlayFab template fallback",
    contactLinkOrigin: safeOrigin ? "Configured" : "Not configured",
    contactAdminRecipient: /^[a-f0-9]{1,32}$/i.test(
      process.env["PLAYFAB_CONTACT_ADMIN_PLAYER_ID"]?.trim() || "",
    )
      ? "Configured"
      : "Not configured",
    contactAdminTemplate: configured("PLAYFAB_CONTACT_ADMIN_EMAIL_TEMPLATE_ID"),
    contactReplyTemplate: configured("PLAYFAB_CONTACT_REPLY_EMAIL_TEMPLATE_ID"),
  };
}
