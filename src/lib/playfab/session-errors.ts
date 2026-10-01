export const SESSION_EXPIRED_MESSAGE = "Your session expired. Please log in again.";

/** Only explicit ticket errors, never a generic 401/403 or server-secret failure. */
export function isInvalidPlayerTicket(error: unknown, code?: unknown): boolean {
  return (
    ["InvalidSessionTicket", "NotAuthenticated", "AuthTokenExpired"].includes(String(error)) ||
    code === 1100 ||
    code === 1074 ||
    code === 1328
  );
}

/** Allow internal destinations only; reject protocol-relative URLs and encoded bypasses. */
export function playerReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || /[\\\s]/.test(value))
    return "/dashboard";
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || /[\\\s]/.test(decoded)) return "/dashboard";
    const url = new URL(value, "https://civilcraft.invalid");
    if (
      url.origin !== "https://civilcraft.invalid" ||
      /^\/(login|signup|admin)(\/|$)/.test(url.pathname)
    )
      return "/dashboard";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/dashboard";
  }
}
