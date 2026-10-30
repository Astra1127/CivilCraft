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
import { Clock, ExternalLink, FileCheck, Lock, Mail, Shield } from "lucide-react";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Civil Craft: Bridge Edition" },
      {
        name: "description",
        content:
          "Privacy policy explaining personal data handling, storage, user rights under the Philippine Data Privacy Act (RA 10173), and third-party services in Civil Craft.",
      },
      { property: "og:title", content: "Privacy Policy — Civil Craft: Bridge Edition" },
      {
        property: "og:description",
        content:
          "Transparency report and data protection guidelines for the Civil Craft: Bridge Edition student capstone project.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PrivacyPage,
});

const TOC_ITEMS: TocItem[] = [
  { id: "privacy-scope", title: "1. About CivilCraft & Legal Framework (RA 10173)" },
  { id: "information-collected", title: "2. Personal Information We Collect" },
  { id: "purposes-processing", title: "3. Purposes & Legal Bases for Processing" },
  { id: "third-party-services", title: "4. Third-Party Service Providers & Cloud Storage" },
  { id: "data-retention", title: "5. Data Retention & Archival Timeline" },
  { id: "data-security", title: "6. Security Measures & Technical Safeguards" },
  { id: "data-subject-rights", title: "7. Your Rights Under Philippine Data Privacy Law" },
  { id: "deletion-process", title: "8. Account Deletion & Right to Erasure" },
  { id: "cookies-reference", title: "9. Cookies & Local Browser Storage" },
  { id: "contact-dpo", title: "10. Contact Us & Data Protection Inquiries" },
];

