import { put } from "@vercel/blob";
import { createHash } from "node:crypto";
import { AdminApiError, playFabAdmin } from "../playfab/admin-client.server.ts";

/** PlayFab's SMTP add-on owns delivery and templates. This app has no SMTP client. */
export const emailDelivery = {
  async claim(updateId: string, playerId: string) {
    const token = process.env["BLOB_READ_WRITE_TOKEN"];
    if (!token)
      throw new AdminApiError(503, "Notification duplicate protection is not configured.");
    const key = createHash("sha256")
      .update(updateId + ":" + playerId)
      .digest("hex");
    try {
      await put(
        `civilcraft/email/claims/${key}.json`,
        JSON.stringify({ attemptedAt: new Date().toISOString() }),
        {
          token,
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: false,
          contentType: "application/json",
          abortSignal: AbortSignal.timeout(12_000),
        },
      );
      return true;
    } catch (error) {
      if (error instanceof Error && /already exists/i.test(error.message)) return false;
      throw error;
    }
  },
  async send(playerId: string, templateId: string) {
    await playFabAdmin("Server/SendEmailFromTemplate", {
      PlayFabId: playerId,
      EmailTemplateId: templateId,
    });
  },
};
