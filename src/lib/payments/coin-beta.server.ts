import { adminGameConfig } from "../playfab/admin-client.server.ts";
import { AdminApiError } from "../playfab/admin-client.server.ts";
import {
  newAccountCohortConfig,
  prepareAccountCoinAuthority,
} from "../game-wallet/cohort.server.ts";
import {
  requireGameWalletReady,
  requireGameWalletSettlementReady,
} from "../game-wallet/config.server.ts";
import type { GameCoinOrder, GameWalletSnapshot } from "../game-wallet/types.ts";
import {
  CoinFulfillmentMaintenance,
  assertCoinFulfillmentAvailable,
  isCoinFulfillmentMaintenance,
} from "./coin-maintenance.server.ts";
import { requirePayMongoCheckoutReady } from "./paymongo.server.ts";
import { normalizeProductReward } from "./products.ts";
import type { CoinBetaBinding, PaymentOrder, PaymentProduct } from "./types.ts";

export const COIN_BETA_PRODUCT_ID = "coins_500" as const;
const MAIN_ORIGIN = "https://civil-craft.vercel.app";
const bindingKeys = [
  "protocolVersion",
  "mode",
  "scopeId",
  "titleId",
  "playerId",
  "entity",
  "productId",
  "rewardCurrency",
  "rewardAmount",
  "expectedAmount",
  "currency",
];
const snapshotKeys = [
  "storage",
  "namespace",
  "databaseId",
  "targetId",
  "protocolVersion",
  "entity",
];
const enabled = (key: string) => process.env[key]?.trim().toLowerCase() === "true";
const paused = (): never => {
  throw new CoinFulfillmentMaintenance();
};

export function isGeneralTestCoinCheckoutEnabled(): boolean {
  return (
    enabled("COIN_COHORT_TEST_CHECKOUT_ENABLED") && enabled("COIN_COHORT_TEST_DELIVERY_ENABLED")
  );
}

function cohortScope(phase: "checkout" | "delivery", playerId: string, entityId: string) {
  if (
    !enabled("COIN_COHORT_TEST_DELIVERY_ENABLED") ||
    (phase === "checkout" && !isGeneralTestCoinCheckoutEnabled()) ||
    !isCoinFulfillmentMaintenance()
  )
    return paused();
  const cutoff = process.env["GAME_WALLET_NEW_ACCOUNT_CUTOFF_AT"] || "";
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(cutoff) ||
    !Number.isFinite(Date.parse(cutoff)) ||
    new Date(cutoff).toISOString() !== cutoff ||
    Date.parse(cutoff) > Date.now() ||
    !/^[A-F0-9]{1,32}$/.test(playerId) ||
    !/^[A-F0-9]{1,64}$/.test(entityId)
  )
    return paused();
  if (phase === "checkout" && !newAccountCohortConfig()) return paused();
  const provider = requirePayMongoCheckoutReady();
  if (
    !provider.secretKey.startsWith("sk_test_") ||
    provider.secretKey.length <= 8 ||
    ![MAIN_ORIGIN, `${MAIN_ORIGIN}/`].includes(provider.appUrl) ||
    ![MAIN_ORIGIN, `${MAIN_ORIGIN}/`].includes((process.env["PUBLIC_APP_URL"] || "").trim())
  )
    return paused();
  const wallet =
    phase === "checkout" ? requireGameWalletReady() : requireGameWalletSettlementReady();
  return {
    scopeId: `cohort-${Date.parse(cutoff)}-${playerId.toLowerCase()}`,
    titleId: adminGameConfig().titleId.toUpperCase(),
    playerId,
    entityId,
    wallet,
  };
}

