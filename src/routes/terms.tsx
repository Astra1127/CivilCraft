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
import { ArrowRight, BookOpen, Clock, ShieldCheck, Mail } from "lucide-react";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Use — Civil Craft: Bridge Edition" },
      {
        name: "description",
        content:
          "Terms and conditions for using the Civil Craft: Bridge Edition website, player accounts, and educational Android game.",
      },
      { property: "og:title", content: "Terms of Use — Civil Craft: Bridge Edition" },
      {
        property: "og:description",
        content:
          "Educational scope, fair play rules, account guidelines, and student project terms for Civil Craft: Bridge Edition.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TermsPage,
});

const TOC_ITEMS: TocItem[] = [
  { id: "educational-scope", title: "1. Educational Purpose & Academic Scope" },
  { id: "player-accounts", title: "2. Player Registration & Account Security" },
  { id: "acceptable-use", title: "3. Acceptable Use & Fair Play" },
  { id: "apk-distribution", title: "4. Official APK Downloads & Device Safety" },
  { id: "virtual-currency", title: "5. Virtual Coins, Payments & Purchases" },
  { id: "intellectual-property", title: "6. Intellectual Property & Ownership" },
  { id: "moderation-suspension", title: "7. Account Suspension & Fair Play Moderation" },
  { id: "deletion-requests", title: "8. Account Deletion & Data Removal Requests" },
  { id: "limitation-liability", title: "9. Disclaimers & Limitation of Liability" },
  { id: "governing-law", title: "10. Governing Law & Contact Information" },
];

