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
            Player accounts are created and managed inside the Civil Craft mobile game through its
            game backend. This website only displays account and gameplay information supplied by
            that backend; it never creates progress, scores or purchases on its own.
          </p>
        </section>
        <section className="paper-panel space-y-2 p-5">
          <h2 className="font-display text-xl text-foreground">Gameplay data</h2>
          <p>
            Level completions, achievements, leaderboard entries and in-game currency balances are
            recorded by the game. The website shows them read-only so you can review your progress
            on a larger screen.
          </p>
        </section>
        <section className="paper-panel space-y-2 p-5">
          <h2 className="font-display text-xl text-foreground">Messages and bug reports</h2>
          <p>
            Contact messages and bug reports you submit are stored so the student development team
            can respond. Please avoid sending sensitive personal information.
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
