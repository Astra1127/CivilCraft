import { Link } from "@tanstack/react-router";
import { useContactSettings, emptyContactSettings } from "@/lib/cms/contact-settings";
import { BrandMark } from "./BrandMark";

export function SiteFooter() {
  const settings = useContactSettings().data ?? emptyContactSettings;

  return (
    <footer className="relative mt-16 border-t-2 border-border bg-card">
      {/* subtle canyon silhouette along the top edge */}
      <svg
        viewBox="0 0 1200 26"
        aria-hidden="true"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-x-0 -top-[26px] h-[26px] w-full"
      >
        <path
          d="M0 26 0 16 110 8 210 20 320 6 430 18 540 9 660 21 770 11 880 19 1000 7 1110 18 1200 12 1200 26Z"
          fill="var(--card)"
        />
      </svg>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <BrandMark />
          {(() => {
            const links = (["facebook", "youtube", "discord"] as const).filter(
              (k) => settings.social[k],
            );
            if (!links.length && !settings.supportEmail && !settings.address) return null;
            return (
              <div className="mt-6 min-w-0 max-w-sm">
                <h2 className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
                  Connect
                </h2>
                {links.length ? (
                  <ul className="mt-3 flex flex-wrap gap-4 text-sm">
                    {links.map((k) => (
                      <li key={k} className="capitalize">
                        <a
                          href={settings.social[k]}
                          className="text-muted-foreground hover:text-foreground"
                          rel="noreferrer noopener"
                          target="_blank"
                        >
                          {k}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {settings.supportEmail ? (
                  <p className="mt-3 break-words text-sm text-muted-foreground">
                    {settings.supportEmail}
                  </p>
                ) : null}
                {settings.address ? (
                  <p className="text-sm text-muted-foreground">{settings.address}</p>
                ) : null}
              </div>
            );
          })()}
        </div>

        <div className="flex flex-col gap-8 sm:flex-row sm:gap-16 md:justify-self-end lg:gap-24">
          <nav aria-label="Explore">
            <h2 className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
              Explore
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {[
                { to: "/", label: "Home" },
                { to: "/about", label: "About" },
                { to: "/gallery", label: "Gallery" },
                { to: "/download", label: "Download" },
              ].map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="text-muted-foreground hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Support">
            <h2 className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
              Support
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {[
                { to: "/faq", label: "FAQ" },
                { to: "/contact", label: "Contact" },
                { to: "/privacy", label: "Privacy" },
                { to: "/terms", label: "Terms" },
              ].map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="text-muted-foreground hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
      <div className="border-t border-border px-4 py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {settings.siteName}. Student educational project.
      </div>
    </footer>
  );
}
