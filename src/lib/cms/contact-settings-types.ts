import { z } from "zod";

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .refine((value) => !value || /^https?:\/\//i.test(value), "Use an HTTP or HTTPS URL.");
export const contactSettingsSchema = z.object({
  siteName: z.string().trim().max(100),
  supportEmail: z.union([z.literal(""), z.string().trim().email().max(255)]),
  phone: z.string().trim().max(100),
  address: z.string().trim().max(500),
  officeHours: z.string().trim().max(200),
  social: z.object({ facebook: optionalUrl, youtube: optionalUrl, discord: optionalUrl }),
});
export type ContactSettings = z.infer<typeof contactSettingsSchema>;
export const emptyContactSettings: ContactSettings = {
  siteName: "",
  supportEmail: "",
  phone: "",
  address: "",
  officeHours: "",
  social: { facebook: "", youtube: "", discord: "" },
};
