import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthSessionContinuation } from "@/features/auth/flow";
import type { Locale } from "@/lib/preferences";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const authenticated = Boolean(data?.claims?.sub);
  const parts = request.nextUrl.pathname.split("/");
  const locale: Locale = parts[1] === "en" ? "en" : "pt-BR";
  const inApp = parts[2] === "app";
  const inAuth = parts[2] === "auth";

  if (inApp && !authenticated) {
    return NextResponse.redirect(new URL(`/${locale}/auth/login`, request.url));
  }

  if (
    inAuth
    && authenticated
    && !isAuthSessionContinuation(request.nextUrl.pathname, locale)
  ) {
    return NextResponse.redirect(new URL(`/${locale}/app`, request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
