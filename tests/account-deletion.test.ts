import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import {
  type AccountDeletionRecord,
  acquireDeletionLock,
  adminRetryAccountDeletion,
  createDeletionRecoveryToken,
  executeAccountDeletion,
  getDeletionRecord,
  getDeletionRecordByReceiptId,
  getPlayerPlayedTitles,
  handleAccountDeletionRequest,
  isAccountDeleted,
  releaseDeletionLock,
  renewDeletionLock,
  requestAccountDeletion,
  resetDeletionRateLimits,
  resetDeletionStorageForTesting,
  saveDeletionRecord,
  verifyDeletionRecoveryToken,
  verifyDeletionStatus,
  verifyStorageHealth,
} from "../src/lib/playfab/account-deletion.server.ts";
import { verifyPlayerSession } from "../src/lib/playfab/player-verification.server.ts";
import { handleBridgeSnapshot } from "../src/lib/playfab/bridge-snapshot.server.ts";
import { handleCharacterPortrait } from "../src/lib/playfab/character-portrait.server.ts";
import { handlePlayerBugRequest } from "../src/lib/playfab/bug-reports.server.ts";
import { handleLeaderboardRequest } from "../src/lib/playfab/leaderboard.server.ts";
import { handleQuizReview } from "../src/lib/playfab/quiz-review.server.ts";
import { getOrder, listOrdersForPlayer, saveOrder } from "../src/lib/payments/orders.server.ts";
import { authenticatePaymentPlayer } from "../src/lib/payments/player-auth.server.ts";
import type { PaymentOrder } from "../src/lib/payments/types.ts";

const TEST_PLAYER_ID = "D851A9A5B7F72D01";
const TEST_OTHER_PLAYER_ID = "A123B456C789D012";
const TEST_GUEST_PLAYER_ID = "B999C888D777E666";
const TEST_ENTITY_ID = "FACE1234567890AB";
const TEST_TICKET = "TICKET_VALID_DELETION_TEST";
const TEST_OTHER_TICKET = "TICKET_OTHER_PLAYER";
const TEST_GUEST_TICKET = "TICKET_GUEST_PLAYER";
const TEST_WEBHOOK_SECRET = "secret-webhook-key-12345";

const env = {
  VITE_PLAYFAB_TITLE_ID: "17FA03",
  PLAYFAB_SECRET_KEY: "test-playfab-secret",
  PLAYFAB_WEBHOOK_SECRET: TEST_WEBHOOK_SECRET,
  PUBLIC_APP_URL: "https://civil-craft.vercel.app",
};

const previousEnv = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
const originalFetch = globalThis.fetch;

let internalData: Record<string, string> = {};
let playFabApiCalls: Array<{
  path: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}> = [];
let failOnPlayFabCall: string | null = null;
let accountPurgedFromPlayFab = false;
let playedTitlesList: string[] = ["17FA03"];

beforeEach(async () => {
  resetDeletionRateLimits();
  await resetDeletionStorageForTesting();
  for (const [k, v] of Object.entries(env)) {
    process.env[k] = v;
  }
  internalData = {};
  playFabApiCalls = [];
  failOnPlayFabCall = null;
  accountPurgedFromPlayFab = false;
  playedTitlesList = ["17FA03"];

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const headers = (init?.headers as Record<string, string>) || {};

    const path = url.replace(/^https:\/\/[^/]+\//, "");
    playFabApiCalls.push({ path, body, headers });

    if (failOnPlayFabCall && path.includes(failOnPlayFabCall)) {
      return Response.json(
        { code: 500, status: "Error", errorMessage: "Simulated PlayFab failure" },
        { status: 500 },
      );
    }

    // 1. AuthenticateSessionTicket
    if (path.includes("Server/AuthenticateSessionTicket")) {
      const ticket = body["SessionTicket"];
      if (ticket === TEST_TICKET) {
        return Response.json({
          code: 200,
          status: "OK",
          data: {
            UserInfo: {
              PlayFabId: TEST_PLAYER_ID,
              TitleInfo: {
                DisplayName: "TestBuilder",
                TitlePlayerAccount: { Id: TEST_ENTITY_ID, Type: "title_player_account" },
              },
            },
          },
        });
      }
      if (ticket === TEST_OTHER_TICKET) {
        return Response.json({
          code: 200,
          status: "OK",
          data: {
            UserInfo: {
              PlayFabId: TEST_OTHER_PLAYER_ID,
              TitleInfo: {
                DisplayName: "OtherPlayer",
                TitlePlayerAccount: { Id: "OTHER_ENTITY", Type: "title_player_account" },
              },
            },
          },
        });
      }
      if (ticket === TEST_GUEST_TICKET) {
        return Response.json({
          code: 200,
          status: "OK",
          data: {
            UserInfo: {
              PlayFabId: TEST_GUEST_PLAYER_ID,
              TitleInfo: {
                DisplayName: "GuestEngineer",
                TitlePlayerAccount: { Id: "GUEST_ENTITY", Type: "title_player_account" },
              },
            },
          },
        });
      }
      return Response.json({
        code: 200,
        status: "OK",
        data: {
          IsSessionTicketExpired: true,
        },
      });
    }

    // 2. Title Internal Data
    if (path.includes("Admin/GetTitleInternalData")) {
      const keys = (body["Keys"] as string[]) || [];
      if (keys.length > 0) {
        const filtered: Record<string, string> = {};
        for (const k of keys) {
          if (internalData[k] !== undefined) filtered[k] = internalData[k];
        }
        return Response.json({ code: 200, status: "OK", data: { Data: filtered } });
      }
      return Response.json({ code: 200, status: "OK", data: { Data: { ...internalData } } });
    }

    if (path.includes("Admin/SetTitleInternalData")) {
      const key = String(body["Key"]);
      const val = body["Value"];
      if (val === null || val === undefined) {
        delete internalData[key];
      } else {
        internalData[key] = String(val);
      }
      return Response.json({ code: 200, status: "OK", data: {} });
    }

    // 3. GetPlayedTitleList
    if (path.includes("Admin/GetPlayedTitleList")) {
      return Response.json({
        code: 200,
        status: "OK",
        data: {
          TitleIds: [...playedTitlesList],
        },
      });
    }

    // 4. GetUserAccountInfo
    if (path.includes("Admin/GetUserAccountInfo")) {
      const id = String(body["PlayFabId"]);
      if (accountPurgedFromPlayFab && id === TEST_PLAYER_ID) {
        return Response.json(
          {
            code: 404,
            status: "NotFound",
            error: "AccountNotFound",
            errorMessage: "User not found",
          },
          { status: 404 },
        );
      }

      if (id === TEST_GUEST_PLAYER_ID) {
        return Response.json({
          code: 200,
          status: "OK",
          data: {
            UserInfo: {
              PlayFabId: id,
              TitleInfo: {
                DisplayName: "GuestEngineer",
                TitlePlayerAccount: { Id: "GUEST_ENTITY", Type: "title_player_account" },
              },
            },
          },
        });
      }

      const isOther = id === TEST_OTHER_PLAYER_ID;
      return Response.json({
        code: 200,
        status: "OK",
        data: {
          UserInfo: {
            PlayFabId: id,
            Username: isOther ? "otherplayer" : "testbuilder",
            PrivateInfo: { Email: isOther ? "other@civilcraft.game" : "builder@civilcraft.game" },
            TitleInfo: {
              DisplayName: isOther ? "OtherPlayer" : "TestBuilder",
              TitlePlayerAccount: {
                Id: isOther ? "OTHER_ENTITY" : TEST_ENTITY_ID,
                Type: "title_player_account",
              },
            },
          },
        },
      });
    }

    // 5. Entity Token
    if (path.includes("Authentication/GetEntityToken")) {
      return Response.json({
        code: 200,
        status: "OK",
        data: {
          EntityToken: "TEST_ENTITY_TOKEN_123",
          Entity: { Id: "17FA03", Type: "title" },
          TokenExpiration: new Date(Date.now() + 3600_000).toISOString(),
        },
      });
    }

    // 6. File APIs
    if (path.includes("File/GetFiles")) {
      return Response.json({
        code: 200,
        status: "OK",
        data: {
          Metadata: {
            "playerSaveData.json": { FileName: "playerSaveData.json" },
            "characterPortrait.png": { FileName: "characterPortrait.png" },
          },
        },
      });
    }

    if (path.includes("File/DeleteFiles")) {
      return Response.json({ code: 200, status: "OK", data: {} });
    }

    // 7. Object APIs
    if (path.includes("Object/SetObjects")) {
      return Response.json({ code: 200, status: "OK", data: {} });
    }

    // 8. UserData & Statistics
    if (path.includes("Server/UpdateUserData")) {
      return Response.json({ code: 200, status: "OK", data: {} });
    }

    if (path.includes("Server/UpdatePlayerStatistics")) {
      return Response.json({ code: 200, status: "OK", data: {} });
    }

    // 9. Delete Master Player Account (returns JobReceiptId)
    if (path.includes("Admin/DeleteMasterPlayerAccount")) {
      return Response.json({
        code: 200,
        status: "OK",
        data: {
          JobReceiptId: "job-receipt-del-998877",
          TitleId: "17FA03",
        },
      });
    }

    // 10. LoginWithPlayFab / LoginWithEmailAddress (Password confirmation)
    if (path.includes("Client/LoginWithPlayFab") || path.includes("Client/LoginWithEmailAddress")) {
      if (body["Password"] === "CorrectPassword123!") {
        const username = String(body["Username"] || "");
        const email = String(body["Email"] || "");
        const isOther = username.includes("other") || email.includes("other");
        return Response.json({
          code: 200,
          status: "OK",
          data: {
            PlayFabId: isOther ? TEST_OTHER_PLAYER_ID : TEST_PLAYER_ID,
            SessionTicket: "TICKET_NEW",
          },
        });
      }
      return Response.json({
        code: 400,
        status: "BadRequest",
        error: "InvalidUsernameOrPassword",
        errorMessage: "Invalid password",
      });
    }

    return Response.json({ code: 200, status: "OK", data: {} });
  };
});

