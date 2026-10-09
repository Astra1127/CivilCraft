import { createHash } from "node:crypto";
import { AdminApiError, adminGameConfig } from "../playfab/admin-client.server.ts";
import { currencyDatabaseConfig } from "../payments/currency-database.server.ts";
import { GAME_WALLET_NAMESPACE, type GameWalletConfig } from "./types.ts";

const enabled = (key: string) => process.env[key]?.trim().toLowerCase() === "true";
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
      }),
    )
    .digest("hex");
}
export function requireGameWalletReady(): GameWalletConfig {
  if (!isGameWalletEnabled()) throw new AdminApiError(503, "Game wallet is not enabled.");
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
    throw new AdminApiError(503, "Game wallet requires verified setup and legacy-handler cutover.");
  return config;
}
