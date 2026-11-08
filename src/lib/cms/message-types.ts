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
export const publicInquiryTypes = [
  "General",
  "Technical Support",
  "Partnership",
  "Educational",
] as const;
export const publicContactSchema = contactSchema.extend({
  inquiryType: z.enum(publicInquiryTypes),
});
export const feedbackCategories = [
  "Gameplay Feedback",
  "Bug Report",
  "Suggestion",
  "Other Game Feedback",
] as const;
export const feedbackSchema = contactSchema
  .pick({ subject: true, message: true })
  .extend({
    action: z.literal("feedback"),
    inquiryType: z.enum(feedbackCategories),
    rating: z.number().int().min(1).max(5).optional(),
    allowPublicTestimonial: z.boolean().default(false),
  })
  .strict();
export type FeedbackInput = z.infer<typeof feedbackSchema>;

export type TestimonialStatus = "Pending" | "Approved" | "Rejected";

export interface PublicTestimonial {
  id: string;
  displayName: string;
  message: string;
  rating?: number;
  inquiryType: string;
  createdAt: string;
}
