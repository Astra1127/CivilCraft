import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { useFeedbackEligibility, submitPlayerFeedback } from "@/lib/cms/messages";
import { feedbackSchema, feedbackCategories } from "@/lib/cms/message-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function FeedbackForm({
  playerId,
  onSubmitted,
}: {
  playerId: string;
  onSubmitted: (id: string) => Promise<void>;
}) {
  const eligibility = useFeedbackEligibility(playerId);
  const [inquiryType, setCategory] = useState<string>(feedbackCategories[0]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState<number>(5);
  const [allowPublicTestimonial, setAllowPublicTestimonial] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  return (
    <section className="panel space-y-4 p-5">
      <h2 className="font-display text-xl">Game feedback</h2>
      {eligibility.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Checking feedback eligibility...
        </p>
      ) : eligibility.isError ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm">
            We couldn't verify your game progress right now. Please try again later.
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={eligibility.isFetching}
            onClick={() => eligibility.refetch()}
          >
            {eligibility.isFetching ? "Checking..." : "Retry"}
          </Button>
        </div>
      ) : !eligibility.data?.eligible ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Play CivilCraft and complete a bridge-building challenge to unlock game feedback.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="gold" size="sm">
              <Link to="/download">Download CivilCraft</Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={eligibility.isFetching}
              onClick={() => eligibility.refetch()}
            >
              {eligibility.isFetching ? "Checking..." : "Check again"}
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (sending) return;
            const parsed = feedbackSchema.safeParse({
              action: "feedback",
              inquiryType,
              subject,
              message,
              rating,
              allowPublicTestimonial,
            });
            if (!parsed.success) {
              setError(parsed.error.issues[0]?.message ?? "Check your feedback fields.");
              return;
            }
            setSending(true);
            setError("");
            try {
              const result = await submitPlayerFeedback(parsed.data);
              setSubject("");
              setMessage("");
              setRating(5);
              setAllowPublicTestimonial(false);
              toast.success("Feedback sent");
              await onSubmitted(result.id);
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Feedback could not be sent. Please try again.",
              );
              void eligibility.refetch();
            } finally {
              setSending(false);
            }
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="feedback-category">Category</Label>
            <select
              id="feedback-category"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={inquiryType}
              onChange={(e) => setCategory(e.target.value)}
              disabled={sending}
            >
              {feedbackCategories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Rating</Label>
            <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Game rating">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  disabled={sending}
                  className="rounded p-1 text-gold transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-gold"
                  aria-label={`${star} star${star > 1 ? "s" : ""}`}
                  aria-checked={rating === star}
                  role="radio"
                >
                  <Star
                    className={`h-6 w-6 ${
                      star <= rating ? "fill-gold text-gold" : "text-muted-foreground/40"
                    }`}
                  />
                </button>
              ))}
              <span className="ml-2 text-xs font-semibold text-muted-foreground">
                {rating} of 5 stars
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="feedback-subject">Subject</Label>
            <Input
              id="feedback-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              minLength={3}
              maxLength={150}
              required
              disabled={sending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="feedback-message">Message</Label>
            <Textarea
              id="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              minLength={10}
              maxLength={1000}
              rows={5}
              required
              disabled={sending}
            />
          </div>

          <div className="rounded-lg border border-border/80 bg-secondary/30 p-3.5">
            <div className="flex items-start gap-2.5">
              <input
                type="checkbox"
                id="feedback-public-testimonial"
                checked={allowPublicTestimonial}
                onChange={(e) => setAllowPublicTestimonial(e.target.checked)}
                disabled={sending}
                className="mt-1 h-4 w-4 rounded border-border text-gold focus:ring-gold"
              />
              <div className="space-y-1">
                <Label
                  htmlFor="feedback-public-testimonial"
                  className="cursor-pointer font-semibold"
                >
                  Feature my feedback as a player testimonial on the homepage
                </Label>
                <p className="text-xs text-muted-foreground">
                  If selected, an administrator will review your feedback before featuring it. Your
                  rating, message, and display name may appear publicly. Your email, PlayFab ID, and
                  internal account data are never shown. You can revoke this permission anytime from
                  your dashboard.
                </p>
              </div>
            </div>
          </div>

          <Button variant="gold" type="submit" disabled={sending}>
            {sending ? "Sending..." : "Send Feedback"}
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