/** General development TEST path; eligibility comes from verified server account/wallet records. */
export async function createCoinCheckoutBindingForAccount(
  playFabId: string,
  product: PaymentProduct,
) {
  if (newAccountCohortConfig() && !isCoinFulfillmentMaintenance()) return paused();
  if (!isGeneralTestCoinCheckoutEnabled()) return createCoinBetaCheckoutBinding(playFabId, product);
  const prepared = await prepareAccountCoinAuthority(playFabId);
  if (!prepared.websiteCoinCheckoutAllowed)
    throw new AdminApiError(
      409,
      "This development account keeps legacy Coins and cannot buy website Coins.",
    );
  const current = cohortScope("checkout", playFabId.toUpperCase(), prepared.entity.Id);
  const reward = normalizeProductReward(product);
  if (
    !product.active ||
    product.id !== COIN_BETA_PRODUCT_ID ||
    product.category !== "currency" ||
    product.amount !== 5000 ||
    product.currency !== "PHP" ||
    reward.rewardCurrency !== "CO" ||
    reward.rewardAmount !== 500 ||
    product.rewardCoins !== 500
  )
    return paused();
  const binding: CoinBetaBinding = {
    protocolVersion: 1,
    mode: "test",
    scopeId: current.scopeId,
    titleId: current.titleId,
    playerId: current.playerId,
    entity: { Id: current.entityId, Type: "title_player_account" },
    productId: COIN_BETA_PRODUCT_ID,
    rewardCurrency: "CO",
    rewardAmount: 500,
    expectedAmount: 5000,
    currency: "PHP",
  };
  assertBinding(binding, current);
  return Object.freeze(binding);
}

/** Absolute, server-only window; no restart or request can extend its deadline. */
function assertCheckoutWindow(): void {
  const parse = (key: string) => {
    const value = process.env[key] || "";
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return NaN;
    const stamp = Date.parse(value);
    return Number.isFinite(stamp) && new Date(stamp).toISOString() === value ? stamp : NaN;
  };
  const start = parse("COIN_BETA_CHECKOUT_STARTS_AT");
  const end = parse("COIN_BETA_CHECKOUT_ENDS_AT");
  const now = Date.now();
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    !Number.isSafeInteger(now) ||
    end <= start ||
    end - start > 30 * 60 * 1000 ||
    now < start ||
    now >= end
  )
    paused();
}

function exactObject(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== null && Object.getPrototypeOf(prototype) !== null) return false;
  const actual = Reflect.ownKeys(value);
  return (
    actual.length === keys.length &&
    actual.every((key) => typeof key === "string" && keys.includes(key))
  );
}

type ScopeSelection = { playerId: string } | { scopeId: string };