after(() => {
  globalThis.fetch = originalFetch;
  for (const [k, v] of Object.entries(previousEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

test("1. External deletion record persistence: stores and retrieves lifecycle state outside PlayFab", async () => {
  const record = {
    playFabId: TEST_PLAYER_ID,
    status: "processing" as const,
    requestedAt: "2026-11-12T00:00:00.000Z",
    jobReceiptId: "job-receipt-del-12345",
    queuedAt: "2026-11-12T00:00:10.000Z",
    stepsCompleted: ["entity_files", "user_data_and_statistics", "playfab_account_queued"],
    affectedTitleIds: ["17FA03"],
    pseudonymizedIdentifier: "PSEUDO_PLAYER_TEST_1",
    updatedAt: "2026-11-12T00:00:10.000Z",
  };

  await saveDeletionRecord(record);

  const retrieved = await getDeletionRecord(TEST_PLAYER_ID);
  assert.ok(retrieved);
  assert.equal(retrieved.playFabId, TEST_PLAYER_ID);
  assert.equal(retrieved.status, "processing");
  assert.equal(retrieved.jobReceiptId, "job-receipt-del-12345");
  assert.equal(retrieved.pseudonymizedIdentifier, "PSEUDO_PLAYER_TEST_1");
  assert.deepEqual(retrieved.affectedTitleIds, ["17FA03"]);
});

test("2. Deletion record availability after PlayFab player data is removed: survives PlayFab account deletion", async () => {
  await saveDeletionRecord({
    playFabId: TEST_PLAYER_ID,
    status: "processing",
    requestedAt: "2026-11-12T00:00:00.000Z",
    jobReceiptId: "job-receipt-del-998877",
    queuedAt: "2026-11-12T00:00:15.000Z",
    stepsCompleted: ["playfab_account_queued"],
    affectedTitleIds: ["17FA03"],
    pseudonymizedIdentifier: "PSEUDO_PLAYER_PURGED",
    updatedAt: "2026-11-12T00:00:15.000Z",
  });

  // Simulate PlayFab purging the master player account completely
  accountPurgedFromPlayFab = true;

  // Record is still available from durable website storage
  const record = await getDeletionRecord(TEST_PLAYER_ID);
  assert.ok(record, "Deletion record must survive PlayFab player account erasure");
  assert.equal(record.jobReceiptId, "job-receipt-del-998877");
  assert.equal(record.status, "processing");

  // Lookup by receipt ID also succeeds
  const byReceipt = await getDeletionRecordByReceiptId("job-receipt-del-998877");
  assert.ok(byReceipt);
  assert.equal(byReceipt.playFabId, TEST_PLAYER_ID);
});

test("3. Correct title_deleted_master_player event handling: transitions processing to completed", async () => {
  await saveDeletionRecord({
    playFabId: TEST_PLAYER_ID,
    status: "processing",
    requestedAt: "2026-11-12T00:00:00.000Z",
    jobReceiptId: "job-receipt-del-998877",
    queuedAt: "2026-11-12T00:00:10.000Z",
    stepsCompleted: ["playfab_account_queued"],
    affectedTitleIds: ["17FA03"],
    pseudonymizedIdentifier: "PSEUDO_PLAYER_WEBHOOK",
    updatedAt: "2026-11-12T00:00:10.000Z",
  });

  const webhookReq = new Request(
    "https://civil-craft.vercel.app/api/player/account/delete/webhook",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PlayFab-Webhook-Secret": TEST_WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        EventName: "title_deleted_master_player",
        EventId: "evt_del_complete_123",
        PlayerId: TEST_PLAYER_ID,
        ReceiptId: "job-receipt-del-998877",
        Timestamp: "2026-11-12T00:05:00.000Z",
        MetaData: "17FA03",
      }),
    },
  );

  const res = await handleAccountDeletionRequest(webhookReq);
  assert.ok(res);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.acknowledged, true);
  assert.equal(data.status, "completed");
  assert.equal(data.receiptId, undefined, "Webhook response must not leak receiptId");

  // Verify external record updated to completed
  const completed = await getDeletionRecord(TEST_PLAYER_ID);
  assert.ok(completed);
  assert.equal(completed.status, "completed");
  assert.equal(completed.jobReceiptId, "job-receipt-del-998877");
  assert.equal(completed.completedAt, "2026-11-12T00:05:00.000Z");
});

