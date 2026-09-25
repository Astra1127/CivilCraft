import nodemailer from "nodemailer";
import { z } from "zod";
import { renderResendEmail, type ContactResendContent } from "./contact-resend.server.ts";

export interface GmailSmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

/**
 * Validates and retrieves the server-side Gmail SMTP configuration.
 * Strictly checks process.env (server-only).
 */
export function getGmailSmtpConfig(): GmailSmtpConfig | null {
  const user = (process.env["GMAIL_SMTP_USER"] || process.env["SMTP_USER"])?.trim();
  const rawPass = (
    process.env["GMAIL_SMTP_APP_PASSWORD"] ||
    process.env["SMTP_PASS"] ||
    process.env["SMTP_PASSWORD"]
  )?.trim();
  if (!user || !rawPass) return null;

  // Google App Passwords are 16 letters, often formatted with spaces (e.g. "xxxx xxxx xxxx xxxx")
  const pass = rawPass.replace(/\s+/g, "");

  const host =
    (process.env["GMAIL_SMTP_HOST"] || process.env["SMTP_HOST"])?.trim() || "smtp.gmail.com";
  const rawPort = (process.env["GMAIL_SMTP_PORT"] || process.env["SMTP_PORT"])?.trim();
  const port = rawPort ? Number(rawPort) : 465;
  const secure =
    process.env["GMAIL_SMTP_SECURE"] !== undefined
      ? process.env["GMAIL_SMTP_SECURE"] === "true"
      : process.env["SMTP_SECURE"] !== undefined
        ? process.env["SMTP_SECURE"] === "true"
        : port === 465;

  const from = `Civil Craft <${user}>`;

  return { host, port, secure, user, pass, from };
}

/** Determines whether Gmail SMTP delivery is configured. */
export function isGmailSmtpConfigured(): boolean {
  return getGmailSmtpConfig() !== null;
}

export interface SendGmailReplyOptions {
  recipient?: string;
  to?: string;
  content: ContactResendContent;
  origin?: string;
}

/**
 * Sends an admin -> visitor reply email through Gmail SMTP using Nodemailer.
 * Reuses the existing Civil Craft branded HTML email template.
 */
export async function sendGmailReplyEmail({
  recipient,
  to,
  content,
  origin,
}: SendGmailReplyOptions): Promise<void> {
  const targetEmail = recipient?.trim() || to?.trim() || content.email?.trim();

  const config = getGmailSmtpConfig();
  if (!config) {
    console.warn(
      "[contact/gmail] SMTP configuration missing: GMAIL_SMTP_USER or GMAIL_SMTP_APP_PASSWORD not set",
    );
    throw new Error("Gmail SMTP configuration missing");
  }

  if (!targetEmail) {
    console.warn("[contact/gmail] Missing recipient email");
    throw new Error("Missing recipient email");
  }

  let validRecipient: string;
  try {
    validRecipient = z.string().trim().email().parse(targetEmail);
  } catch {
    console.warn("[contact/gmail] Invalid recipient email address", { recipient: targetEmail });
    throw new Error(`Invalid recipient email: ${targetEmail}`);
  }

  // Render the existing Civil Craft reply HTML email
  const rendered = renderResendEmail("player", content, origin);

  console.log("[contact/gmail] Recipient:", validRecipient);
  console.log("[contact/gmail] Sending reply");

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  try {
    await transporter.sendMail({
      from: config.from,
      to: validRecipient,
      replyTo: config.user,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    console.log("[contact/gmail] Delivery successful");
  } catch (err: unknown) {
    console.warn("[contact/gmail] Delivery failed");
    const error = err as { code?: string; responseCode?: number; message?: string };
    if (error?.code === "EAUTH" || error?.responseCode === 535) {
      console.warn(
        "[contact/gmail] Authentication failure: check GMAIL_SMTP_USER and GMAIL_SMTP_APP_PASSWORD",
        {
          code: error.code || error.responseCode,
        },
      );
    } else if (
      error?.code === "ESOCKET" ||
      error?.code === "ETIMEDOUT" ||
      error?.code === "ECONNREFUSED"
    ) {
      console.warn("[contact/gmail] SMTP connection failure", {
        code: error.code,
        message: error.message,
      });
    } else if (error?.responseCode && error.responseCode >= 500) {
      console.warn("[contact/gmail] Gmail rejected message", {
        responseCode: error.responseCode,
        message: error.message,
      });
    } else {
      console.warn("[contact/gmail] Error code:", error?.code || "UNKNOWN");
      console.warn("[contact/gmail] Error message:", error?.message || "Unknown delivery error");
    }
    throw err;
  } finally {
    transporter.close();
  }
}

