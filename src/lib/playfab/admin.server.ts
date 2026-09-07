/**
 * SERVER-ONLY PlayFab access for administrator features.
 *
 * The Developer Secret Key is read here and NEVER leaves the server: the
 * browser only ever calls our own server endpoints. Locally (VS Code / an
 * exported project) put the key in `.env.local`:
 *
 *   PLAYFAB_SECRET_KEY=your_secret_here
 *   PLAYFAB_TITLE_ID=17FA03          # optional, defaults to 17FA03
 *   PLAYFAB_ADMIN_IDS=ABC123,DEF456  # optional allow-list of admin PlayFab ids
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const FALLBACK_TITLE_ID = "17FA03";

export function serverTitleId(): string {
  return process.env["PLAYFAB_TITLE_ID"]?.trim() || FALLBACK_TITLE_ID;
}

export function serverApiBase(): string {
  return `https://${serverTitleId()}.playfabapi.com`;
}

function secretKey(): string {
  const key = process.env["PLAYFAB_SECRET_KEY"]?.trim();
  if (!key) {
    throw new Error(
      "Administrator access is not configured on the server (PLAYFAB_SECRET_KEY is missing).",
    );
  }
  return key;
}

interface Envelope<T> {
  code: number;
  data?: T;
  errorMessage?: string;
  error?: string;
}

/** Unauthenticated PlayFab call (Client API) made from the server. */
export async function serverCallPlayFab<T>(
  path: string,
  body: Record<string, unknown>,
  init: { secret?: boolean; sessionTicket?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.secret) headers["X-SecretKey"] = secretKey();
  if (init.sessionTicket) headers["X-Authorization"] = init.sessionTicket;

  const response = await fetch(`${serverApiBase()}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ TitleId: serverTitleId(), ...body }),
  });
  const payload = (await response.json().catch(() => null)) as Envelope<T> | null;
  if (!response.ok || !payload || payload.code >= 400) {
    throw new Error(payload?.errorMessage ?? payload?.error ?? "PlayFab request failed.");
  }
  return payload.data as T;
}

/* ------------------------------------------------- admin session tokens */

function signingSecret(): string {
  return process.env["ADMIN_SESSION_SECRET"]?.trim() || secretKey();
}

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

export function issueAdminToken(playFabId: string): string {
  const payload = `${playFabId}.${Date.now() + TOKEN_TTL_MS}`;
  const signature = createHmac("sha256", signingSecret()).update(payload).digest("hex");
  return `${Buffer.from(payload).toString("base64url")}.${signature}`;
}

/** Verifies a server-issued admin token; throws when invalid or expired. */
export function verifyAdminToken(token: string | undefined): string {
  if (!token) throw new Error("Administrator authorisation required.");
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) throw new Error("Administrator authorisation required.");
  const payload = Buffer.from(encoded, "base64url").toString("utf8");
  const expected = createHmac("sha256", signingSecret()).update(payload).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Administrator authorisation required.");
  }
  const [playFabId, expiry] = payload.split(".");
  if (!playFabId || !expiry || Number(expiry) < Date.now()) {
    throw new Error("Your administrator session has expired.");
  }
  return playFabId;
}

/* ------------------------------------------------------ authorisation */

/**
 * Administrator status is decided SERVER-SIDE only: either the account is in
 * the server allow-list, or the game backend stores `Role: admin` in the
 * player's internal (server-only) data. Email prefixes, usernames, URLs and
 * localStorage values are never trusted.
 */
export async function isAdminAccount(playFabId: string): Promise<boolean> {
  const allowList = (process.env["PLAYFAB_ADMIN_IDS"] ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (allowList.includes(playFabId)) return true;

  try {
    const result = await serverCallPlayFab<{
      Data?: Record<string, { Value?: string }>;
    }>("/Server/GetUserInternalData", { PlayFabId: playFabId, Keys: ["Role"] }, { secret: true });
    return (result.Data?.["Role"]?.Value ?? "").toLowerCase() === "admin";
  } catch {
    return false;
  }
}
