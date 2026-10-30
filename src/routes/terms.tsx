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

  return (
    <PublicLayout>
      <PageHeader
        eyebrow="Project Governance"
        title="Terms of Use"
        description="Terms and conditions governing the Civil Craft educational bridge simulation and website."
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
          <DraftReviewNotice documentTitle="Terms of Use" />
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
                <strong>Civil Craft: Bridge Edition</strong> is a student-built capstone research
                and engineering demonstration project developed by an undergraduate student team
                under academic supervision in the Republic of the Philippines. Both the Android
                mobile game and this accompanying website are distributed free of charge for
                non-commercial educational learning purposes.
              </p>
              <p>
                Civil Craft introduces fundamental structural mechanics and civil engineering
                principles, including bending, tension and compression, load distribution, static
                equilibrium, material stress limits, and structural failure. The in-game 3D physics
                engine and material behavior calculations are simplified to provide intuitive,
                gameplay-oriented learning.
              </p>
              <div className="rounded-lg border border-amber-600/30 bg-amber-500/10 p-4 text-xs sm:text-sm text-foreground space-y-1.5">
                <p className="font-semibold text-amber-900 dark:text-amber-400">
                  Engineering Simulation Disclaimer:
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  The physics simulations and structural stress calculations in Civil Craft do not
                  replicate the full complexity of real-world engineering environments, geotechnical
                  factors, seismic loads, dynamic aerodynamics, or real material tolerances.{" "}
                  <strong>
                    Civil Craft does not replace professional structural analysis software,
                    certified engineering design calculations, or the judgment of a licensed
                    professional civil engineer.
                  </strong>{" "}
                  Do not rely on simulated results for real-world bridge or building construction.
                </p>
              </div>
            </section>

            {/* Section 2 */}
            <section id="player-accounts" className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24">
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
                  <strong className="text-foreground">Eligibility:</strong> You must be at least 13
                  years of age, or have the express permission of a parent or legal guardian if you
                  are a minor under the laws of the Republic of the Philippines.
                </li>
                <li>
                  <strong className="text-foreground">Accurate Information:</strong> You agree to
                  provide a valid email address and unique username during registration.
                </li>
                <li>
                  <strong className="text-foreground">Credential Confidentiality:</strong> You are
                  solely responsible for maintaining the confidentiality of your account password.
                  You agree not to share your account or use another player&apos;s account without
                  authorization.
                </li>
                <li>
                  <strong className="text-foreground">Shared Unity &amp; Web Login:</strong> Your
                  Civil Craft account credentials are valid for both the web player dashboard and
                  the Android mobile game.
                </li>
              </ul>
            </section>

            {/* Section 3 */}
            <section id="acceptable-use" className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24">
              <h2 className="font-display text-xl sm:text-2xl text-foreground">
                3. Acceptable Use &amp; Fair Play
              </h2>
              <p>
                Civil Craft is designed as a collaborative, fair-play learning environment. By using
                our website and game, you agree to abide by the following community and technical
                standards:
              </p>
              <div className="space-y-3">
                <p className="font-semibold text-foreground">You agree NOT to:</p>
                <ul className="list-disc list-inside space-y-1.5 pl-1">
                  <li>
                    Use automated bots, memory injection tools, decompilers, or exploits to tamper
                    with bridge physics or game mechanics.
                  </li>
                  <li>
                    Artificially falsify bridge completion scores, material counts, or leaderboard
                    rankings.
                  </li>
                  <li>
                    Transmit offensive, defamatory, harassing, or sexually explicit content in
                    usernames, player display names, or support messages.
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
                Scores and leaderboard records detected as fraudulent or manipulated outside
                authentic game parameters are subject to administrative removal without prior
                notice.
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
                  <strong className="text-foreground">Authorized Source:</strong> Never download or
                  install Civil Craft APK packages from third-party mirrors, unauthorized file
                  repositories, or unofficial chat channels.
                </li>
                <li>
                  <strong className="text-foreground">Android Permissions:</strong> The game
                  requires standard Android permissions necessary for graphics rendering, audio
                  playback, local file caching, and HTTPS network communication with PlayFab game
                  servers.
                </li>
                <li>
                  <strong className="text-foreground">Device Compatibility:</strong> While designed
                  for a wide range of Android smartphones and tablets, the student team does not
                  guarantee compatibility with all hardware configurations or custom ROMs.
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
                Civil Craft includes an optional Coin Shop in the player dashboard. In-game coins
                and cosmetic items are virtual licensing features intended solely for game
                enhancement.
              </p>
              <ul className="list-disc list-inside space-y-2 pl-1">
                <li>
                  <strong className="text-foreground">No Real-World Monetary Value:</strong> Virtual
                  coins, cosmetic outfits, and bridge materials have no monetary value in the real
                  world and cannot be redeemed, refunded, or exchanged for fiat currency or cash
                  equivalents.
                </li>
                <li>
                  <strong className="text-foreground">Payment Processing:</strong> Transactions are
                  handled through <strong>PayMongo</strong>, a Bangko Sentral ng Pilipinas
                  (BSP)-regulated payment gateway supporting GCash, Maya, and major credit/debit
                  cards. CivilCraft does not store or process credit card numbers or digital wallet
                  credentials.
                </li>
                <li>
                  <strong className="text-foreground">Academic / Beta Testing Environment:</strong>{" "}
                  The coin shop operates under academic evaluation parameters. Transactions and item
                  deliveries are governed by sandbox or testing guidelines established for the
                  capstone study.
                </li>
                <li>
                  <strong className="text-foreground">Finality:</strong> All virtual currency
                  purchases and cosmetic unlocks are considered final upon fulfillment to your
                  PlayFab player account. In the event of a billing error or unfulfilled checkout,
                  please contact the team.
                </li>
              </ul>
              <div className="rounded-lg border border-border bg-secondary/40 p-3.5 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Institutional Review Notice:</span>{" "}
                Commercial transaction guidelines, digital goods tax compliance, and long-term
                virtual item guarantees remain subject to formal review by university research
                supervisors and legal counsel.
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
                All original visual assets, character artwork, 3D models, sound effects, level
                contracts, educational lessons, and custom software code comprising Civil Craft:
                Bridge Edition belong to the student development team and their academic
                institution.
              </p>
              <ul className="list-disc list-inside space-y-2 pl-1">
                <li>
                  <strong className="text-foreground">Player Designs:</strong> Players retain
                  creative ownership of their unique bridge configurations and design blueprints. By
                  submitting designs to leaderboards or public challenges, you grant the project a
                  non-exclusive, royalty-free license to display your bridge layout, test
                  recordings, and scores within the game and on the website.
                </li>
                <li>
                  <strong className="text-foreground">Third-Party Assets:</strong> Software
                  dependencies, Unity game engine packages, and open-source libraries are used under
                  their respective open-source or commercial licenses.
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
                  Accounts verified to have engaged in leaderboard tampering, cheating, harassment,
                  or unauthorized API flooding may be temporarily suspended or permanently banned
                  from CivilCraft.
                </li>
                <li>
                  <strong className="text-foreground">Moderation vs. Deletion:</strong> Banning an
                  account restricts sign-in and gameplay privileges. It does not delete the account
                  data. Suspended players may contact support to appeal a moderation decision.
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
                You have the right to request permanent deletion of your account and personal data.
              </p>
              <div className="rounded-lg border border-amber-600/30 bg-amber-500/10 p-4 text-xs sm:text-sm text-foreground space-y-1.5">
                <p className="font-semibold text-amber-900 dark:text-amber-400">
                  Current Self-Service Deletion Status: Unavailable
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  Automated one-click account deletion is currently offline in the player dashboard
                  while backend multi-system synchronization is being finalized across PlayFab
                  entities, PostgreSQL financial ledgers, and local Android client saves.
                </p>
              </div>
              <p>
                To request permanent erasure of your account, email progress, and save files during
                this academic testing phase, please submit a verified request through the{" "}
                <Link to="/contact" className="text-gold underline hover:text-gold/80">
                  Contact page
                </Link>{" "}
                using the email address linked to your Civil Craft account. An administrator will
                manually verify your identity and process the deletion across all connected systems
                in accordance with our Privacy Policy.
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
                Civil Craft: Bridge Edition and its associated online services are provided on an{" "}
                <strong>&ldquo;AS IS&rdquo;</strong> and <strong>&ldquo;AS AVAILABLE&rdquo;</strong>{" "}
                basis without warranties of any kind, whether express or implied, including but not
                limited to fitness for a particular educational purpose, uninterrupted server
                availability, or error-free gameplay.
              </p>
              <p>
                To the fullest extent permitted by applicable Philippine law, the student
                development team, academic supervisors, and affiliated educational institution shall
                not be liable for any direct, indirect, incidental, special, or consequential
                damages arising out of or in connection with the use or inability to use this
                software, device malfunctions, or reliance on simulated engineering concepts.
              </p>
            </section>

            {/* Section 10 */}
            <section id="governing-law" className="paper-panel p-6 sm:p-8 space-y-4 scroll-mt-24">
              <div className="flex items-center gap-2 text-gold">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                <h2 className="font-display text-xl sm:text-2xl text-foreground">
                  10. Governing Law &amp; Contact Information
                </h2>
              </div>
              <p>
                These Terms of Use shall be governed by and construed in accordance with the laws of
                the <strong>Republic of the Philippines</strong>, including the Electronic Commerce
                Act of 2000 (Republic Act No. 8792) and applicable consumer and academic standards.
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
          </main>
        </div>
      </div>
    </PublicLayout>
  );
}
