import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/PageHeader";
import { PublicLayout } from "@/components/site/PublicLayout";
import { useCms } from "@/lib/cms/store";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Civil Craft: Bridge Edition" },
      {
        name: "description",
        content:
          "How Civil Craft: Bridge Edition, a student capstone project, handles player accounts, gameplay data and website messages.",
      },
      { property: "og:title", content: "Privacy Policy — Civil Craft: Bridge Edition" },
      {
        property: "og:description",
        content: "Data handling for the Civil Craft: Bridge Edition academic game project.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const settings = useCms((s) => s.settings);

  return (
    <PublicLayout>
      <PageHeader
        eyebrow="Project Documents"
        title="Privacy Policy"
        description="Civil Craft: Bridge Edition is an academic capstone project. This page explains what the game and this website store."
      />
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-12 text-sm leading-relaxed text-muted-foreground sm:px-6 sm:text-base">
        <section className="paper-panel space-y-2 p-5">
          <h2 className="font-display text-xl text-foreground">Player accounts</h2>
          <p>
            Civil Craft uses PlayFab to handle player accounts. The game and website use the same
            player account for sign-in. The website also supports registration and password recovery
            and displays account information supplied by the game backend.
          </p>
        </section>
        <section className="paper-panel space-y-2 p-5">
          <h2 className="font-display text-xl text-foreground">Gameplay data</h2>
          <p>
            Gameplay progress, achievements, leaderboard data, in-game currency balances and
            transaction records may be handled through PlayFab. The player dashboard displays the
            records supplied by the backend so you can review your progress and items.
          </p>
        </section>
        <section className="paper-panel space-y-2 p-5">
          <h2 className="font-display text-xl text-foreground">Messages and bug reports</h2>
          <p>
            Contact forms handle the name, email address and message you provide. Contact messages
            are currently saved in this browser. Submitted bug reports are stored for the team to
            review and linked to your signed-in player account. Please avoid including sensitive
            personal information in either.
          </p>
        </section>
        <section className="paper-panel space-y-2 p-5">
          <h2 className="font-display text-xl text-foreground">Questions</h2>
          <p>
            For privacy questions about this project, contact the team
            {settings.supportEmail ? ` at ${settings.supportEmail}` : " through the contact page"}.
          </p>
        </section>
      </div>
    </PublicLayout>
  );
}
