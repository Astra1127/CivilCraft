import { createHash } from "node:crypto";
import { BlobError, BlobNotFoundError, head, put } from "@vercel/blob";
import { getVercelOidcTokenSync } from "@vercel/oidc";
import nodemailer from "nodemailer";
import { z } from "zod";
import {
  AdminApiError,
  adminGameConfig,
  object,
  playFabAdmin,
} from "../playfab/admin-client.server.ts";
import { getGmailSmtpConfig } from "./gmail-smtp.server.ts";
import { emailDelivery } from "./delivery.server.ts";

const configKey = "civilcraft.website.v1.release-config";
const releasePrefix = "civilcraft.website.v1.releases.";
const deletedPrefix = "civilcraft.website.v1.release-deleted.";
const preferencePrefix = "civilcraft.email.preference.";
const cursorPrefix = "civilcraft.email.version-cursor.";
const versionId = (titleId: string, version: string) =>
  createHash("sha256")
    .update(JSON.stringify([titleId.toUpperCase(), version.trim()]))
    .digest("hex");
const label = z.string().trim().min(1).max(40);
export const versionAnnouncementSchema = z
  .object({
    id: z.string().regex(/^[a-f0-9]{64}$/),
    titleId: z.string().regex(/^[a-f0-9]{1,16}$/i),
    releaseId: z.string().regex(/^[a-zA-Z0-9-]{1,64}$/),
    version: label,
    build: label,
    announcedAtISO: z.string().datetime(),
  })
  .strict()
  .refine((event) => event.id === versionId(event.titleId, event.version));
export type VersionAnnouncement = z.infer<typeof versionAnnouncementSchema>;

export function createVersionAnnouncement(input: {
  releaseId: string;
  version: string;
  build: string;
}): VersionAnnouncement {
  const titleId = adminGameConfig().titleId;
  return versionAnnouncementSchema.parse({
    ...input,
    id: versionId(titleId, input.version),
    titleId,
    announcedAtISO: new Date().toISOString(),
  });
}

const smtpKeys = [
  "GMAIL_SMTP_HOST",
  "GMAIL_SMTP_PORT",
  "GMAIL_SMTP_SECURE",
  "GMAIL_SMTP_USER",
  "GMAIL_SMTP_APP_PASSWORD",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_PASSWORD",
  "SMTP_FROM",
  "EMAIL_FROM",
];
function smtpSelected() {
  return smtpKeys.some((key) => process.env[key] !== undefined);
}
function smtpConfig() {
  const config = getGmailSmtpConfig();
  const secure = process.env["GMAIL_SMTP_SECURE"] ?? process.env["SMTP_SECURE"];
  if (
    !config ||
    !z.string().email().safeParse(config.user).success ||
    !config.host ||
    /[\s/@\\]/.test(config.host) ||
    !Number.isInteger(config.port) ||
    config.port < 1 ||
    config.port > 65535 ||
    (secure !== undefined && !["true", "false"].includes(secure))
  )
    throw new AdminApiError(503, "Release email SMTP settings are incomplete or invalid.");
  return config;
}
function siteOrigin() {
  try {
    const url = new URL(
      process.env["PUBLIC_SITE_URL"]?.trim() || process.env["ADMIN_AUTH_ORIGIN"]?.trim() || "",
    );
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new AdminApiError(503, "Configure the canonical HTTPS website URL for release emails.");
  }
}
function oidcAvailable() {
  try {
    return Boolean(getVercelOidcTokenSync().trim());
  } catch {
    return false;
  }
}
export function releaseEmailReadiness(): {
  configured: boolean;
  provider: string;
  message: string;
} {
  const provider = smtpSelected()
    ? "Gmail SMTP"
    : process.env["PLAYFAB_RELEASE_EMAIL_TEMPLATE_ID"]?.trim()
      ? "PlayFab template"
      : "Not configured";
  try {
    if (!process.env["CRON_SECRET"]?.trim())
      throw new AdminApiError(503, "Configure the release email worker secret.");
    if (!adminGameConfig().secret)
      throw new AdminApiError(503, "Configure server access to PlayFab for release emails.");
    if (!process.env["BLOB_STORE_ID"]?.trim() || !oidcAvailable())
      throw new AdminApiError(
        503,
        "Connect the private Blob store with OIDC for release email duplicate protection.",
      );
    siteOrigin();
    if (smtpSelected()) smtpConfig();
    else if (!process.env["PLAYFAB_RELEASE_EMAIL_TEMPLATE_ID"]?.trim())
      throw new AdminApiError(503, "Configure SMTP or the PlayFab release email template.");
    return {
      configured: true,
      provider,
      message: "Version notifications are ready for the authenticated worker.",
    };
  } catch (error) {
    return {
      configured: false,
      provider,
      message:
        error instanceof AdminApiError ? error.message : "Release email configuration is invalid.",
    };
  }
}

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );
export function renderVersionEmail(event: VersionAnnouncement) {
  const origin = siteOrigin();
  const download = `${origin}/download`;
  const preferences = `${origin}/dashboard/settings`;
  const version = escapeHtml(event.version);
  const build = escapeHtml(event.build);
  return {
    subject: `Civil Craft v${event.version.replace(/[\r\n]/g, " ")} is ready to download`,
    text: `A new Civil Craft version is available.\n\nVersion: ${event.version}\nBuild: ${event.build}\n\nDownload: ${download}\n\nYou received this because you enabled Email Updates. Manage your preference: ${preferences}`,
    html: `<!doctype html><html><body style="margin:0;background:#F3E7D1;font-family:Nunito,Arial,sans-serif;color:#4A3428"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="600" style="width:100%;max-width:600px;border:1px solid #4A3428;border-top:5px solid #C58A42;background:#FCF6EC" cellpadding="0" cellspacing="0"><tr><td style="padding:28px 32px"><p style="margin:0 0 12px;font-size:11px;letter-spacing:2px">CIVIL CRAFT · GAME UPDATE</p><h1 style="margin:0 0 16px;font-size:24px">Version ${version} is available</h1><p style="line-height:1.6">Your next build is ready. Download the current Civil Craft APK from the website.</p><p style="padding:14px;background:#FAF2E6;border-left:4px solid #C58A42">Version: <strong>${version}</strong><br>Build: ${build}</p><p style="margin:24px 0"><a href="${escapeHtml(download)}" style="display:inline-block;padding:12px 24px;background:#C58A42;border:1px solid #A87332;border-radius:6px;color:#FCF6EC;text-decoration:none">Download Civil Craft</a></p><p style="font-size:13px;line-height:1.6">If the button does not open, visit <a href="${escapeHtml(download)}" style="color:#4E372C">${escapeHtml(download)}</a>.</p></td></tr><tr><td style="padding:18px 32px;background:#F5ECE0;font-size:12px;line-height:1.6">You enabled Email Updates for Civil Craft. <a href="${escapeHtml(preferences)}" style="color:#4E372C">Manage email preferences</a>.</td></tr></table></td></tr></table></body></html>`,
  };
}

