import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(254)
  .email();

const passwordSchema = z
  .string()
  .min(12)
  .max(128)
  .regex(/[a-z]/)
  .regex(/[A-Z]/)
  .regex(/[0-9]/)
  .regex(/[^A-Za-z0-9]/);

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

/**
 * SH-LEGAL-007. The consent control is part of the SCHEMA, not of the form.
 *
 * An unchecked checkbox submits nothing at all, so the field is absent rather
 * than `false` — and `z.literal("on")` on a required field is exactly "the box
 * was ticked". Removing the input in the browser therefore does not bypass
 * anything: the parse fails server-side with its own code, which is the
 * property the requirement asks for.
 */
export const signUpSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  email: emailSchema,
  password: passwordSchema,
  passwordConfirmation: z.string().min(1).max(128),
  acceptedPolicies: z.literal("on"),
}).refine((value) => value.password === value.passwordConfirmation, {
  path: ["passwordConfirmation"],
});

export const recoverySchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  password: passwordSchema,
  passwordConfirmation: z.string().min(1).max(128),
}).refine((value) => value.password === value.passwordConfirmation, {
  path: ["passwordConfirmation"],
});
