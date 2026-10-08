import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { adminGameConfig, object, playFabAdmin } from "../src/lib/playfab/admin-client.server.ts";
import {
  entityObjectsRequest,
  premiumWalletConfig,
  premiumWalletVerificationFingerprint,
  resolvePremiumEntity,
} from "../src/lib/playfab/premium-wallet.server.ts";
import {
  assertCoinCheckoutReady,
  CoinGrantReviewRequired,
  coinReceiptVerificationFingerprint,
  getCoinReceiptStatus,
  grantCoinsOnce,
} from "../src/lib/payments/coin-receipts.server.ts";
import { policyBlocksPlayerObjectWrites } from "./verify-diamonds-setup.mjs";

const COIN_OBJECT = "civilcraft.coin-purchases.v1";
const permittedDenials = new Set([
  "NotAuthorized",
  "APINotEnabledForGameClient",
  "ApiNotEnabledForGameClient",
  "APIRequestNotAllowed",
]);

/** Opt-in test-account check; never enables deployed checkout or alters player policy. */
export async function verifyCoinSetup({ testPlayerId, playerTicket, confirmTestWrites = false }) {
  if (!confirmTestWrites)
    throw new Error(
      "Explicit --confirm-test-writes is required; this check leaves one Coin and its permanent receipt on the disposable account.",
    );
  if (!/^[a-f0-9]{1,32}$/i.test(testPlayerId || ""))
    throw new Error("A valid --test-player PlayFab ID is required.");
  if (typeof playerTicket !== "string" || !playerTicket || playerTicket.length > 4096)
    throw new Error(
      "Set the fresh test player's session ticket in PLAYFAB_COINS_VERIFICATION_PLAYER_TICKET.",
    );
  const enabled = (name) => process.env[name]?.trim().toLowerCase() === "true";
  if (enabled("PLAYFAB_COINS_RECEIPTS_VERIFIED"))
    throw new Error(
      "Disable Coin receipt verification before this test. Deployed configuration is never changed by the script.",
    );
  if (!process.env["PAYMONGO_SECRET_KEY"]?.trim().startsWith("sk_test_"))
    throw new Error("A PayMongo test key is required; live payments cannot be verified here.");
  const { titleId, secret } = adminGameConfig();
  if (!secret) throw new Error("Server-only PlayFab title secret is required.");
  const wallet = premiumWalletConfig();
  if (
    wallet.storage !== "entity-objects" ||
    !enabled("PLAYFAB_DIAMONDS_BOOTSTRAP_VERIFIED") ||
    !enabled("PLAYFAB_DIAMONDS_PLAYER_WRITES_DENIED") ||
    !enabled("PLAYFAB_DIAMONDS_CAPACITY_VERIFIED") ||
    process.env["PLAYFAB_DIAMONDS_VERIFIED_TITLE_ID"]?.trim().toUpperCase() !==
      titleId.toUpperCase() ||
    process.env["PLAYFAB_DIAMONDS_VERIFIED_CONFIG_SHA256"]?.trim().toLowerCase() !==
      premiumWalletVerificationFingerprint()
  )
    throw new Error(
      "Complete the full Entity Objects Diamonds capacity/permission verification first. Diamonds checkout itself may remain disabled.",
    );
  const currencyCode = (process.env["PLAYFAB_COINS_CURRENCY_CODE"] || "CO").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(currencyCode)) throw new Error("Coin currency configuration is invalid.");
  const request = async (path, body, authentication) => {
    try {
      const response = await fetch(`https://${titleId}.playfabapi.com/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authentication },
        body: JSON.stringify(body),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(12_000),
      });
      const payload = object(await response.json());
      return { ok: response.ok && payload.code === 200, payload };
    } catch {
      throw new Error(
        `Verification connection unavailable (${path}). Keep Coin checkout disabled.`,
      );
    }
  };
  const api = async (path, body, authentication) => {
    const response = await request(path, body, authentication);
    if (!response.ok)
      throw new Error(
        `Verification could not complete ${path}. No private upstream response was printed.`,
      );
    return object(response.payload.data);
  };
  const authentication = await api(
    "Server/AuthenticateSessionTicket",
    { SessionTicket: playerTicket },
    { "X-SecretKey": secret },
  );
  const verifiedPlayer = object(authentication.UserInfo).PlayFabId;
  if (
    authentication.IsSessionTicketExpired === true ||
    typeof verifiedPlayer !== "string" ||
    verifiedPlayer.toUpperCase() !== testPlayerId.toUpperCase()
  )
    throw new Error(
      "Verification ticket does not belong to the explicitly selected fresh test player.",
    );
  const entity = await resolvePremiumEntity(testPlayerId);
  const policy = await api(
    "Admin/GetPolicy",
    { PolicyName: "ApiPolicy" },
    { "X-SecretKey": secret },
  );
  if (!policyBlocksPlayerObjectWrites(policy.Statements))
    throw new Error(
      "Player Object/SetObjects must be unconditionally denied. No Coin grant was attempted.",
    );
  const player = await api(
    "Authentication/GetEntityToken",
    {},
    { "X-Authorization": playerTicket },
  );
  if (
    object(player.Entity).Type !== entity.Type ||
    object(player.Entity).Id?.toUpperCase() !== entity.Id.toUpperCase() ||
    typeof player.EntityToken !== "string" ||
    !player.EntityToken
  )
    throw new Error("Player token does not resolve to the selected test player's entity.");
  const read = async () => {
    const state = await entityObjectsRequest("Object/GetObjects", {
      Entity: entity,
      EscapeObject: false,
    });
    if (
      object(state.Entity).Type !== entity.Type ||
      object(state.Entity).Id?.toUpperCase() !== entity.Id.toUpperCase() ||
      !Number.isSafeInteger(state.ProfileVersion) ||
      state.ProfileVersion < 0 ||
      !state.Objects ||
      typeof state.Objects !== "object" ||
      Array.isArray(state.Objects)
    )
      throw new Error("Invalid Entity Objects readback. Keep Coin checkout disabled.");
    return state;
  };
  const original = await read();
  const diamond = object(original.Objects[wallet.objectName]);
  const diamondData = object(diamond.DataObject);
  const diamondReceipts = object(diamondData.receipts);
  const receiptEntries = Object.entries(diamondReceipts);
  if (
    Object.hasOwn(original.Objects, COIN_OBJECT) ||
    Object.keys(original.Objects).length !== 1 ||
    diamond.ObjectName !== wallet.objectName ||
    diamondData.schemaVersion !== 1 ||
    diamondData.currency !== "DI" ||
    diamondData.titleId !== titleId.toUpperCase() ||
    diamondData.playFabId !== testPlayerId.toUpperCase() ||
    diamondData.entityId !== entity.Id.toUpperCase() ||
    diamondData.balance !== 1 ||
    receiptEntries.length !== 1 ||
    !/^order-[a-f0-9]{64}$/.test(receiptEntries[0]?.[0] || "") ||
    object(receiptEntries[0]?.[1]).amount !== 1 ||
    !/^[a-f0-9]{64}$/.test(String(object(receiptEntries[0]?.[1]).fingerprint || ""))
  )
    throw new Error(
      "Use the disposable account from successful Diamonds verification: exactly its one-Diamond wallet and no Coin ledger or other Entity Objects. Existing data is never removed.",
    );
  const diamondSnapshot = JSON.stringify(diamond);
  const probe = await request(
    "Object/SetObjects",
    {
      Entity: entity,
      ExpectedProfileVersion: original.ProfileVersion,
      Objects: [
        { ObjectName: "civilcraft.coins.permission-probe.v1", DataObject: { verification: true } },
      ],
    },
    { "X-EntityToken": player.EntityToken },
  );
  if (probe.ok || !permittedDenials.has(String(probe.payload.error)))
    throw new Error(
      "Player object write was not explicitly denied. No Coin grant was attempted; a nonmonetary probe marker may exist.",
    );
  // The shared transport sanitizes errors. Inspect this one raw, nonmonetary
  // mismatching-version probe so only an explicit concurrency denial qualifies.
  const title = await api("Authentication/GetEntityToken", {}, { "X-SecretKey": secret });
  if (
    object(title.Entity).Type !== "title" ||
    object(title.Entity).Id?.toUpperCase() !== titleId.toUpperCase() ||
    typeof title.EntityToken !== "string" ||
    !title.EntityToken
  )
    throw new Error("Could not verify a title-level entity token.");
  const cas = await request(
    "Object/SetObjects",
    {
      Entity: entity,
      ExpectedProfileVersion: original.ProfileVersion + 1,
      Objects: [
        { ObjectName: "civilcraft.coins.cas-probe.v1", DataObject: { verification: true } },
      ],
    },
    { "X-EntityToken": title.EntityToken },
  );
  if (
    cas.ok ||
    !["EntityProfileVersionMismatch", "ConcurrentEditError"].includes(String(cas.payload.error))
  )
    throw new Error(
      "Conditional Coin receipt writes were not explicitly rejected. Keep Coin checkout disabled.",
    );
  const balances = async () => {
    const inventory = await playFabAdmin("Server/GetUserInventory", { PlayFabId: testPlayerId });
    if (
      !inventory.VirtualCurrency ||
      typeof inventory.VirtualCurrency !== "object" ||
      Array.isArray(inventory.VirtualCurrency)
    )
      throw new Error("Coin balance is unavailable. Keep Coin checkout disabled.");
    const balance = inventory.VirtualCurrency[currencyCode] ?? 0;
    if (!Number.isSafeInteger(balance) || balance < 0 || balance > 2_147_483_647)
      throw new Error("Coin balance is unavailable. Keep Coin checkout disabled.");
    return balance;
  };
  const before = await balances();
  if (before === 2_147_483_647)
    throw new Error("Coin balance cannot safely receive the one-Coin verification grant.");
  const attestations = {
    PLAYFAB_COINS_RECEIPTS_VERIFIED: "true",
    PLAYFAB_COINS_VERIFIED_TITLE_ID: titleId.toUpperCase(),
    PLAYFAB_COINS_VERIFIED_CONFIG_SHA256: coinReceiptVerificationFingerprint(),
  };
  const previous = Object.fromEntries(
    Object.keys(attestations).map((key) => [key, process.env[key]]),
  );
  const orderId = `CC-COINS-VERIFY-${crypto.randomUUID()}`;
  try {
    Object.assign(process.env, attestations);
    const grant = { orderId, playFabId: testPlayerId, currencyCode, rewardAmount: 1 };
    await assertCoinCheckoutReady(grant);
    const results = await Promise.allSettled([grantCoinsOnce(grant), grantCoinsOnce(grant)]);
    if (
      !results.some((result) => result.status === "fulfilled") ||
      results.some(
        (result) =>
          result.status === "rejected" && !(result.reason instanceof CoinGrantReviewRequired),
      )
    )
      throw new Error(
        "Concurrent Coin verification did not complete. Review the disposable account; never blindly repeat a pending Coin grant.",
      );
    let after;
    let status;
    let current;
    for (let attempt = 0; attempt < 5; attempt++) {
      after = await balances();
      status = await getCoinReceiptStatus(grant);
      current = await read();
      if (after === before + 1 && status === "granted") break;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const repeated = await grantCoinsOnce(grant);
    const finalBalance = await balances();
    const finalState = await read();
    if (
      after !== before + 1 ||
      finalBalance !== before + 1 ||
      status !== "granted" ||
      !repeated.alreadyGranted ||
      JSON.stringify(current.Objects[wallet.objectName]) !== diamondSnapshot ||
      JSON.stringify(finalState.Objects[wallet.objectName]) !== diamondSnapshot
    )
      throw new Error(
        "Coin receipt/balance/replay or unchanged-Diamonds verification failed. Keep checkout disabled and review the disposable account.",
      );
    return {
      titleId: titleId.toUpperCase(),
      testPlayerId: testPlayerId.toUpperCase(),
      orderId,
      currencyCode,
      balanceBefore: before,
      balance: finalBalance,
      attestations,
    };
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--help")) {
    console.log(
      "Usage: node --env-file=.env scripts/verify-coins-setup.mjs --test-player <PlayFabId> --confirm-test-writes\nRequires completed full-capacity Entity Objects Diamonds verification, the SAME disposable account containing exactly one test Diamond, no Coin ledger, and PLAYFAB_COINS_VERIFICATION_PLAYER_TICKET. Leaves one test Coin and permanent receipt. Does not alter policy, catalog, env files, or deployed settings.",
    );
  } else {
    const index = process.argv.indexOf("--test-player");
    try {
      const result = await verifyCoinSetup({
        testPlayerId: index >= 0 ? process.argv[index + 1] : undefined,
        playerTicket: process.env["PLAYFAB_COINS_VERIFICATION_PLAYER_TICKET"],
        confirmTestWrites: process.argv.includes("--confirm-test-writes"),
      });
      console.log(
        `Verified title ${result.titleId}; disposable player ${result.testPlayerId}; exactly one test Coin added; receipt order ${result.orderId}.`,
      );
      console.log(
        "All checks passed. Review these nonsecret outputs before setting deployment environment values:",
      );
      for (const [key, value] of Object.entries(result.attestations))
        console.log(`${key}=${value}`);
    } catch (error) {
      console.error(
        error instanceof Error
          ? error.message
          : "Coin setup verification failed. Keep checkout disabled.",
      );
      process.exitCode = 1;
    }
  }
}
