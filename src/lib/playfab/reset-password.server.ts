import { AdminApiError, playFabAdmin } from "./admin-client.server.ts";
import { smallBody } from "./request-body.server.ts";
import { expiredResetLink, resetFailure, resetPasswordSchema } from "./reset-password.ts";

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });

export async function handlePasswordReset(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/auth/reset-password") return null;
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== url.origin))
    return json({ error: resetFailure }, 403);
  try {
    const parsed = resetPasswordSchema.safeParse(await smallBody(request));
    if (!parsed.success) return json({ error: resetFailure }, 400);
    await playFabAdmin("Admin/ResetPassword", {
      Token: parsed.data.token,
      Password: parsed.data.password,
    });
    return json({ success: true });
  } catch (error) {
    // Never log or echo the token, password, credentials or raw provider response.
    if (error instanceof AdminApiError && error.status === 410)
      return json({ error: expiredResetLink }, 410);
    return json({ error: resetFailure }, 503);
  }
}
