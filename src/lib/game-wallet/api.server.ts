import { AdminApiError, object } from "../playfab/admin-client.server.ts";
import { authenticatePaymentPlayer } from "../payments/player-auth.server.ts";
import {
  isGameWalletInstalled,
  requireGameWalletReady,
  requireGameWalletSettlementReady,
} from "./config.server.ts";
import {
  assertGameShopLink,
  gameEntitlements,
  gamePurchaseStatus,
  gameWallet,
  grantGameRewards,
  GamePurchaseRejected,
  importGameWallet,
  issueGameShopLink,
  purchaseGameItem,
} from "./service.server.ts";

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      Vary: "Authorization",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
function onlyKeys(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new AdminApiError(400, "Unexpected request fields.");
}
async function body(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (raw.length > 350_000) throw new AdminApiError(413, "Request is too large.");
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new AdminApiError(400, "Invalid JSON request.");
  }
}
function shopOrigin(): string {
  const value = process.env["PUBLIC_APP_URL"] || process.env["PUBLIC_SITE_URL"] || "";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AdminApiError(503, "Website shop origin is not configured.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    (url.protocol !== "https:" &&
      !(process.env["NODE_ENV"] !== "production" && local && url.protocol === "http:"))
  )
    throw new AdminApiError(503, "Website shop origin is invalid.");
  return url.origin;
}
export async function handleGameWalletRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const known = [
    "/api/game/shop-link",
    "/api/game/wallet",
    "/api/game/wallet/import",
    "/api/game/rewards",
    "/api/game/purchases",
    "/api/game/entitlements",
  ];
  const statusPath = /^\/api\/game\/purchases\/([^/]+)$/.exec(url.pathname);
  if (!known.includes(url.pathname) && !statusPath)
    return url.pathname.startsWith("/api/game/") ? json({ error: "Not found." }, 404) : null;
  const method = ["/api/game/wallet/import", "/api/game/rewards", "/api/game/purchases"].includes(
    url.pathname,
  )
    ? "POST"
    : "GET";
  if (url.pathname === "/api/game/shop-link") {
    if (!["GET", "POST"].includes(request.method))
      return json({ error: "Method not allowed." }, 405);
  } else if (request.method !== method) return json({ error: "Method not allowed." }, 405);
  try {
    // Default-off performs no PlayFab authentication, database connection, or DNS lookup.
    if (
      request.method === "GET" &&
      url.pathname !== "/api/game/shop-link" &&
      isGameWalletInstalled()
    )
      requireGameWalletSettlementReady();
    else requireGameWalletReady();
    const { playFabId } = await authenticatePaymentPlayer(request);
    if (url.pathname === "/api/game/wallet") return json(await gameWallet(playFabId));
    if (url.pathname === "/api/game/entitlements") return json(await gameEntitlements(playFabId));
    if (statusPath) return json(await gamePurchaseStatus(playFabId, statusPath[1]!));
    if (url.pathname === "/api/game/shop-link" && request.method === "GET")
      return json(await assertGameShopLink(url.searchParams.get("token") || "", playFabId));
    const input = await body(request);
    if (url.pathname === "/api/game/shop-link") {
      onlyKeys(input, ["currency"]);
      if (input["currency"] !== "coins" && input["currency"] !== "diamonds")
        throw new AdminApiError(400, "Shop currency is invalid.");
      const origin = shopOrigin();
      const link = await issueGameShopLink(playFabId, input["currency"]);
      const target = `/dashboard/shop?${new URLSearchParams({ currency: link.currency, gameLink: link.token })}`;
      return json({ ...link, url: `${origin}/login?${new URLSearchParams({ redirect: target })}` });
    }
    if (url.pathname === "/api/game/wallet/import") {
      onlyKeys(input, [
        "gold",
        "saveHash",
        "completedContracts",
        "unlockedAchievements",
        "purchasedShopItemIds",
        "unlockedCosmeticIDs",
        "unlockedContractMaterials",
        "lifetimeGoldEarned",
        "lifetimeGoldSpent",
      ]);
      return json(await importGameWallet(playFabId, input));
    }
    if (url.pathname === "/api/game/rewards") {
      onlyKeys(input, ["events"]);
      const events = input["events"];
      if (
        !Array.isArray(events) ||
        events.length < 1 ||
        events.length > 100 ||
        events.some((event) => !event || typeof event !== "object" || Array.isArray(event))
      )
        throw new AdminApiError(400, "Reward batch is invalid.");
      for (const event of events) {
        onlyKeys(object(event), ["kind", "sourceId", "eventId", "amount", "evidence"]);
        const evidence = object(object(event)["evidence"]);
        onlyKeys(evidence, ["finalCost", "failureCount", "quotedAmount", "tutorial"]);
      }
      return json(await grantGameRewards(playFabId, events as Record<string, unknown>[]));
    }
    onlyKeys(input, ["operationId", "targetKind", "targetId", "contractId"]);
    return json(await purchaseGameItem(playFabId, input));
  } catch (error) {
    if (error instanceof GamePurchaseRejected)
      return json({ error: error.message, operationId: error.operationId, terminal: true }, 400);
    if (error instanceof AdminApiError) return json({ error: error.message }, error.status);
    // Never return SQL, tickets, provider details, connection URLs or raw request bodies.
    return json({ error: "Game wallet is temporarily unavailable." }, 503);
  }
}