test("4. ReceiptId matching: webhook matches against persisted deletion job receipt", async () => {
  await saveDeletionRecord({
    playFabId: TEST_PLAYER_ID,
    status: "processing",
    requestedAt: "2026-11-12T00:00:00.000Z",
    jobReceiptId: "correct-receipt-id-xyz",
    stepsCompleted: ["playfab_account_queued"],
    affectedTitleIds: ["17FA03"],
    pseudonymizedIdentifier: "PSEUDO_PLAYER_XYZ",
    updatedAt: "2026-11-12T00:00:00.000Z",
  });

  const webhookReq = new Request(
    "https://civil-craft.vercel.app/api/player/account/delete/webhook",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PlayFab-Webhook-Secret": TEST_WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        EventName: "title_deleted_master_player",
        PlayerId: TEST_PLAYER_ID,
        ReceiptId: "correct-receipt-id-xyz",
      }),
    },
  );

  const res = await handleAccountDeletionRequest(webhookReq);
  assert.ok(res);
  assert.equal(res.status, 200);
  const stored = await getDeletionRecord(TEST_PLAYER_ID);
  assert.equal(stored?.status, "completed");
});

test("5. Unauthorized webhook rejection: rejects requests without valid secret header", async () => {
  const reqNoHeader = new Request(
    "https://civil-craft.vercel.app/api/player/account/delete/webhook",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        EventName: "title_deleted_master_player",
        ReceiptId: "some-receipt",
      }),
    },
  );

  const resNoHeader = await handleAccountDeletionRequest(reqNoHeader);
  assert.ok(resNoHeader);
  assert.equal(resNoHeader.status, 401);

  const reqWrongHeader = new Request(
    "https://civil-craft.vercel.app/api/player/account/delete/webhook",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PlayFab-Webhook-Secret": "wrong-secret",
      },
      body: JSON.stringify({
        EventName: "title_deleted_master_player",
        ReceiptId: "some-receipt",
      }),
    },
  );

  const resWrongHeader = await handleAccountDeletionRequest(reqWrongHeader);
  assert.ok(resWrongHeader);
  assert.equal(resWrongHeader.status, 401);
});

test("6. Duplicate webhook delivery: handled idempotently without re-processing", async () => {
  await saveDeletionRecord({
    playFabId: TEST_PLAYER_ID,
    status: "completed",
    requestedAt: "2026-11-12T00:00:00.000Z",
    completedAt: "2026-11-12T00:05:00.000Z",
    jobReceiptId: "duplicate-receipt-123",
    stepsCompleted: ["playfab_account_queued"],
    affectedTitleIds: ["17FA03"],
    pseudonymizedIdentifier: "PSEUDO_PLAYER_DUP",
    updatedAt: "2026-11-12T00:05:00.000Z",
  });

  const webhookReq = new Request(
    "https://civil-craft.vercel.app/api/player/account/delete/webhook",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PlayFab-Webhook-Secret": TEST_WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        EventName: "title_deleted_master_player",
        PlayerId: TEST_PLAYER_ID,
        ReceiptId: "duplicate-receipt-123",
      }),
    },
  );

  const res = await handleAccountDeletionRequest(webhookReq);
  assert.ok(res);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.acknowledged, true);
  assert.equal(data.duplicate, true);
});

test("7. Missing or mismatched receipt: rejects invalid webhook events", async () => {
  // 1. Missing ReceiptId in event payload
  const reqMissingReceipt = new Request(
    "https://civil-craft.vercel.app/api/player/account/delete/webhook",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PlayFab-Webhook-Secret": TEST_WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        EventName: "title_deleted_master_player",
        PlayerId: TEST_PLAYER_ID,
        // No ReceiptId
      }),
    },
  );
  const resMissing = await handleAccountDeletionRequest(reqMissingReceipt);
  assert.ok(resMissing);
  assert.equal(resMissing.status, 400);

  // 2. Unmatched ReceiptId (unknown receipt)
  const reqUnknownReceipt = new Request(
    "https://civil-craft.vercel.app/api/player/account/delete/webhook",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PlayFab-Webhook-Secret": TEST_WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        EventName: "title_deleted_master_player",
        PlayerId: TEST_PLAYER_ID,
        ReceiptId: "non-existent-receipt-999",
      }),
    },
  );
  const resUnknown = await handleAccountDeletionRequest(reqUnknownReceipt);
  assert.ok(resUnknown);
  assert.equal(resUnknown.status, 404);

  // 3. Mismatched PlayerId for an existing receipt
  await saveDeletionRecord({
    playFabId: TEST_PLAYER_ID,
    status: "processing",
    requestedAt: "2026-11-12T00:00:00.000Z",
    jobReceiptId: "valid-receipt-belonging-to-player-1",
    stepsCompleted: ["playfab_account_queued"],
    affectedTitleIds: ["17FA03"],
    pseudonymizedIdentifier: "PSEUDO_1",
    updatedAt: "2026-11-12T00:00:00.000Z",
  });

  const reqMismatchedPlayer = new Request(
    "https://civil-craft.vercel.app/api/player/account/delete/webhook",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PlayFab-Webhook-Secret": TEST_WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        EventName: "title_deleted_master_player",
        PlayerId: "WRONG_ATTACKER_PLAYER_ID",
        ReceiptId: "valid-receipt-belonging-to-player-1",
      }),
    },
  );
  const resMismatched = await handleAccountDeletionRequest(reqMismatchedPlayer);
  assert.ok(resMismatched);
  assert.equal(resMismatched.status, 400);
});

