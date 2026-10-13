import { AdminApiError, object, playFabAdmin } from "../playfab/admin-client.server.ts";
import { availableCoinPackages } from "./checkout-preflight.ts";
import {
  assertDiamondCheckoutCapacity,
  getDiamondBalance,
  requireDiamondCheckoutReady,
  resolvePremiumEntity,
} from "../playfab/premium-wallet.server.ts";
import { normalizeOrderReward, normalizeProductReward } from "./products.ts";
import { getProductById, listActiveProducts } from "./products.server.ts";
import {
  generateOrderId,
  getOrder,
  listOrdersForPlayer,
  saveOrder,
  updateOrderStatus,
} from "./orders.server.ts";
import { createPayMongoCheckout, requirePayMongoCheckoutReady } from "./paymongo.server.ts";
import {
  getCoinsCurrencyCode,
  processPayMongoWebhook,
  repairPaymentOrder,
} from "./fulfillment.server.ts";
import { authenticatePaymentPlayer } from "./player-auth.server.ts";
import type { PaymentOrder } from "./types.ts";
import {
  assertCoinFulfillmentAvailable,
  isCoinFulfillmentMaintenance,
} from "./coin-maintenance.server.ts";
import {
  COIN_BETA_PRODUCT_ID,
  assertCoinCheckoutSnapshotAllowed,
  createCoinCheckoutBindingForAccount,
  isGeneralTestCoinCheckoutEnabled,
  isCoinBetaCheckoutCandidate,
} from "./coin-beta.server.ts";
import {
  assertClassicCurrencyConfigured,
  assertCoinCheckoutReady,
  coinReceiptSnapshot,
} from "./coin-receipts.server.ts";
import {
  assertGameShopLink,
  gameCoinBalance,
  gameCoinSnapshot,
  isGameWalletEnabled,
  isGameWalletInstalled,
  requireGameWalletReady,
} from "../game-wallet/index.server.ts";

function jsonResponse(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      Vary: "Authorization",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function configuredReturnOrigin(): string {
  const url = new URL(requirePayMongoCheckoutReady().appUrl);
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  ) {
    throw new AdminApiError(503, "Payment return URL is not configured safely.");
  }
  // Never use caller-controlled Origin/forwarded-host headers for checkout redirects.
  return url.origin;
}

function safeOrder(order: PaymentOrder) {
  const reward = normalizeOrderReward(order);
  return {
    orderId: order.orderId,
    productId: order.productId,
    status: order.status,
    ...reward,
    expectedCoins: reward.rewardCurrency === "CO" ? reward.rewardAmount : 0,
    expectedAmount: order.expectedAmount,
    currency: order.currency,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    fulfilledAt: order.fulfilledAt,
    fulfillmentReviewRequired: order.fulfillmentReviewRequired === true,
  };
}