function scope(phase: "checkout" | "delivery", selection: ScopeSelection) {
  if (
    !enabled("COIN_BETA_DELIVERY_ENABLED") ||
    (phase === "checkout" && !enabled("COIN_BETA_CHECKOUT_ENABLED"))
  )
    paused();
  // Delivery deliberately ignores time limits: already accepted orders retain
  // their immutable settlement authority after checkout expires or is closed.
  if (phase === "checkout") assertCheckoutWindow();
  const scopeId = process.env["COIN_BETA_SCOPE_ID"]?.trim() || "";
  const titleId = process.env["COIN_BETA_TITLE_ID"]?.trim().toUpperCase() || "";
  const playerId = process.env["COIN_BETA_PLAYER_ID"]?.trim().toUpperCase() || "";
  const entityId = process.env["COIN_BETA_ENTITY_ID"]?.trim().toUpperCase() || "";
  if (
    scopeId.length > 64 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(scopeId) ||
    !/^[A-F0-9]{1,16}$/.test(titleId) ||
    !/^[A-F0-9]{1,32}$/.test(playerId) ||
    !/^[A-F0-9]{1,64}$/.test(entityId) ||
    titleId !== adminGameConfig().titleId.toUpperCase()
  )
    paused();
  const provider = requirePayMongoCheckoutReady();
  const rawOrigin = (
    process.env["PUBLIC_APP_URL"] ||
    process.env["PUBLIC_SITE_URL"] ||
    process.env["SITE_URL"] ||
    ""
  ).trim();
  const origin = new URL(rawOrigin);
  const providerOrigin = new URL(provider.appUrl);
  if (
    !provider.secretKey.startsWith("sk_test_") ||
    provider.secretKey.length <= "sk_test_".length ||
    (rawOrigin !== MAIN_ORIGIN && rawOrigin !== `${MAIN_ORIGIN}/`) ||
    origin.origin !== MAIN_ORIGIN ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password ||
    providerOrigin.origin !== MAIN_ORIGIN ||
    providerOrigin.pathname !== "/" ||
    providerOrigin.search ||
    providerOrigin.hash ||
    providerOrigin.username ||
    providerOrigin.password
  )
    paused();
  const wallet =
    phase === "checkout" ? requireGameWalletReady() : requireGameWalletSettlementReady();
  if (
    wallet.storage !== "postgres" ||
    wallet.namespace !== "civilcraft_game_wallet_v3" ||
    wallet.protocolVersion !== 3 ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(wallet.databaseId) ||
    !/^[a-f0-9]{64}$/.test(wallet.targetId)
  )
    paused();
  const matches = (candidate: { scopeId: string; playerId: string }) =>
    "playerId" in selection
      ? typeof selection.playerId === "string" &&
        /^[a-f0-9]{1,32}$/i.test(selection.playerId) &&
        candidate.playerId === selection.playerId.toUpperCase()
      : typeof selection.scopeId === "string" && candidate.scopeId === selection.scopeId;
  const primary = { scopeId, titleId, playerId, entityId, wallet };
  // Preserve the original v1 beta binding and its accepted-order delivery even
  // when the optional second account is absent, disabled or misconfigured.
  if (matches(primary)) {
    // Global beta checkout may be open for an additional account only. Keep
    // original receipt delivery independent of this new-checkout-only switch.
    const primaryCheckout = process.env["COIN_BETA_PRIMARY_CHECKOUT_ENABLED"];
    if (phase === "checkout" && primaryCheckout !== undefined && primaryCheckout !== "true")
      return paused();
    return primary;
  }
  const secondScopeId = process.env["COIN_BETA_SECOND_SCOPE_ID"]?.trim() || "";
  const secondPlayerId = process.env["COIN_BETA_SECOND_PLAYER_ID"]?.trim().toUpperCase() || "";
  const secondEntityId = process.env["COIN_BETA_SECOND_ENTITY_ID"]?.trim().toUpperCase() || "";
  if (!matches({ scopeId: secondScopeId, playerId: secondPlayerId })) {
    // Parse only for additional accounts. A broken new list must never strand
    // orders already accepted under either original immutable scope.
    const raw = process.env["COIN_BETA_ADDITIONAL_ACCOUNTS"] || "[]";
    if (raw.length > 16_384) return paused();
    const entries: unknown = JSON.parse(raw);
    if (!Array.isArray(entries) || entries.length > 32) return paused();
    const scopes = new Set([scopeId, secondScopeId]);
    const players = new Set([playerId, secondPlayerId]);
    const entities = new Set([entityId, secondEntityId]);
    let selected:
      | {
          scopeId: string;
          playerId: string;
          entityId: string;
          checkoutEnabled: boolean;
          deliveryEnabled: boolean;
        }
      | undefined;
    for (const entry of entries) {
      if (
        !exactObject(entry, [
          "scopeId",
          "playerId",
          "entityId",
          "checkoutEnabled",
          "deliveryEnabled",
        ])
      )
        return paused();
      const s = entry["scopeId"],
        p = entry["playerId"],
        e = entry["entityId"];
      if (
        typeof s !== "string" ||
        s.length > 64 ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) ||
        typeof p !== "string" ||
        !/^[A-F0-9]{1,32}$/.test(p) ||
        typeof e !== "string" ||
        !/^[A-F0-9]{1,64}$/.test(e) ||
        typeof entry["checkoutEnabled"] !== "boolean" ||
        typeof entry["deliveryEnabled"] !== "boolean" ||
        scopes.has(s) ||
        players.has(p) ||
        entities.has(e)
      )
        return paused();
      scopes.add(s);
      players.add(p);
      entities.add(e);
      if (matches({ scopeId: s, playerId: p }))
        selected = {
          scopeId: s,
          playerId: p,
          entityId: e,
          checkoutEnabled: entry["checkoutEnabled"],
          deliveryEnabled: entry["deliveryEnabled"],
        };
    }
    if (
      !selected ||
      !selected.deliveryEnabled ||
      (phase === "checkout" && !selected.checkoutEnabled)
    )
      return paused();
    return {
      scopeId: selected.scopeId,
      playerId: selected.playerId,
      entityId: selected.entityId,
      titleId,
      wallet,
    };
  }
  if (
    !enabled("COIN_BETA_SECOND_DELIVERY_ENABLED") ||
    (phase === "checkout" && !enabled("COIN_BETA_SECOND_CHECKOUT_ENABLED"))
  )
    paused();
  if (
    secondScopeId.length > 64 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(secondScopeId) ||
    !/^[A-F0-9]{1,32}$/.test(secondPlayerId) ||
    !/^[A-F0-9]{1,64}$/.test(secondEntityId) ||
    secondScopeId === scopeId ||
    secondPlayerId === playerId ||
    secondEntityId === entityId
  )
    paused();
  const second = {
    scopeId: secondScopeId,
    titleId,
    playerId: secondPlayerId,
    entityId: secondEntityId,
    wallet,
  };
  if (!matches(second)) paused();
  return second;
}

