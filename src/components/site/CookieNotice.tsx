import { useEffect, useState } from "react";
import { acknowledgeCookieNotice, hasCookieNoticeAcknowledgment } from "@/lib/cookie-notice";

export function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!hasCookieNoticeAcknowledgment());
  }, []);

  if (!visible) return null;

  return (
    <aside
      aria-label="Cookies and browser storage notice"
      className="border-b border-border bg-secondary px-4 py-3 text-foreground"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 text-sm">
        <p className="min-w-0 flex-1 basis-64">
          CivilCraft uses essential storage to keep you signed in and functional storage to remember
          preferences. We do not use advertising or analytics trackers. Got It only acknowledges
          this notice. Read our{" "}
          <a
            href="/cookies"
            className="rounded underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            Cookie Policy
          </a>
          .
        </p>
        <button
          type="button"
          onClick={() => {
            acknowledgeCookieNotice();
            setVisible(false);
          }}
          className="min-h-11 shrink-0 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          Got It
        </button>
      </div>
    </aside>
  );
}
