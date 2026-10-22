/** Query values are only a storefront preference, never payment instructions. */
export type ShopCurrency = "coins" | "diamonds";

export const DIAMOND_LOGIN_MESSAGE =
  "Log in with your Civil Craft game account before buying Diamonds.";
export const COIN_LOGIN_MESSAGE = "Log in with your Civil Craft game account before buying Coins.";

/** Only an opaque correlation token goes into the URL, never a game session ticket. */
export function shopGameLink(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{32,128}$/.test(value))
    throw new Error("This game shop link is invalid. Open the shop again from Civil Craft.");
  return value;
}

export function shopCurrency(value: unknown): ShopCurrency {
  return value === "diamonds" ? "diamonds" : "coins";
}

export function shopDestination(currency: ShopCurrency, gameLink?: string): string {
  const token = shopGameLink(gameLink);
  return `/dashboard/shop?currency=${currency}${token ? `&gameLink=${encodeURIComponent(token)}` : ""}`;
}

export function isShopDestination(destination: string): boolean {
  try {
    const url = new URL(destination, "https://civilcraft.invalid");
    return (
      url.origin === "https://civilcraft.invalid" &&
      ["/shop", "/dashboard/shop"].includes(url.pathname)
    );
  } catch {
    return false;
  }
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
