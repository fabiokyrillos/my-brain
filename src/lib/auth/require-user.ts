import { redirect } from "next/navigation";
import type { Locale } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/server";

export async function requireUser(locale: Locale) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);
  return { supabase, user };
}
