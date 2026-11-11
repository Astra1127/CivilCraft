import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import {
  getPlayerContactVerification,
  handlePlayerVerificationRequest,
  maskEmail,
  requireVerifiedPlayer,
  resendVerificationEmail,
  verifyPlayerSession,
} from "../src/lib/playfab/player-verification.server.ts";
import { AdminApiError } from "../src/lib/playfab/admin-client.server.ts";
import {
  loginWithEmail,
  loginWithUsername,
  registerPlayer,
  getStoredPlayer,
  signOutPlayer,
  EmailVerificationRequiredError,
} from "../src/lib/playfab/auth.ts";

const originalFetch = globalThis.fetch;
const priorSecret = process.env["PLAYFAB_SECRET_KEY"];
const priorTemplate = process.env["PLAYFAB_EMAIL_VERIFICATION_TEMPLATE_ID"];
const priorTitle = process.env["VITE_PLAYFAB_TITLE_ID"];

let playFabCalls: { operation: string; body: Record<string, unknown> }[] = [];
let rejectContactWrite = false;
const mockProfiles = new Map<string, Record<string, unknown>>();

// Setup localStorage / window mock for session persistence testing
const storage = new Map<string, string>();
const mockWindow = {
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, String(value)),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
  },
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
};

beforeEach(() => {
  playFabCalls = [];
  rejectContactWrite = false;
  mockProfiles.clear();
  storage.clear();
  process.env["PLAYFAB_SECRET_KEY"] = "test-secret-key";
  process.env["PLAYFAB_EMAIL_VERIFICATION_TEMPLATE_ID"] = "template-123";
  process.env["VITE_PLAYFAB_TITLE_ID"] = "17FA03";
  (globalThis as unknown as { window: unknown }).window = mockWindow;

  globalThis.fetch = async (url, init) => {
    const urlStr = String(url);

    // Dispatch local internal API requests
    if (urlStr.includes("/api/player/auth/")) {
      const internalRes = await handlePlayerVerificationRequest(
        new Request(urlStr.startsWith("http") ? urlStr : `https://civilcraft.test${urlStr}`, init),
      );
      if (internalRes) return internalRes;
    }

    if (urlStr.includes("/api/player/email-preference")) {
      return Response.json({ success: true, emailUpdates: true });
    }

    const op = urlStr.split("/").pop() ?? "";
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    playFabCalls.push({ operation: op, body });

    if (op === "AuthenticateSessionTicket") {
      const ticket = String(body["SessionTicket"] ?? "");
      if (ticket === "expired-ticket") {
        return Response.json({
          code: 200,
          data: { IsSessionTicketExpired: true, UserInfo: { PlayFabId: "A100" } },
        });
      }
      if (ticket === "unverified-ticket") {
        return Response.json({
          code: 200,
          data: { IsSessionTicketExpired: false, UserInfo: { PlayFabId: "A100" } },
        });
      }
      if (ticket === "verified-ticket") {
        return Response.json({
          code: 200,
          data: { IsSessionTicketExpired: false, UserInfo: { PlayFabId: "B200" } },
        });
      }
      return Response.json(
        {
          code: 400,
          error: "InvalidSessionTicket",
          errorMessage: "Ticket is invalid.",
        },
        { status: 400 },
      );
    }

    if (op === "LoginWithEmailAddress") {
      const email = String(body["Email"] ?? "").toLowerCase();
      if (email === "unverified@example.com") {
        return Response.json({
          code: 200,
          data: {
            PlayFabId: "A100",
            SessionTicket: "unverified-ticket",
            InfoResultPayload: {
              AccountInfo: {
                Username: "unverified_user",
                PrivateInfo: { Email: "unverified@example.com" },
                TitleInfo: { DisplayName: "Unverified Engineer" },
              },
            },
          },
        });
      }
      if (email === "verified@example.com") {
        return Response.json({
          code: 200,
          data: {
            PlayFabId: "B200",
            SessionTicket: "verified-ticket",
            InfoResultPayload: {
              AccountInfo: {
                Username: "verified_user",
                PrivateInfo: { Email: "verified@example.com" },
                TitleInfo: { DisplayName: "Verified Engineer" },
              },
            },
          },
        });
      }
      return Response.json({ code: 400, error: "InvalidCredentials" }, { status: 400 });
    }

    if (op === "LoginWithPlayFab") {
      const username = String(body["Username"] ?? "").toLowerCase();
      if (username === "unverified_user") {
        return Response.json({
          code: 200,
          data: {
            PlayFabId: "A100",
            SessionTicket: "unverified-ticket",
            InfoResultPayload: {
              AccountInfo: {
                Username: "unverified_user",
                PrivateInfo: { Email: "unverified@example.com" },
                TitleInfo: { DisplayName: "Unverified Engineer" },
              },
            },
          },
        });
      }
      if (username === "verified_user") {
        return Response.json({
          code: 200,
          data: {
            PlayFabId: "B200",
            SessionTicket: "verified-ticket",
            InfoResultPayload: {
              AccountInfo: {
                Username: "verified_user",
                PrivateInfo: { Email: "verified@example.com" },
                TitleInfo: { DisplayName: "Verified Engineer" },
              },
            },
          },
        });
      }
      return Response.json({ code: 400, error: "InvalidCredentials" }, { status: 400 });
    }

    if (op === "RegisterPlayFabUser") {
      return Response.json({
        code: 200,
        data: {
          PlayFabId: "REG123",
          SessionTicket: "new-reg-ticket",
        },
      });
    }

    if (op === "AddOrUpdateContactEmail") {
      if (rejectContactWrite) {
        return Response.json({ code: 400, error: "ContactEmailFailure" }, { status: 400 });
      }
      return Response.json({ code: 200, data: {} });
    }

    if (op === "UpdateUserTitleDisplayName") {
      return Response.json({ code: 200, data: { DisplayName: body["DisplayName"] } });
    }

    if (op === "UpdateUserData") {
      return Response.json({ code: 200, data: { DataVersion: 1 } });
    }

    if (op === "GetPlayerProfile") {
      const id = String(body["PlayFabId"] ?? "");
      const profile = mockProfiles.get(id);
      if (profile) {
        return Response.json({ code: 200, data: { PlayerProfile: profile } });
      }
      return Response.json({ code: 404, error: "NotFound" }, { status: 404 });
    }

    if (op === "GetUserAccountInfo") {
      const id = String(body["PlayFabId"] ?? "");
      const username = String(body["Username"] ?? "");
      const email = String(body["Email"] ?? "");

      if (
        id === "A100" ||
        username === "unverified_user" ||
        email === "unverified@example.com" ||
        email === "newbie@civilcraft.game"
      ) {
        return Response.json({
          code: 200,
          data: {
            UserInfo: {
              PlayFabId: "A100",
              Username: "unverified_user",
              PrivateInfo: { Email: "unverified@example.com" },
            },
          },
        });
      }
      if (id === "B200" || username === "verified_user" || email === "verified@example.com") {
        return Response.json({
          code: 200,
          data: {
            UserInfo: {
              PlayFabId: "B200",
              Username: "verified_user",
              PrivateInfo: { Email: "verified@example.com" },
            },
          },
        });
      }
      return Response.json({ code: 404, error: "AccountNotFound" }, { status: 404 });
    }

    if (op === "SendEmailFromTemplate") {
      return Response.json({ code: 200, data: {} });
    }

    return Response.json({ code: 400, error: "UnhandledOperation" }, { status: 400 });
  };
});