test("8. GetPlayedTitleList failure: fails closed before destructive deletion", async () => {
  failOnPlayFabCall = "Admin/GetPlayedTitleList";

  await assert.rejects(
    async () => {
      await requestAccountDeletion({
        sessionTicket: TEST_TICKET,
        confirm: true,
        confirmationText: "DELETE",
        password: "CorrectPassword123!",
      });
    },
    (err: unknown) => {
      return (
        typeof err === "object" &&
        err !== null &&
        ("status" in err ? err.status === 503 || err.status === 500 : true)
      );
    },
  );

  // Master deletion must NOT have been called
  const delMasterCall = playFabApiCalls.find((c) =>
    c.path.includes("Admin/DeleteMasterPlayerAccount"),
  );
  assert.equal(
    delMasterCall,
    undefined,
    "DeleteMasterPlayerAccount must not be called when GetPlayedTitleList fails",
  );

  // No deletion record should exist
  const record = await getDeletionRecord(TEST_PLAYER_ID);
  assert.equal(record, null);
});

test("9. Multiple affected title IDs: discovers and persists all played titles", async () => {
  playedTitlesList = ["17FA03", "B7890", "C9999"];

  // Preflight check
  const preflightReq = new Request(
    "https://civil-craft.vercel.app/api/player/account/delete/preflight",
    {
      method: "GET",
      headers: { Authorization: `Bearer ${TEST_TICKET}` },
    },
  );

  const preflightRes = await handleAccountDeletionRequest(preflightReq);
  assert.ok(preflightRes);
  assert.equal(preflightRes.status, 200);
  const preflightData = await preflightRes.json();
  assert.equal(preflightData.hasMultipleTitles, true);
  assert.deepEqual(preflightData.affectedTitleIds, ["17FA03", "B7890", "C9999"]);

  // Deletion request persists all affected title IDs
  const result = await requestAccountDeletion({
    sessionTicket: TEST_TICKET,
    confirm: true,
    confirmationText: "DELETE",
    password: "CorrectPassword123!",
  });

  assert.equal(result.success, true);
  assert.deepEqual(result.affectedTitleIds, ["17FA03", "B7890", "C9999"]);

  const stored = await getDeletionRecord(TEST_PLAYER_ID);
  assert.ok(stored);
  assert.deepEqual(stored.affectedTitleIds, ["17FA03", "B7890", "C9999"]);
});

test("10. Server restart during processing: state in durable storage survives memory reset", async () => {
  await saveDeletionRecord({
    playFabId: TEST_PLAYER_ID,
    status: "processing",
    requestedAt: "2026-11-12T00:00:00.000Z",
    jobReceiptId: "job_receipt_persisted_999",
    queuedAt: "2026-11-12T00:00:10.000Z",
    stepsCompleted: ["entity_files", "user_data_and_statistics", "playfab_account_queued"],
    affectedTitleIds: ["17FA03"],
    pseudonymizedIdentifier: "PSEUDO_PLAYER_PERSISTED",
    updatedAt: "2026-11-12T00:00:10.000Z",
  });

  // Simulate process memory restart
  resetDeletionRateLimits();

  // Read back state from durable website storage
  const restoredRecord = await getDeletionRecord(TEST_PLAYER_ID);
  assert.ok(restoredRecord);
  assert.equal(restoredRecord.status, "processing");
  assert.equal(restoredRecord.jobReceiptId, "job_receipt_persisted_999");
  assert.ok(restoredRecord.stepsCompleted.includes("playfab_account_queued"));

  // Account remains locked out during processing
  assert.equal(await isAccountDeleted(TEST_PLAYER_ID), true);
  await assert.rejects(
    async () => {
      await verifyPlayerSession(TEST_TICKET);
    },
    (err: unknown) => {
      return (
        typeof err === "object" &&
        err !== null &&
        "status" in err &&
        (err as { status: number }).status === 401
      );
    },
  );
});

test("11. Completion notification only after verified completion: truthful status reporting", async () => {
  await saveDeletionRecord({
    playFabId: TEST_PLAYER_ID,
    status: "processing",
    requestedAt: "2026-11-12T00:00:00.000Z",
    jobReceiptId: "receipt-flow-123",
    stepsCompleted: ["playfab_account_queued"],
    affectedTitleIds: ["17FA03"],
    pseudonymizedIdentifier: "PSEUDO_FLOW",
    updatedAt: "2026-11-12T00:00:00.000Z",
  });

  // Status check while in processing
  const statusReq1 = new Request(
    "https://civil-craft.vercel.app/api/player/account/delete/status",
    {
      method: "GET",
      headers: { Authorization: `Bearer ${TEST_TICKET}` },
    },
  );
  const statusRes1 = await handleAccountDeletionRequest(statusReq1);
  assert.ok(statusRes1);
  const statusData1 = await statusRes1.json();
  assert.equal(statusData1.hasPendingDeletion, true);
  assert.equal(statusData1.isDeleted, false, "Must not claim deleted prematurely");

  // Webhook delivers title_deleted_master_player event
  const webhookReq = new Request(
    "https://civil-craft.vercel.app/api/player/account/delete/webhook",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PlayFab-Webhook-Secret": TEST_WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        EventName: "title_deleted_master_player",
        PlayerId: TEST_PLAYER_ID,
        ReceiptId: "receipt-flow-123",
        Timestamp: "2026-11-12T00:06:00.000Z",
      }),
    },
  );
  await handleAccountDeletionRequest(webhookReq);

  // Status check after verified completion
  const statusReq2 = new Request(
    "https://civil-craft.vercel.app/api/player/account/delete/status",
    {
      method: "GET",
      headers: { Authorization: `Bearer ${TEST_TICKET}` },
    },
  );
  const statusRes2 = await handleAccountDeletionRequest(statusReq2);
  assert.ok(statusRes2);
  const statusData2 = await statusRes2.json();
  assert.equal(statusData2.hasPendingDeletion, false);
  assert.equal(statusData2.isDeleted, true, "Confirmed deleted only after verified event");
  assert.equal(statusData2.record.status, "completed");
});