function boundScope(phase: "checkout" | "delivery", beta: unknown) {
  if (!exactObject(beta, bindingKeys) || typeof beta["scopeId"] !== "string") return paused();
  if (beta["scopeId"].startsWith("cohort-")) {
    if (
      typeof beta["playerId"] !== "string" ||
      !exactObject(beta["entity"], ["Id", "Type"]) ||
      typeof beta["entity"]["Id"] !== "string"
    )
      return paused();
    return cohortScope(phase, beta["playerId"], beta["entity"]["Id"]);
  }
  // Stored server-authored scope chooses a candidate, never authorizes a grant:
  // assertBinding and assertSnapshot still validate every immutable field below.
  return scope(phase, { scopeId: beta["scopeId"] });
}

function assertBinding(
  beta: unknown,
  current: ReturnType<typeof scope>,
): asserts beta is CoinBetaBinding {
  if (
    !exactObject(beta, bindingKeys) ||
    !exactObject(beta["entity"], ["Id", "Type"]) ||
    beta["protocolVersion"] !== 1 ||
    beta["mode"] !== "test" ||
    beta["scopeId"] !== current.scopeId ||
    beta["titleId"] !== current.titleId ||
    beta["playerId"] !== current.playerId ||
    beta["entity"]["Id"] !== current.entityId ||
    beta["entity"]["Type"] !== "title_player_account" ||
    beta["productId"] !== COIN_BETA_PRODUCT_ID ||
    beta["rewardCurrency"] !== "CO" ||
    beta["rewardAmount"] !== 500 ||
    beta["expectedAmount"] !== 5000 ||
    beta["currency"] !== "PHP"
  )
    paused();
}

function assertSnapshot(
  beta: CoinBetaBinding,
  snapshot: unknown,
  current: ReturnType<typeof scope>,
): void {
  if (
    !exactObject(snapshot, snapshotKeys) ||
    !exactObject(snapshot["entity"], ["Id", "Type"]) ||
    snapshot["storage"] !== current.wallet.storage ||
    snapshot["namespace"] !== current.wallet.namespace ||
    snapshot["protocolVersion"] !== 3 ||
    snapshot["databaseId"] !== current.wallet.databaseId ||
    snapshot["targetId"] !== current.wallet.targetId ||
    snapshot["entity"]["Id"] !== beta.entity.Id ||
    snapshot["entity"]["Type"] !== beta.entity.Type
  )
    paused();
}

