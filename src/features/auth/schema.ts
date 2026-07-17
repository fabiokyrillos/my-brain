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

export const signUpSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  email: emailSchema,
  password: passwordSchema,
  passwordConfirmation: z.string().min(1).max(128),
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
