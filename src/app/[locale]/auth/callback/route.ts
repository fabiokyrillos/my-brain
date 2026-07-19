import { NextResponse } from "next/server";
import { safeAuthNext } from "@/features/auth/flow";
import { isLocale, resolveLocale } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale: candidate } = await params;
  const locale = isLocale(candidate) ? candidate : resolveLocale(candidate);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeAuthNext(url.searchParams.get("next"), locale);

  if (!code) {
    return NextResponse.redirect(new URL(`/${locale}/auth/login?error=callback-failed`, url.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL(`/${locale}/auth/login?error=callback-failed`, url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
