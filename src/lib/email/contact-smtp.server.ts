import nodemailer from "nodemailer";
import { z } from "zod";
import { object, playFabAdmin } from "../playfab/admin-client.server.ts";

export interface ContactEmailContent {
  name: string;
  email: string;
  subject: string;
  message: string;
}
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );

export function renderContactEmail(
  kind: "admin" | "player",
  content: ContactEmailContent,
  origin: string,
) {
  const base = new URL(origin);
  if (base.protocol !== "https:" || base.username || base.password)
    throw new Error("Invalid email site origin");
  const url = new URL(kind === "admin" ? "/admin/messages" : "/dashboard/messages", base).href;
  const button = kind === "admin" ? "Open Admin Messages" : "View Conversation";
  const heading = kind === "admin" ? "New contact message" : "The Civil Craft team replied";
  const fields =
    kind === "admin"
      ? [
          ["Name", content.name],
          ["Email", content.email],
          ["Subject", content.subject],
        ]
      : [["Subject", content.subject]];
  const footer =
    "Reply on the Civil Craft website. This email is a notification and readable copy only; replies to this email are not added to your conversation.";
  return {
    subject: `Civil Craft: ${heading}`,
    text: `${heading}\n\n${fields.map(([label, value]) => `${label}: ${value}`).join("\n")}\n\n${content.message}\n\n${button}: ${url}\n\n${footer}`,
    html: `<!doctype html><html><body><h1>${heading}</h1>${fields.map(([label, value]) => `<p><strong>${label}:</strong> ${escapeHtml(value!)}</p>`).join("")}<div style="white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(content.message).replace(/\r\n|\r|\n/g, "<br>")}</div><p><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px">${button}</a></p><p>${footer}</p></body></html>`,
  };
}

/** An absent SMTP configuration preserves existing PlayFab template notifications. */
export function contactSmtpConfigured() {
  return ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"].some((key) =>
    Boolean(process.env[key]),
  );
}

export const contactSmtp = {
  async send(recipient: string, content: ReturnType<typeof renderContactEmail>) {
    const host = process.env["SMTP_HOST"]?.trim();
    const port = Number(process.env["SMTP_PORT"] || "587");
    const user = process.env["SMTP_USER"]?.trim();
    const pass = process.env["SMTP_PASSWORD"];
    const from = z.string().email().parse(process.env["SMTP_FROM"]?.trim());
    if (!host || !user || !pass || !Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error("Incomplete contact SMTP configuration");
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      requireTLS: true,
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    try {
      await transport.sendMail({ from, to: recipient, ...content });
    } finally {
      transport.close();
    }
  },
};

export async function contactRecipient(playerId: string) {
  const result = await playFabAdmin("Server/GetPlayerProfile", {
    PlayFabId: playerId,
    ProfileConstraints: { ShowContactEmailAddresses: true },
  });
  const contacts = object(result["PlayerProfile"])["ContactEmailAddresses"];
  if (!Array.isArray(contacts)) throw new Error("No contact email");
  // Resolve from the authenticated owner's PlayFab profile, never the submitted form address.
  const address = contacts
    .map((entry) => object(entry)["EmailAddress"])
    .find((value) => z.string().email().safeParse(value).success);
  return z.string().email().parse(address);
}
