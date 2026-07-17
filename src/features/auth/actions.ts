"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { buildAuthCallbackUrl } from "@/features/auth/flow";
import {
  recoverySchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/features/auth/schema";
import type { Locale } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/server";

function safeLocale(value: FormDataEntryValue | null): Locale {
  return value === "en" ? "en" : "pt-BR";
}

function formValues(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

async function requestOrigin() {
  return (await headers()).get("origin") ?? "http://localhost:3000";
}

export async function signIn(formData: FormData) {
  const locale = safeLocale(formData.get("locale"));
  const parsed = signInSchema.safeParse(formValues(formData));
  if (!parsed.success) redirect(`/${locale}/auth/login?error=invalid-form`);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) redirect(`/${locale}/auth/login?error=invalid-credentials`);

  redirect(`/${locale}/app`);
}

export async function signUp(formData: FormData) {
  const locale = safeLocale(formData.get("locale"));
  const parsed = signUpSchema.safeParse(formValues(formData));
  if (!parsed.success) redirect(`/${locale}/auth/register?error=invalid-form`);

  const origin = await requestOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: buildAuthCallbackUrl(origin, locale, `/${locale}/app`),
    },
  });

  if (error) redirect(`/${locale}/auth/register?error=signup-failed`);
  redirect(`/${locale}/auth/login?message=check-email`);
}

export async function recoverPassword(formData: FormData) {
  const locale = safeLocale(formData.get("locale"));
  const parsed = recoverySchema.safeParse(formValues(formData));
  if (!parsed.success) redirect(`/${locale}/auth/recover?error=invalid-form`);

  const origin = await requestOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: buildAuthCallbackUrl(origin, locale, `/${locale}/auth/reset`),
  });

  if (error) redirect(`/${locale}/auth/recover?error=recovery-failed`);
  redirect(`/${locale}/auth/login?message=recovery-sent`);
}

export async function updatePassword(formData: FormData) {
  const locale = safeLocale(formData.get("locale"));
  const parsed = resetPasswordSchema.safeParse(formValues(formData));
  if (!parsed.success) redirect(`/${locale}/auth/reset?error=invalid-form`);

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect(`/${locale}/auth/login?error=callback-failed`);

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) redirect(`/${locale}/auth/reset?error=password-update-failed`);

  await supabase.auth.signOut();
  redirect(`/${locale}/auth/login?message=password-updated`);
}
