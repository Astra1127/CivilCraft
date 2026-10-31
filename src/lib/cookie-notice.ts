export const COOKIE_NOTICE_VERSION = "2026-10-30";
export const COOKIE_NOTICE_KEY = "civilcraft.cookie-notice.v1";

export function hasCookieNoticeAcknowledgment(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const record = JSON.parse(window.localStorage.getItem(COOKIE_NOTICE_KEY) ?? "null");
    return (
      record?.policyVersion === COOKIE_NOTICE_VERSION &&
      typeof record.acknowledgedAt === "string" &&
      Number.isFinite(Date.parse(record.acknowledgedAt))
    );
  } catch {
    return false;
  }
}

export function acknowledgeCookieNotice(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      COOKIE_NOTICE_KEY,
      JSON.stringify({
        policyVersion: COOKIE_NOTICE_VERSION,
        acknowledgedAt: new Date().toISOString(),
      }),
    );
  } catch {
    // Storage may be unavailable. The notice can still close for this page visit.
  }
}
