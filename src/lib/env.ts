import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url("Supabase URL inválida"),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20).optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20).optional(),
}).refine(
  (value) => value.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || value.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { message: "Supabase publishable key ausente" },
);

export function parsePublicEnv(input: Record<string, unknown>) {
  const result = publicEnvSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`Supabase não configurado: ${result.error.issues.map((issue) => issue.message).join(", ")}`);
  }
  return {
    NEXT_PUBLIC_SUPABASE_URL: result.data.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_KEY:
      result.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      result.data.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  };
}

export function getPublicEnv() {
  return parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}
