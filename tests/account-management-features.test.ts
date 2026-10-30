import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  registerPlayer,
} from "../src/lib/playfab/auth.ts";
import { ACCOUNT_DATA_AUDIT, reauthenticatePlayer } from "../src/lib/playfab/account-settings.ts";

test("policy versions are defined and follow date versioning format", () => {
  assert.ok(typeof CURRENT_TERMS_VERSION === "string");
  assert.ok(typeof CURRENT_PRIVACY_VERSION === "string");
  assert.match(CURRENT_TERMS_VERSION, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(CURRENT_PRIVACY_VERSION, /^\d{4}-\d{2}-\d{2}$/);
});

test("registerPlayer persists policy agreement and version metadata to UserData when accepted", async () => {
  const calls: {
    path: string;
    body: Record<string, unknown>;
    options?: Record<string, unknown>;
  }[] = [];
  const originalFetch = globalThis.fetch;

  // Mock fetch for PlayFab calls
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const headers = init?.headers as Record<string, string> | undefined;
    const sessionTicket = headers?.["X-Authorization"];

    if (url.includes("/Client/RegisterPlayFabUser")) {
      calls.push({ path: "/Client/RegisterPlayFabUser", body, options: { sessionTicket } });
      return Response.json({
        code: 200,
        status: "OK",
        data: {
          PlayFabId: "NEW_PLAYER_123",
          SessionTicket: "TICKET_NEW_123",
        },
      });
    }

    if (url.includes("/Client/AddOrUpdateContactEmail")) {
      calls.push({ path: "/Client/AddOrUpdateContactEmail", body, options: { sessionTicket } });
      return Response.json({ code: 200, status: "OK", data: {} });
    }

    if (url.includes("/Client/UpdateUserTitleDisplayName")) {
      calls.push({ path: "/Client/UpdateUserTitleDisplayName", body, options: { sessionTicket } });
      return Response.json({ code: 200, status: "OK", data: { DisplayName: body["DisplayName"] } });
    }

    if (url.includes("/Client/UpdateUserData")) {
      calls.push({ path: "/Client/UpdateUserData", body, options: { sessionTicket } });
      return Response.json({ code: 200, status: "OK", data: { DataVersion: 1 } });
    }

    if (url.includes("/api/player/email-preference")) {
      calls.push({ path: "/api/player/email-preference", body, options: { sessionTicket } });
      return Response.json({ emailUpdates: true });
    }

    return Response.json({ code: 200, status: "OK", data: {} });
  };

  try {
    const timestamp = "2026-10-29T10:00:00.000Z";
    const res = await registerPlayer({
      username: "testengineer",
      email: "engineer@example.com",
      password: "StrongPassword123!",
      termsAccepted: true,
      termsVersion: CURRENT_TERMS_VERSION,
      privacyVersion: CURRENT_PRIVACY_VERSION,
      policyAcceptedAt: timestamp,
      emailUpdates: true,
    });

    assert.equal(res.email, "engineer@example.com");
    assert.equal(res.verificationRequired, true);

    // Verify UpdateUserData was called with the policy keys
    const userDataCall = calls.find((c) => c.path === "/Client/UpdateUserData");
    assert.ok(
      userDataCall,
      "UpdateUserData should be called on registration when terms are accepted",
    );
    assert.equal(userDataCall.options?.["sessionTicket"], "TICKET_NEW_123");

    const data = userDataCall.body["Data"] as Record<string, string>;
    assert.equal(data["PolicyAcceptedAt"], timestamp);
    assert.equal(data["TermsAcceptedVersion"], CURRENT_TERMS_VERSION);
    assert.equal(data["PrivacyAcceptedVersion"], CURRENT_PRIVACY_VERSION);

    const parsedAgreement = JSON.parse(String(data["PolicyAgreement"])) as {
      termsVersion: string;
      privacyVersion: string;
      acceptedAt: string;
    };
    assert.equal(parsedAgreement.termsVersion, CURRENT_TERMS_VERSION);
    assert.equal(parsedAgreement.privacyVersion, CURRENT_PRIVACY_VERSION);
    assert.equal(parsedAgreement.acceptedAt, timestamp);

    // Verify email preference was persisted
    const emailPrefCall = calls.find((c) => c.path === "/api/player/email-preference");
    assert.ok(emailPrefCall, "Email preference should be saved when opted in");
    assert.equal(emailPrefCall.body["emailUpdates"], true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("registerPlayer does not persist email preference if optional checkbox is unselected", async () => {
  const calls: { path: string }[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/Client/RegisterPlayFabUser")) {
      calls.push({ path: "/Client/RegisterPlayFabUser" });
      return Response.json({
        code: 200,
        status: "OK",
        data: { PlayFabId: "OPT_OUT_PLAYER", SessionTicket: "TICKET_OPT_OUT" },
      });
    }
    if (url.includes("/api/player/email-preference")) {
      calls.push({ path: "/api/player/email-preference" });
      return Response.json({ emailUpdates: false });
    }
    return Response.json({ code: 200, status: "OK", data: {} });
  };

  try {
    await registerPlayer({
      username: "optoutengineer",
      email: "optout@example.com",
      password: "StrongPassword123!",
      termsAccepted: true,
      emailUpdates: false,
    });

    const emailPrefCall = calls.find((c) => c.path === "/api/player/email-preference");
    assert.equal(
      emailPrefCall,
      undefined,
      "Email preference endpoint must not be called when user does not opt in",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("data dependency audit identifies all 6 required architectural layers", () => {
  assert.equal(ACCOUNT_DATA_AUDIT.length, 6);

  const categories = ACCOUNT_DATA_AUDIT.map((item) => item.category);
  assert.ok(categories.includes("Authentication & Credentials"));
  assert.ok(categories.includes("Game Saves & Customization"));
  assert.ok(categories.includes("Player Progression & Almanac"));
  assert.ok(categories.includes("Leaderboards & Statistics"));
  assert.ok(categories.includes("Virtual Currency & Purchases"));
  assert.ok(categories.includes("Local Device Storage"));

  // Check that Postgres financial trigger requirement is documented
  const postgresAudit = ACCOUNT_DATA_AUDIT.find((item) => item.source.includes("PostgreSQL"));
  assert.ok(postgresAudit);
  assert.ok(postgresAudit.requirement.includes("permanent_account"));
  assert.ok(postgresAudit.requirement.includes("permanent_receipt"));

  // Check that Unity client local storage requirement is documented
  const unityAudit = ACCOUNT_DATA_AUDIT.find((item) => item.source.includes("Unity"));
  assert.ok(unityAudit);
  assert.ok(unityAudit.requirement.includes("client-side wipe"));
});

test("reauthenticatePlayer verifies password against PlayFab and guards against session tampering", async () => {
  const originalFetch = globalThis.fetch;
  const store: Record<string, string> = {
    "civilcraft.session.player.v1": JSON.stringify({
      sessionTicket: "ORIGINAL_SESSION_TICKET",
      identity: { playFabId: "VERIFIED_PLAYER_ID" },
    }),
  };

  // Mock localStorage for readSession
  const storageMock = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const key of Object.keys(store)) delete store[key];
    },
    length: 1,
    key: () => null,
  };

  (globalThis as unknown as { window: { localStorage: typeof storageMock } }).window = {
    localStorage: storageMock,
  };

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};

    if (url.includes("/Client/GetAccountInfo")) {
      return Response.json({
        code: 200,
        status: "OK",
        data: {
          AccountInfo: {
            PlayFabId: "VERIFIED_PLAYER_ID",
            Username: "testplayer",
            PrivateInfo: { Email: "player@example.com" },
          },
        },
      });
    }

    if (url.includes("/Client/GetPlayerProfile")) {
      return Response.json({
        code: 200,
        status: "OK",
        data: {
          PlayerProfile: {
            PlayerId: "VERIFIED_PLAYER_ID",
            ContactEmailAddresses: [
              { EmailAddress: "player@example.com", VerificationStatus: "Confirmed" },
            ],
          },
        },
      });
    }

    if (url.includes("/Client/LoginWithPlayFab")) {
      if (body["Password"] === "CorrectPassword123!") {
        return Response.json({
          code: 200,
          status: "OK",
          data: {
            PlayFabId: "VERIFIED_PLAYER_ID",
            SessionTicket: "REAUTH_SESSION_TICKET_OK",
          },
        });
      }
      return Response.json(
        {
          code: 400,
          status: "BadRequest",
          errorCode: 1001,
          errorMessage: "Invalid username or password.",
        },
        { status: 400 },
      );
    }

    return Response.json({ code: 200, status: "OK", data: {} });
  };

  try {
    // 1. Success with correct password
    const result = await reauthenticatePlayer("CorrectPassword123!");
    assert.equal(result.playFabId, "VERIFIED_PLAYER_ID");
    assert.equal(result.sessionTicket, "REAUTH_SESSION_TICKET_OK");

    // 2. Reject empty password
    await assert.rejects(() => reauthenticatePlayer(""), /Enter your current password/);

    // 3. Reject incorrect password
    await assert.rejects(
      () => reauthenticatePlayer("WrongPassword!"),
      /Invalid username or password/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    delete (globalThis as unknown as { window?: unknown }).window;
  }
});

test("account deletion audit document docs/account-deletion-audit.md exists and covers all 6 systems", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  const docPath = path.resolve(process.cwd(), "docs/account-deletion-audit.md");
  const content = await fs.readFile(docPath, "utf-8");

  assert.ok(content.includes("PlayFab Master Account"));
  assert.ok(content.includes("PlayFab Title Entity Files"));
  assert.ok(content.includes("PlayFab Title UserData & Statistics"));
  assert.ok(content.includes("PostgreSQL Database"));
  assert.ok(content.includes("permanent_account"));
  assert.ok(content.includes("permanent_receipt"));
  assert.ok(content.includes("Unity Android Client"));
  assert.ok(content.includes("Active Browser Sessions & Cache"));
});

test("settings route places Email updates above Delete Account and hides preview controls", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  const settingsRoutePath = path.resolve(process.cwd(), "src/routes/dashboard.settings.tsx");
  const content = await fs.readFile(settingsRoutePath, "utf-8");

  // Verify Email updates comes before DeleteAccountSection in JSX order
  const emailUpdatesIndex = content.indexOf('id="email-updates"');
  const deleteAccountIndex = content.indexOf("<DeleteAccountSection");
  assert.ok(emailUpdatesIndex > 0, "Email updates switch must exist");
  assert.ok(deleteAccountIndex > 0, "DeleteAccountSection must exist");
  assert.ok(
    emailUpdatesIndex < deleteAccountIndex,
    "Email updates must be positioned above Delete Account",
  );

  // Verify preview-only controls (publicProfile, compactMode) are preserved but wrapped in hidden container
  assert.ok(content.includes('id="public-profile"'), "publicProfile switch preserved");
  assert.ok(content.includes('id="compact-mode"'), "compactMode switch preserved");
  assert.ok(
    content.includes('className="hidden"'),
    "preview-only controls wrapped in hidden container",
  );
  assert.ok(content.includes('aria-hidden="true"'), "preview-only controls have aria-hidden");
});

test("account settings player UI simplifies deletion and truthfully reflects unavailable backend status", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  const componentPath = path.resolve(process.cwd(), "src/components/dashboard/AccountSettings.tsx");
  const content = await fs.readFile(componentPath, "utf-8");

  // Verify player-facing UI shows unavailable badge & action
  assert.ok(content.includes("Currently Unavailable"), "Shows Currently Unavailable badge");
  assert.ok(
    content.includes("Delete Account (Unavailable)"),
    "Action clearly indicates unavailable status",
  );

  // Verify dialog states no request was submitted or processed
  assert.ok(
    content.includes("No deletion request has been submitted or processed"),
    "Dialog truthfully states no request was submitted or processed",
  );

  // Verify false claims are NOT present
  assert.ok(
    !content.includes("Identity Reauthenticated & Request Submitted"),
    "Must not claim request was submitted",
  );
  assert.ok(
    !content.includes("A permanent account deletion request has been registered"),
    "Must not claim request was registered",
  );

  // Verify developer jargon (SQL trigger names) is removed from player component
  assert.ok(
    !content.includes("permanent_account"),
    "SQL trigger permanent_account removed from player UI",
  );
  assert.ok(
    !content.includes("permanent_receipt"),
    "SQL trigger permanent_receipt removed from player UI",
  );
});
