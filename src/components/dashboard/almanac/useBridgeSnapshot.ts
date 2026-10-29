import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { playerFetch, readSession } from "@/lib/playfab/client";
import type { AlmanacLevel } from "@/lib/playfab/types";

export function useBridgeSnapshot(level: AlmanacLevel) {
  const { player } = useAuth();
  const id = player?.playFabId;
  const fileName = level.completion?.snapshotFileName;
  const key = JSON.stringify([
    id,
    level.regionId,
    level.levelId,
    fileName,
    level.completion?.snapshotAlbum,
  ]);
  const [photo, setPhoto] = useState<{ key: string; url: string }>();
  useEffect(() => {
    if (!id || !fileName) return;
    const session = readSession("player");
    if (session?.identity.playFabId !== id) return;
    const controller = new AbortController();
    let disposed = false;
    let objectUrl: string | undefined;
    void (async () => {
      try {
        const search = new URLSearchParams({ contractId: level.levelId, regionId: level.regionId });
        const response = await playerFetch(`/api/player/bridge-snapshot?${search}`, {
          headers: { Authorization: `Bearer ${session.sessionTicket}` },
          cache: "no-store",
          signal: controller.signal,
        });
        const blob =
          response.ok && response.headers.get("content-type") === "image/png"
            ? await response.blob()
            : null;
        if (disposed || readSession("player")?.sessionTicket !== session.sessionTicket) return;
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
          setPhoto({ key, url: objectUrl });
        }
      } catch {
        /* Completion remains visible when its image is unavailable. */
      }
    })();
    return () => {
      disposed = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, fileName, key, level.levelId, level.regionId]);
  return photo?.key === key ? photo.url : undefined;
}
