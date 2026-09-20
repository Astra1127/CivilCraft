import { z } from "zod";
import { AdminApiError, object, playFabAdmin } from "../playfab/admin-client.server.ts";
import { smallBody } from "../playfab/request-body.server.ts";
import { contactSettingsSchema, emptyContactSettings } from "./contact-settings-types.ts";
import { isRealText } from "./content-types.ts";

const key = "civilcraft.website.v1.contact-settings";
export async function contactSettingsRequest(
  request: Request,
  admin = false,
): Promise<Response | null> {
  if (
    new URL(request.url).pathname !==
    (admin ? "/api/admin/contact-settings" : "/api/contact-settings")
  )
    return null;
  const json = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { "Cache-Control": "no-store", Vary: "Cookie" } });
  try {
    if (request.method === "GET") {
      const stored = object(
        (await playFabAdmin("Admin/GetTitleInternalData", { Keys: [key] }))["Data"],
      )[key];
      const settings =
        stored == null
          ? emptyContactSettings
          : contactSettingsSchema.parse(JSON.parse(String(stored)));
      return json({
        ...settings,
        ...Object.fromEntries(
          Object.entries(settings)
            .filter(([k]) => k !== "social")
            .map(([k, v]) => [k, isRealText(v) ? v : ""]),
        ),
        social: Object.fromEntries(
          Object.entries(settings.social).map(([k, v]) => [k, isRealText(v) ? v : ""]),
        ),
      });
    }
    if (!admin || request.method !== "POST") return json({ error: "Method not allowed." }, 405);
    const settings = contactSettingsSchema.parse(await smallBody(request));
    await playFabAdmin("Admin/SetTitleInternalData", { Key: key, Value: JSON.stringify(settings) });
    return json(settings);
  } catch (error) {
    if (error instanceof z.ZodError)
      return json({ error: "Check the contact details and social links." }, 400);
    return json(
      {
        error:
          error instanceof AdminApiError
            ? error.message
            : "Contact details are temporarily unavailable.",
      },
      error instanceof AdminApiError ? error.status : 503,
    );
  }
}
