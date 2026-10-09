/** Query values are only a storefront preference, never payment instructions. */
export type ShopCurrency = "coins" | "diamonds";

export const DIAMOND_LOGIN_MESSAGE =
  "Log in with your Civil Craft game account before buying Diamonds.";

export function shopCurrency(value: unknown): ShopCurrency {
  return value === "diamonds" ? "diamonds" : "coins";
}

export function shopDestination(currency: ShopCurrency): string {
  return `/dashboard/shop?currency=${currency}`;
}

export function isDiamondShopDestination(destination: string): boolean {
  try {
    const url = new URL(destination, "https://civilcraft.invalid");
    return (
      url.origin === "https://civilcraft.invalid" &&
      ["/shop", "/dashboard/shop"].includes(url.pathname) &&
      url.searchParams.get("currency") === "diamonds"
    );
  } catch {
    return false;
  }
}

export function displayBalance(value: number | null | undefined, pending = false): string {
  if (pending) return "Loading…";
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value.toLocaleString()
    : "Unavailable";
}
