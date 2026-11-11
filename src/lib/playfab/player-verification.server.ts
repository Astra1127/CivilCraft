import { z } from "zod";
import { AdminApiError, adminGameConfig, object, playFabAdmin } from "./admin-client.server.ts";
import { smallBody } from "./request-body.server.ts";
import { maskEmail } from "./contact-email.ts";

export { maskEmail };

export interface PlayerVerificationStatus {
  playFabId: string;
  verified: boolean;
  email?: string;
  maskedEmail: string;
  status: "Confirmed" | "Unconfirmed" | "Unknown";
}

/** Rate-limiting tracker for verification email resends (identifier -> timestamp) */
const resendCooldowns = new Map<string, number>();
const resendCounts = new Map<string, { count: number; windowStart: number }>();
const RESEND_COOLDOWN_MS = 60_000; // 60 seconds
const RESEND_MAX_PER_WINDOW = 4;
const RESEND_WINDOW_MS = 10 * 60_000; // 10 minutes

/**
 * Authoritatively retrieves a player's contact email and verification status from PlayFab.
 */
export async function getPlayerContactVerification(
  playFabId: string,
): Promise<PlayerVerificationStatus> {
  if (!playFabId || !/^[a-f0-9]{1,32}$/i.test(playFabId)) {
    throw new AdminApiError(400, "Invalid player identifier.");
  }

  const result = await playFabAdmin("Server/GetPlayerProfile", {
    PlayFabId: playFabId,
    ProfileConstraints: { ShowContactEmailAddresses: true },
  });

  const profile = object(result["PlayerProfile"]);
  const contacts = profile["ContactEmailAddresses"];

  if (Array.isArray(contacts) && contacts.length > 0) {
    const primary = object(contacts[0]);
    const email = typeof primary["EmailAddress"] === "string" ? primary["EmailAddress"].trim() : "";
    const status = primary["VerificationStatus"];
    const verified = status === "Confirmed";

    return {
      playFabId,
      verified,
      ...(email ? { email } : {}),
      maskedEmail: maskEmail(email),
      status: status === "Confirmed" ? "Confirmed" : "Unconfirmed",
    };
  }

  // Fallback: check UserAccountInfo PrivateInfo if contact email is not yet populated
  try {
    const accountInfoResult = await playFabAdmin("Admin/GetUserAccountInfo", {
      PlayFabId: playFabId,
    });
    const info = object(accountInfoResult["UserInfo"]);
    const privateInfo = object(info["PrivateInfo"]);
    const loginEmail = typeof privateInfo["Email"] === "string" ? privateInfo["Email"].trim() : "";

    return {
      playFabId,
      verified: false,
      ...(loginEmail ? { email: loginEmail } : {}),
      maskedEmail: maskEmail(loginEmail),
      status: "Unconfirmed",
    };
  } catch {
    return {
      playFabId,
      verified: false,
      maskedEmail: "your registered email address",
      status: "Unknown",
    };
  }
}

/**
 * Validates a session ticket server-side and checks whether the player's contact email is confirmed.
 */
export async function verifyPlayerSession(
  sessionTicket: string,
): Promise<PlayerVerificationStatus> {
  if (!sessionTicket || typeof sessionTicket !== "string" || sessionTicket.length > 4096) {
    throw new AdminApiError(401, "Player sign-in is required.");
  }

  const auth = await playFabAdmin("Server/AuthenticateSessionTicket", {
    SessionTicket: sessionTicket,
  });

  if (auth["IsSessionTicketExpired"] === true) {
    throw new AdminApiError(401, "Player session has expired. Please sign in again.");
  }

  const playerId = object(auth["UserInfo"])["PlayFabId"];
  if (typeof playerId !== "string" || !/^[a-f0-9]{1,32}$/i.test(playerId)) {
    throw new AdminApiError(502, "Unable to verify player account.");
  }

  return getPlayerContactVerification(playerId);
}

/**
 * Authoritatively verifies player identity and email confirmation status for protected APIs.
 * Throws 401 if unauthenticated, 403 if unconfirmed.
 */
export async function requireVerifiedPlayer(
  request: Request,
): Promise<{ playFabId: string; email?: string; maskedEmail: string }> {
  const ticket = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (!ticket || ticket.length > 4096) {
    throw new AdminApiError(401, "Player sign-in is required.");
  }
  const status = await verifyPlayerSession(ticket);
  if (!status.verified) {
    throw new AdminApiError(403, "Please verify your email address to access this service.");
  }
  return {
    playFabId: status.playFabId,
    ...(status.email ? { email: status.email } : {}),
    maskedEmail: status.maskedEmail,
  };
}

const resendSchema = z.object({
  identifier: z.string().trim().min(3).max(255),
  sessionTicket: z.string().max(4096).optional(),
});

/**
 * Requests PlayFab to resend the account email verification link.
 * Applies rate limiting and a 60-second cooldown per identifier.
 */
