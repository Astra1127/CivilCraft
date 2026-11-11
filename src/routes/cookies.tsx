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
import {
  CheckCircle2,
  Clock,
  Cookie,
  Layers,
  Lock,
  Mail,
  Sliders,
  Timer,
  XCircle,
} from "lucide-react";

export const Route = createFileRoute("/cookies")({
  head: () => ({
    meta: [
      { title: "Cookie Policy — Civil Craft: Bridge Edition" },
      {
        name: "description",
        content:
          "Player-friendly explanation of cookies and browser storage used by the Civil Craft: Bridge Edition website.",
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
  { id: "storage-categories", title: "3. Types of Browser Storage We Use" },
  { id: "purposes-legal", title: "4. Classification Under Philippine Privacy Law" },
  { id: "managing-storage", title: "5. How to Manage & Clear Storage" },
  { id: "updates-contact", title: "6. Updates & Contact Information" },
];

function CookiesPage() {
  const settings = useContactSettings().data ?? emptyContactSettings;

  return (
    <PublicLayout>
      <PageHeader
        eyebrow="Transparency Disclosure"
        title="Cookie &amp; Browser Storage Policy"
        description="A clear, player-friendly overview of how cookies and browser storage are used on the Civil Craft website."
        actions={
          <div className="flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3.5 py-1 text-xs font-semibold text-gold">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Last Updated: November 10, 2026</span>
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
                ), your browser uses small amounts of local memory to help the website operate
                smoothly. These technologies include standard browser cookies and local web storage.
              </p>
              <p>
                This policy applies specifically to the Civil Craft website and its browser-based
                features. Storage and data processing within the Civil Craft mobile game may be
                covered by our Privacy Policy or a separate in-game privacy notice.
              </p>
              <p>
                We believe in straightforward transparency. This policy explains what information is
                kept on your device, why it is necessary, how long it stays, and how you can manage
                or clear it at any time.
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
                Unlike commercial gaming websites and ad-supported platforms, CivilCraft is an
                educational project built with a strict, privacy-first commitment:
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
                      We do not show advertisements and never place tracking cookies to profile your
                      browsing habits.
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
                      We do not load external analytics trackers, advertising pixels, or cross-site
                      surveillance scripts.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-4">
                  <CheckCircle2 className="h-5 w-5 text-gold shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="text-xs sm:text-sm">
                    <p className="font-semibold text-foreground">
                      Only Essential &amp; Functional Storage
                    </p>
                    <p className="text-muted-foreground mt-0.5">
                      Any data saved on your device is strictly limited to keeping you signed in and
                      remembering your interface preferences.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-4">
                  <CheckCircle2 className="h-5 w-5 text-gold shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="text-xs sm:text-sm">
                    <p className="font-semibold text-foreground">A Simple Storage Notice</p>
                    <p className="text-muted-foreground mt-0.5">
                      Our notice explains browser storage without blocking site access. The
                      &ldquo;Got It&rdquo; button acknowledges that the notice has been displayed;
                      it does not serve as consent to optional tracking or unrelated data
                      processing.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 3 */}
            <section
              id="storage-categories"
              className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24"
            >
              <div className="flex items-center gap-2 text-gold">
                <Layers className="h-5 w-5" aria-hidden="true" />
                <h2 className="font-display text-xl sm:text-2xl text-foreground">
                  3. Types of Browser Storage We Use
                </h2>
              </div>
              <p>
                To provide a secure and responsive experience, CivilCraft uses three simple
                categories of browser storage:
              </p>

              <div className="space-y-4">
                {/* Essential Storage */}
                <div className="rounded-2xl border border-gold/30 bg-gold/5 p-5 sm:p-6 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-gold" aria-hidden="true" />
                      <h3 className="font-display text-lg text-foreground">Essential Storage</h3>
                    </div>
                    <span className="rounded-full bg-gold/10 px-2.5 py-0.5 text-xs font-semibold text-gold border border-gold/20">
                      Required for Sign-In
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed">
                    <strong>How it is used:</strong> Keeps you securely signed in to your player
                    account while you browse the dashboard, review your bridge scores, and inspect
                    your cosmetics. Without this storage, you would have to re-enter your
                    credentials on every page. It also maintains administrative security sessions
                    and notices when your login session has expired so you know when to sign in
                    again.
                  </p>
                  <div className="flex flex-wrap gap-4 pt-1 text-xs text-muted-foreground border-t border-border/60">
                    <p>
                      <strong className="text-foreground">Lifespan:</strong> Player login sessions
                      remain in your browser local storage until you click &ldquo;Sign Out&rdquo;,
                      an expiration is detected, or browser site data is cleared. Administrative
                      session cookies expire after 8 hours.
                    </p>
                    <p>
                      <strong className="text-foreground">Can it be disabled?</strong> Essential for
                      account features; the authenticated player dashboard cannot function without
                      it.
                    </p>
                  </div>
                </div>

                {/* Functional Storage */}
                <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Sliders className="h-4 w-4 text-gold" aria-hidden="true" />
                      <h3 className="font-display text-lg text-foreground">Functional Storage</h3>
                    </div>
                    <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-foreground">
                      User Preferences
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    <strong>How it is used:</strong> Remembers your preferred website display
                    options, such as whether the dashboard sidebar is expanded or collapsed, keeps a
                    local record of your cookie notice acknowledgment so the prompt does not
                    reappear unnecessarily, and remembers which notification alerts you have already
                    read.
                  </p>
                  <div className="flex flex-wrap gap-4 pt-1 text-xs text-muted-foreground border-t border-border/60">
                    <p>
                      <strong className="text-foreground">Lifespan:</strong> The sidebar layout
                      cookie is set for up to 7 days. Preference records in browser local storage
                      remain until you clear your browser site data or an updated policy version is
                      published.
                    </p>
                    <p>
                      <strong className="text-foreground">Can it be disabled?</strong> Yes, through
                      your browser settings, though your layout preferences will reset to default.
                    </p>
                  </div>
                </div>

                {/* Temporary Storage */}
                <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Timer className="h-4 w-4 text-gold" aria-hidden="true" />
                      <h3 className="font-display text-lg text-foreground">Temporary Storage</h3>
                    </div>
                    <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-foreground">
                      Active Tab Only
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    <strong>How it is used:</strong> Holds short-term viewing options while you
                    actively browse (such as your chosen table row density in administrative views).
                    It does not follow you across different browser tabs or record personal browsing
                    habits.
                  </p>
                  <div className="flex flex-wrap gap-4 pt-1 text-xs text-muted-foreground border-t border-border/60">
                    <p>
                      <strong className="text-foreground">Lifespan:</strong> Automatically erased
                      the moment you close your active browser tab or window.
                    </p>
                    <p>
                      <strong className="text-foreground">Can it be disabled?</strong> Leaves no
                      lasting data on your computer once the browser tab is closed.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 4 */}
            <section id="purposes-legal" className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24">
              <h2 className="font-display text-xl sm:text-2xl text-foreground">
                4. Classification Under Philippine Privacy Law
              </h2>
              <p>
                Under the Philippine Data Privacy Act of 2012 (Republic Act No. 10173), Civil Craft
                aims to follow the principles of transparency, legitimate purpose, and
                proportionality when using cookies and browser storage.
              </p>
              <p>
                Our website explains the purpose of each storage category and uses essential storage
                only when necessary to provide requested account features. The &ldquo;Got It&rdquo;
                button acknowledges that the notice has been displayed; it does not serve as consent
                to optional tracking or unrelated data processing.
              </p>
              <ul className="list-disc list-inside space-y-2 pl-1 text-xs sm:text-sm">
                <li>
                  <strong className="text-foreground">Proportionate to Requested Features:</strong>{" "}
                  Data stored on your device is strictly limited to what is reasonably needed to
                  maintain your authenticated player session, preserve interface preferences, and
                  secure website administration.
                </li>
                <li>
                  <strong className="text-foreground">Zero Cross-Site Tracking:</strong> Functional
                  and Temporary Storage operate solely on this website. They are never shared with
                  advertising networks, data brokers, or external analytics firms.
                </li>
              </ul>
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
                You have full control over any data stored by your browser. You can inspect, manage,
                or delete this information at any time:
              </p>
              <ul className="list-disc list-inside space-y-2.5 pl-1">
                <li>
                  <strong className="text-foreground">Clicking &ldquo;Sign Out&rdquo;:</strong>{" "}
                  Whenever you click <strong>Sign Out</strong> in the dashboard or sidebar, your
                  active login session is immediately erased from your browser storage.
                </li>
                <li>
                  <strong className="text-foreground">Clearing Your Browser Cache:</strong> You can
                  delete all cookies and local website data through your browser settings:
                  <ul className="list-circle list-inside ml-5 mt-1.5 space-y-1 text-xs sm:text-sm">
                    <li>
                      <strong>Google Chrome &amp; Microsoft Edge:</strong> Settings &rarr; Privacy
                      and Security &rarr; Clear browsing data (select Cookies and site data).
                    </li>
                    <li>
                      <strong>Mozilla Firefox:</strong> Settings &rarr; Privacy &amp; Security
                      &rarr; Cookies and Site Data &rarr; Clear Data.
                    </li>
                    <li>
                      <strong>Apple Safari:</strong> Settings &rarr; Privacy &rarr; Manage Website
                      Data &rarr; Remove All.
                    </li>
                  </ul>
                </li>
              </ul>
              <div className="rounded-lg border border-border bg-secondary/40 p-3.5 text-xs text-muted-foreground">
                <strong>Player Note:</strong> Clearing your browser data will simply sign you out on
                that device and reset local viewing preferences. Your bridge designs, unlocked
                achievements, and virtual coin balances remain safely stored on our cloud servers.
              </div>
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
                We remember your notice acknowledgment locally on this browser, with the policy
                version and acknowledgment time, until you clear site data. A new policy version
                will show the notice again. This record contains no account identifier and is not
                sent to our servers. If browser storage is unavailable, you can still dismiss the
                notice for the current page visit.
              </p>
              <p>
                As an evolving academic student project, any future updates to how the website uses
                storage will be reflected on this page with an updated &ldquo;Last Updated&rdquo;
                date.
              </p>
              <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                <p className="text-xs sm:text-sm text-muted-foreground">
                  If you have any questions or feedback regarding our use of cookies and browser
                  storage, please reach out to the project team:
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
