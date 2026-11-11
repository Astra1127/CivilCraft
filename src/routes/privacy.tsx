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
import { usePublicPolicy } from "@/lib/cms/policies";
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
  const { data: dynamicPolicy } = usePublicPolicy("privacy");
  const lastUpdated = dynamicPolicy?.lastUpdated ?? "November 10, 2026";
  const isCustomRevision = Boolean(
    dynamicPolicy && dynamicPolicy.version && dynamicPolicy.version !== "2026-11-10",
  );

  const tocItems: TocItem[] =
    isCustomRevision && dynamicPolicy?.sections?.length
      ? dynamicPolicy.sections.map((sec, idx) => ({
          id: sec.id,
          title: sec.title.startsWith(`${idx + 1}.`) ? sec.title : `${idx + 1}. ${sec.title}`,
        }))
      : TOC_ITEMS;

  return (
    <PublicLayout>
      <PageHeader
        eyebrow="Data Protection"
        title="Privacy Policy"
        description="How Civil Craft: Bridge Edition collects, protects, and handles player data under the Philippine Data Privacy Act of 2012."
        actions={
          <div className="flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3.5 py-1 text-xs font-semibold text-gold">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Last Updated: {lastUpdated}</span>
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
            <TableOfContents items={tocItems} />
          </aside>

          {/* Document Content */}
          <main className="space-y-8 text-sm sm:text-base leading-relaxed text-muted-foreground">
            {/* Mobile Table of Contents */}
            <div className="block lg:hidden">
              <TableOfContents items={tocItems} />
            </div>

            {isCustomRevision && dynamicPolicy?.sections?.length ? (
              dynamicPolicy.sections.map((sec, idx) => (
                <section
                  key={sec.id}
                  id={sec.id}
                  className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24"
                >
                  <div className="flex items-center gap-2 text-gold">
                    <Shield className="h-5 w-5" aria-hidden="true" />
                    <h2 className="font-display text-xl sm:text-2xl text-foreground">
                      {sec.title.startsWith(`${idx + 1}.`) ? sec.title : `${idx + 1}. ${sec.title}`}
                    </h2>
                  </div>
                  <div className="space-y-4 text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {sec.content}
                  </div>
                </section>
              ))
            ) : (
              <>
                {/* Section 1 */}
                <section
                  id="privacy-scope"
                  className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24"
                >
                  <div className="flex items-center gap-2 text-gold">
                    <Shield className="h-5 w-5" aria-hidden="true" />
                    <h2 className="font-display text-xl sm:text-2xl text-foreground">
                      1. About CivilCraft &amp; Legal Framework (RA 10173)
                    </h2>
                  </div>
                  <p>
                    Civil Craft: Bridge Edition is an academic capstone project developed by an
                    undergraduate student team in the Philippines. This Privacy Policy explains how
                    personal data is collected, used, stored, and protected through the Civil Craft
                    website (
                    <Link to="/" className="text-gold underline hover:text-gold/80">
                      civilcraft.game
                    </Link>
                    ) and Android application. The responsible Personal Information Controller and
                    its designated privacy contact will be identified in the final institutional
                    version of this policy.
                  </p>
                  <p>
                    In conducting this educational project, CivilCraft aims to process personal data
                    in accordance with <strong>Republic Act No. 10173</strong>, otherwise known as
                    the <strong>Data Privacy Act of 2012 (DPA)</strong>, its Implementing Rules and
                    Regulations (IRR), and guidance from the{" "}
                    <strong>National Privacy Commission (NPC)</strong>. We adhere to the fundamental
                    principles of{" "}
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
                    We only collect personal information that is reasonably necessary to provide
                    game functionality, maintain secure accounts, and evaluate educational outcomes.
                    The data collected consists of:
                  </p>

                  <div className="space-y-4">
                    <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-2">
                      <h3 className="font-display text-base text-foreground">
                        A. Account Registration Data
                      </h3>
                      <p className="text-xs sm:text-sm">
                        When you create an account, we collect your chosen <strong>username</strong>
                        , <strong>login email address</strong>, and <strong>password</strong>.
                        Password authentication is handled through Microsoft Azure PlayFab. Civil
                        Craft does not directly store or access players&apos; plaintext passwords.
                        We also record the timestamp and version of the Terms and Privacy Policy
                        accepted during registration.
                      </p>
                    </div>

                    <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-2">
                      <h3 className="font-display text-base text-foreground">
                        B. Contact &amp; Support Messages
                      </h3>
                      <p className="text-xs sm:text-sm">
                        If you add a secondary <strong>contact email</strong> in Player Settings, it
                        is saved to your PlayFab profile for important account notifications. When
                        you submit inquiries through our{" "}
                        <Link to="/contact" className="text-gold underline">
                          Contact form
                        </Link>
                        , we collect your name, email address, message subject, and message text.
                        For registered players, support replies can be viewed privately in the
                        Player Dashboard. Users should never submit passwords, payment credentials,
                        digital wallet PINs, or unnecessary sensitive personal information in
                        message forms.
                      </p>
                    </div>

                    <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-2">
                      <h3 className="font-display text-base text-foreground">
                        C. Gameplay, Bridge Blueprints &amp; Almanac Progression
                      </h3>
                      <p className="text-xs sm:text-sm">
                        As you play, the game synchronizes progression data with PlayFab servers,
                        including current level, total score, bridge completion records, challenge
                        statuses, unlocked achievements, discovered Almanac engineering concepts,
                        custom chibi cosmetic loadout IDs, and your encrypted level save files (
                        <code>playerSaveData.json</code>).
                      </p>
                    </div>

                    <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-2">
                      <h3 className="font-display text-base text-foreground">
                        D. Virtual Coin Transactions (Test Environment)
                      </h3>
                      <p className="text-xs sm:text-sm">
                        Optional virtual coin checkout is currently conducted in test/sandbox mode
                        through <strong>PayMongo</strong>; no real money is charged. CivilCraft only
                        receives an external checkout reference, payment status, timestamp, and
                        purchased coin amount.{" "}
                        <strong>
                          We never collect, process, or store credit card numbers, CVVs, or digital
                          wallet PINs.
                        </strong>{" "}
                        Donations are not supported.
                      </p>
                    </div>

                    <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-2">
                      <h3 className="font-display text-base text-foreground">
                        E. Player Feedback &amp; Public Testimonials
                      </h3>
                      <p className="text-xs sm:text-sm">
                        When signed-in players submit game feedback through the Player Dashboard, we
                        record the star rating, category, feedback text, and your explicit consent
                        choice regarding public display (<code>allowPublicTestimonial</code>). Only
                        feedback with explicit consent that is approved by project administrators is
                        shown on public pages. You may revoke public permission at any time.
                      </p>
                    </div>

                    <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-2">
                      <h3 className="font-display text-base text-foreground">
                        F. Diagnostic &amp; Security Logs
                      </h3>
                      <p className="text-xs sm:text-sm">
                        Our server infrastructure logs operational security events, error
                        diagnostics, and administrative moderation actions (such as temporary bans
                        for leaderboard tampering). These logs are used strictly to maintain server
                        stability and defend against unauthorized API access.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground space-y-1">
                    <p className="font-semibold text-foreground">Technologies We DO NOT Use:</p>
                    <p>
                      CivilCraft does <strong>NOT</strong> use third-party advertising cookies,
                      Google Analytics, Meta (Facebook) tracking pixels, behavioral cross-site
                      tracking scripts, or commercial surveillance software.
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
                      To register your player identity, authenticate your logins, and synchronize
                      bridge designs between the Android APK and web dashboard.
                    </li>
                    <li>
                      <strong className="text-foreground">
                        Academic Capstone Evaluation (Academic Research &amp; Evaluation):
                      </strong>{" "}
                      Certain gameplay results, quiz scores, and challenge completion records may be
                      used to evaluate the educational functionality of Civil Craft as part of the
                      student capstone project. Where possible, evaluation results will be presented
                      in aggregated or anonymized form. Any additional personal data collected
                      through surveys or research activities will be explained in the applicable
                      research consent and privacy notices.
                    </li>
                    <li>
                      <strong className="text-foreground">
                        Leaderboards &amp; Public Visibility (Legitimate Project Interest):
                      </strong>{" "}
                      To display bridge-building rankings and player display names on the global
                      Overall Leaderboard and Quest/Level Leaderboards. Display names, ranks,
                      levels, total scores, bridges completed, and challenges completed are visible
                      to any public visitor browsing the website. Note that the application
                      currently does not provide an in-game option to hide or opt out from public
                      leaderboard rankings once records are submitted.
                    </li>
                    <li>
                      <strong className="text-foreground">Email Updates (Express Consent):</strong>{" "}
                      To send email notifications regarding new game builds, major releases, and
                      research updates. We only send update announcements if you explicitly opted in
                      during registration or toggled Email Updates ON in Player Settings. You may
                      revoke consent at any time.
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
                    CivilCraft collaborates with established cloud and technology providers to
                    deliver backend functionality. External processors handle specific data
                    categories under their respective service agreements:
                  </p>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-border bg-card p-4 space-y-1.5">
                      <h3 className="font-display text-base text-foreground">
                        Microsoft Azure PlayFab
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Backend-as-a-Service powering player accounts, progression UserData,
                        statistics, character entity files, and CloudScript handlers. Data is stored
                        in Microsoft cloud data centers subject to Microsoft Enterprise Privacy
                        Standards.
                      </p>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-4 space-y-1.5">
                      <h3 className="font-display text-base text-foreground">
                        PayMongo Payments (Test Mode)
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Payment gateway utilized in sandbox/test mode to simulate checkout flows for
                        virtual coin packages; no live real-money payments are processed.
                      </p>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-4 space-y-1.5">
                      <h3 className="font-display text-base text-foreground">
                        PostgreSQL Currency Database
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Dedicated server-side relational database storing player virtual coin
                        balances and immutable purchase receipts.
                      </p>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-4 space-y-1.5">
                      <h3 className="font-display text-base text-foreground">
                        Vercel &amp; Vercel Blob
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Hosting the web application, serverless Nitro API endpoints, static assets,
                        and secure object storage for APK releases and gallery media.
                      </p>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-4 space-y-1.5">
                      <h3 className="font-display text-base text-foreground">
                        Transactional Email Services
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        SMTP services via Nodemailer (e.g. Gmail SMTP or PlayFab SMTP add-on) and
                        Resend used solely for password recovery, release announcements, and contact
                        form notifications.
                      </p>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-4 space-y-1.5">
                      <h3 className="font-display text-base text-foreground">Google Fonts</h3>
                      <p className="text-xs text-muted-foreground">
                        Content delivery network serving Baloo 2 and Nunito web typography to
                        website visitors.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-secondary/30 p-4 text-xs text-muted-foreground space-y-1">
                    <p className="font-semibold text-foreground">International Data Processing:</p>
                    <p>
                      External cloud infrastructure providers (including Microsoft Azure, Vercel,
                      and Google) store and process data in secure cloud facilities located outside
                      the Philippines (such as in the United States). These providers are subject to
                      enterprise commercial privacy frameworks and data protection standards.
                    </p>
                  </div>
                </section>

                {/* Section 5 */}
                <section
                  id="data-retention"
                  className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24"
                >
                  <h2 className="font-display text-xl sm:text-2xl text-foreground">
                    5. Data Retention &amp; Archival Timeline
                  </h2>
                  <p>
                    Personal data is retained only for as long as necessary to fulfill the
                    educational research purposes of the CivilCraft capstone project or to satisfy
                    statutory obligations under Philippine law:
                  </p>
                  <ul className="list-disc list-inside space-y-2 pl-1">
                    <li>
                      <strong className="text-foreground">Player Accounts &amp; Game Saves:</strong>{" "}
                      Retained while the account is active. Accounts inactive for extended periods
                      may be archived following the conclusion of the academic evaluation.
                    </li>
                    <li>
                      <strong className="text-foreground">Financial &amp; Receipt Records:</strong>{" "}
                      Virtual coin purchase receipts and transaction references are maintained in
                      accordance with database ledger immutability triggers (
                      <code>permanent_receipt</code>). In the event of account deletion, personal
                      identifiers are pseudonymized/anonymized while financial ledger totals are
                      retained for accounting integrity.
                    </li>
                    <li>
                      <strong className="text-foreground">Contact &amp; Bug Inquiries:</strong>{" "}
                      Retained until the relevant support thread, inquiry, or software defect is
                      resolved.
                    </li>
                  </ul>
                  <div className="rounded-lg border border-border bg-secondary/40 p-3.5 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      Institutional Confirmation Required:
                    </span>{" "}
                    Specific long-term data archiving timelines, retention periods, and disposal
                    procedures following the capstone thesis defense require formal confirmation by
                    university research advisers and institutional guidelines.
                  </div>
                </section>

                {/* Section 6 */}
                <section
                  id="data-security"
                  className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24"
                >
                  <div className="flex items-center gap-2 text-gold">
                    <Lock className="h-5 w-5" aria-hidden="true" />
                    <h2 className="font-display text-xl sm:text-2xl text-foreground">
                      6. Security Measures &amp; Technical Safeguards
                    </h2>
                  </div>
                  <p>
                    In compliance with Section 20 of the Data Privacy Act of 2012, CivilCraft
                    implements organizational, physical, and technical measures to protect personal
                    data against accidental loss, unauthorized access, or unlawful processing:
                  </p>
                  <ul className="list-disc list-inside space-y-2 pl-1">
                    <li>
                      <strong className="text-foreground">Transport Layer Encryption:</strong> All
                      web and mobile API communications are enforced over modern HTTPS/TLS
                      (Transport Layer Security) protocols in transit.
                    </li>
                    <li>
                      <strong className="text-foreground">Password Security:</strong> Password
                      authentication is handled through Microsoft Azure PlayFab. Civil Craft does
                      not directly store or access players&apos; plaintext passwords.
                    </li>
                    <li>
                      <strong className="text-foreground">Credential Isolation:</strong> Master
                      PlayFab secret keys, payment secrets, and database credentials reside strictly
                      on server environments and are never bundled into player browsers or mobile
                      APKs.
                    </li>
                    <li>
                      <strong className="text-foreground">Admin Session Protection:</strong>{" "}
                      Administrative endpoints are guarded by server-verified, HttpOnly session
                      cookies with strict cross-site scripting (XSS) defenses and origin
                      verification.
                    </li>
                    <li>
                      <strong className="text-foreground">Reauthentication Verification:</strong>{" "}
                      Sensitive account modifications (such as updating your contact email) require
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
                    Under Section 16 of the Data Privacy Act of 2012 (RA 10173), registered players
                    and website visitors possess statutory data privacy rights:
                  </p>

                  <div className="grid gap-3 sm:grid-cols-2 text-xs sm:text-sm">
                    <div className="rounded-xl border border-border bg-card p-3.5 space-y-1">
                      <p className="font-semibold text-foreground">1. Right to be Informed</p>
                      <p className="text-muted-foreground">
                        You have the right to know whether personal data concerning you is being
                        processed, and to receive transparency regarding how it is handled.
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-3.5 space-y-1">
                      <p className="font-semibold text-foreground">2. Right to Access</p>
                      <p className="text-muted-foreground">
                        You have the right to inspect your saved progression data, player profile
                        details, and leaderboard statistics upon request.
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-3.5 space-y-1">
                      <p className="font-semibold text-foreground">3. Right to Rectification</p>
                      <p className="text-muted-foreground">
                        You can dispute and correct inaccurate or incomplete data, such as updating
                        your contact email directly in Player Settings.
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-3.5 space-y-1">
                      <p className="font-semibold text-foreground">4. Right to Object</p>
                      <p className="text-muted-foreground">
                        You may refuse or withdraw consent for optional processing, such as toggling
                        off Email Updates at any time in Player Settings.
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-3.5 space-y-1">
                      <p className="font-semibold text-foreground">
                        5. Right to Erasure or Blocking
                      </p>
                      <p className="text-muted-foreground">
                        You may request the erasure or blocking of your personal data when
                        conditions under applicable law are met.
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-3.5 space-y-1">
                      <p className="font-semibold text-foreground">6. Right to File a Complaint</p>
                      <p className="text-muted-foreground">
                        If you believe your privacy rights have been violated, you have the right to
                        file a complaint with the National Privacy Commission.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-secondary/30 p-4 text-xs text-muted-foreground">
                    <p>
                      You may request the erasure or blocking of your personal data when the
                      conditions under applicable privacy laws are met. Certain information may need
                      to be retained where a lawful purpose or legal obligation requires it. If a
                      request cannot be fully granted, we will explain the applicable reason.
                    </p>
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
                    Because CivilCraft coordinates account credentials, encrypted game saves, level
                    progression, leaderboard rankings, and virtual currency ledgers across multiple
                    independent systems, complete deletion requires synchronized multi-system
                    erasure:
                  </p>
                  <div className="rounded-lg border border-amber-600/30 bg-amber-500/10 p-4 text-xs sm:text-sm text-foreground space-y-1.5">
                    <p className="font-semibold text-amber-900 dark:text-amber-400">
                      Current Self-Service Deletion Status: Unavailable
                    </p>
                    <p className="text-muted-foreground leading-relaxed">
                      Automated one-click deletion is currently offline in the player dashboard
                      while backend multi-system synchronization is being finalized. No simulated
                      deletion requests are queued automatically from the browser.
                    </p>
                  </div>
                  <p>
                    To request permanent account deletion during this academic evaluation phase,
                    please submit a verified request through the{" "}
                    <Link to="/contact" className="text-gold underline hover:text-gold/80">
                      Contact page
                    </Link>{" "}
                    using the email address associated with your player account. Our team will
                    verify your identity, purge your PlayFab master credentials and title entity
                    files, and anonymize related database purchase receipts. Note that local save
                    files cached on an Android device must be removed directly by clearing
                    application storage on that device.
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
                    CivilCraft uses minimal browser storage strictly necessary for authentication
                    and user interface preferences. We do not use advertising or tracking cookies.
                  </p>
                  <p>
                    For a complete explanation of all cookies and browser storage technologies used
                    on this website, please review our separate{" "}
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
                    The responsible Personal Information Controller and its designated privacy
                    contact will be identified in the final institutional version of this policy.
                  </p>
                  <p>
                    If you have questions about this Privacy Policy, wish to exercise any of your
                    statutory data privacy rights, or wish to submit an inquiry regarding your
                    personal data, please contact the CivilCraft research team:
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
                        * The designated privacy contact and formal Data Protection Officer (DPO)
                        registration remain subject to academic department appointment.
                      </p>
                    </div>
                  </div>
                </section>
              </>
            )}
          </main>
        </div>
      </div>
    </PublicLayout>
  );
}
