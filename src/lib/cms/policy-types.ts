import { z } from "zod";

export const policySectionSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(50_000),
});

export type PolicySection = z.infer<typeof policySectionSchema>;

export const policyRevisionSchema = z.object({
  version: z.string(),
  publishedAt: z.string().datetime(),
  publishedBy: z.string(),
  changeSummary: z.string(),
});

export type PolicyRevision = z.infer<typeof policyRevisionSchema>;

export const policyRecordSchema = z.object({
  id: z.enum(["privacy", "terms"]),
  title: z.string(),
  version: z.string(),
  lastUpdated: z.string(),
  publishedAt: z.string().datetime(),
  publishedBy: z.string(),
  changeSummary: z.string(),
  sections: z.array(policySectionSchema),
  draft: z
    .object({
      sections: z.array(policySectionSchema),
      changeSummary: z.string().optional(),
      savedAt: z.string().datetime(),
      savedBy: z.string(),
    })
    .nullable()
    .optional(),
  revisions: z.array(policyRevisionSchema).default([]),
});

export type PolicyRecord = z.infer<typeof policyRecordSchema>;

export interface PublicPolicy {
  id: "privacy" | "terms";
  title: string;
  version: string;
  lastUpdated: string;
  publishedAt: string;
  changeSummary: string;
  sections: PolicySection[];
}
