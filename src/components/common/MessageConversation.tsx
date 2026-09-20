import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { ContactMessage } from "@/lib/cms/types";
import { formatDate } from "@/lib/cms/store";

export function MessageConversation({
  message,
  onReply,
  admin = false,
}: {
  message: ContactMessage;
  onReply: (text: string) => Promise<void>;
  admin?: boolean;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending || !text.trim()) return;
    setSending(true);
    try {
      await onReply(text.trim());
      setText("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send reply.");
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="space-y-4">
      <p className="whitespace-pre-wrap break-words rounded-xl border-2 border-dashed border-border bg-secondary/30 p-3 text-sm">
        {message.message}
      </p>
      {admin && message.notificationStatus && message.notificationStatus !== "sent" ? (
        <p className="text-xs text-muted-foreground">
          Initial email notification: {message.notificationStatus.replaceAll("_", " ")}. The message
          is saved.
        </p>
      ) : null}
      <ol className="space-y-3">
        {(message.replies ?? []).map((reply) => (
          <li key={reply.id} className="rounded-xl border-2 border-border bg-card p-3">
            <p className="text-xs font-bold text-muted-foreground">
              {reply.author === "admin" ? "Civil Craft team" : "Player"} /{" "}
              <time dateTime={reply.createdAt}>{formatDate(reply.createdAt)}</time>
            </p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm">{reply.message}</p>
            {admin && reply.notificationStatus && reply.notificationStatus !== "sent" ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Email notification: {reply.notificationStatus.replaceAll("_", " ")}. The reply is
                saved.
              </p>
            ) : null}
          </li>
        ))}
      </ol>
      {admin && !message.ownerId ? (
        <p className="text-xs text-muted-foreground">
          Guest submission: replies are saved for the team, but this guest has no player
          conversation or automatic reply email. Use Reply by email to contact them.
        </p>
      ) : null}
      <form onSubmit={submit} className="space-y-2">
        <Label htmlFor={`reply-${message.id}`}>Reply</Label>
        <Textarea
          id={`reply-${message.id}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          rows={4}
          disabled={sending}
        />
        <Button type="submit" variant="gold" size="sm" disabled={sending || !text.trim()}>
          {sending ? "Sending..." : "Send reply"}
        </Button>
      </form>
    </div>
  );
}