after(() => {
  globalThis.fetch = originalFetch;
  delete (globalThis as unknown as { window?: unknown }).window;
  if (priorSecret !== undefined) process.env["PLAYFAB_SECRET_KEY"] = priorSecret;
  else delete process.env["PLAYFAB_SECRET_KEY"];
  if (priorTemplate !== undefined)
    process.env["PLAYFAB_EMAIL_VERIFICATION_TEMPLATE_ID"] = priorTemplate;
  else delete process.env["PLAYFAB_EMAIL_VERIFICATION_TEMPLATE_ID"];
  if (priorTitle !== undefined) process.env["VITE_PLAYFAB_TITLE_ID"] = priorTitle;
  else delete process.env["VITE_PLAYFAB_TITLE_ID"];
});

test("maskEmail masks personal email addresses safely without leaking", () => {
  assert.equal(maskEmail("engineer@civilcraft.game"), "e***r@c***t.g***e");
  assert.equal(maskEmail("ab@cd.com"), "a***@c***.c***m");
  assert.equal(maskEmail(""), "your registered email address");
  assert.equal(maskEmail(null), "your registered email address");
  assert.equal(maskEmail(undefined), "your registered email address");
});

test("verifyPlayerSession authoritatively distinguishes confirmed and unconfirmed contact emails", async () => {
  mockProfiles.set("A100", {
    PlayerId: "A100",
    ContactEmailAddresses: [
      { EmailAddress: "builder@civilcraft.game", VerificationStatus: "Unconfirmed" },
    ],
  });
  mockProfiles.set("B200", {
    PlayerId: "B200",
    ContactEmailAddresses: [
      { EmailAddress: "architect@civilcraft.game", VerificationStatus: "Confirmed" },
    ],
  });

  const unverified = await verifyPlayerSession("unverified-ticket");
  assert.equal(unverified.verified, false);
  assert.equal(unverified.status, "Unconfirmed");
  assert.equal(unverified.maskedEmail, "b***r@c***t.g***e");

  const verified = await verifyPlayerSession("verified-ticket");
  assert.equal(verified.verified, true);
  assert.equal(verified.status, "Confirmed");
  assert.equal(verified.maskedEmail, "a***t@c***t.g***e");
});

