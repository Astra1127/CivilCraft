import { AdminApiError } from "../playfab/admin-client.server.ts";

/** Explicit operator fence; not evidence that retired workers/consumers have drained. */
export function isCoinFulfillmentMaintenance(): boolean {
  return process.env["COIN_FULFILLMENT_MAINTENANCE"]?.trim().toLowerCase() === "true";
}

export class CoinFulfillmentMaintenance extends AdminApiError {
  constructor() {
    super(
      503,
      "Coin purchases and delivery are paused for maintenance. Please try again later. If you already paid, do not pay again.",
    );
  }
}

export function assertCoinFulfillmentAvailable(): void {
  if (isCoinFulfillmentMaintenance()) throw new CoinFulfillmentMaintenance();
}