/** SDK credential discovery uses the existing OIDC-connected private store. */
export const releaseEmailStorage = { put, head };
export const versionEmailDelivery = {
  async claim(event: VersionAnnouncement, playerId: string): Promise<boolean> {
    const key = createHash("sha256")
      .update(
        JSON.stringify([event.titleId.toUpperCase(), event.version.trim(), playerId.toUpperCase()]),
      )
      .digest("hex");
    const pathname = `civilcraft/email/version-claims/${key}.json`;
    try {
      await releaseEmailStorage.put(
        pathname,
        JSON.stringify({ attemptedAt: new Date().toISOString() }),
        {
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: false,
          contentType: "application/json",
          abortSignal: AbortSignal.timeout(5000),
        },
      );
      return true;
    } catch (error) {
      // This SDK represents an existing pathname as BlobError, not a dedicated conflict type.
      // Verify the deterministic claim instead of interpreting arbitrary error messages.
      if (!(error instanceof BlobError)) throw error;
      try {
        const existing = await releaseEmailStorage.head(pathname, {
          abortSignal: AbortSignal.timeout(5000),
        });
        if (
          existing.pathname === pathname &&
          existing.contentType === "application/json" &&
          existing.size > 0 &&
          existing.size <= 1024
        )
          return false;
      } catch (lookupError) {
        if (!(lookupError instanceof BlobNotFoundError)) throw lookupError;
      }
      throw error;
    }
  },
  async send(event: VersionAnnouncement, playerId: string, recipient: string): Promise<void> {
    if (!smtpSelected()) {
      const template = process.env["PLAYFAB_RELEASE_EMAIL_TEMPLATE_ID"]?.trim();
      if (!template) throw new AdminApiError(503, "Release email delivery is not configured.");
      await emailDelivery.send(playerId, template);
      return;
    }
    const config = smtpConfig();
    const content = renderVersionEmail(event);
    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 8000,
    });
    try {
      await transport.sendMail({
        from: config.from,
        to: recipient,
        replyTo: config.user,
        ...content,
      });
    } finally {
      transport.close();
    }
  },
};

async function data(keys?: string[]) {
  return object(
    (await playFabAdmin("Admin/GetTitleInternalData", keys ? { Keys: keys } : {}))["Data"],
  );
}
function parsed(raw: unknown) {
  try {
    return object(JSON.parse(String(raw)));
  } catch {
    return {};
  }
}
function active(saved: Record<string, unknown>, event: VersionAnnouncement) {
  const config = parsed(saved[configKey]);
  const latest = versionAnnouncementSchema.safeParse(config["notification"]);
  const release = parsed(saved[releasePrefix + event.releaseId]);
  return (
    latest.success &&
    latest.data.id === event.id &&
    latest.data.releaseId === event.releaseId &&
    latest.data.version === event.version &&
    latest.data.build === event.build &&
    latest.data.announcedAtISO === event.announcedAtISO &&
    config["currentId"] === event.releaseId &&
    release["id"] === event.releaseId &&
    release["version"] === event.version &&
    release["build"] === event.build &&
    (saved[deletedPrefix + event.releaseId] === undefined ||
      saved[deletedPrefix + event.releaseId] === null) &&
    (Boolean(release["apk"]) ||
      (typeof release["fileUrl"] === "string" && Boolean(release["fileUrl"].trim())))
  );
}
function consent(raw: unknown, event: VersionAnnouncement) {
  const pref = parsed(raw);
  const subscribed = Date.parse(String(pref["subscribedAt"]));
  return (
    pref["emailUpdates"] === true &&
    Number.isFinite(subscribed) &&
    subscribed <= Date.parse(event.announcedAtISO)
  );
}