function TermsPage() {
  const settings = useContactSettings().data ?? emptyContactSettings;
  const supportEmail = settings.supportEmail || "support@civilcraft.game";
  const { data: dynamicPolicy } = usePublicPolicy("terms");
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
        eyebrow="Project Governance"
        title="Terms of Use"
        description="Terms and conditions governing the Civil Craft educational bridge simulation and website."
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
          <DraftReviewNotice documentTitle="Terms of Use" />
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
                    <BookOpen className="h-5 w-5" aria-hidden="true" />
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
                  id="educational-scope"
                  className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24"
                >
                  <div className="flex items-center gap-2 text-gold">
                    <BookOpen className="h-5 w-5" aria-hidden="true" />
                    <h2 className="font-display text-xl sm:text-2xl text-foreground">
                      1. Educational Purpose &amp; Academic Scope
                    </h2>
                  </div>
                  <p>
                    <strong>Civil Craft: Bridge Edition</strong> is an educational bridge
                    engineering simulation and academic capstone research demonstration developed by
                    an undergraduate student team under academic supervision in the Republic of the
                    Philippines. Access to the game is free, although optional virtual currency or
                    cosmetic purchases may be offered during approved testing or future releases.
                  </p>
                  <p>
                    Civil Craft introduces fundamental structural mechanics and civil engineering
                    principles, including bending, tension and compression, load distribution,
                    static equilibrium, material stress limits, and structural failure. The in-game
                    3D physics engine and material behavior calculations are simplified to provide
                    intuitive, gameplay-oriented learning.
                  </p>
                  <div className="rounded-lg border border-amber-600/30 bg-amber-500/10 p-4 text-xs sm:text-sm text-foreground space-y-1.5">
                    <p className="font-semibold text-amber-900 dark:text-amber-400">
                      Engineering Simulation Disclaimer:
                    </p>
                    <p className="text-muted-foreground leading-relaxed">
                      The physics simulations and structural stress calculations in Civil Craft do
                      not replicate the full complexity of real-world engineering environments,
                      geotechnical factors, seismic loads, dynamic aerodynamics, or real material
                      tolerances.{" "}
                      <strong>
                        Civil Craft does not replace professional structural analysis software,
                        certified engineering design calculations, or the judgment of a licensed
                        professional civil engineer.
                      </strong>{" "}
                      Do not rely on simulated results for real-world bridge or building
                      construction.
                    </p>
                  </div>
                </section>

                {/* Section 2 */}
                <section
                  id="player-accounts"
                  className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24"
                >
                  <h2 className="font-display text-xl sm:text-2xl text-foreground">
                    2. Player Registration &amp; Account Security
                  </h2>
                  <p>
                    To access saved progression, level leaderboards, the Bridge Almanac, and custom
                    character cosmetics, players must register a Civil Craft account. Account
                    authentication and progression storage are securely powered by Microsoft Azure
                    PlayFab.
                  </p>
                  <ul className="list-disc list-inside space-y-2 pl-1">
                    <li>
                      <strong className="text-foreground">Eligibility:</strong> You must be at least
                      13 years of age, or have the express permission of a parent or legal guardian
                      if you are a minor under the laws of the Republic of the Philippines. (Please
                      note: Civil Craft is designed primarily for educational evaluation with senior
                      high school and undergraduate civil engineering learners, whose typical
                      demographic is 17 years and older; formal minimum age policies remain subject
                      to final institutional confirmation.)
                    </li>
                    <li>
                      <strong className="text-foreground">Accurate Information:</strong> You agree
                      to provide a valid email address and unique username during registration.
                      Email verification is informative to confirm account ownership and enable
                      password recovery.
                    </li>
                    <li>
                      <strong className="text-foreground">
                        Credential Confidentiality &amp; Password Security:
                      </strong>{" "}
                      Civil Craft does not directly store or access players&apos; plaintext
                      passwords; authentication credentials and session tickets are transmitted
                      securely to Microsoft Azure PlayFab via encrypted transport. You are solely
                      responsible for maintaining the confidentiality of your account credentials
                      and agree not to share your account or use another player&apos;s account
                      without authorization.
                    </li>
                    <li>
                      <strong className="text-foreground">Shared Unity &amp; Web Login:</strong>{" "}
                      Your Civil Craft account credentials are valid for both the web player
                      dashboard and the Android mobile game.
                    </li>
                  </ul>
                </section>

                {/* Section 3 */}
                <section
                  id="acceptable-use"
                  className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24"
                >
                  <h2 className="font-display text-xl sm:text-2xl text-foreground">
                    3. Acceptable Use &amp; Fair Play
                  </h2>
                  <p>
                    Civil Craft is designed as a collaborative, fair-play learning environment. By
                    using our website and game, you agree to abide by the following community and
                    technical standards:
                  </p>
                  <div className="space-y-3">
                    <p className="font-semibold text-foreground">You agree NOT to:</p>
                    <ul className="list-disc list-inside space-y-1.5 pl-1">
                      <li>
                        Use automated bots, memory injection tools, decompilers, or exploits to
                        tamper with bridge physics or game mechanics.
                      </li>
                      <li>
                        Artificially falsify bridge completion scores, material counts, or
                        leaderboard rankings.
                      </li>
                      <li>
                        Transmit offensive, defamatory, harassing, or sexually explicit content in
                        usernames, player display names, support messages, or feedback submissions.
                      </li>
                      <li>
                        Probe, scan, or test the vulnerability of the website, backend APIs, or
                        connected database services without permission.
                      </li>
                      <li>
                        Impersonate project administrators, student researchers, or other registered
                        players.
                      </li>
                    </ul>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Scores, display names, bridge challenge completions, and overall rankings
                    submitted through game client APIs are published to the public leaderboards
                    without an in-game private leaderboard toggle. Scores and leaderboard records
                    detected as fraudulent or manipulated outside authentic game parameters are
                    subject to administrative removal without prior notice.
                  </p>
                </section>

                {/* Section 4 */}
                <section
                  id="apk-distribution"
                  className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24"
                >
                  <h2 className="font-display text-xl sm:text-2xl text-foreground">
                    4. Official APK Downloads &amp; Device Safety
                  </h2>
                  <p>
                    The official Civil Craft Android application package (APK) is distributed
                    exclusively through this website at{" "}
                    <Link to="/download" className="text-gold underline hover:text-gold/80">
                      /download
                    </Link>
                    .
                  </p>
                  <ul className="list-disc list-inside space-y-2 pl-1">
                    <li>
                      <strong className="text-foreground">Authorized Source:</strong> Never download
                      or install Civil Craft APK packages from third-party mirrors, unauthorized
                      file repositories, or unofficial chat channels.
                    </li>
                    <li>
                      <strong className="text-foreground">Android Permissions:</strong> The game
                      client requires standard Android network access permissions (
                      <code className="text-xs bg-muted/60 px-1 py-0.5 rounded font-mono">
                        android.permission.INTERNET
                      </code>{" "}
                      and{" "}
                      <code className="text-xs bg-muted/60 px-1 py-0.5 rounded font-mono">
                        android.permission.ACCESS_NETWORK_STATE
                      </code>
                      ) for online features, cloud synchronization with PlayFab, and release update
                      checks. The game does not require runtime permissions for graphics rendering
                      (OpenGL/Vulkan), audio playback, or local file caching within its application
                      sandbox.
                    </li>
                    <li>
                      <strong className="text-foreground">Device Compatibility:</strong> While
                      designed for a wide range of Android smartphones and tablets running supported
                      Android versions, the student team does not guarantee compatibility with all
                      hardware configurations or custom ROMs.
                    </li>
                  </ul>
                </section>

                {/* Section 5 */}
                <section
                  id="virtual-currency"
                  className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24"
                >
                  <h2 className="font-display text-xl sm:text-2xl text-foreground">
                    5. Virtual Coins, Payments &amp; Purchases
                  </h2>
                  <p>
                    Civil Craft includes an optional Coin Shop in the player dashboard and virtual
                    coins that can be earned through completing in-game bridge construction
                    contracts and challenges. In-game coins and cosmetic items are virtual licensing
                    features intended solely for game enhancement.
                  </p>
                  <ul className="list-disc list-inside space-y-2 pl-1">
                    <li>
                      <strong className="text-foreground">No Real-World Monetary Value:</strong>{" "}
                      Virtual coins, cosmetic outfits, and bridge materials have no monetary value
                      in the real world and cannot be redeemed, refunded, transferred, or exchanged
                      for fiat currency or cash equivalents.
                    </li>
                    <li>
                      <strong className="text-foreground">
                        Payment Processing (Sandbox / Test Mode):
                      </strong>{" "}
                      Payment integrations are handled through PayMongo operating in sandbox / test
                      mode (
                      <code className="text-xs bg-muted/60 px-1 py-0.5 rounded font-mono">
                        sk_test_...
                      </code>
                      ). In this testing environment, simulated purchases may be conducted using
                      test credentials. Civil Craft does not store or process payment card numbers
                      or digital wallet credentials, and does not conduct live real-money commercial
                      transactions.
                    </li>
                    <li>
                      <strong className="text-foreground">
                        Academic / Beta Testing Environment:
                      </strong>{" "}
                      The coin shop operates under academic evaluation parameters. Transactions and
                      item deliveries are governed by sandbox or testing guidelines established for
                      the capstone study.
                    </li>
                    <li>
                      <strong className="text-foreground">
                        Finality &amp; Remedy for Billing Errors:
                      </strong>{" "}
                      All virtual currency purchases and cosmetic unlocks in the test environment
                      are fulfilled directly to your PlayFab player account. In the event of a
                      simulated billing error, unfulfilled item delivery, or duplicate test
                      transaction, players may submit a support inquiry through the Contact page for
                      manual review and account adjustment.
                    </li>
                  </ul>
                  <div className="rounded-lg border border-border bg-secondary/40 p-3.5 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      Institutional Review Notice:
                    </span>{" "}
                    Commercial transaction guidelines, digital goods tax compliance, and long-term
                    virtual item guarantees remain subject to formal review by university research
                    supervisors and legal counsel before any live monetary release.
                  </div>
                </section>

                {/* Section 6 */}
                <section
                  id="intellectual-property"
                  className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24"
                >
                  <h2 className="font-display text-xl sm:text-2xl text-foreground">
                    6. Intellectual Property &amp; Ownership
                  </h2>
                  <p>
                    Original content created specifically for Civil Craft is subject to the
                    intellectual property rights and ownership arrangements established by the
                    student development team and its academic institution. Third-party materials
                    remain subject to their respective licenses and terms.
                  </p>
                  <ul className="list-disc list-inside space-y-2 pl-1">
                    <li>
                      <strong className="text-foreground">Player Designs:</strong> Players retain
                      creative ownership of their unique bridge configurations and design
                      blueprints. By submitting designs to leaderboards or public challenges, you
                      grant the project a non-exclusive, royalty-free license to display your bridge
                      layout, test recordings, scores, and player display name within the game and
                      on the website.
                    </li>
                    <li>
                      <strong className="text-foreground">Third-Party Assets:</strong> Software
                      dependencies, Unity game engine packages, UI components, sound libraries, and
                      open-source libraries are used under their respective open-source or
                      commercial licenses.
                    </li>
                  </ul>
                </section>

                {/* Section 7 */}
                <section
                  id="moderation-suspension"
                  className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24"
                >
                  <h2 className="font-display text-xl sm:text-2xl text-foreground">
                    7. Account Suspension &amp; Fair Play Moderation
                  </h2>
                  <p>
                    To safeguard community integrity and fair academic competition, project
                    administrators reserve the right to review, moderate, and take action on player
                    accounts.
                  </p>
                  <ul className="list-disc list-inside space-y-2 pl-1">
                    <li>
                      <strong className="text-foreground">Suspension &amp; Ban Actions:</strong>{" "}
                      Accounts verified to have engaged in leaderboard tampering, cheating,
                      harassment, or unauthorized API flooding may be temporarily suspended or
                      permanently banned from CivilCraft.
                    </li>
                    <li>
                      <strong className="text-foreground">Notification &amp; Appeals:</strong> Where
                      reasonably possible, affected players will be notified of the reason for the
                      suspension and may submit an appeal through the Contact page. Banning an
                      account restricts sign-in and gameplay privileges; it does not automatically
                      delete stored account data.
                    </li>
                  </ul>
                </section>

                {/* Section 8 */}
                <section
                  id="deletion-requests"
                  className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24"
                >
                  <h2 className="font-display text-xl sm:text-2xl text-foreground">
                    8. Account Deletion &amp; Data Removal Requests
                  </h2>
                  <p>
                    You have the right to request permanent deletion of your account and personal
                    data.
                  </p>
                  <div className="rounded-lg border border-amber-600/30 bg-amber-500/10 p-4 text-xs sm:text-sm text-foreground space-y-1.5">
                    <p className="font-semibold text-amber-900 dark:text-amber-400">
                      Current Self-Service Deletion Status: Unavailable
                    </p>
                    <p className="text-muted-foreground leading-relaxed">
                      Automated one-click account deletion is currently offline in the player
                      dashboard while backend multi-system synchronization is being finalized across
                      PlayFab entities, PostgreSQL financial ledgers, and local Android client
                      saves.
                    </p>
                  </div>
                  <p>
                    To request permanent erasure of your account, email progress, and save files
                    during this academic testing phase, please submit a verified request through the{" "}
                    <Link to="/contact" className="text-gold underline hover:text-gold/80">
                      Contact page
                    </Link>{" "}
                    using the email address linked to your Civil Craft account. An administrator
                    will manually verify your identity and process the deletion across all connected
                    systems in accordance with our Privacy Policy.
                  </p>
                </section>

                {/* Section 9 */}
                <section
                  id="limitation-liability"
                  className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24"
                >
                  <h2 className="font-display text-xl sm:text-2xl text-foreground">
                    9. Disclaimers &amp; Limitation of Liability
                  </h2>
                  <p>
                    Civil Craft: Bridge Edition and its associated online services are provided on
                    an <strong>&ldquo;AS IS&rdquo;</strong> and{" "}
                    <strong>&ldquo;AS AVAILABLE&rdquo;</strong> basis without warranties of any
                    kind, whether express or implied, including but not limited to fitness for a
                    particular educational purpose, uninterrupted server availability, or error-free
                    gameplay.
                  </p>
                  <p>
                    To the fullest extent permitted by applicable Philippine law, the student
                    development team, academic supervisors, and affiliated educational institution
                    shall not be liable for any direct, indirect, incidental, special, or
                    consequential damages arising out of or in connection with the use or inability
                    to use this software, device malfunctions, or reliance on simulated engineering
                    concepts.
                  </p>
                </section>

                {/* Section 10 */}
                <section
                  id="governing-law"
                  className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24"
                >
                  <div className="flex items-center gap-2 text-gold">
                    <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                    <h2 className="font-display text-xl sm:text-2xl text-foreground">
                      10. Governing Law &amp; Contact Information
                    </h2>
                  </div>
                  <p>
                    These Terms of Use shall be governed by and construed in accordance with the
                    laws of the <strong>Republic of the Philippines</strong>, including the
                    Electronic Commerce Act of 2000 (Republic Act No. 8792), the Data Privacy Act of
                    2012 (Republic Act No. 10173), and applicable consumer and academic standards.
                  </p>
                  <div className="mt-4 rounded-xl border border-border bg-card p-5 space-y-3">
                    <h3 className="font-display text-base text-foreground flex items-center gap-2">
                      <Mail className="h-4 w-4 text-gold" aria-hidden="true" />
                      <span>Questions &amp; Legal Notices</span>
                    </h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      If you have questions regarding these Terms of Use, need assistance with your
                      player account, or wish to submit a project inquiry, please contact the
                      development team:
                    </p>
                    <div className="flex flex-wrap gap-3 pt-1">
                      <Link
                        to="/contact"
                        className="inline-flex items-center gap-1.5 rounded-xl bg-gold px-4 py-2 text-xs font-semibold text-stone-900 hover:bg-gold/90 transition-colors"
                      >
                        <span>Submit via Contact Form</span>
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
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
              </>
            )}
          </main>
        </div>
      </div>
    </PublicLayout>
  );
}
