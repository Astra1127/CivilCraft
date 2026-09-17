import { z } from "zod";
import { passwordRules } from "./password-rules.ts";

export const resetFailure = "Unable to reset your password. Please request a new recovery email.";
export const invalidResetLink = "This password reset link is incomplete.";
export const expiredResetLink = "This password reset link has expired or has already been used.";
export const resetTokenSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine((v) => v.trim().length > 0);
export const resetPasswordSchema = z.object({
  token: resetTokenSchema,
  password: z
    .string()
    .max(128, "Use no more than 128 characters")
    .refine(
      (v) => passwordRules.every((rule) => rule.test(v)),
      "Use at least 8 characters, including uppercase, lowercase and a number",
    ),
});
export const resetFormSchema = resetPasswordSchema
  .extend({ confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "Passwords do not match",
  });