export async function resendVerificationEmail(
  identifier: string,
  sessionTicket?: string,
): Promise<{
  success: boolean;
  message: string;
  cooldownSeconds: number;
  alreadyVerified?: boolean;
}> {
  const cleanId = identifier.trim().toLowerCase();
  const now = Date.now();

  // Cooldown check (60 seconds)
  const lastSent = resendCooldowns.get(cleanId);
  if (lastSent && now - lastSent < RESEND_COOLDOWN_MS) {
    const remaining = Math.ceil((RESEND_COOLDOWN_MS - (now - lastSent)) / 1000);
    throw new AdminApiError(
      429,
      `Please wait ${remaining} second${remaining === 1 ? "" : "s"} before requesting another verification email.`,
    );
  }

  // Rate limiting check (max 4 per 10 minutes)
  const windowData = resendCounts.get(cleanId) ?? { count: 0, windowStart: now };
  if (now - windowData.windowStart > RESEND_WINDOW_MS) {
    windowData.count = 0;
    windowData.windowStart = now;
  }
  if (windowData.count >= RESEND_MAX_PER_WINDOW) {
    throw new AdminApiError(
      429,
      "Too many verification requests. Please check your spam folder or try again in a few minutes.",
    );
  }

  // Resolve player PlayFabId
  let playFabId: string | undefined;
  if (sessionTicket) {
    try {
      const auth = await playFabAdmin("Server/AuthenticateSessionTicket", {
        SessionTicket: sessionTicket,
      });
      const id = object(auth["UserInfo"])["PlayFabId"];
      if (typeof id === "string") playFabId = id;
    } catch {
      // Fallback to identifier lookup
    }
  }

  if (!playFabId) {
    try {
      const isEmail = cleanId.includes("@");
      const accountResult = await playFabAdmin("Admin/GetUserAccountInfo", {
        [isEmail ? "Email" : "Username"]: cleanId,
      });
      const info = object(accountResult["UserInfo"]);
      const id = info["PlayFabId"];
      if (typeof id === "string") playFabId = id;
    } catch (error) {
      // Do not reveal if the account exists or not
      if (error instanceof AdminApiError && error.status === 404) {
        // Return a generic friendly response
        resendCooldowns.set(cleanId, now);
        return {
          success: true,
          message:
            "If an unverified account exists for this username or email, a verification link has been sent.",
          cooldownSeconds: 60,
        };
      }
      throw error;
    }
  }

  if (!playFabId) {
    return {
      success: true,
      message:
        "If an unverified account exists for this username or email, a verification link has been sent.",
      cooldownSeconds: 60,
    };
  }

  // Check if player is already verified
  const status = await getPlayerContactVerification(playFabId);
  if (status.verified) {
    return {
      success: true,
      alreadyVerified: true,
      message: "Your email is already verified. You can sign in now.",
      cooldownSeconds: 0,
    };
  }

  // Send verification email using PlayFab template if configured, or trigger via PlayStream
  const templateId = process.env["PLAYFAB_EMAIL_VERIFICATION_TEMPLATE_ID"]?.trim();
  let emailDispatched = false;

  if (templateId) {
    await playFabAdmin("Server/SendEmailFromTemplate", {
      PlayFabId: playFabId,
      EmailTemplateId: templateId,
    });
    emailDispatched = true;
  } else if (sessionTicket && status.email) {
    // Re-trigger PlayStream com.playfab.player_updated_contact_email via Client API
    const titleId = adminGameConfig().titleId;
    const clientRes = await fetch(
      `https://${titleId}.playfabapi.com/Client/AddOrUpdateContactEmail`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Authorization": sessionTicket,
        },
        body: JSON.stringify({ EmailAddress: status.email }),
        cache: "no-store",
      },
    );
    if (clientRes.ok) {
      emailDispatched = true;
    }
  }

  if (!emailDispatched) {
    throw new AdminApiError(
      503,
      "Unable to resend verification email automatically. Please sign in with your credentials to verify your account or contact support.",
    );
  }

  // Update cooldown and rate limit
  resendCooldowns.set(cleanId, now);
  windowData.count += 1;
  resendCounts.set(cleanId, windowData);

  return {
    success: true,
    message: `Verification link sent to ${status.maskedEmail}. Please check your inbox.`,
    cooldownSeconds: 60,
  };
}

/**
 * Handles incoming verification requests from /api/player/auth/*
 */
export async function handlePlayerVerificationRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (
    path !== "/api/player/auth/verify-session" &&
    path !== "/api/player/auth/resend-verification" &&
    path !== "/api/player/auth/status"
  ) {
    return null;
  }

  const json = (data: unknown, status = 200) =>
    Response.json(data, {
      status,
      headers: {
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    });

  try {
    if (path === "/api/player/auth/verify-session") {
      if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
      const ticket =
        request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1] ??
        String((await smallBody(request))["sessionTicket"] ?? "");

      if (!ticket) {
        return json({ error: "Session ticket is required." }, 400);
      }

      const status = await verifyPlayerSession(ticket);
      return json(status);
    }

    if (path === "/api/player/auth/resend-verification") {
      if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
      const body = await smallBody(request);
      const parsed = resendSchema.parse(body);
      const result = await resendVerificationEmail(parsed.identifier, parsed.sessionTicket);
      return json(result);
    }

    if (path === "/api/player/auth/status") {
      if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);
      const ticket = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
      if (!ticket) return json({ authenticated: false, verified: false });

      const status = await verifyPlayerSession(ticket);
      return json({ authenticated: true, ...status });
    }

    return null;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ error: "Invalid request data." }, 400);
    }
    if (error instanceof AdminApiError) {
      return json({ error: error.message }, error.status);
    }
    return json({ error: "An unexpected error occurred. Please try again." }, 500);
  }
}
