import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/PageHeader";
import { PublicLayout } from "@/components/site/PublicLayout";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Use — Civil Craft: Bridge Edition" },
      {
        name: "description",
        content:
          "Terms for using the Civil Craft: Bridge Edition website and downloading the student-built Android game.",
      },
      { property: "og:title", content: "Terms of Use — Civil Craft: Bridge Edition" },
      {
        property: "og:description",
        content: "Usage terms for the Civil Craft: Bridge Edition website and APK download.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <PublicLayout>
      <PageHeader
        eyebrow="Project Documents"
        title="Terms of Use"
        description="Civil Craft: Bridge Edition is distributed as a free educational student project."
      />
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-12 text-sm leading-relaxed text-muted-foreground sm:px-6 sm:text-base">
        <section className="paper-panel space-y-2 p-5">
          <h2 className="font-display text-xl text-foreground">Educational use</h2>
          <p>
            The game and this website are provided free of charge for learning purposes as part of
            an academic capstone project. Civil Craft simplifies selected engineering concepts for
            educational gameplay. It is not professional engineering software or a substitute for
            structural analysis, engineering design, formal engineering instruction, or engineering
            approval or certification. The game and website are offered as-is, without warranty.
          </p>
        </section>
        <section className="paper-panel space-y-2 p-5">
          <h2 className="font-display text-xl text-foreground">Downloads</h2>
          <p>
            Only install the Civil Craft APK from this official website. Builds obtained elsewhere
            may be modified and are not supported by the development team.
          </p>
        </section>
        <section className="paper-panel space-y-2 p-5">
          <h2 className="font-display text-xl text-foreground">Fair play</h2>
          <p>
            Please do not attempt to tamper with gameplay data, leaderboards or other players&apos;
            accounts. Progress is recorded by the game backend and may be corrected or removed if it
            was not earned in-game.
          </p>
        </section>
        <section className="paper-panel space-y-2 p-5">
          <h2 className="font-display text-xl text-foreground">Content ownership</h2>
          <p>
            Civil Craft artwork, level designs and educational content belong to the student
            development team and their institution.
          </p>
        </section>
      </div>
    </PublicLayout>
  );
}