export async function handlePaymentsRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === "/api/webhooks/paymongo") {
    if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
    try {
      const rawBody = await request.text();
      if (Buffer.byteLength(rawBody) > 262144)
        return jsonResponse({ error: "Webhook payload too large" }, 413);
      const result = await processPayMongoWebhook(
        rawBody,
        request.headers.get("paymongo-signature"),
      );
      return jsonResponse(result.body, result.status);
    } catch {
      return jsonResponse({ error: "Payment processing is temporarily unavailable." }, 503);
    }
  }
  const handled = [
    "/api/payments/paymongo/create-checkout",
    "/api/payments/paymongo/order",
    "/api/payments/paymongo/player-orders",
    "/api/shop/products",
    "/api/player/currencies",
  ];
  if (!handled.includes(path)) return null;
  if (request.method !== (path.endsWith("create-checkout") ? "POST" : "GET"))
    return jsonResponse({ error: "Method not allowed" }, 405);
  try {
    if (path === "/api/shop/products")
      return jsonResponse({ products: await listActiveProducts() });
    const { playFabId } = await authenticatePaymentPlayer(request);
    if (path === "/api/player/currencies") {
      const unifiedCoins = isGameWalletInstalled();
      let coinsReady = !unifiedCoins;
      let legacyCoins = false;
      const readCoins = async () => {
        if (unifiedCoins) {
          const wallet = await gameCoinBalance(playFabId);
          coinsReady = wallet.ready;
          legacyCoins = "coinAuthority" in wallet && wallet.coinAuthority === "legacy";
          return wallet.coins;
        }
        if (process.env["COIN_RECEIPTS_STORAGE"]?.trim() === "postgres") {
          if (getCoinsCurrencyCode() !== "CO")
            throw new AdminApiError(503, "Coin balance is unavailable.");
          await assertClassicCurrencyConfigured();
        }
        const inventory = await playFabAdmin("Server/GetUserInventory", { PlayFabId: playFabId });
        const raw = inventory["VirtualCurrency"];
        if (!raw || typeof raw !== "object" || Array.isArray(raw))
          throw new AdminApiError(503, "Coin balance is unavailable.");
        const amount = object(raw)[getCoinsCurrencyCode()] ?? 0;
        if (!Number.isSafeInteger(amount) || (amount as number) < 0)
          throw new AdminApiError(503, "Coin balance is unavailable.");
        return amount as number;
      };
      const readDiamonds = async () => {
        requireDiamondCheckoutReady();
        return getDiamondBalance(playFabId);
      };
      const [coins, diamonds] = await Promise.allSettled([readCoins(), readDiamonds()]);
      // Display-only reads must not wait for catalog/account checks for every package.
      // This response never authorizes checkout; the normal preflight remains unchanged.
      if (url.searchParams.get("view") === "balances")
        return jsonResponse({
          coins: coins.status === "fulfilled" ? coins.value : null,
          diamonds: diamonds.status === "fulfilled" ? diamonds.value : null,
          coinsAvailable: false,
          diamondsAvailable: false,
        });
      let paymentReady = false;
      try {
        requirePayMongoCheckoutReady();
        paymentReady = true;
      } catch {
        /* Disable checkout, not an existing balance. */
      }
      let coinMaintenanceAllowsCheckout = !isCoinFulfillmentMaintenance();
      let coinTestProductIds: string[] | undefined;
      if (
        !coinMaintenanceAllowsCheckout &&
        unifiedCoins &&
        coins.status === "fulfilled" &&
        coinsReady &&
        paymentReady &&
        isGameWalletEnabled() &&
        (isCoinBetaCheckoutCandidate(playFabId) || isGeneralTestCoinCheckoutEnabled())
      ) {
        if (isGeneralTestCoinCheckoutEnabled()) {
          // All ready wallets may attempt TEST checkout. Validate only the selected
          // server catalog product at create-checkout, never every package on load.
          coinMaintenanceAllowsCheckout = true;
        } else
          try {
            // Retain the old bounded beta path for deployments not on general rollout.
            const products = [await getProductById(COIN_BETA_PRODUCT_ID)];
            const available = await availableCoinPackages(products, async (product) => {
              const beta = await createCoinCheckoutBindingForAccount(playFabId, product);
              if (!beta) return false;
              // Every package still verifies the actual entity, account and ready wallet.
              await gameCoinSnapshot(playFabId, beta);
              return beta.productId === product.id;
            });
            if (available.length) {
              coinTestProductIds = available;
              coinMaintenanceAllowsCheckout = true;
            }
          } catch {
            /* A failed beta guard disables checkout, never a healthy balance or Diamonds. */
          }
      }
      return jsonResponse({
        coins: coins.status === "fulfilled" ? coins.value : null,
        diamonds: diamonds.status === "fulfilled" ? diamonds.value : null,
        diamondsAvailable: diamonds.status === "fulfilled" && paymentReady,
        coinsAvailable:
          coins.status === "fulfilled" &&
          coinsReady &&
          paymentReady &&
          coinMaintenanceAllowsCheckout &&
          (!unifiedCoins || isGameWalletEnabled()),
        ...(legacyCoins ? { coinsLegacyAccount: true } : {}),
        coinsMigrationRequired:
          !legacyCoins && unifiedCoins && coins.status === "fulfilled" && !coinsReady,
        ...(coinTestProductIds ? { coinTestCheckout: true, coinTestProductIds } : {}),
      });
    }
    if (path === "/api/payments/paymongo/create-checkout") {
      let body: Record<string, unknown>;
      try {
        body = object(await request.json());
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }
      if (Object.hasOwn(body, "coinBeta"))
        throw new AdminApiError(400, "Coin test settings are controlled by the server.");
      const id = typeof body["productId"] === "string" ? body["productId"] : "";
      if (Object.hasOwn(body, "gameLink")) {
        if (typeof body["gameLink"] !== "string")
          throw new AdminApiError(400, "The game shop link is invalid.");
        await assertGameShopLink(body["gameLink"], playFabId);
      }
      const product = await getProductById(id);
      if (!product || product.active === false)
        return jsonResponse({ error: "Unknown or unavailable product." }, 400);
      const reward = normalizeProductReward(product);
      const coinBeta =
        reward.rewardCurrency === "CO"
          ? await createCoinCheckoutBindingForAccount(playFabId, product)
          : undefined;
      if (reward.rewardCurrency === "CO" && !coinBeta) assertCoinFulfillmentAvailable();
      const returnOrigin = configuredReturnOrigin();
      const orderId = generateOrderId(reward.rewardCurrency);
      if (await getOrder(orderId))
        throw new AdminApiError(503, "Checkout order ID is already in use. Please try again.");
      let premiumWallet: PaymentOrder["premiumWallet"];
      let coinReceipt: PaymentOrder["coinReceipt"];
      let gameWallet: PaymentOrder["gameWallet"];
      if (reward.rewardCurrency === "DI") {
        const wallet = requireDiamondCheckoutReady();
        const entity = await resolvePremiumEntity(playFabId);
        // Also check the actual wallet before accepting a payment.
        await assertDiamondCheckoutCapacity({
          orderId,
          playFabId,
          entity,
          wallet,
          rewardAmount: reward.rewardAmount,
        });
        premiumWallet = { ...wallet, entity };
      } else if (isGameWalletEnabled()) {
        requireGameWalletReady();
        gameWallet = await gameCoinSnapshot(playFabId, coinBeta);
        const balance = await gameCoinBalance(playFabId);
        if (!balance.ready || balance.coins === null)
          throw new AdminApiError(
            409,
            "Open the updated game and finish selecting your account save before buying Coins.",
          );
        if (
          !Number.isSafeInteger(balance.coins + reward.rewardAmount) ||
          balance.coins + reward.rewardAmount > 2_147_483_647
        )
          throw new AdminApiError(409, "This Coin package would exceed your wallet limit.");
      } else {
        if (isGameWalletInstalled())
          throw new AdminApiError(
            503,
            "Coin purchases are paused for wallet maintenance. No payment has been started.",
          );
        coinReceipt = coinReceiptSnapshot();
        await assertCoinCheckoutReady({
          orderId,
          playFabId,
          currencyCode: getCoinsCurrencyCode(),
          rewardAmount: reward.rewardAmount,
          ...(coinReceipt ? { receipt: coinReceipt } : {}),
        });
      }
      const order: PaymentOrder = {
        orderId,
        playFabId,
        productId: product.id,
        expectedAmount: product.amount,
        currency: product.currency,
        ...reward,
        expectedCoins: reward.rewardCurrency === "CO" ? reward.rewardAmount : 0,
        ...(reward.rewardCurrency === "CO"
          ? gameWallet
            ? {
                coinReceiptVersion: 3 as const,
                gameWallet,
                ...(coinBeta ? { coinBeta, coinCurrencyCode: "CO" } : {}),
              }
            : {
                coinCurrencyCode: getCoinsCurrencyCode(),
                coinReceiptVersion: coinReceipt ? 2 : 1,
                ...(coinReceipt ? { coinReceipt } : {}),
              }
          : { premiumWallet }),
        PayMongoCheckoutSessionId: null,
        PayMongoReferenceNumber: orderId,
        status: "pending",
        createdAt: new Date().toISOString(),
        paidAt: null,
        fulfilledAt: null,
        webhookEventId: null,
      };
      await saveOrder(order);
      // Account/database/storage awaits may cross the window boundary. Recheck
      // immediately before starting provider checkout; an unpaid audit row is
      // not payment authority and cannot itself credit currency.
      if (coinBeta) assertCoinCheckoutSnapshotAllowed(playFabId, coinBeta);
      const checkout = await createPayMongoCheckout({
        orderId,
        product,
        playFabId,
        requestOrigin: returnOrigin,
      });
      if (checkout.referenceNumber !== orderId)
        throw new AdminApiError(503, "Checkout reference could not be verified.");
      await updateOrderStatus(orderId, {
        PayMongoCheckoutSessionId: checkout.checkoutId,
        checkoutUrl: checkout.checkoutUrl,
      });
      return jsonResponse({ success: true, orderId, checkoutUrl: checkout.checkoutUrl });
    }
    if (path === "/api/payments/paymongo/order") {
      const orderId = url.searchParams.get("id") || "";
      if (!/^[a-z0-9_-]{1,128}$/i.test(orderId))
        return jsonResponse({ error: "Invalid order id" }, 400);
      const order = await getOrder(orderId);
      if (!order || order.playFabId.toUpperCase() !== playFabId.toUpperCase())
        return jsonResponse({ error: "Order not found" }, 404);
      return jsonResponse(safeOrder(await repairPaymentOrder(order)));
    }
    const orders = await listOrdersForPlayer(playFabId);
    const verifiedOrders: PaymentOrder[] = [];
    // Legacy repairs share this player's permanent migration/grant gate. Do not
    // race them against each other or weaken that gate to assemble history.
    // Return history only after every required receipt has been checked.
    for (const order of orders) {
      verifiedOrders.push(
        isGameWalletInstalled() || order.coinReceiptVersion === 3
          ? await repairPaymentOrder(order)
          : order,
      );
    }
    return jsonResponse({ orders: verifiedOrders.map(safeOrder) });
  } catch (error) {
    const status = error instanceof AdminApiError ? error.status : 503;
    return jsonResponse(
      {
        error:
          error instanceof AdminApiError
            ? error.message
            : "Game services are temporarily unavailable.",
      },
      status,
    );
  }
}
