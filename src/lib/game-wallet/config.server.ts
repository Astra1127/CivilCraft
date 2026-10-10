import { createHash } from "node:crypto";
import { AdminApiError, adminGameConfig } from "../playfab/admin-client.server.ts";
import {
  currencyDatabaseConfig,
  requireCurrencyDatabaseReady,
} from "../payments/currency-database.server.ts";
import { GAME_WALLET_NAMESPACE, type GameWalletConfig } from "./types.ts";

const enabled = (key: string) => process.env[key]?.trim().toLowerCase() === "true";
/** Machine-readable only for trusted wallet readiness failures, not provider errors. */
export class GameWalletReadinessError extends AdminApiError {
  readonly code: "GAME_WALLET_DISABLED" | "GAME_WALLET_NOT_READY";
  constructor(code: "GAME_WALLET_DISABLED" | "GAME_WALLET_NOT_READY") {
    super(
      503,
      code === "GAME_WALLET_DISABLED"
        ? "Game wallet is not enabled."
        : "Game wallet requires verified setup and legacy-handler cutover.",
    );
    this.code = code;
  }
}
export function isGameWalletEnabled(): boolean {
  return enabled("GAME_WALLET_ENABLED");
}
/** Once cut over, outstanding orders retain PG/gate authority even during feature maintenance. */
export function isLegacyCoinGateRequired(): boolean {
  return (
    isGameWalletEnabled() ||
    enabled("GAME_WALLET_VERIFIED") ||
    enabled("GAME_WALLET_LEGACY_HANDLERS_QUIESCED")
  );
}
export const isGameWalletInstalled = isLegacyCoinGateRequired;
export function gameWalletConfig(): GameWalletConfig {
  const db = currencyDatabaseConfig();
  return Object.freeze({
    storage: "postgres",
    namespace: GAME_WALLET_NAMESPACE,
    databaseId: db.databaseId,
    targetId: db.targetId,
    protocolVersion: 3,
  });
}
export function gameWalletVerificationFingerprint(): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        titleId: adminGameConfig().titleId.toUpperCase(),
        ...gameWalletConfig(),
        protocol: "unified-game-coins-atomic-ledger-v3",
        capabilityRevision: "permanent-receipt-coverage-v1",
      }),
    )
    .digest("hex");
}
export function requireGameWalletReady(): GameWalletConfig {
  if (!isGameWalletEnabled()) throw new GameWalletReadinessError("GAME_WALLET_DISABLED");
  return requireGameWalletSettlementReady();
}
export function requireGameWalletSettlementReady(): GameWalletConfig {
  const config = gameWalletConfig();
  const { titleId, secret } = adminGameConfig();
  if (
    !secret ||
    !enabled("GAME_WALLET_VERIFIED") ||
    !enabled("GAME_WALLET_LEGACY_HANDLERS_QUIESCED") ||
    process.env["GAME_WALLET_VERIFIED_TITLE_ID"]?.trim().toUpperCase() !== titleId.toUpperCase() ||
    process.env["GAME_WALLET_VERIFIED_CONFIG_SHA256"]?.trim().toLowerCase() !==
      gameWalletVerificationFingerprint()
  )
    throw new GameWalletReadinessError("GAME_WALLET_NOT_READY");
  return config;
}
/** Navigation grants no wallet, sign-in, payment or import authority. */
export function requireGameShopLinkReady(): GameWalletConfig {
  requireCurrencyDatabaseReady();
  if (!adminGameConfig().secret)
    throw new AdminApiError(503, "Website shop navigation is temporarily unavailable.");
  return gameWalletConfig();
}
