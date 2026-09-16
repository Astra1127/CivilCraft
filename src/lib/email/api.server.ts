import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  AdminApiError,
  adminGameConfig,
  object,
  playFabAdmin,
} from "../playfab/admin-client.server.ts";
import { smallBody } from "../playfab/request-body.server.ts";
import { listContent } from "../cms/content.server.ts";
import { emailDelivery } from "./delivery.server.ts";

export const recoveryMessage =
  "If an account exists for that email, password recovery instructions have been sent.";
const prefix = "civilcraft.email.preference.";
const cursorKey = "civilcraft.email.dispatch.cursor";
const prefSchema = z.object({ emailUpdates: z.boolean(), subscribedAt: z.string().datetime() });
// Only known symbolic names enter logs; arbitrary provider strings may contain user data.
const recoveryErrorNames = new Set([
  "EmailRecipientBlacklisted",
  "InvalidEmailAddress",
  "NoContactEmailAddressFound",
  "SmtpAddonNotEnabled",
  "AccountNotFound",
  "UserNotFound",
  "InvalidParams",
  "InvalidTitleId",
  "EmailTemplateNotFound",
  "InvalidEmailTemplate",
  "EmailTemplateTypeMismatch",
  "APIRequestLimitExceeded",
  "ServiceUnavailable",
  "InternalServerError",
  "DownstreamServiceUnavailable",
]);
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" },
  });