function PrivacyPage() {
  const settings = useContactSettings().data ?? emptyContactSettings;
  const supportEmail = settings.supportEmail || "support@civilcraft.game";

  return (
    <PublicLayout>
      <PageHeader
        eyebrow="Data Protection"
        title="Privacy Policy"
        description="How Civil Craft: Bridge Edition collects, protects, and handles player data under the Philippine Data Privacy Act of 2012."
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
          <DraftReviewNotice documentTitle="Privacy Policy" />
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
            <section id="privacy-scope" className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24">
              <div className="flex items-center gap-2 text-gold">
                <Shield className="h-5 w-5" aria-hidden="true" />
                <h2 className="font-display text-xl sm:text-2xl text-foreground">
                  1. About CivilCraft &amp; Legal Framework (RA 10173)
                </h2>
              </div>
              <p>
                <strong>Civil Craft: Bridge Edition</strong> (&ldquo;CivilCraft&rdquo;,
                &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;the project&rdquo;) is an academic
                capstone research project developed by an undergraduate student team in the Republic
                of the Philippines. This Privacy Policy describes our practices regarding the
                collection, use, storage, and disclosure of personal data obtained through the
                CivilCraft website (
                <Link to="/" className="text-gold underline hover:text-gold/80">
                  civilcraft.game
                </Link>
                ) and the CivilCraft Android mobile application.
              </p>
              <p>
                As a personal information controller (PIC) operating in the Philippines, CivilCraft
                is committed to processing personal data in accordance with{" "}
                <strong>Republic Act No. 10173</strong>, otherwise known as the{" "}
                <strong>Data Privacy Act of 2012 (DPA)</strong>, its Implementing Rules and
                Regulations (IRR), and the policy advisories issued by the{" "}
                <strong>National Privacy Commission (NPC)</strong>. We adhere strictly to the
                fundamental principles of{" "}
                <strong>transparency, legitimate purpose, and proportionality</strong>.
              </p>
            </section>

            {/* Section 2 */}
            <section
              id="information-collected"
              className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24"
            >
              <h2 className="font-display text-xl sm:text-2xl text-foreground">
                2. Personal Information We Collect
              </h2>
              <p>
                We only collect personal information that is reasonably necessary to provide game
                functionality, maintain secure accounts, and evaluate educational outcomes. The data
                collected consists of:
              </p>

              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-2">
                  <h3 className="font-display text-base text-foreground">
                    A. Account Registration Data
                  </h3>
                  <p className="text-xs sm:text-sm">
                    When you create an account, we collect your chosen <strong>username</strong>,{" "}
                    <strong>login email address</strong>, and <strong>password</strong>. Passwords
                    are salted, hashed, and processed securely by Microsoft Azure PlayFab. The
                    website never stores or views plaintext passwords. We also record the timestamp
                    and version of the Terms and Privacy Policy accepted during registration.
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-2">
                  <h3 className="font-display text-base text-foreground">
                    B. Contact &amp; Communication Data
                  </h3>
                  <p className="text-xs sm:text-sm">
                    If you add a secondary <strong>contact email</strong> in Player Settings, it is
                    saved to your PlayFab profile for important account notifications. When you
                    submit inquiries through our{" "}
                    <Link to="/contact" className="text-gold underline">
                      Contact form
                    </Link>{" "}
                    or submit in-game bug reports, we collect your name, email address, message
                    subject, message content, and submitted screenshots.
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-2">
                  <h3 className="font-display text-base text-foreground">
                    C. Gameplay, Bridge Blueprints &amp; Almanac Progression
                  </h3>
                  <p className="text-xs sm:text-sm">
                    As you play, the game synchronizes progression data with PlayFab servers,
                    including current level, total XP, bridge completion scores, challenge statuses,
                    unlocked achievements, discovered Almanac engineering concepts, custom chibi
                    cosmetic loadout IDs, and your encrypted level save files (
                    <code>playerSaveData.json</code>).
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-2">
                  <h3 className="font-display text-base text-foreground">
                    D. Virtual Coin Transactions
                  </h3>
                  <p className="text-xs sm:text-sm">
                    If you purchase in-game coins, payment checkout is handled directly by{" "}
                    <strong>PayMongo</strong>. CivilCraft only receives an external checkout
                    reference, payment status, timestamp, and purchased coin amount.{" "}
                    <strong>
                      We never collect, process, or store credit card numbers, CVVs, or GCash/Maya
                      PINs.
                    </strong>
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground">Technologies We DO NOT Use:</p>
                <p>
                  CivilCraft does <strong>NOT</strong> use third-party advertising cookies, Google
                  Analytics, Meta (Facebook) tracking pixels, behavioral cross-site tracking
                  scripts, or commercial surveillance software.
                </p>
              </div>
            </section>

            {/* Section 3 */}
            <section
              id="purposes-processing"
              className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24"
            >
              <h2 className="font-display text-xl sm:text-2xl text-foreground">
                3. Purposes &amp; Legal Bases for Processing
              </h2>
              <p>
                We process your personal data for the following specific purposes and under the
                following legal bases recognized by the Philippine Data Privacy Act:
              </p>
              <ul className="list-disc list-inside space-y-2.5 pl-1">
                <li>
                  <strong className="text-foreground">
                    Providing Account &amp; Cross-Platform Services (Contractual Necessity):
                  </strong>{" "}
                  To register your player identity, authenticate your logins, and synchronize bridge
                  designs between the Android APK and web dashboard.
                </li>
                <li>
                  <strong className="text-foreground">
                    Leaderboards &amp; Academic Competition (Legitimate Project Interest):
                  </strong>{" "}
                  To display public bridge-building scores, rankings, and player display names on
                  global leaderboards.
                </li>
                <li>
                  <strong className="text-foreground">Email Updates (Express Consent):</strong> To
                  send email notifications regarding new game builds, major releases, and research
                  updates. We only send marketing or update announcements if you explicitly opted in
                  during registration or toggled Email Updates ON in Player Settings. You may revoke
                  consent at any time.
                </li>
                <li>
                  <strong className="text-foreground">
                    System Stability &amp; Security (Legitimate Project Interest):
                  </strong>{" "}
                  To detect botting, prevent leaderboard tampering, debug software defects, and
                  maintain server infrastructure.
                </li>
              </ul>
            </section>

            {/* Section 4 */}
            <section
              id="third-party-services"
              className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24"
            >
              <h2 className="font-display text-xl sm:text-2xl text-foreground">
                4. Third-Party Service Providers &amp; Cloud Storage
              </h2>
              <p>
                CivilCraft collaborates with established cloud and technology providers to deliver
                backend functionality. We ensure that all external processors adhere to robust data
                protection and confidentiality standards:
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-card p-4 space-y-1.5">
                  <h3 className="font-display text-base text-foreground">
                    Microsoft Azure PlayFab
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Backend-as-a-Service powering player accounts, progression UserData, statistics,
                    character entity files, and CloudScript handlers. Data is stored in secure
                    Microsoft cloud data centers subject to Microsoft Enterprise Privacy Standards.
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-card p-4 space-y-1.5">
                  <h3 className="font-display text-base text-foreground">PayMongo Payments</h3>
                  <p className="text-xs text-muted-foreground">
                    Bangko Sentral ng Pilipinas (BSP)-regulated payment gateway handling checkout
                    for digital wallets (GCash, Maya) and bank cards. PCI-DSS Level 1 certified.
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-card p-4 space-y-1.5">
                  <h3 className="font-display text-base text-foreground">
                    PostgreSQL Currency Database
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Dedicated server-side relational database storing player virtual coin balances
                    and immutable purchase receipts.
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-card p-4 space-y-1.5">
                  <h3 className="font-display text-base text-foreground">
                    Vercel &amp; Cloud Infrastructure
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Hosting the web application, static game assets, and serverless Nitro API
                    endpoints under modern HTTPS/TLS encryption.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 5 */}
            <section id="data-retention" className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24">
              <h2 className="font-display text-xl sm:text-2xl text-foreground">
                5. Data Retention &amp; Archival Timeline
              </h2>
              <p>
                Personal data is retained only for as long as necessary to fulfill the educational
                research purposes of the CivilCraft capstone project or to satisfy statutory
                obligations under Philippine law:
              </p>
              <ul className="list-disc list-inside space-y-2 pl-1">
                <li>
                  <strong className="text-foreground">Player Accounts &amp; Game Saves:</strong>{" "}
                  Retained while the account is active. Accounts inactive for extended periods may
                  be archived following the conclusion of the academic evaluation.
                </li>
                <li>
                  <strong className="text-foreground">Financial &amp; Receipt Records:</strong> Coin
                  purchase receipts and transaction references are maintained in accordance with
                  database ledger immutability triggers (<code>permanent_receipt</code>). In the
                  event of account deletion, personal identifiers are pseudonymized/anonymized while
                  financial ledger totals are retained for accounting integrity.
                </li>
                <li>
                  <strong className="text-foreground">Contact &amp; Bug Reports:</strong> Retained
                  until the relevant support ticket or software bug is resolved and verified.
                </li>
              </ul>
              <div className="rounded-lg border border-border bg-secondary/40 p-3.5 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Institutional Review Notice:</span>{" "}
                Long-term academic data archiving and destruction schedules following the final
                thesis defense remain subject to university department guidelines.
              </div>
            </section>

            {/* Section 6 */}
            <section id="data-security" className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24">
              <div className="flex items-center gap-2 text-gold">
                <Lock className="h-5 w-5" aria-hidden="true" />
                <h2 className="font-display text-xl sm:text-2xl text-foreground">
                  6. Security Measures &amp; Technical Safeguards
                </h2>
              </div>
              <p>
                In compliance with Section 20 of the Data Privacy Act of 2012, CivilCraft implements
                organizational, physical, and technical measures to protect personal data against
                accidental loss, unauthorized access, or unlawful processing:
              </p>
              <ul className="list-disc list-inside space-y-2 pl-1">
                <li>
                  <strong className="text-foreground">Transport Layer Encryption:</strong> All web
                  and mobile API communications are enforced over modern HTTPS/TLS (Transport Layer
                  Security) protocols.
                </li>
                <li>
                  <strong className="text-foreground">Credential Isolation:</strong> Master PlayFab
                  secret keys, payment secret keys, and database credentials reside strictly on
                  server environments and are never sent to player browsers or mobile APKs.
                </li>
                <li>
                  <strong className="text-foreground">Admin Session Protection:</strong>{" "}
                  Administrative endpoints are guarded by server-verified, HttpOnly session cookies
                  with strict cross-site scripting (XSS) defenses.
                </li>
                <li>
                  <strong className="text-foreground">Reauthentication Verification:</strong>{" "}
                  Critical account modifications (such as changing your contact email) require
                  password reauthentication to prevent unauthorized hijacking.
                </li>
              </ul>
            </section>

            {/* Section 7 */}
            <section
              id="data-subject-rights"
              className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24"
            >
              <div className="flex items-center gap-2 text-gold">
                <FileCheck className="h-5 w-5" aria-hidden="true" />
                <h2 className="font-display text-xl sm:text-2xl text-foreground">
                  7. Your Rights Under Philippine Data Privacy Law
                </h2>
              </div>
              <p>
                Under Section 16 of the Data Privacy Act of 2012 (RA 10173), registered players and
                website visitors possess the following statutory data privacy rights:
              </p>

              <div className="grid gap-3 sm:grid-cols-2 text-xs sm:text-sm">
                <div className="rounded-xl border border-border bg-card p-3.5 space-y-1">
                  <p className="font-semibold text-foreground">1. Right to be Informed</p>
                  <p className="text-muted-foreground">
                    You have the right to know whether your personal data is being processed, and to
                    receive full disclosure regarding how it is handled.
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-card p-3.5 space-y-1">
                  <p className="font-semibold text-foreground">2. Right to Access</p>
                  <p className="text-muted-foreground">
                    You have the right to inspect and view the progression data, profile
                    information, and statistics stored about your account.
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-card p-3.5 space-y-1">
                  <p className="font-semibold text-foreground">3. Right to Rectification</p>
                  <p className="text-muted-foreground">
                    You can dispute and correct inaccurate or incomplete data, such as updating your
                    contact email directly in Player Settings.
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-card p-3.5 space-y-1">
                  <p className="font-semibold text-foreground">4. Right to Object</p>
                  <p className="text-muted-foreground">
                    You may refuse or withdraw consent for optional processing, such as toggling off
                    Email Updates at any time in Player Settings.
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-card p-3.5 space-y-1">
                  <p className="font-semibold text-foreground">5. Right to Erasure or Blocking</p>
                  <p className="text-muted-foreground">
                    You have the right to request the suspension, withdrawal, or removal of your
                    personal data when no longer needed for lawful purposes.
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-card p-3.5 space-y-1">
                  <p className="font-semibold text-foreground">6. Right to File a Complaint</p>
                  <p className="text-muted-foreground">
                    If you believe your privacy rights have been violated, you have the right to
                    file a formal complaint with the National Privacy Commission.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 8 */}
            <section
              id="deletion-process"
              className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24"
            >
              <h2 className="font-display text-xl sm:text-2xl text-foreground">
                8. Account Deletion &amp; Right to Erasure
              </h2>
              <p>
                We honor your right to erasure. Because CivilCraft distributes player saves,
                cosmetic files, leaderboard rankings, and currency accounts across multiple
                connected services, complete deletion requires synchronized data erasure:
              </p>
              <div className="rounded-lg border border-amber-600/30 bg-amber-500/10 p-4 text-xs sm:text-sm text-foreground space-y-1.5">
                <p className="font-semibold text-amber-900 dark:text-amber-400">
                  Current Self-Service Deletion Status: Unavailable
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  Automated one-click deletion is currently offline in the player dashboard while
                  backend multi-system synchronization is being finalized. No simulated deletion
                  requests are queued automatically from the browser.
                </p>
              </div>
              <p>
                To request permanent account deletion during this academic evaluation phase, please
                submit a verified request through the{" "}
                <Link to="/contact" className="text-gold underline hover:text-gold/80">
                  Contact page
                </Link>{" "}
                using the email associated with your player account. Our team will verify your
                identity, purge your PlayFab master credentials and entity files, and anonymize any
                related database receipts.
              </p>
            </section>

            {/* Section 9 */}
            <section
              id="cookies-reference"
              className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24"
            >
              <h2 className="font-display text-xl sm:text-2xl text-foreground">
                9. Cookies &amp; Local Browser Storage
              </h2>
              <p>
                CivilCraft uses minimal browser storage strictly necessary for authentication and
                user interface preferences. We do not use advertising or tracking cookies.
              </p>
              <p>
                For a complete technical inventory of all cookies, <code>localStorage</code> keys,
                and <code>sessionStorage</code> tokens verified in our codebase, please review our
                separate{" "}
                <Link
                  to="/cookies"
                  className="text-gold font-semibold underline hover:text-gold/80"
                >
                  Cookie &amp; Browser Storage Policy
                </Link>
                .
              </p>
            </section>

            {/* Section 10 */}
            <section id="contact-dpo" className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24">
              <div className="flex items-center gap-2 text-gold">
                <Mail className="h-5 w-5" aria-hidden="true" />
                <h2 className="font-display text-xl sm:text-2xl text-foreground">
                  10. Contact Us &amp; Data Protection Inquiries
                </h2>
              </div>
              <p>
                If you have questions about this Privacy Policy, wish to exercise any of your
                statutory data privacy rights, or wish to submit an inquiry regarding your personal
                data, please contact the CivilCraft research team:
              </p>

              <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                <div className="flex flex-wrap gap-3">
                  <Link
                    to="/contact"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gold px-4 py-2 text-xs font-semibold text-stone-900 hover:bg-gold/90 transition-colors"
                  >
                    <span>Contact Form</span>
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
                <div className="pt-2 text-xs text-muted-foreground border-t border-border/60">
                  <p>
                    <strong>National Privacy Commission (Philippines):</strong> If you are
                    dissatisfied with our response, you have the right to contact the National
                    Privacy Commission at{" "}
                    <a
                      href="https://privacy.gov.ph"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gold underline inline-flex items-center gap-1"
                    >
                      <span>privacy.gov.ph</span>
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                    .
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground/80">
                    * Formal Data Protection Officer (DPO) institutional registration with the NPC
                    remains subject to academic department appointment.
                  </p>
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>
    </PublicLayout>
  );
}