/** Display preflight only: actual entity/imported-wallet readiness is checked separately. */
export function isCoinBetaCheckoutCandidate(playFabId: string): boolean {
  if (!isCoinFulfillmentMaintenance()) return false;
  try {
    return scope("checkout", { playerId: playFabId }).playerId === playFabId.toUpperCase();
  } catch {
    return false;
  }
}

/** Called only with the authenticated owner and active server-loaded product, never browser bindings. */
export function createCoinBetaCheckoutBinding(
  playFabId: string,
  product: PaymentProduct,
): CoinBetaBinding | undefined {
  if (!isCoinFulfillmentMaintenance()) return undefined;
  try {
    const current = scope("checkout", { playerId: playFabId });
    const reward = normalizeProductReward(product);
    if (
      typeof playFabId !== "string" ||
      !/^[a-f0-9]{1,32}$/i.test(playFabId) ||
      playFabId.toUpperCase() !== current.playerId ||
      product.id !== COIN_BETA_PRODUCT_ID ||
      product.active !== true ||
      product.category !== "currency" ||
      product.amount !== 5000 ||
      product.currency !== "PHP" ||
      product.rewardCurrency !== "CO" ||
      product.rewardAmount !== 500 ||
      product.rewardCoins !== 500 ||
      reward.rewardCurrency !== "CO" ||
      reward.rewardAmount !== 500
    )
      paused();
    return Object.freeze({
      protocolVersion: 1,
      mode: "test",
      scopeId: current.scopeId,
      titleId: current.titleId,
      playerId: current.playerId,
      entity: Object.freeze({ Id: current.entityId, Type: "title_player_account" }),
      productId: COIN_BETA_PRODUCT_ID,
      rewardCurrency: "CO",
      rewardAmount: 500,
      expectedAmount: 5000,
      currency: "PHP",
    });
  } catch {
    return paused();
  }
}

export function assertCoinCheckoutSnapshotAllowed(playFabId: string, beta?: CoinBetaBinding): void {
  if (beta === undefined) return assertCoinFulfillmentAvailable();
  try {
    const current = boundScope("checkout", beta);
    assertBinding(beta, current);
    if (
      typeof playFabId !== "string" ||
      !/^[a-f0-9]{1,32}$/i.test(playFabId) ||
      playFabId.toUpperCase() !== beta.playerId
    )
      paused();
  } catch {
    paused();
  }
}

export function assertCoinBetaWalletBinding(
  beta: CoinBetaBinding,
  snapshot: GameWalletSnapshot,
): void {
  try {
    const current = boundScope("delivery", beta);
    assertBinding(beta, current);
    assertSnapshot(beta, snapshot, current);
  } catch {
    paused();
  }
}

/** A bound paid TEST order may settle with checkout closed, but never with delivery closed. */
export function assertCoinOrderDeliveryAllowed(order: GameCoinOrder | PaymentOrder): void {
  if (order.coinBeta === undefined) return assertCoinFulfillmentAvailable();
  try {
    const current = boundScope("delivery", order.coinBeta);
    assertBinding(order.coinBeta, current);
    if (
      order.coinReceiptVersion !== 3 ||
      order.playFabId !== current.playerId ||
      typeof order.orderId !== "string" ||
      !/^[a-z0-9][a-z0-9._:-]{0,199}$/i.test(order.orderId) ||
      order.productId !== COIN_BETA_PRODUCT_ID ||
      order.rewardCurrency !== "CO" ||
      order.rewardAmount !== 500 ||
      order.expectedCoins !== 500 ||
      order.expectedAmount !== 5000 ||
      order.currency !== "PHP" ||
      order.coinCurrencyCode !== "CO" ||
      order.coinReceipt !== undefined ||
      (order as unknown as Record<string, unknown>)["premiumWallet"] !== undefined
    )
      paused();
    assertSnapshot(order.coinBeta, order.gameWallet, current);
  } catch {
    paused();
  }
}
