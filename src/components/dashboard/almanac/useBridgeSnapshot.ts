import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { playerFetch, readSession } from "@/lib/playfab/client";
import type { AlmanacLevel } from "@/lib/playfab/types";

type SnapshotState = {
  status: "missing" | "loading" | "ready" | "unavailable";
  url?: string;
};

export function useBridgeSnapshotState(level: AlmanacLevel, refreshKey = 0): SnapshotState {
  const { player } = useAuth();
  const id = player?.playFabId;
  const fileName = level.completion?.snapshotFileName;
  const session = readSession("player");
  const ticket = session?.identity.playFabId === id ? session?.sessionTicket : undefined;
  const key = JSON.stringify([
    id,
    level.regionId,
    level.levelId,
    fileName,
    level.completion?.resultId,
    level.completion?.snapshotAlbum,
    refreshKey,
  ]);
  const [photo, setPhoto] = useState<{ key: string; ticket: string; state: SnapshotState }>();
  useEffect(() => {
    if (!id || !fileName || !ticket) return;
    const controller = new AbortController();
    let disposed = false;
    let objectUrl: string | undefined;
    void (async () => {
      try {
        const search = new URLSearchParams({ contractId: level.levelId, regionId: level.regionId });
        const response = await playerFetch(`/api/player/bridge-snapshot?${search}`, {
          headers: { Authorization: `Bearer ${ticket}` },
          cache: "no-store",
          signal: controller.signal,
        });
        const blob =
          response.ok && response.headers.get("content-type") === "image/png"
            ? await response.blob()
            : null;
        if (disposed || readSession("player")?.sessionTicket !== ticket) return;
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
          setPhoto({ key, ticket, state: { status: "ready", url: objectUrl } });
        } else {
          setPhoto({ key, ticket, state: { status: "unavailable" } });
        }
      } catch {
        if (!disposed && readSession("player")?.sessionTicket === ticket)
          setPhoto({ key, ticket, state: { status: "unavailable" } });
      }
    })();
    return () => {
      disposed = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, ticket, fileName, key, level.levelId, level.regionId]);
  if (!id || !fileName) return { status: "missing" };
  if (!ticket) return { status: "unavailable" };
  return photo?.key === key && photo.ticket === ticket ? photo.state : { status: "loading" };
}

export function useBridgeSnapshot(level: AlmanacLevel, refreshKey = 0) {
  return useBridgeSnapshotState(level, refreshKey).url;
}
