import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { replyAsPlayer, usePlayerMessages } from "@/lib/cms/messages";
import { MessageConversation } from "@/components/common/MessageConversation";
import { SectionHeading } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/dashboard/messages")({ component: PlayerMessages });
function PlayerMessages() {
  const { player } = useAuth();
  const query = usePlayerMessages(player?.playFabId ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const messages = query.data?.messages ?? [];
  const selected = messages.find((m) => m.id === selectedId) ?? messages[0];
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
                  <Badge variant="outline">{message.status}</Badge>
                </button>
              </li>
            ))}
          </ul>
          <section className="panel min-w-0 space-y-4 p-4">
            <h2 className="break-words text-xl">{selected.subject}</h2>
            <Badge variant="outline">{selected.status}</Badge>
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
