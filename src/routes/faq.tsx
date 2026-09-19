import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/States";
import { PublicLayout } from "@/components/site/PublicLayout";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useCms } from "@/lib/cms/store";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQ — Civil Craft: Bridge Edition" },
      {
        name: "description",
        content:
          "Answers to common questions about downloading, installing and playing Civil Craft: Bridge Edition.",
      },
      { property: "og:title", content: "FAQ — Civil Craft: Bridge Edition" },
      {
        property: "og:description",
        content: "Download, gameplay and account questions about Civil Craft: Bridge Edition.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FaqPage,
});

const groups = ["Download", "Gameplay", "Account", "General"] as const;

function FaqPage() {
  const faq = useCms((s) => s.faq.filter((f) => f.published).sort((a, b) => a.order - b.order));

  return (
    <PublicLayout>
      <PageHeader
        eyebrow="Site Office"
        title="Frequently Asked Questions"
        description="Answers about installing the APK, playing Civil Craft and keeping your progress safe."
      />
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-12 sm:px-6">
        {faq.length === 0 ? (
          <EmptyState
            title="No questions published yet"
            description="Answers to common Civil Craft questions will appear here."
          />
        ) : (
          groups
            .filter((g) => faq.some((f) => f.category === g))
            .map((g) => (
              <section key={g} className="paper-panel p-5">
                <h2 className="mb-2 font-display text-xl">{g}</h2>
                <Accordion type="single" collapsible>
                  {faq
                    .filter((f) => f.category === g)
                    .map((f) => (
                      <AccordionItem key={f.id} value={f.id}>
                        <AccordionTrigger className="text-left font-bold">
                          {f.question}
                        </AccordionTrigger>
                        <AccordionContent className="text-muted-foreground">
                          {f.answer}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                </Accordion>
              </section>
            ))
        )}
      </div>
    </PublicLayout>
  );
}
