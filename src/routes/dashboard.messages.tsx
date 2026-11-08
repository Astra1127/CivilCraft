import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { replyAsPlayer, toggleTestimonialConsent, usePlayerMessages } from "@/lib/cms/messages";
import { MessageConversation } from "@/components/common/MessageConversation";
import { SectionHeading } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FeedbackForm } from "@/components/dashboard/FeedbackForm";

export const Route = createFileRoute("/dashboard/messages")({ component: PlayerMessages });
function PlayerMessages() {
  const { player } = useAuth();
  const queryClient = useQueryClient();
  const query = usePlayerMessages(player?.playFabId ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [togglingConsent, setTogglingConsent] = useState(false);
  const messages = query.data?.messages ?? [];
  const selected = messages.find((m) => m.id === selectedId) ?? messages[0];

  const handleToggleConsent = async (messageId: string, currentConsent: boolean) => {
    setTogglingConsent(true);
    try {
      await toggleTestimonialConsent(messageId, !currentConsent);
      toast.success(
        !currentConsent
          ? "Permission granted for homepage testimonial"
          : "Homepage testimonial permission revoked",
      );
      await Promise.all([
        query.refetch(),
        queryClient.invalidateQueries({ queryKey: ["public-testimonials"] }),
      ]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update testimonial permission.",
      );
    } finally {
      setTogglingConsent(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeading
        title="Messages"
        description="Your conversations with the Civil Craft team."
        action={
          <Button asChild variant="gold" size="sm">
            <Link to="/contact">New message</Link>
          </Button>
        }
      />
      <FeedbackForm
        playerId={player?.playFabId ?? ""}
        onSubmitted={async (id) => {
          setSelectedId(id);
          await query.refetch();
        }}
      />
      {query.isPending ? (
        <LoadingState label="Loading conversations..." />
      ) : query.isError ? (
        <ErrorState description={query.error.message} onRetry={() => query.refetch()} />
      ) : !selected ? (
        <EmptyState
          title="No messages yet"
          description="Messages you send while signed in will appear here."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
          <ul className="panel space-y-2 p-3">
            {messages.map((message) => (
              <li key={message.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(message.id)}
                  aria-current={selected.id === message.id}
                  className="w-full rounded-lg p-3 text-left hover:bg-secondary/50"
                >
                  <span className="block break-words font-display">{message.subject}</span>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline">{message.status}</Badge>
                    {message.rating ? (
                      <span className="flex items-center text-xs text-gold">
                        <Star className="mr-0.5 h-3 w-3 fill-gold" />
                        {message.rating}
                      </span>
                    ) : null}
                    {message.allowPublicTestimonial ? (
                      <Badge variant="secondary" className="text-[10px] text-gold border-gold/30">
                        {message.testimonialStatus === "Approved"
                          ? "Featured"
                          : message.testimonialStatus === "Rejected"
                            ? "Declined"
                            : "Testimonial Pending"}
                      </Badge>
                    ) : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <section className="panel min-w-0 space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="break-words text-xl">{selected.subject}</h2>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{selected.status}</Badge>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>{selected.inquiryType}</span>
              {selected.rating ? (
                <div className="flex items-center gap-1 text-gold">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`h-4 w-4 ${
                        star <= (selected.rating ?? 0)
                          ? "fill-gold text-gold"
                          : "text-muted-foreground/30"
                      }`}
                    />
                  ))}
                  <span className="ml-1 text-xs font-semibold">{selected.rating}/5</span>
                </div>
              ) : null}
            </div>

            {/* Testimonial consent & moderation status */}
            <div className="rounded-lg border border-border/80 bg-secondary/30 p-3.5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Public Testimonial Status
                  </p>
                  <p className="text-sm">
                    {selected.allowPublicTestimonial ? (
                      selected.testimonialStatus === "Approved" ? (
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          Approved — Featured on homepage
                        </span>
                      ) : selected.testimonialStatus === "Rejected" ? (
                        <span className="font-semibold text-muted-foreground">
                          Not approved for public display
                        </span>
                      ) : (
                        <span className="font-semibold text-gold">
                          Pending administrator review
                        </span>
                      )
                    ) : (
                      <span className="text-muted-foreground">
                        Private feedback — Not shared publicly
                      </span>
                    )}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={selected.allowPublicTestimonial ? "outline" : "gold"}
                  disabled={togglingConsent}
                  onClick={() =>
                    handleToggleConsent(selected.id, !!selected.allowPublicTestimonial)
                  }
                >
                  {togglingConsent
                    ? "Updating..."
                    : selected.allowPublicTestimonial
                      ? "Revoke Public Permission"
                      : "Allow as Testimonial"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {selected.allowPublicTestimonial
                  ? "You gave permission for your feedback, rating, and display name to be considered as a testimonial. You may revoke this permission at any time."
                  : "Allowing your feedback as a testimonial lets the CivilCraft team review and feature your comment on the public homepage. Personal details like email and player ID are never shared."}
              </p>
            </div>

            <MessageConversation
              key={selected.id}
              message={selected}
              onReply={async (text) => {
                await replyAsPlayer(selected.id, text);
                toast.success("Reply saved");
                await query.refetch();
              }}
            />
          </section>
        </div>
      )}
    </div>
  );
}
