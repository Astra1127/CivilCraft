import { AdminApiError, adminGameConfig } from "../playfab/admin-client.server.ts";
import { currencyDatabaseConnection } from "../payments/currency-database.server.ts";
import {
  gameWalletConfig,
  requireGameWalletReady,
  requireGameWalletSettlementReady,
} from "./config.server.ts";
import { MAX_GAME_COINS, type GameWalletConfig, type GameWalletSnapshot } from "./types.ts";
import { markGameWalletImportAttempted } from "./gate-context.server.ts";

const MESSAGE =
  "Game wallet is temporarily unavailable. Please retry or contact support for a pending operation.";
const operations = new Set([
  "wallet_balance",
  "gate_acquire",
  "gate_release",
  "import_wallet",
  "credit",
  "receipt",
  "reward",
  "purchase",
  "reject_purchase",
  "purchase_status",
  "entitlements",
  "link_issue",
  "link_read",
]);
export function walletUnavailable(): AdminApiError {
  return new AdminApiError(503, MESSAGE);
}
export function walletInteger(value: unknown, maximum = MAX_GAME_COINS): number {
  if ((typeof value !== "number" && typeof value !== "string") || !/^\d+$/.test(String(value)))
    throw walletUnavailable();
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0 || n > maximum) throw walletUnavailable();
  return n;
}
export async function assertGameWalletHealthy(): Promise<{
  databaseId: string;
  titleId: string;
  protocolVersion: 3;
}> {
  const config = gameWalletConfig();
  const titleId = adminGameConfig().titleId.toUpperCase();
  try {
    const rows = await currencyDatabaseConnection().unsafe(
      "SELECT * FROM civilcraft_game_wallet_v3.health($1::uuid,$2,$3)",
      [config.databaseId, titleId, 3],
    );
    if (
      rows.length !== 1 ||
      rows[0]?.["healthy"] !== true ||
      rows[0]?.["database_id"] !== config.databaseId ||
      rows[0]?.["title_id"] !== titleId ||
      rows[0]?.["protocol_version"] !== 3
    )
      throw walletUnavailable();
    return { databaseId: config.databaseId, titleId, protocolVersion: 3 };
  } catch {
    throw walletUnavailable();
  }
}
export async function walletCall(
  name: string,
  args: unknown[],
  settlement = false,
): Promise<Record<string, unknown>[]> {
  if (settlement) requireGameWalletSettlementReady();
  else requireGameWalletReady();
  if (!operations.has(name)) throw walletUnavailable();
  await assertGameWalletHealthy();
  try {
    if (name === "import_wallet") markGameWalletImportAttempted();
    const rows = await currencyDatabaseConnection().unsafe(
      `SELECT * FROM civilcraft_game_wallet_v3.${name}(${args.map((_, i) => `$${i + 1}`).join(",")})`,
      args as never[],
    );
    return [...rows];
  } catch {
    throw walletUnavailable();
  }
}
export function walletIdentity(
  config: GameWalletConfig,
  player: string,
  entity: GameWalletSnapshot["entity"],
): unknown[] {
  if (
    !/^[a-f0-9]{1,32}$/i.test(player) ||
    !/^[a-f0-9]{1,64}$/i.test(entity?.Id || "") ||
    entity.Type !== "title_player_account"
  )
    throw walletUnavailable();
  return [
    config.databaseId,
    adminGameConfig().titleId.toUpperCase(),
    player.toUpperCase(),
    entity.Id.toUpperCase(),
    entity.Type,
  ];
}
export function balanceRow(row: Record<string, unknown> | undefined) {
  if (!row || typeof row["ready"] !== "boolean") throw walletUnavailable();
  return {
    coins: row["ready"] ? walletInteger(row["coins"]) : null,
    ready: row["ready"],
    version: walletInteger(row["version"], Number.MAX_SAFE_INTEGER),
  };
}
