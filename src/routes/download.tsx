import { useReleasePosts } from "@/lib/cms/releases";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Smartphone } from "lucide-react";
import { EmptyState } from "@/components/common/States";
import { PublicLayout } from "@/components/site/PublicLayout";
import { SectionDivider } from "@/components/site/SectionDivider";
import { GameProp, GameArt } from "@/components/site/GameProp";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDate, useCms } from "@/lib/cms/store";
import canyonPanorama from "@/assets/canyon-panorama.jpg";

export const Route = createFileRoute("/download")({
  head: () => ({
    meta: [
      { title: "Download — Civil Craft: Bridge Edition" },
      {
        name: "description",
        content:
          "Download Civil Craft: Bridge Edition for Android. System requirements, installation guide and FAQ.",
      },
      { property: "og:title", content: "Download Civil Craft: Bridge Edition" },
      {
        property: "og:description",
        content: "Get the Android build, system requirements and installation guide.",
      },
    ],
  }),
  component: DownloadPage,
});

function DownloadPage() {
  const legacyRelease = useCms((s) => s.releases.find((r) => r.status === "current"));
  const updates = useReleasePosts();
  const release = updates.data?.initialized ? updates.data.current : legacyRelease;
  const latest = updates.data?.latest;
  const faq = useCms((s) => s.faq.filter((f) => f.published).sort((a, b) => a.order - b.order));
  const steps = useCms((s) => s.settings.installSteps);

  return (
    <PublicLayout>
      {/* SCENE + download panel */}
      <section className="relative overflow-hidden border-b-2 border-border">
        <img
          src={canyonPanorama}
          alt="Low-poly Civil Craft canyon at golden hour"
          width={1920}
          height={720}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/20"
          aria-hidden="true"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-gold">Download</p>
            <h1 className="mt-3 text-4xl sm:text-5xl">Grab your hard hat</h1>
            <p className="mt-4 max-w-lg text-muted-foreground">
              Civil Craft: Bridge Edition runs on Android. Install the build, pick up your first
              contract and start drafting.
            </p>

            {!release ? (
              <div className="mt-8 max-w-lg">
                <EmptyState
                  title="No build published yet"
                  description="A download appears here as soon as the team publishes a release."
                />
              </div>
            ) : (
              <>
                <div className="mt-7 flex flex-wrap gap-3">
                  {release.fileUrl ? (
                    <Button asChild size="lg" variant="gold">
                      <a href={release.fileUrl} download>
                        <Download className="mr-2 h-5 w-5" aria-hidden="true" />
                        Download APK
                      </a>
                    </Button>
                  ) : (
                    <Button size="lg" variant="gold" disabled>
                      <Download className="mr-2 h-5 w-5" aria-hidden="true" />
                      Download unavailable
                    </Button>
                  )}
                  <Button size="lg" variant="outline" disabled>
                    <Smartphone className="mr-2 h-5 w-5" aria-hidden="true" />
                    Google Play unavailable
                  </Button>
                </div>
                <div className="mt-4 flex max-w-lg flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline" className="border-gold/60 bg-gold/10 text-gold">
                    {release.platform}
                  </Badge>
                  <span className="min-w-0">{release.title ?? `Version ${release.version}`}</span>
                </div>

                {!release.fileUrl ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    No installer is attached to this release yet.
                  </p>
                ) : null}
              </>
            )}
          </div>

          {release ? (
            <dl className="panel grid gap-2 p-6 text-sm">
              <p className="font-display text-lg">Game information</p>
              {[
                ["Version", release.version],
                ["Build", release.build],
                ["Platform", release.platform],
                ["File size", formatBytes(release.fileSizeBytes)],
                ["Released", formatDate(release.releaseDate)],
                ["Min. Android", release.minAndroid],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-center justify-between gap-3 border-b-2 border-border pb-2 last:border-0"
                >
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </section>

      <section id="whats-new" className="scroll-mt-24 bg-background py-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="panel p-6 sm:p-8">
            <h2 className="text-3xl">What's New</h2>
            {updates.isPending ? (
              <p role="status" className="mt-4">
                Loading updates...
              </p>
            ) : updates.isError ? (
              <div role="alert" className="mt-4">
                <p>Updates are temporarily unavailable.</p>
                <Button variant="outline" onClick={() => updates.refetch()}>
                  Retry
                </Button>
              </div>
            ) : latest ? (
              <article className="mt-4">
                <h3 className="break-words text-2xl">{latest.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  v{latest.version} / build {latest.build} /{" "}
                  <time dateTime={latest.releaseDate}>{formatDate(latest.releaseDate)}</time>
                </p>
                <p className="mt-4 whitespace-pre-wrap break-words text-muted-foreground">
                  {latest.notes}
                </p>
              </article>
            ) : (
              <p className="mt-4 text-muted-foreground">No published updates yet.</p>
            )}
          </div>
        </div>
      </section>

      <SectionDivider variant="beam" />

      {/* SYSTEM REQUIREMENTS — spec sheet on blueprint paper */}
      {release ? (
        <section className="relative overflow-hidden bg-background py-16">
          <GameProp kind="tools" className="-left-12 top-8 w-56 opacity-90" />
          <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
            <div className="blueprint-page p-6 sm:p-10">
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] opacity-80">
                Device specification
              </p>
              <h2 className="mt-2 text-3xl text-current">System requirements</h2>
              <div className="mt-8 grid gap-10 md:grid-cols-2">
                {[
                  ["Minimum", release.minRequirements],
                  ["Recommended", release.recommendedRequirements],
                ].map(([label, list]) => (
                  <div
                    key={label as string}
                    className="min-w-0 border-t-2 border-dashed border-current/40 pt-4"
                  >
                    <h3 className="font-display text-lg text-current">{label as string}</h3>
                    <ul className="mt-2 space-y-1.5 text-sm opacity-90">
                      {(list as string[]).map((r) => (
                        <li key={r} className="flex gap-2">
                          <span aria-hidden="true">—</span>
                          <span className="min-w-0">{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* INSTALL — progression path */}
      <section className="border-y-2 border-border bg-card/60 py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-3xl">Installation guide</h2>
          <ol className="relative mt-10 grid gap-8 md:grid-cols-4">
            <span
              className="absolute left-0 right-0 top-6 hidden border-t-2 border-dashed border-border md:block"
              aria-hidden="true"
            />
            {steps.map((step, i) => (
              <li key={step} className="relative min-w-0">
                <span className="relative grid h-12 w-12 place-items-center rounded-2xl border-2 border-border gold-gradient font-display text-gold-foreground shadow-[var(--shadow-soft)]">
                  {i + 1}
                </span>
                <p className="mt-3 text-sm text-muted-foreground">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* FAQ + engineer */}
      <section className="relative overflow-hidden bg-background py-16">
        <div className="mx-auto grid max-w-6xl items-start gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,15rem)]">
          <div className="min-w-0">
            <h2 className="text-3xl">Frequently asked questions</h2>
            {faq.length === 0 ? (
              <div className="mt-6">
                <EmptyState title="No FAQs yet" />
              </div>
            ) : (
              <Accordion type="single" collapsible className="panel mt-6 px-4">
                {faq.map((f) => (
                  <AccordionItem key={f.id} value={f.id}>
                    <AccordionTrigger className="font-display">{f.question}</AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      {f.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </div>
          <GameArt
            kind="engineer"
            alt="Chibi Civil Craft engineer pointing at the install steps"
            className="mx-auto hidden w-full lg:block"
          />
        </div>
      </section>
    </PublicLayout>
  );
}
