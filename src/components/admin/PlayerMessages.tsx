import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { request } from "@/lib/playfab/admin-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
type Message = { id: string; title: string; body: string; createdAt: string };
export function PlayerMessages({ playerId }: { playerId: string }) {
  const path = `players/${encodeURIComponent(playerId)}/messages`;
  const query = useQuery({
    queryKey: ["admin-player-messages", playerId],
    queryFn: () => request<{ messages: Message[] }>(path),
    retry: false,
  });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const mutate = async (data: Record<string, unknown>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setNotice("");
    try {
      await request(path, data);
      if (data["action"] === "send") {
        setTitle("");
        setBody("");
      }
      setDeleting(null);
      setNotice(
        data["action"] === "send"
          ? "Message sent to this player’s Updates inbox."
          : "Message deleted. It disappears on the game’s next refresh.",
      );
      await query.refetch();
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message + " Refresh the list before retrying."
          : "Unable to confirm the action. Refresh before retrying.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="mt-4 space-y-3 border-t border-border pt-3">
      <h4 className="font-semibold">Private game messages</h4>
      <p className="text-xs text-muted-foreground">
        Only player {playerId} can read these in the game’s Updates screen. Plain text only; no
        currency or rewards are granted.
      </p>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void mutate({ action: "send", title, body });
        }}
      >
        <Input
          aria-label="Message title"
          placeholder="Message title"
          maxLength={100}
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
        />
        <Textarea
          aria-label="Private message"
          placeholder="Write to this player…"
          maxLength={2000}
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={busy}
        />
        <Button type="submit" disabled={busy || !title.trim() || !body.trim()}>
          Send private message
        </Button>
      </form>
      <p role="status" className="text-sm">
        {notice}
      </p>
      <Button
        size="sm"
        variant="outline"
        disabled={busy || query.isFetching}
        onClick={() => void query.refetch()}
      >
        Refresh messages
      </Button>
      {query.isPending ? (
        <p>Loading messages…</p>
      ) : query.isError ? (
        <p role="alert">Messages could not be loaded. Please refresh.</p>
      ) : query.data?.messages.length === 0 ? (
        <p>No messages for this player.</p>
      ) : (
        query.data?.messages.map((m) => (
          <article key={m.id} className="rounded-lg border border-border p-3 space-y-2">
            <h5 className="font-semibold break-words">{m.title}</h5>
            <p className="text-xs">{new Date(m.createdAt).toLocaleString()}</p>
            <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
            {deleting === m.id ? (
              <div className="space-y-2">
                <p>
                  Delete this message from this player’s inbox? Already-read copies cannot be
                  recalled.
                </p>
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void mutate({ action: "delete", id: m.id })}
                >
                  Confirm delete
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => setDeleting(m.id)}>
                Delete message
              </Button>
            )}
          </article>
        ))
      )}
    </div>
  );
}