test("12. Full end-to-end deletion cleans up auxiliary data and pseudonymizes financial records", async () => {
  // Pre-populate order
  const order: PaymentOrder = {
    orderId: "CC-COINS-DEL-E2E",
    playFabId: TEST_PLAYER_ID,
    productId: "coins_500",
    expectedAmount: 5000,
    currency: "PHP",
    expectedCoins: 500,
    PayMongoCheckoutSessionId: "cs_del_e2e",
    PayMongoReferenceNumber: "CC-COINS-DEL-E2E",
    status: "fulfilled",
    createdAt: "2026-11-10T00:00:00.000Z",
    paidAt: "2026-11-10T00:01:00.000Z",
    fulfilledAt: "2026-11-10T00:01:05.000Z",
    webhookEventId: "evt_del_e2e",
  };
  await saveOrder(order);

  const result = await requestAccountDeletion({
    sessionTicket: TEST_TICKET,
    confirm: true,
    confirmationText: "DELETE",
    password: "CorrectPassword123!",
  });

  assert.equal(result.success, true);
  assert.equal(result.status, "processing");
  assert.equal(result.jobReceiptId, "job-receipt-del-998877");
  assert.ok(result.pseudonymizedIdentifier?.startsWith("PSEUDO_PLAYER_"));

  // Verify order was pseudonymized and cannot be retrieved by original player ID
  const updatedOrder = await getOrder("CC-COINS-DEL-E2E");
  assert.ok(updatedOrder);
  assert.equal(updatedOrder.playFabId, result.pseudonymizedIdentifier);
  assert.equal(updatedOrder.expectedAmount, 5000); // Statutory financial data preserved

  const playerOrders = await listOrdersForPlayer(TEST_PLAYER_ID);
  assert.equal(playerOrders.length, 0);

  // Verify Admin/DeletePlayer was NOT called
  const delPlayerCall = playFabApiCalls.find((c) => c.path.includes("Admin/DeletePlayer"));
  assert.equal(delPlayerCall, undefined);
});

test("13. Production mode with no PostgreSQL connection: fails closed before destructive operations", async () => {
  process.env["CIVILCRAFT_FORCE_PRODUCTION_STORAGE"] = "true";
  delete process.env["CURRENCY_DATABASE_URL"];
  delete process.env["DATABASE_URL"];
  delete process.env["ACCOUNT_DELETIONS_DATABASE_URL"];

  try {
    await assert.rejects(
      async () => {
        await requestAccountDeletion({
          sessionTicket: TEST_TICKET,
          confirm: true,
          confirmationText: "DELETE",
          password: "CorrectPassword123!",
        });
      },
      (err: unknown) => {
        return (
          typeof err === "object" &&
          err !== null &&
          "status" in err &&
          (err as { status: number }).status === 503
        );
      },
    );

    // Verify NO destructive operations were performed
    const delCall = playFabApiCalls.find((c) => c.path.includes("Admin/DeleteMasterPlayerAccount"));
    assert.equal(delCall, undefined, "Must not queue deletion when storage is unconfigured");
    const fileCall = playFabApiCalls.find((c) => c.path.includes("File/DeleteFiles"));
    assert.equal(fileCall, undefined, "Must not delete files when storage is unconfigured");
  } finally {
    delete process.env["CIVILCRAFT_FORCE_PRODUCTION_STORAGE"];
  }
});

test("14. Production mode with unavailable database: fails closed with 503", async () => {
  process.env["CIVILCRAFT_FORCE_PRODUCTION_STORAGE"] = "true";
  process.env["CURRENCY_DATABASE_URL"] =
    "postgres://invalid_user:invalid_pass@127.0.0.1:54329/invalid_db?connect_timeout=1";

  try {
    await assert.rejects(
      async () => {
        await verifyStorageHealth();
      },
      (err: unknown) => {
        return (
          typeof err === "object" &&
          err !== null &&
          "status" in err &&
          (err as { status: number }).status === 503
        );
      },
    );
  } finally {
    delete process.env["CIVILCRAFT_FORCE_PRODUCTION_STORAGE"];
    delete process.env["CURRENCY_DATABASE_URL"];
  }
});

test("15. Local development JSON fallback: operates safely in non-production", async () => {
  delete process.env["CIVILCRAFT_FORCE_PRODUCTION_STORAGE"];
  delete process.env["CURRENCY_DATABASE_URL"];
  process.env["NODE_ENV"] = "development";

  const health = await verifyStorageHealth();
  assert.equal(health.ok, true);
  assert.equal(health.storageType, "local_dev_storage");

  await saveDeletionRecord({
    playFabId: TEST_PLAYER_ID,
    status: "pending",
    requestedAt: new Date().toISOString(),
    stepsCompleted: [],
    affectedTitleIds: ["17FA03"],
    pseudonymizedIdentifier: "PSEUDO_DEV",
    updatedAt: new Date().toISOString(),
  });

  const record = await getDeletionRecord(TEST_PLAYER_ID);
  assert.ok(record);
  assert.equal(record.status, "pending");
});

test("16. Crash after pending record creation: safe resumption and execution", async () => {
  // Pre-seed a pending record as if previous process died right after step 4
  await saveDeletionRecord({
    playFabId: TEST_PLAYER_ID,
    status: "pending",
    requestedAt: "2026-11-12T00:00:00.000Z",
    stepsCompleted: [],
    affectedTitleIds: ["17FA03"],
    pseudonymizedIdentifier: "PSEUDO_PENDING_CRASH",
    updatedAt: "2026-11-12T00:00:00.000Z",
  });

  const res = await requestAccountDeletion({
    sessionTicket: TEST_TICKET,
    confirm: true,
    confirmationText: "DELETE",
    password: "CorrectPassword123!",
  });

  assert.equal(res.success, true);
  assert.equal(res.status, "processing");

  const record = await getDeletionRecord(TEST_PLAYER_ID);
  assert.ok(record);
  assert.equal(record.status, "processing");
  assert.equal(record.jobReceiptId, "job-receipt-del-998877");
});

test("17. Crash after PlayFab accepts deletion but before receipt persistence: safe recovery without duplicate call", async () => {
  // Server died after PlayFab call was initiated in step 7, before jobReceiptId was saved in step 8
  await saveDeletionRecord({
    playFabId: TEST_PLAYER_ID,
    status: "pending",
    requestedAt: "2026-11-12T00:00:00.000Z",
    stepsCompleted: ["entity_files", "playfab_account_deletion_called"],
    affectedTitleIds: ["17FA03"],
    pseudonymizedIdentifier: "PSEUDO_PRE_CRASH",
    updatedAt: "2026-11-12T00:00:00.000Z",
  });

  // PlayFab account is now missing / queued
  accountPurgedFromPlayFab = true;
  playFabApiCalls = [];

  const res = await requestAccountDeletion({
    sessionTicket: TEST_TICKET,
    confirm: true,
    confirmationText: "DELETE",
    password: "CorrectPassword123!",
  });

  assert.equal(res.success, true);
  assert.equal(res.status, "processing");

  // Ensure Admin/DeleteMasterPlayerAccount was NOT called again!
  const dupCall = playFabApiCalls.find((c) => c.path.includes("Admin/DeleteMasterPlayerAccount"));
  assert.equal(
    dupCall,
    undefined,
    "Must not blindly call DeleteMasterPlayerAccount again on recovery",
  );

  const record = await getDeletionRecord(TEST_PLAYER_ID);
  assert.ok(record);
  assert.equal(record.status, "processing");
  assert.ok(record.recoveryNote?.includes("already queued"));
});

