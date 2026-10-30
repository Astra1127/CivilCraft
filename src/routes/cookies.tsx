import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/PageHeader";
import { PublicLayout } from "@/components/site/PublicLayout";
import {
  DraftReviewNotice,
  PolicyTabs,
  TableOfContents,
  type TocItem,
} from "@/components/site/PolicyNav";
import { useContactSettings, emptyContactSettings } from "@/lib/cms/contact-settings";
import { CheckCircle2, Clock, Cookie, Info, Mail, ShieldAlert, XCircle } from "lucide-react";

export const Route = createFileRoute("/cookies")({
  head: () => ({
    meta: [
      { title: "Cookie Policy — Civil Craft: Bridge Edition" },
      {
        name: "description",
        content:
          "Verified inventory of cookies and browser storage technologies used by the Civil Craft: Bridge Edition website.",
      },
      { property: "og:title", content: "Cookie Policy — Civil Craft: Bridge Edition" },
      {
        property: "og:description",
        content:
          "Transparency disclosure of browser storage, cookies, and local data handling in Civil Craft: Bridge Edition.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CookiesPage,
});

const TOC_ITEMS: TocItem[] = [
  { id: "overview", title: "1. Introduction to Cookies & Browser Storage" },
  { id: "privacy-principles", title: "2. Our Zero-Tracker Privacy Policy" },
  { id: "verified-technologies", title: "3. Verified Browser Storage Inventory" },
  { id: "purposes-legal", title: "4. Classification Under Philippine Privacy Law" },
  { id: "managing-storage", title: "5. How to Manage & Clear Storage" },
  { id: "updates-contact", title: "6. Updates & Contact Information" },
];

function CookiesPage() {
  const settings = useContactSettings().data ?? emptyContactSettings;
  const supportEmail = settings.supportEmail || "support@civilcraft.game";

  return (
    <PublicLayout>
      <PageHeader
        eyebrow="Transparency Disclosure"
        title="Cookie &amp; Browser Storage Policy"
        description="A verified technical inventory of cookies and local browser storage technologies used by the Civil Craft website."
        actions={
          <div className="flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3.5 py-1 text-xs font-semibold text-gold">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Last Updated: October 30, 2026</span>
          </div>
        }
      />

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <PolicyTabs />

        <div className="mt-8">
          <DraftReviewNotice documentTitle="Cookie &amp; Browser Storage Policy" />
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)] items-start">
          {/* Table of Contents sidebar */}
          <aside className="hidden lg:block">
            <TableOfContents items={TOC_ITEMS} />
          </aside>

          {/* Document Content */}
          <main className="space-y-8 text-sm sm:text-base leading-relaxed text-muted-foreground">
            {/* Mobile Table of Contents */}
            <div className="block lg:hidden">
              <TableOfContents items={TOC_ITEMS} />
            </div>

            {/* Section 1 */}
            <section id="overview" className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24">
              <div className="flex items-center gap-2 text-gold">
                <Cookie className="h-5 w-5" aria-hidden="true" />
                <h2 className="font-display text-xl sm:text-2xl text-foreground">
                  1. Introduction to Cookies &amp; Browser Storage
                </h2>
              </div>
              <p>
                When you visit the <strong>Civil Craft: Bridge Edition</strong> website (
                <Link to="/" className="text-gold underline hover:text-gold/80">
                  civilcraft.game
                </Link>
                ), small pieces of data may be placed or accessed on your device. These technologies
                include:
              </p>
              <ul className="list-disc list-inside space-y-2 pl-1">
                <li>
                  <strong className="text-foreground">HTTP &amp; JavaScript Cookies:</strong> Small
                  text files placed in your browser directory that remember preferences or session
                  states.
                </li>
                <li>
                  <strong className="text-foreground">Local Storage (localStorage):</strong> Web
                  storage provided by your modern browser that retains authenticated player
                  credentials locally so you do not have to log in on every page visit.
                </li>
                <li>
                  <strong className="text-foreground">Session Storage (sessionStorage):</strong>{" "}
                  Ephemeral web storage that automatically clears when you close your active browser
                  tab or window.
                </li>
              </ul>
              <p>
                This policy provides a verified, code-level explanation of every storage key,
                purpose, and retention duration used across the website.
              </p>
            </section>

            {/* Section 2 */}
            <section
              id="privacy-principles"
              className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24"
            >
              <h2 className="font-display text-xl sm:text-2xl text-foreground">
                2. Our Zero-Tracker Privacy Policy
              </h2>
              <p>
                Unlike commercial gaming portals and ad-driven websites, CivilCraft operates with a
                strict, privacy-first architecture:
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-4">
                  <XCircle
                    className="h-5 w-5 text-destructive shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <div className="text-xs sm:text-sm">
                    <p className="font-semibold text-foreground">NO Advertising Cookies</p>
                    <p className="text-muted-foreground mt-0.5">
                      We do not serve ads and never place advertising or cross-site tracking
                      cookies.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-4">
                  <XCircle
                    className="h-5 w-5 text-destructive shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <div className="text-xs sm:text-sm">
                    <p className="font-semibold text-foreground">
                      NO Third-Party Analytics Trackers
                    </p>
                    <p className="text-muted-foreground mt-0.5">
                      We do not load Google Analytics, Meta Pixels, Hotjar, or commercial tracking
                      scripts.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-4">
                  <CheckCircle2 className="h-5 w-5 text-gold shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="text-xs sm:text-sm">
                    <p className="font-semibold text-foreground">
                      Only Strictly Necessary &amp; Functional Storage
                    </p>
                    <p className="text-muted-foreground mt-0.5">
                      Data stored in your browser is strictly limited to maintaining your sign-in
                      session and UI settings.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-4">
                  <CheckCircle2 className="h-5 w-5 text-gold shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="text-xs sm:text-sm">
                    <p className="font-semibold text-foreground">
                      No Intrusive Cookie Banner Required
                    </p>
                    <p className="text-muted-foreground mt-0.5">
                      Because we use zero non-essential marketing trackers, consent-gating banners
                      are not required by privacy regulations.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 3 */}
            <section
              id="verified-technologies"
              className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24"
            >
              <h2 className="font-display text-xl sm:text-2xl text-foreground">
                3. Verified Browser Storage Inventory
              </h2>
              <p>
                The table below details all browser storage keys verified in the current CivilCraft
                codebase:
              </p>

              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-muted text-foreground font-semibold">
                    <tr>
                      <th className="p-3">Technology / Key</th>
                      <th className="p-3">Category</th>
                      <th className="p-3">Purpose</th>
                      <th className="p-3">Lifespan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-muted-foreground">
                    <tr className="hover:bg-muted/30">
                      <td className="p-3 font-mono font-medium text-foreground">sidebar_state</td>
                      <td className="p-3">
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-foreground">
                          Cookie (Client)
                        </span>
                      </td>
                      <td className="p-3">
                        Remembers whether the dashboard sidebar is expanded or collapsed across page
                        navigations.
                      </td>
                      <td className="p-3">7 days (604,800s)</td>
                    </tr>
                    <tr className="hover:bg-muted/30">
                      <td className="p-3 font-mono font-medium text-foreground">
                        civilcraft_admin_session
                      </td>
                      <td className="p-3">
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-foreground">
                          Cookie (Server HttpOnly)
                        </span>
                      </td>
                      <td className="p-3">
                        Strictly necessary session token for verified staff/admin dashboard logins.
                        Not issued to normal players.
                      </td>
                      <td className="p-3">Active Session (Max 8h)</td>
                    </tr>
                    <tr className="hover:bg-muted/30">
                      <td className="p-3 font-mono font-medium text-foreground">
                        civilcraft.session.player.v1
                      </td>
                      <td className="p-3">
                        <span className="rounded-full bg-gold/10 text-gold px-2 py-0.5 text-xs font-semibold">
                          localStorage
                        </span>
                      </td>
                      <td className="p-3">
                        Maintains active PlayFab player authentication ticket and basic player
                        identity so you stay signed in.
                      </td>
                      <td className="p-3">Persistent until Sign Out</td>
                    </tr>
                    <tr className="hover:bg-muted/30">
                      <td className="p-3 font-mono font-medium text-foreground">
                        civilcraft.session.end_reason.v1
                      </td>
                      <td className="p-3">
                        <span className="rounded-full bg-gold/10 text-gold px-2 py-0.5 text-xs font-semibold">
                          localStorage
                        </span>
                      </td>
                      <td className="p-3">
                        Stores session expiry status to inform the player when a re-login is
                        required.
                      </td>
                      <td className="p-3">Cleared upon new login</td>
                    </tr>
                    <tr className="hover:bg-muted/30">
                      <td className="p-3 font-mono font-medium text-foreground">
                        civilcraft.cms.v1
                      </td>
                      <td className="p-3">
                        <span className="rounded-full bg-gold/10 text-gold px-2 py-0.5 text-xs font-semibold">
                          localStorage
                        </span>
                      </td>
                      <td className="p-3">
                        Local preview cache for news, releases, and FAQ items in offline
                        demonstration or testing environments.
                      </td>
                      <td className="p-3">Persistent in demo mode</td>
                    </tr>
                    <tr className="hover:bg-muted/30">
                      <td className="p-3 font-mono font-medium text-foreground">
                        unlocked-levels-&lt;id&gt;
                      </td>
                      <td className="p-3">
                        <span className="rounded-full bg-gold/10 text-gold px-2 py-0.5 text-xs font-semibold">
                          localStorage
                        </span>
                      </td>
                      <td className="p-3">
                        Local client-side cache of completed level IDs to optimize dashboard load
                        performance.
                      </td>
                      <td className="p-3">Persistent until cleared</td>
                    </tr>
                    <tr className="hover:bg-muted/30">
                      <td className="p-3 font-mono font-medium text-foreground">
                        civilcraft.admin.directory.rows
                      </td>
                      <td className="p-3">
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-foreground">
                          sessionStorage
                        </span>
                      </td>
                      <td className="p-3">
                        Remembers the selected rows-per-page setting in the admin player directory
                        table.
                      </td>
                      <td className="p-3">Browser tab session</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Section 4 */}
            <section id="purposes-legal" className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24">
              <h2 className="font-display text-xl sm:text-2xl text-foreground">
                4. Classification Under Philippine Privacy Law
              </h2>
              <p>
                Under Republic Act No. 10173 (Philippine Data Privacy Act of 2012) and international
                privacy best practices, browser storage technologies are categorized based on their
                technical necessity:
              </p>
              <div className="space-y-3">
                <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-1">
                  <p className="font-semibold text-foreground">Strictly Necessary Storage</p>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Technologies required to provide the digital service explicitly requested by the
                    user. In CivilCraft, this covers the PlayFab player authentication ticket in{" "}
                    <code>localStorage</code> and staff session cookies. Under Philippine data
                    privacy principles, strictly necessary authentication data does not require
                    separate cookie consent banners because it is essential to fulfilling the player
                    account agreement.
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-1">
                  <p className="font-semibold text-foreground">Functional UI Preferences</p>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Technologies that remember user interface choices to improve user experience
                    (such as <code>sidebar_state</code>). These do not track your browsing activity
                    across other websites and do not build marketing profiles.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 5 */}
            <section
              id="managing-storage"
              className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24"
            >
              <h2 className="font-display text-xl sm:text-2xl text-foreground">
                5. How to Manage &amp; Clear Storage
              </h2>
              <p>
                You retain full control over the data stored in your browser. You can inspect or
                clear your stored cookies and local data at any time:
              </p>
              <ul className="list-disc list-inside space-y-2 pl-1">
                <li>
                  <strong className="text-foreground">Signing Out:</strong> Clicking{" "}
                  <strong>Sign Out</strong> in the player dashboard or sidebar immediately purges
                  your session token (<code>civilcraft.session.player.v1</code>) from browser{" "}
                  <code>localStorage</code>.
                </li>
                <li>
                  <strong className="text-foreground">Browser Settings:</strong> You can clear
                  cookies and site data through your browser settings:
                  <ul className="list-circle list-inside ml-5 mt-1 space-y-1 text-xs sm:text-sm">
                    <li>
                      <strong>Google Chrome / Microsoft Edge:</strong> Settings &rarr; Privacy and
                      Security &rarr; Clear browsing data (select Cookies and other site data).
                    </li>
                    <li>
                      <strong>Mozilla Firefox:</strong> Settings &rarr; Privacy &amp; Security
                      &rarr; Cookies and Site Data &rarr; Clear Data.
                    </li>
                    <li>
                      <strong>Apple Safari:</strong> Preferences &rarr; Privacy &rarr; Manage
                      Website Data &rarr; Remove All.
                    </li>
                  </ul>
                </li>
              </ul>
              <p className="text-xs text-muted-foreground">
                Note: Clearing <code>localStorage</code> will sign you out of CivilCraft on that
                browser. Your game progression and items remain safely stored on PlayFab cloud
                servers.
              </p>
            </section>

            {/* Section 6 */}
            <section id="updates-contact" className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24">
              <div className="flex items-center gap-2 text-gold">
                <Mail className="h-5 w-5" aria-hidden="true" />
                <h2 className="font-display text-xl sm:text-2xl text-foreground">
                  6. Updates &amp; Contact Information
                </h2>
              </div>
              <p>
                If we introduce new functional storage technologies or modify existing keys as part
                of our academic capstone development, this Cookie Policy will be updated accordingly
                with a revised &ldquo;Last Updated&rdquo; date.
              </p>
              <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                <p className="text-xs sm:text-sm text-muted-foreground">
                  For technical or privacy inquiries concerning browser storage and cookies in Civil
                  Craft:
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link
                    to="/contact"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gold px-4 py-2 text-xs font-semibold text-stone-900 hover:bg-gold/90 transition-colors"
                  >
                    <span>Contact the Team</span>
                  </Link>
                  {settings.supportEmail ? (
                    <a
                      href={`mailto:${settings.supportEmail}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-secondary/50 px-4 py-2 text-xs font-semibold text-foreground hover:bg-secondary transition-colors"
                    >
                      <span>Email: {settings.supportEmail}</span>
                    </a>
                  ) : null}
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>
    </PublicLayout>
  );
}