test("verifyPlayerSession rejects expired session tickets with 401", async () => {
  await assert.rejects(
    async () => verifyPlayerSession("expired-ticket"),
    (err: unknown) => err instanceof AdminApiError && err.status === 401,
  );
});

test("requireVerifiedPlayer denies access to unverified players with 403", async () => {
  mockProfiles.set("A100", {
    PlayerId: "A100",
    ContactEmailAddresses: [
      { EmailAddress: "unverified@example.com", VerificationStatus: "Unconfirmed" },
    ],
  });

  const req = new Request("https://civilcraft.test/api/player/messages", {
    headers: { Authorization: "Bearer unverified-ticket" },
  });

  await assert.rejects(
    async () => requireVerifiedPlayer(req),
    (err: unknown) =>
      err instanceof AdminApiError &&
      err.status === 403 &&
      err.message.includes("verify your email address"),
  );
});

test("requireVerifiedPlayer permits access to verified players", async () => {
  mockProfiles.set("B200", {
    PlayerId: "B200",
    ContactEmailAddresses: [
      { EmailAddress: "verified@example.com", VerificationStatus: "Confirmed" },
    ],
  });

  const req = new Request("https://civilcraft.test/api/player/messages", {
    headers: { Authorization: "Bearer verified-ticket" },
  });

  const result = await requireVerifiedPlayer(req);
  assert.equal(result.playFabId, "B200");
  assert.equal(result.email, "verified@example.com");
});

test("resendVerificationEmail enforces cooldown and rate limiting", async () => {
  mockProfiles.set("A100", {
    PlayerId: "A100",
    ContactEmailAddresses: [
      { EmailAddress: "newbie@civilcraft.game", VerificationStatus: "Unconfirmed" },
    ],
  });

  // First request should succeed
  const res1 = await resendVerificationEmail("newbie@civilcraft.game", "unverified-ticket");
  assert.equal(res1.success, true);
  assert.equal(res1.cooldownSeconds, 60);

  // Immediate second request within 60s should be rejected with 429
  await assert.rejects(
    async () => resendVerificationEmail("newbie@civilcraft.game", "unverified-ticket"),
    (err: unknown) => err instanceof AdminApiError && err.status === 429,
  );
});

test("resendVerificationEmail notifies player if already verified", async () => {
  mockProfiles.set("B200", {
    PlayerId: "B200",
    ContactEmailAddresses: [
      { EmailAddress: "verified@example.com", VerificationStatus: "Confirmed" },
    ],
  });

  const res = await resendVerificationEmail("verified@example.com", "verified-ticket");
  assert.equal(res.success, true);
  assert.equal(res.alreadyVerified, true);
  assert.ok(res.message.includes("already verified"));
});