test("18. Webhook completion after server crashed before receipt persistence", async () => {
  // Server crashed before receiptId was persisted, so record has NO jobReceiptId
  await saveDeletionRecord({
    playFabId: TEST_PLAYER_ID,
    status: "processing",
    requestedAt: "2026-11-12T00:00:00.000Z",
    // jobReceiptId: undefined,
    stepsCompleted: ["playfab_account_deletion_called"],
    affectedTitleIds: ["17FA03"],
    pseudonymizedIdentifier: "PSEUDO_NO_RECEIPT_YET",
    updatedAt: "2026-11-12T00:00:00.000Z",
  });

  // Webhook delivers title_deleted_master_player event with PlayerId and ReceiptId
  const webhookReq = new Request(
    "https://civil-craft.vercel.app/api/player/account/delete/webhook",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PlayFab-Webhook-Secret": TEST_WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        EventName: "title_deleted_master_player",
        PlayerId: TEST_PLAYER_ID,
        ReceiptId: "recovered-receipt-id-888",
        Timestamp: "2026-11-12T01:00:00.000Z",
      }),
    },
  );

  const res = await handleAccountDeletionRequest(webhookReq);
  assert.ok(res);
  assert.equal(res.status, 200);

  const updatedRecord = await getDeletionRecord(TEST_PLAYER_ID);
  assert.ok(updatedRecord);
  assert.equal(updatedRecord.status, "completed");
  assert.equal(updatedRecord.jobReceiptId, "recovered-receipt-id-888");
});

test("19. Concurrent deletion requests from different server instances: locked out with 409", async () => {
  // Instance A acquires lock
  const lockedA = await acquireDeletionLock(TEST_PLAYER_ID, "instance_A");
  assert.equal(lockedA, true);

  // Instance B attempts to acquire lock for same player
  const lockedB = await acquireDeletionLock(TEST_PLAYER_ID, "instance_B");
  assert.equal(lockedB, false, "Second instance must be locked out");

  // Release lock
  await releaseDeletionLock(TEST_PLAYER_ID, "instance_A");

  // Instance B can now acquire
  const lockedBRetry = await acquireDeletionLock(TEST_PLAYER_ID, "instance_B");
  assert.equal(lockedBRetry, true);
  await releaseDeletionLock(TEST_PLAYER_ID, "instance_B");
});

test("20. Webhook completion after player account no longer exists in PlayFab", async () => {
  await saveDeletionRecord({
    playFabId: TEST_PLAYER_ID,
    status: "processing",
    requestedAt: "2026-11-12T00:00:00.000Z",
    jobReceiptId: "receipt_account_purged_1",
    stepsCompleted: ["playfab_account_queued"],
    affectedTitleIds: ["17FA03"],
    pseudonymizedIdentifier: "PSEUDO_PURGED_WEBHOOK",
    updatedAt: "2026-11-12T00:00:00.000Z",
  });

  // Account is completely gone from PlayFab
  accountPurgedFromPlayFab = true;

  const webhookReq = new Request(
    "https://civil-craft.vercel.app/api/player/account/delete/webhook",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PlayFab-Webhook-Secret": TEST_WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        EventName: "title_deleted_master_player",
        PlayerId: TEST_PLAYER_ID,
        ReceiptId: "receipt_account_purged_1",
        Timestamp: "2026-11-12T02:00:00.000Z",
      }),
    },
  );

  const res = await handleAccountDeletionRequest(webhookReq);
  assert.ok(res);
  assert.equal(res.status, 200);

  const record = await getDeletionRecord(TEST_PLAYER_ID);
  assert.ok(record);
  assert.equal(record.status, "completed");
  assert.equal(record.completedAt, "2026-11-12T02:00:00.000Z");
});

test("21. Status retrieval after session invalidation via signed recovery token: no JobReceiptId leak", async () => {
  await saveDeletionRecord({
    playFabId: TEST_PLAYER_ID,
    status: "processing",
    requestedAt: "2026-11-12T00:00:00.000Z",
    jobReceiptId: "SECRET_INTERNAL_JOB_RECEIPT_DO_NOT_LEAK",
    stepsCompleted: ["playfab_account_queued"],
    affectedTitleIds: ["17FA03"],
    pseudonymizedIdentifier: "PSEUDO_SAFE",
    updatedAt: "2026-11-12T00:00:00.000Z",
  });

  const recoveryToken = createDeletionRecoveryToken(TEST_PLAYER_ID);
  assert.ok(recoveryToken);

  // Status check with recovery token (no Authorization header, simulating expired/revoked session)
  const req = new Request(
    `https://civil-craft.vercel.app/api/player/account/delete/status?token=${encodeURIComponent(recoveryToken)}`,
    { method: "GET" },
  );

  const res = await handleAccountDeletionRequest(req);
  assert.ok(res);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.hasPendingDeletion, true);
  assert.equal(data.isDeleted, false);
  assert.equal(data.record.status, "processing");

  // Critical requirement: Do not reveal JobReceiptId in public responses
  assert.equal(
    data.record.jobReceiptId,
    undefined,
    "JobReceiptId must not be leaked in public status response",
  );

  // Unauthorized with invalid token
  const badReq = new Request(
    "https://civil-craft.vercel.app/api/player/account/delete/status?token=invalid.tampered.token",
    { method: "GET" },
  );
  const badRes = await handleAccountDeletionRequest(badReq);
  assert.ok(badRes);
  assert.equal(badRes.status, 401);
});

test("22. Pending account authentication rejection: blocks session verification and payment start", async () => {
  await saveDeletionRecord({
    playFabId: TEST_PLAYER_ID,
    status: "pending",
    requestedAt: new Date().toISOString(),
    stepsCompleted: [],
    affectedTitleIds: ["17FA03"],
    pseudonymizedIdentifier: "PSEUDO_PENDING_GATE",
    updatedAt: new Date().toISOString(),
  });

  // verifyPlayerSession must reject
  await assert.rejects(
    async () => {
      await verifyPlayerSession(TEST_TICKET);
    },
    (err: unknown) => {
      return (
        typeof err === "object" &&
        err !== null &&
        "status" in err &&
        (err as { status: number }).status === 401
      );
    },
  );

  // authenticatePaymentPlayer must reject
  const paymentReq = new Request("https://civil-craft.vercel.app/api/shop/checkout", {
    method: "POST",
    headers: { Authorization: `Bearer ${TEST_TICKET}` },
  });
  await assert.rejects(
    async () => {
      await authenticatePaymentPlayer(paymentReq);
    },
    (err: unknown) => {
      return (
        typeof err === "object" &&
        err !== null &&
        "status" in err &&
        (err as { status: number }).status === 403
      );
    },
  );
});

