import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { authService, notificationService } from "@/lib/playfab";

/** A destination acknowledges an item only after resolving the current player's record. */
export function useNotificationRead(notificationId: string | undefined) {
  const { player } = useAuth();
  const qc = useQueryClient();
  const id = player?.playFabId;
  useEffect(() => {
    if (!id || !notificationId || authService.getCurrentUser("player")?.playFabId !== id) return;
    void notificationService
      .markRead([notificationId], id)
      .then(() => qc.invalidateQueries({ queryKey: ["notifications", id] }));
  }, [id, notificationId, qc]);
}