test("handlePlayerVerificationRequest dispatches verify-session and resend endpoints", async () => {
  mockProfiles.set("A100", {
    PlayerId: "A100",
    ContactEmailAddresses: [
      { EmailAddress: "test@civilcraft.game", VerificationStatus: "Unconfirmed" },
    ],
  });

  // Test verify-session
  const verifyReq = new Request("https://civilcraft.test/api/player/auth/verify-session", {
    method: "POST",
    headers: { Authorization: "Bearer unverified-ticket" },
  });
  const verifyRes = await handlePlayerVerificationRequest(verifyReq);
  assert.ok(verifyRes);
  assert.equal(verifyRes.status, 200);
  const verifyBody = (await verifyRes.json()) as { verified: boolean };
  assert.equal(verifyBody.verified, false);

  // Test status endpoint
  const statusReq = new Request("https://civilcraft.test/api/player/auth/status", {
    method: "GET",
    headers: { Authorization: "Bearer unverified-ticket" },
  });
  const statusRes = await handlePlayerVerificationRequest(statusReq);
  assert.ok(statusRes);
  assert.equal(statusRes.status, 200);
  const statusBody = (await statusRes.json()) as { authenticated: boolean; verified: boolean };
  assert.equal(statusBody.authenticated, true);
  assert.equal(statusBody.verified, false);
});

test("registration synchronizes contact email and leaves player unauthenticated", async () => {
  const result = await registerPlayer({
    username: "new_cadet",
    email: "cadet@civilcraft.game",
    password: "Password123!",
    emailUpdates: true,
    termsAccepted: true,
  });

  assert.equal(result.email, "cadet@civilcraft.game");
  assert.equal(result.verificationRequired, true);

  // Assert that AddOrUpdateContactEmail was called
  const syncCall = playFabCalls.find((c) => c.operation === "AddOrUpdateContactEmail");
  assert.ok(syncCall, "AddOrUpdateContactEmail must be called during registration");
  assert.equal(syncCall.body["EmailAddress"], "cadet@civilcraft.game");

  // Assert that no manual SendEmailFromTemplate was called during registration (PlayStream handles it)
  const templateCall = playFabCalls.find((c) => c.operation === "SendEmailFromTemplate");
  assert.equal(templateCall, undefined, "Manual template must not be triggered on registration");

  // Registration must clear player session
  assert.equal(getStoredPlayer(), null);
});

test("verified player can log in and establish a player dashboard session", async () => {
  mockProfiles.set("B200", {
    PlayerId: "B200",
    ContactEmailAddresses: [
      { EmailAddress: "verified@example.com", VerificationStatus: "Confirmed" },
    ],
  });

  const identity = await loginWithEmail("verified@example.com", "Password123!");
  assert.equal(identity.playFabId, "B200");
  assert.equal(identity.displayName, "Verified Engineer");

  const stored = getStoredPlayer();
  assert.ok(stored);
  assert.equal(stored.playFabId, "B200");

  signOutPlayer();
  assert.equal(getStoredPlayer(), null);
});

test("unverified player cannot establish a dashboard session and throws EmailVerificationRequiredError", async () => {
  mockProfiles.set("A100", {
    PlayerId: "A100",
    ContactEmailAddresses: [
      { EmailAddress: "unverified@example.com", VerificationStatus: "Unconfirmed" },
    ],
  });

  await assert.rejects(
    async () => loginWithEmail("unverified@example.com", "Password123!"),
    (err: unknown) => {
      assert.ok(err instanceof EmailVerificationRequiredError);
      assert.equal(err.playFabId, "A100");
      assert.equal(err.maskedEmail, "u***d@e***e.c***m");
      return true;
    },
  );

  // Verify that NO session is stored for unverified user!
  assert.equal(getStoredPlayer(), null);
});

test("client-side manipulation cannot bypass server verification check", async () => {
  mockProfiles.set("A100", {
    PlayerId: "A100",
    ContactEmailAddresses: [
      { EmailAddress: "unverified@example.com", VerificationStatus: "Unconfirmed" },
    ],
  });

  // Client attempts to pass verified=true in body
  const forgedReq = new Request("https://civilcraft.test/api/player/auth/verify-session", {
    method: "POST",
    headers: {
      Authorization: "Bearer unverified-ticket",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ verified: true, status: "Confirmed" }),
  });

  const res = await handlePlayerVerificationRequest(forgedReq);
  assert.ok(res);
  const data = (await res.json()) as { verified: boolean; status: string };

  // Server ignores client input and reports authoritative status
  assert.equal(data.verified, false);
  assert.equal(data.status, "Unconfirmed");
});