test("23. Failed cleanup account access rejection: blocks partially scrubbed account from resuming play", async () => {
  await saveDeletionRecord({
    playFabId: TEST_PLAYER_ID,
    status: "failed",
    requestedAt: new Date().toISOString(),
    failedAt: new Date().toISOString(),
    error: "Simulated PlayFab failure during entity scrubbing",
    stepsCompleted: ["entity_files"],
    affectedTitleIds: ["17FA03"],
    pseudonymizedIdentifier: "PSEUDO_FAILED_LOCKED",
    updatedAt: new Date().toISOString(),
  });

  // verifyPlayerSession must reject with 403
  await assert.rejects(
    async () => {
      await verifyPlayerSession(TEST_TICKET);
    },
    (err: unknown) => {
      return (
        typeof err === "object" &&
        err !== null &&
        "status" in err &&
        (err as { status: number }).status === 403
      );
    },
  );

  // authenticatePaymentPlayer must reject
  const paymentReq = new Request("https://civil-craft.vercel.app/api/shop/checkout", {
    method: "POST",
    headers: { Authorization: `Bearer ${TEST_TICKET}` },
  });
  await assert.rejects(
    async () => {
      await authenticatePaymentPlayer(paymentReq);
    },
    (err: unknown) => {
      return (
        typeof err === "object" &&
        err !== null &&
        "status" in err &&
        (err as { status: number }).status === 403
      );
    },
  );
});

test("24. Expired distributed lock recovery: locks older than 5 minutes can be acquired safely", async () => {
  // Pre-seed a record locked 6 minutes ago
  const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
  await saveDeletionRecord({
    playFabId: TEST_PLAYER_ID,
    status: "pending",
    requestedAt: sixMinutesAgo,
    stepsCompleted: [],
    affectedTitleIds: ["17FA03"],
    pseudonymizedIdentifier: "PSEUDO_LOCK_RECOVERY",
    lockedAt: sixMinutesAgo,
    lockedBy: "old_crashed_instance_999",
    updatedAt: sixMinutesAgo,
  });

  // New instance attempts to acquire lock
  const acquired = await acquireDeletionLock(TEST_PLAYER_ID, "new_recovering_instance_111");
  assert.equal(acquired, true, "Expired lock must be recoverable by new instance");

  const record = await getDeletionRecord(TEST_PLAYER_ID);
  assert.ok(record);
  assert.equal(record.lockedBy, "new_recovering_instance_111");

  await releaseDeletionLock(TEST_PLAYER_ID, "new_recovering_instance_111");
});

test("25. Failed cleanup step is NOT marked as completed and is retried safely on recovery", async () => {
  // Simulate PlayFab failure on Object/SetObjects (step 6b)
  failOnPlayFabCall = "Object/SetObjects";

  await assert.rejects(
    async () => {
      await requestAccountDeletion({
        sessionTicket: TEST_TICKET,
        confirm: true,
        confirmationText: "DELETE",
        password: "CorrectPassword123!",
      });
    },
    (err: unknown) => {
      return (
        typeof err === "object" &&
        err !== null &&
        "status" in err &&
        (err as { status: number }).status === 500
      );
    },
  );

  const failedRecord = await getDeletionRecord(TEST_PLAYER_ID);
  assert.ok(failedRecord);
  assert.equal(failedRecord.status, "failed");
  // Entity files succeeded (6a), but entity objects failed (6b)
  assert.ok(failedRecord.stepsCompleted.includes("entity_files"));
  assert.equal(
    failedRecord.stepsCompleted.includes("entity_objects"),
    false,
    "Failed step must NOT be marked as completed",
  );

  // Clear failure simulation and retry
  failOnPlayFabCall = null;
  // Expire lock so retry can proceed
  await releaseDeletionLock(TEST_PLAYER_ID, failedRecord.lockedBy || "");

  const retryResult = await requestAccountDeletion({
    sessionTicket: TEST_TICKET,
    confirm: true,
    confirmationText: "DELETE",
    password: "CorrectPassword123!",
  });

  assert.equal(retryResult.success, true);
  assert.equal(retryResult.status, "processing");

  const recoveredRecord = await getDeletionRecord(TEST_PLAYER_ID);
  assert.ok(recoveredRecord);
  assert.equal(recoveredRecord.status, "processing");
  assert.ok(recoveredRecord.stepsCompleted.includes("entity_objects"));
  assert.ok(recoveredRecord.stepsCompleted.includes("playfab_account_queued"));
});

test("26. Distributed lock lease renewal updates lockedAt and fences out stale workers", async () => {
  const instance1 = "worker_instance_alpha";
  const instance2 = "worker_instance_beta";

  // Worker 1 acquires lock
  const acquired1 = await acquireDeletionLock(TEST_PLAYER_ID, instance1);
  assert.equal(acquired1, true);

  // Worker 1 successfully renews lock
  const renewed1 = await renewDeletionLock(TEST_PLAYER_ID, instance1);
  assert.equal(renewed1, true);

  // Simulate worker 2 reclaiming lock (e.g. after lease expiration or recovery)
  const record = await getDeletionRecord(TEST_PLAYER_ID);
  assert.ok(record);
  record.lockedBy = instance2;
  await saveDeletionRecord(record);

  // Worker 1 attempts renewal on stolen lock -> must be fenced out!
  const renewedStale = await renewDeletionLock(TEST_PLAYER_ID, instance1);
  assert.equal(renewedStale, false, "Stale worker must be fenced out after losing lock");

  // Worker 2 renewal succeeds
  const renewed2 = await renewDeletionLock(TEST_PLAYER_ID, instance2);
  assert.equal(renewed2, true);

  await releaseDeletionLock(TEST_PLAYER_ID, instance2);
});

test("27. Ambiguous webhook matching strictly rejected if player record has conflicting receipt", async () => {
  const existingRecord: AccountDeletionRecord = {
    playFabId: TEST_PLAYER_ID,
    status: "processing",
    requestedAt: new Date().toISOString(),
    jobReceiptId: "OFFICIAL_RECEIPT_AAA",
    stepsCompleted: ["playfab_account_queued"],
    affectedTitleIds: ["17FA03"],
    pseudonymizedIdentifier: "PSEUDO_AMBIGUOUS_TEST",
    updatedAt: new Date().toISOString(),
  };
  await saveDeletionRecord(existingRecord);

  // Incoming webhook has a DIFFERENT receipt ID but the same player ID
  const ambiguousReq = new Request(
    "https://civil-craft.vercel.app/api/player/account/delete/webhook",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PlayFab-Webhook-Secret": TEST_WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        EventName: "title_deleted_master_player",
        ReceiptId: "DIFFERENT_RECEIPT_BBB",
        PlayerId: TEST_PLAYER_ID,
      }),
    },
  );

  const res = await handleAccountDeletionRequest(ambiguousReq);
  assert.ok(res);
  // Must reject with 404 or 400 (mismatched/unrecognized receipt)
  assert.equal(res.status >= 400, true);

  // Record must NOT be marked completed
  const unchanged = await getDeletionRecord(TEST_PLAYER_ID);
  assert.ok(unchanged);
  assert.equal(unchanged.status, "processing");
  assert.equal(unchanged.jobReceiptId, "OFFICIAL_RECEIPT_AAA");
});

