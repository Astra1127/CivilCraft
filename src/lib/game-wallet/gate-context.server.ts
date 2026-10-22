import { AsyncLocalStorage } from "node:async_hooks";
import type { CoinGrantInput } from "../payments/coin-receipts.server.ts";

export interface WalletGatePhase {
  monetaryAttempted: boolean;
  importAttempted: boolean;
  legacyInput?: CoinGrantInput;
}
export const walletGateContext = new AsyncLocalStorage<WalletGatePhase>();
/** Must be called immediately before the non-idempotent classic currency HTTP request. */
export function markLegacyCoinMutationAttempted(input?: CoinGrantInput): void {
  const phase = walletGateContext.getStore();
  if (!phase) return;
  phase.monetaryAttempted = true;
  if (input) phase.legacyInput = input;
}
export function markGameWalletImportAttempted(): void {
  const phase = walletGateContext.getStore();
  if (phase) {
    phase.monetaryAttempted = true;
    phase.importAttempted = true;
  }
}
