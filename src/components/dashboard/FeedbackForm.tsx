import { useState } from "react";
import { Link } from "@tanstack/react-router";
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
          <Button variant="outline" size="sm" onClick={() => eligibility.refetch()}>
            Retry
          </Button>
        </div>
      ) : !eligibility.data?.eligible ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Play CivilCraft and complete a bridge-building challenge to unlock game feedback.
          </p>
          <Button asChild variant="gold" size="sm">
            <Link to="/download">Download CivilCraft</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => eligibility.refetch()}>
            Check again
          </Button>
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
