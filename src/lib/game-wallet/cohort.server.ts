import { AdminApiError, object, playFabAdmin } from "../playfab/admin-client.server.ts";
import { classifyCoinAuthority, verifiedTimestamp } from "./cohort-policy.ts";
import { requireGameWalletReady } from "./config.server.ts";
import { balanceRow, walletCall, walletIdentity, walletUnavailable } from "./database.server.ts";
import { digest } from "./catalog.server.ts";

/** Deliberately default-off until both game support and the additive SQL are deployed. */
export function newAccountCohortConfig(): { cutoffAt: string } | null {
  const enabled = process.env["GAME_WALLET_NEW_ACCOUNT_COHORT_ENABLED"];
  if (enabled === undefined || enabled === "false") return null;
  if (enabled !== "true") throw walletUnavailable();
  const cutoffAt = process.env["GAME_WALLET_NEW_ACCOUNT_CUTOFF_AT"];
  try {
    const stamp = verifiedTimestamp(cutoffAt);
    if (new Date(stamp).toISOString() !== cutoffAt || stamp > Date.now()) throw new Error();
  } catch {
    throw walletUnavailable();
  }
  return { cutoffAt: cutoffAt! };
}

/** Server-only preparation. No save amounts, timestamps or Entity IDs are accepted from clients. */
export async function prepareAccountCoinAuthority(playFabId: string) {
  const cohort = newAccountCohortConfig();
  if (!cohort) throw new AdminApiError(503, "New-account wallet rollout is not enabled.");
  if (!/^[a-f0-9]{1,32}$/i.test(playFabId)) throw walletUnavailable();
  const config = requireGameWalletReady();
  const result = await playFabAdmin("Admin/GetUserAccountInfo", { PlayFabId: playFabId });
  const info = object(result["UserInfo"]),
    title = object(info["TitleInfo"]);
  const entity = object(title["TitlePlayerAccount"]);
  if (
    typeof info["PlayFabId"] !== "string" ||
    info["PlayFabId"].toUpperCase() !== playFabId.toUpperCase() ||
    entity["Type"] !== "title_player_account" ||
    typeof entity["Id"] !== "string" ||
    !/^[a-f0-9]{1,64}$/i.test(entity["Id"]) ||
    title["isBanned"] === true
  )
    throw walletUnavailable();
  const identity = walletIdentity(config, playFabId, {
    Id: entity["Id"],
    Type: "title_player_account",
  });
  const verifiedEntity = {
    Id: String(entity["Id"]).toUpperCase(),
    Type: "title_player_account" as const,
  };
  const existing = await walletCall("wallet_balance", identity);
  if (existing.length !== 1) throw walletUnavailable();
  const balance = balanceRow(existing[0]);
  let authority;
  try {
    authority = classifyCoinAuthority({
      walletReady: balance.ready,
      titleCreatedAt: title["Created"],
      cutoffAt: cohort.cutoffAt,
      now: Date.now(),
    });
  } catch {
    throw walletUnavailable();
  }
  if (authority === "legacy")
    return {
      authority,
      balance,
      entity: verifiedEntity,
      websiteCoinCheckoutAllowed: false as const,
    };
  if (balance.ready)
    return {
      authority,
      balance,
      entity: verifiedEntity,
      websiteCoinCheckoutAllowed: true as const,
    };
  const createdAt = new Date(verifiedTimestamp(title["Created"])).toISOString();
  const fingerprint = digest({
    protocol: "new-account-zero-v1",
    identity,
    createdAt,
    cutoffAt: cohort.cutoffAt,
  });
  const rows = await walletCall("new_account_open", [
    ...identity,
    createdAt,
    cohort.cutoffAt,
    fingerprint,
  ]);
  if (rows.length !== 1 || !balanceRow(rows[0]).ready) throw walletUnavailable();
  return {
    authority,
    balance: balanceRow(rows[0]),
    entity: verifiedEntity,
    websiteCoinCheckoutAllowed: true as const,
  };
}
