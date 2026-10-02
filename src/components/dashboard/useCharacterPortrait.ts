import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { playerFetch, readSession } from "@/lib/playfab/client";

export function useCharacterPortrait() {
  const { player } = useAuth();
  const id = player?.playFabId;
  const [portrait, setPortrait] = useState<{ id: string; url: string }>();
  useEffect(() => {
    if (!id) return;
    let disposed = false;
    let objectUrl: string | undefined;
    let running = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (running) return;
      const session = readSession("player");
      if (session?.identity.playFabId !== id) return;
      running = true;
      try {
        const response = await playerFetch("/api/player/character-portrait", {
          headers: { Authorization: `Bearer ${session.sessionTicket}` },
          cache: "no-store",
          signal: controller.signal,
        });
        const blob =
          response.ok && response.headers.get("content-type") === "image/png"
            ? await response.blob()
            : null;
        if (disposed || readSession("player")?.sessionTicket !== session.sessionTicket) return;
        const next = blob ? URL.createObjectURL(blob) : undefined;
        setPortrait(next ? { id, url: next } : undefined);
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = next;
      } catch {
        if (!disposed) {
          setPortrait(undefined);
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          objectUrl = undefined;
        }
      } finally {
        running = false;
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 60_000);
    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(interval);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);
  return portrait?.id === id ? portrait?.url : undefined;
}
