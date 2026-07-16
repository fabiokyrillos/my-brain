"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

function safeLocale(value: FormDataEntryValue | null) { return value === "en" ? "en" : "pt-BR"; }
function credentials(formData: FormData) { return { email: String(formData.get("email") ?? "").trim(), password: String(formData.get("password") ?? "") }; }

export async function signIn(formData: FormData) {
  const locale = safeLocale(formData.get("locale"));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(credentials(formData));
  if (error) redirect(`/${locale}/auth/login?error=${encodeURIComponent(error.message)}`);
  redirect(`/${locale}/app`);
}

export async function signUp(formData: FormData) {
  const locale = safeLocale(formData.get("locale"));
  const data = credentials(formData);
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ ...data, options: { data: { display_name: String(formData.get("displayName") ?? "").trim() } } });
  if (error) redirect(`/${locale}/auth/register?error=${encodeURIComponent(error.message)}`);
  redirect(`/${locale}/auth/login?message=check-email`);
}

export async function recoverPassword(formData: FormData) {
  const locale = safeLocale(formData.get("locale"));
  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(String(formData.get("email") ?? ""), { redirectTo: `${origin}/${locale}/auth/reset` });
  if (error) redirect(`/${locale}/auth/recover?error=${encodeURIComponent(error.message)}`);
  redirect(`/${locale}/auth/login?message=recovery-sent`);
}

export async function signInWithGoogle(formData: FormData) {
  const locale = safeLocale(formData.get("locale"));
  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${origin}/${locale}/auth/callback` } });
  if (error || !data.url) redirect(`/${locale}/auth/login?error=oauth`);
  redirect(data.url);
}
