import { AdminApiError, object, playFabAdmin } from "../playfab/admin-client.server.ts";
import type { PremiumEntity } from "../playfab/premium-wallet.server.ts";

/** The player identity always comes from PlayFab, never a browser-supplied ID. */
export async function authenticatePaymentPlayer(
  request: Request,
): Promise<{ playFabId: string; entity?: PremiumEntity }> {
  const ticket = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (!ticket || ticket.length > 4096) throw new AdminApiError(401, "Player sign-in is required.");
  const authentication = await playFabAdmin("Server/AuthenticateSessionTicket", {
    SessionTicket: ticket,
  });
  const user = object(authentication["UserInfo"]);
  const playerId = user["PlayFabId"];
  if (
    authentication["IsSessionTicketExpired"] === true ||
    typeof playerId !== "string" ||
    !/^[a-f0-9]{1,32}$/i.test(playerId)
  )
    throw new AdminApiError(401, "Player sign-in is required.");
  const entity = object(object(user["TitleInfo"])["TitlePlayerAccount"]);
  const entityId = entity["Id"];
  return {
    playFabId: playerId.toUpperCase(),
    ...(entity["Type"] === "title_player_account" &&
    typeof entityId === "string" &&
    /^[a-f0-9]{1,64}$/i.test(entityId)
      ? { entity: { Id: entityId, Type: "title_player_account" as const } }
      : {}),
  };
}