export async function dispatchVersionNotifications(
  options: { maxRecipients?: number; timeBudgetMs?: number } = {},
) {
  const maxRecipients = options.maxRecipients ?? 100;
  const timeBudgetMs = options.timeBudgetMs ?? 45000;
  if (
    !Number.isInteger(maxRecipients) ||
    maxRecipients < 0 ||
    maxRecipients > 100 ||
    !Number.isInteger(timeBudgetMs) ||
    timeBudgetMs < 0 ||
    timeBudgetMs > 45000
  )
    throw new AdminApiError(400, "Choose valid release worker limits.");
  const readiness = releaseEmailReadiness();
  if (!readiness.configured) throw new AdminApiError(503, readiness.message);
  const started = Date.now();
  const saved = await data();
  const event = versionAnnouncementSchema.safeParse(parsed(saved[configKey])["notification"]);
  const counts = { sent: 0, skipped: 0, uncertain: 0, nextOffset: 0, remaining: 0 };
  if (
    !event.success ||
    event.data.titleId.toUpperCase() !== adminGameConfig().titleId.toUpperCase() ||
    Date.parse(event.data.announcedAtISO) > Date.now() ||
    !active(saved, event.data)
  )
    return counts;
  const announcement = event.data;
  const players = Object.entries(saved)
    .filter(
      ([key, raw]) =>
        key.startsWith(preferencePrefix) &&
        /^[a-f0-9]{1,32}$/i.test(key.slice(preferencePrefix.length)) &&
        consent(raw, announcement),
    )
    .map(([key]) => ({ key, id: key.slice(preferencePrefix.length).toUpperCase() }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (players.length > 100000)
    throw new AdminApiError(503, "Release notification workload exceeds the worker limit.");
  const cursorKey = cursorPrefix + announcement.id;
  const cursor = parsed(saved[cursorKey]);
  let after =
    cursor["announcedAtISO"] === announcement.announcedAtISO &&
    typeof cursor["after"] === "string" &&
    /^[A-F0-9]{1,32}$/.test(cursor["after"])
      ? cursor["after"]
      : "";
  let processed = 0;
  for (const player of players.filter((p) => p.id > after)) {
    if (processed >= maxRecipients || Date.now() - started >= timeBudgetMs) break;
    const keys = [
      configKey,
      releasePrefix + announcement.releaseId,
      deletedPrefix + announcement.releaseId,
      player.key,
    ];
    const fresh = await data(keys);
    if (!active(fresh, announcement)) return counts;
    if (!consent(fresh[player.key], announcement)) {
      counts.skipped++;
      processed++;
      after = player.id;
      continue;
    }
    const profile = await playFabAdmin("Server/GetPlayerProfile", {
      PlayFabId: player.id,
      ProfileConstraints: { ShowContactEmailAddresses: true },
    });
    const contacts = object(profile["PlayerProfile"])["ContactEmailAddresses"];
    const confirmed = Array.isArray(contacts)
      ? contacts.find(
          (value) =>
            object(value)["VerificationStatus"] === "Confirmed" &&
            z.string().email().safeParse(object(value)["EmailAddress"]).success,
        )
      : undefined;
    if (!confirmed) {
      counts.skipped++;
      processed++;
      after = player.id;
      continue;
    }
    if (Date.now() - started >= timeBudgetMs) break;
    const latest = await data(keys);
    if (!active(latest, announcement)) return counts;
    if (!consent(latest[player.key], announcement)) {
      counts.skipped++;
      processed++;
      after = player.id;
      continue;
    }
    if (Date.now() - started >= timeBudgetMs) break;
    if (!(await versionEmailDelivery.claim(announcement, player.id))) counts.skipped++;
    else {
      const beforeSend = await data(keys);
      if (!active(beforeSend, announcement)) {
        counts.skipped++;
        return counts;
      }
      if (!consent(beforeSend[player.key], announcement)) {
        counts.skipped++;
        processed++;
        after = player.id;
        continue;
      }
      // Retain the claim on timeouts or provider failures: at-most-once attempts.
      try {
        await versionEmailDelivery.send(
          announcement,
          player.id,
          String(object(confirmed)["EmailAddress"]),
        );
        counts.sent++;
      } catch {
        counts.uncertain++;
      }
    }
    processed++;
    after = player.id;
  }
  if (processed)
    await playFabAdmin("Admin/SetTitleInternalData", {
      Key: cursorKey,
      Value: JSON.stringify({ after, announcedAtISO: announcement.announcedAtISO }),
    });
  counts.nextOffset = players.filter((p) => p.id <= after).length;
  counts.remaining = players.length - counts.nextOffset;
  return counts;
}