test("28. Webhook URL query parameter secret authentication verified securely", async () => {
  const receiptId = "RECEIPT_QUERY_AUTH_TEST";
  const record: AccountDeletionRecord = {
    playFabId: TEST_PLAYER_ID,
    status: "processing",
    requestedAt: new Date().toISOString(),
    jobReceiptId: receiptId,
    stepsCompleted: ["playfab_account_queued"],
    affectedTitleIds: ["17FA03"],
    pseudonymizedIdentifier: "PSEUDO_QUERY_AUTH",
    updatedAt: new Date().toISOString(),
  };
  await saveDeletionRecord(record);

  // 1. Invalid query secret -> 401
  const badReq = new Request(
    `https://civil-craft.vercel.app/api/player/account/delete/webhook?secret=wrong-secret`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        EventName: "title_deleted_master_player",
        ReceiptId: receiptId,
        PlayerId: TEST_PLAYER_ID,
      }),
    },
  );
  const badRes = await handleAccountDeletionRequest(badReq);
  assert.ok(badRes);
  assert.equal(badRes.status, 401);

  // 2. Valid query secret -> 200 completed
  const validReq = new Request(
    `https://civil-craft.vercel.app/api/player/account/delete/webhook?secret=${TEST_WEBHOOK_SECRET}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        EventName: "title_deleted_master_player",
        ReceiptId: receiptId,
        PlayerId: TEST_PLAYER_ID,
      }),
    },
  );
  const validRes = await handleAccountDeletionRequest(validReq);
  assert.ok(validRes);
  assert.equal(validRes.status, 200);

  const updated = await getDeletionRecord(TEST_PLAYER_ID);
  assert.ok(updated);
  assert.equal(updated.status, "completed");
});

test("29. Admin recovery resumes failed deletion without unblocking player or allowing account restoration", async () => {
  const failedRecord: AccountDeletionRecord = {
    playFabId: TEST_PLAYER_ID,
    status: "failed",
    requestedAt: new Date().toISOString(),
    failedAt: new Date().toISOString(),
    error: "Simulated prior failure",
    stepsCompleted: ["entity_files"],
    affectedTitleIds: ["17FA03"],
    pseudonymizedIdentifier: "PSEUDO_ADMIN_RETRY",
    updatedAt: new Date().toISOString(),
  };
  await saveDeletionRecord(failedRecord);

  // Player must be blocked with 403
  await assert.rejects(
    async () => verifyPlayerSession(TEST_TICKET),
    (err: unknown) => {
      return (
        typeof err === "object" &&
        err !== null &&
        "status" in err &&
        (err as { status: number }).status === 403
      );
    },
  );

  // Admin triggers recovery
  const retryResult = await adminRetryAccountDeletion(TEST_PLAYER_ID, "admin_staff_01");
  assert.equal(retryResult.success, true);
  assert.equal(retryResult.status, "processing");

  // Player must STILL be blocked (now 401 undergoing deletion)
  await assert.rejects(
    async () => verifyPlayerSession(TEST_TICKET),
    (err: unknown) => {
      return (
        typeof err === "object" &&
        err !== null &&
        "status" in err &&
        (err as { status: number }).status === 401
      );
    },
  );

  const recovered = await getDeletionRecord(TEST_PLAYER_ID);
  assert.ok(recovered);
  assert.equal(recovered.status, "processing");
  assert.ok(recovered.stepsCompleted.includes("entity_objects"));
  assert.ok(recovered.stepsCompleted.includes("playfab_account_queued"));
  assert.match(recovered.recoveryNote || "", /admin_staff_01/);
});

test("30. All player session endpoints block deleted and deletion-pending players", async () => {
  const record: AccountDeletionRecord = {
    playFabId: TEST_PLAYER_ID,
    status: "processing",
    requestedAt: new Date().toISOString(),
    stepsCompleted: ["playfab_account_queued"],
    affectedTitleIds: ["17FA03"],
    pseudonymizedIdentifier: "PSEUDO_AUTH_GATE_TEST",
    updatedAt: new Date().toISOString(),
  };
  await saveDeletionRecord(record);

  const authHeader = { Authorization: `Bearer ${TEST_TICKET}` };

  // 1. Bridge snapshot
  const bridgeReq = new Request(
    "https://civil-craft.vercel.app/api/player/bridge-snapshot?contractId=c1&regionId=r1",
    { method: "GET", headers: authHeader },
  );
  const bridgeRes = await handleBridgeSnapshot(bridgeReq);
  assert.ok(bridgeRes);
  assert.equal(bridgeRes.status, 401);

  // 2. Character portrait
  const portraitReq = new Request("https://civil-craft.vercel.app/api/player/character-portrait", {
    method: "GET",
    headers: authHeader,
  });
  const portraitRes = await handleCharacterPortrait(portraitReq);
  assert.ok(portraitRes);
  assert.equal(portraitRes.status, 401);

  // 3. Bug report
  const bugReq = new Request("https://civil-craft.vercel.app/api/player/bug-reports", {
    method: "POST",
    headers: { ...authHeader, "Content-Type": "application/json" },
    body: JSON.stringify({ category: "Gameplay", description: "Testing deletion block for bugs." }),
  });
  const bugRes = await handlePlayerBugRequest(bugReq);
  assert.ok(bugRes);
  assert.equal(bugRes.status, 401);

  // 4. Leaderboard /me
  const lbReq = new Request("https://civil-craft.vercel.app/api/leaderboard/me", {
    method: "GET",
    headers: authHeader,
  });
  const lbRes = await handleLeaderboardRequest(lbReq);
  assert.ok(lbRes);
  assert.equal(lbRes.status, 401);

  // 5. Quiz review
  const quizReq = new Request(
    "https://civil-craft.vercel.app/api/player/quiz-review?quizId=q1&attemptId=a1",
    { method: "GET", headers: authHeader },
  );
  const quizRes = await handleQuizReview(quizReq);
  assert.ok(quizRes);
  assert.equal(quizRes.status, 401);
});

after(async () => {
  await resetDeletionStorageForTesting();
  globalThis.fetch = originalFetch;
  for (const [k, v] of Object.entries(previousEnv)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
});