async function data(keys?: string[]) {
  return object(
    (await playFabAdmin("Admin/GetTitleInternalData", keys ? { Keys: keys } : {}))["Data"],
  );
}
function preference(raw: unknown) {
  try {
    return prefSchema.parse(JSON.parse(String(raw)));
  } catch {
    return { emailUpdates: false, subscribedAt: new Date().toISOString() };
  }
}
async function playerId(request: Request) {
  const ticket = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (!ticket || ticket.length > 4096) throw new AdminApiError(401, "Player sign-in is required.");
  const auth = await playFabAdmin("Server/AuthenticateSessionTicket", { SessionTicket: ticket });
  const id = object(auth["UserInfo"])["PlayFabId"];
  if (auth["IsSessionTicketExpired"] || typeof id !== "string" || !/^[a-f0-9]{1,32}$/i.test(id))
    throw new AdminApiError(401, "Player sign-in is required.");
  return id;
}
/** No account lookup or upstream error text is returned to a recovery caller. */
export async function recoverAccount(email: unknown) {
  const parsed = z.string().trim().email().max(255).safeParse(email);
  if (!parsed.success) throw new AdminApiError(400, "Enter a valid email address.");
  const { titleId } = adminGameConfig();
  const template = process.env["PLAYFAB_RECOVERY_EMAIL_TEMPLATE_ID"]?.trim();
  console.info("[email/recovery] configuration", { templateConfigured: Boolean(template) });
  if (!template) {
    console.error(
      "[email/recovery] Custom account recovery template is not configured; request not sent.",
    );
    return { message: recoveryMessage };
  }
  try {
    const response = await fetch(
      `https://${titleId}.playfabapi.com/Client/SendAccountRecoveryEmail`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Email: parsed.data,
          TitleId: titleId,
          EmailTemplateId: template,
        }),
        signal: AbortSignal.timeout(12_000),
        redirect: "error",
      },
    );
    const result = object(await response.json().catch(() => null));
    const code = result["errorCode"];
    const name = result["error"];
    console.info("[email/recovery] PlayFab response", {
      httpStatus: response.status,
      errorCode: typeof code === "number" && Number.isSafeInteger(code) ? code : null,
      errorName:
        typeof name === "string"
          ? recoveryErrorNames.has(name)
            ? name
            : "UnrecognizedError"
          : null,
    });
  } catch {
    console.warn("[email/recovery] PlayFab transport failure", {
      httpStatus: null,
      errorCode: null,
      errorName: null,
    });
  }
  return { message: recoveryMessage };
}
export async function dispatchNotifications() {
  const template = process.env["PLAYFAB_RELEASE_EMAIL_TEMPLATE_ID"]?.trim();
  if (!template || !process.env["BLOB_READ_WRITE_TOKEN"])
    throw new AdminApiError(503, "Release notifications are not configured.");
  const saved = await data();
  const updates = (await listContent()).updates.flatMap((update) => {
    try {
      const record = JSON.parse(String(saved["civilcraft.website.v1.updates." + update.id]));
      const announced = Date.parse(record.notificationPublishedAt);
      return Number.isFinite(announced) && announced <= Date.now()
        ? [{ ...update, announced }]
        : [];
    } catch {
      return [];
    }
  });
  const opted = Object.entries(saved)
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, raw]) => ({ id: key.slice(prefix.length), ...preference(raw) }))
    .filter((p) => p.emailUpdates && /^[a-f0-9]{1,32}$/i.test(p.id));
  const pairs = updates
    .flatMap((update) =>
      opted
        .filter((p) => update.announced >= Date.parse(p.subscribedAt))
        .map((p) => ({ update, player: p.id })),
    )
    .sort((a, b) => (a.update.id + a.player).localeCompare(b.update.id + b.player));
  if (pairs.length > 100_000)
    throw new AdminApiError(503, "Notification workload exceeds the configured worker limit.");
  const rawCursor = Number(saved[cursorKey] ?? 0);
  const cursor =
    Number.isSafeInteger(rawCursor) && rawCursor >= 0 && rawCursor < pairs.length ? rawCursor : 0;
  const started = Date.now();
  let processed = 0;
  let sent = 0,
    skipped = 0,
    uncertain = 0;
  for (const pair of pairs.slice(cursor, cursor + 25)) {
    if (Date.now() - started > 20_000) break;
    processed++;
    // Recheck current consent and publication immediately before attempting delivery.
    const fresh = await data([
      prefix + pair.player,
      "civilcraft.website.v1.updates." + pair.update.id,
    ]);
    const consent = preference(fresh[prefix + pair.player]);
    if (!consent.emailUpdates || Date.parse(consent.subscribedAt) > pair.update.announced) {
      skipped++;
      continue;
    }
    let published = false;
    try {
      const article = JSON.parse(String(fresh["civilcraft.website.v1.updates." + pair.update.id]));
      published = article.status === "published" && Date.parse(article.publishedAt) <= Date.now();
    } catch {
      /* removed */
    }
    if (!published) {
      skipped++;
      continue;
    }
    const result = await playFabAdmin("Server/GetPlayerProfile", {
      PlayFabId: pair.player,
      ProfileConstraints: { ShowContactEmailAddresses: true },
    });
    const contacts = object(result["PlayerProfile"])["ContactEmailAddresses"];
    if (
      !Array.isArray(contacts) ||
      !contacts.some(
        (c) =>
          object(c)["VerificationStatus"] === "Confirmed" &&
          z.string().email().safeParse(object(c)["EmailAddress"]).success,
      )
    ) {
      skipped++;
      continue;
    }
    if (!(await emailDelivery.claim(pair.update.id, pair.player))) {
      skipped++;
      continue;
    }
    // Mark before delivery: ambiguous provider failures must not cause duplicate emails.
    try {
      await emailDelivery.send(pair.player, template);
      sent++;
    } catch {
      uncertain++;
    }
  }
  const next = cursor + processed >= pairs.length ? 0 : cursor + processed;
  await playFabAdmin("Admin/SetTitleInternalData", { Key: cursorKey, Value: String(next) });
  return { sent, skipped, uncertain, nextOffset: next };
}
export async function handleEmailRequest(request: Request): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (
    !["/api/email/recovery", "/api/player/email-preference", "/api/email/dispatch"].includes(path)
  )
    return null;
  try {
    if (path === "/api/email/dispatch") {
      const secret = process.env["CRON_SECRET"];
      const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
      if (
        !secret ||
        !timingSafeEqual(
          createHash("sha256").update(token).digest(),
          createHash("sha256").update(secret).digest(),
        )
      )
        return json({ error: "Not authorized." }, 401);
      if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
      return json(await dispatchNotifications());
    }
    if (path === "/api/email/recovery") {
      console.info("[email/recovery] endpoint called");
      if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
      return json(await recoverAccount((await smallBody(request))["email"]));
    }
    if (!["GET", "POST"].includes(request.method))
      return json({ error: "Method not allowed." }, 405);
    const id = await playerId(request),
      key = prefix + id;
    const previous = preference((await data([key]))[key]);
    if (request.method === "GET") return json({ emailUpdates: previous.emailUpdates });
    const body = await smallBody(request);
    if (typeof body["emailUpdates"] !== "boolean")
      throw new AdminApiError(400, "Choose an email preference.");
    await playFabAdmin("Admin/SetTitleInternalData", {
      Key: key,
      Value: JSON.stringify({
        emailUpdates: body["emailUpdates"],
        subscribedAt: previous.emailUpdates ? previous.subscribedAt : new Date().toISOString(),
      }),
    });
    return json({ emailUpdates: body["emailUpdates"] });
  } catch (error) {
    return json(
      {
        error:
          error instanceof AdminApiError
            ? error.message
            : "Email services are temporarily unavailable.",
      },
      error instanceof AdminApiError ? error.status : 503,
    );
  }
}