test("resendVerificationEmail triggers AddOrUpdateContactEmail when template ID is not set", async () => {
  delete process.env["PLAYFAB_EMAIL_VERIFICATION_TEMPLATE_ID"];
  mockProfiles.set("A100", {
    PlayerId: "A100",
    ContactEmailAddresses: [
      { EmailAddress: "playstream@civilcraft.game", VerificationStatus: "Unconfirmed" },
    ],
  });

  const res = await resendVerificationEmail("playstream@civilcraft.game", "unverified-ticket");
  assert.equal(res.success, true);
  assert.equal(res.cooldownSeconds, 60);

  // Check that AddOrUpdateContactEmail was called on PlayFab
  const call = playFabCalls.find((c) => c.operation === "AddOrUpdateContactEmail");
  assert.ok(call, "Expected Client/AddOrUpdateContactEmail to be called to fire PlayStream rule");
  assert.equal(call.body["EmailAddress"], "playstream@civilcraft.game");
});

test("authenticated resend repairs a missing contact using the account's registered email", async () => {
  mockProfiles.set("A100", { PlayerId: "A100", ContactEmailAddresses: [] });
  const response = await handlePlayerVerificationRequest(
    new Request("https://civilcraft.test/api/player/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer unverified-ticket" },
      body: JSON.stringify({
        identifier: "unrelated@example.com",
      }),
    }),
  );

  assert.ok(response);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.match(body.message, /Verification requested/);
  assert.deepEqual(
    playFabCalls.filter((call) => call.operation === "AddOrUpdateContactEmail"),
    [
      {
        operation: "AddOrUpdateContactEmail",
        body: { PlayFabId: "A100", EmailAddress: "unverified@example.com" },
      },
    ],
  );
  assert.ok(!playFabCalls.some((call) => call.operation === "SendEmailFromTemplate"));
});

test("missing contact cannot be written without the account's valid ticket", async () => {
  mockProfiles.set("A100", { PlayerId: "A100", ContactEmailAddresses: [] });
  await assert.rejects(
    () => resendVerificationEmail("unverified_user", "expired-ticket"),
    (error: unknown) => error instanceof AdminApiError && error.status === 401,
  );
  assert.ok(
    !playFabCalls.some((call) =>
      ["AddOrUpdateContactEmail", "SendEmailFromTemplate"].includes(call.operation),
    ),
  );
});

test("a rejected contact repair reports a failure to the game", async () => {
  mockProfiles.set("A100", { PlayerId: "A100", ContactEmailAddresses: [] });
  rejectContactWrite = true;
  await assert.rejects(
    () => resendVerificationEmail("retry-contact", "unverified-ticket"),
    (error: unknown) => error instanceof AdminApiError && error.status === 503,
  );
  assert.ok(!playFabCalls.some((call) => call.operation === "SendEmailFromTemplate"));
});

test("resendVerificationEmail refuses false success when neither template ID nor session ticket exists", async () => {
  delete process.env["PLAYFAB_EMAIL_VERIFICATION_TEMPLATE_ID"];
  mockProfiles.set("A100", {
    PlayerId: "A100",
    ContactEmailAddresses: [
      { EmailAddress: "unverified@example.com", VerificationStatus: "Unconfirmed" },
    ],
  });

  // Anonymous resend without session ticket and without template ID
  await assert.rejects(
    async () => resendVerificationEmail("unverified@example.com"),
    (err: unknown) =>
      err instanceof AdminApiError &&
      err.status === 503 &&
      err.message.includes("Unable to resend verification email automatically"),
  );
});

test("cross-browser authentication: out-of-band email verification unlocks fresh browser login", async () => {
  // Browser 1: Register account
  const regResult = await registerPlayer({
    username: "crossbrowser_eng",
    email: "unverified@example.com",
    password: "Password123!",
  });
  assert.equal(regResult.verificationRequired, true);
  assert.equal(getStoredPlayer(), null);

  // External action: User opens confirmation link on their phone / another browser
  // PlayFab marks the contact email Confirmed
  mockProfiles.set("A100", {
    PlayerId: "A100",
    ContactEmailAddresses: [
      { EmailAddress: "unverified@example.com", VerificationStatus: "Confirmed" },
    ],
  });

  // Browser 2 (fresh window / new device): Logs in
  storage.clear(); // Fresh localStorage
  const identity = await loginWithEmail("unverified@example.com", "Password123!");

  assert.equal(identity.displayName, "Unverified Engineer");
  assert.equal(getStoredPlayer()?.playFabId, "A100");
});
