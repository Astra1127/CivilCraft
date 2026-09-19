import { z } from "zod";

export const inquiryTypes = [
  "General",
  "Technical Support",
  "Bug Report",
  "Feedback",
  "Partnership",
  "Educational",
] as const;

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(100),
  email: z.string().trim().email("Enter a valid email address").max(255),
  subject: z.string().trim().min(3, "Please enter a subject").max(150),
  inquiryType: z.enum(inquiryTypes),
  message: z.string().trim().min(10, "Please write at least 10 characters").max(1000),
});

export type ContactInput = z.infer<typeof contactSchema>;
