import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthSessionContinuation } from "@/features/auth/flow";
import type { Locale } from "@/lib/preferences";

/**
 * What an authenticated response may be kept in, which is nothing (UX-26).
 *
 * `no-store` is not belt-and-braces here — it is the mechanism behind "browser
 * Back must not restore usable authenticated content". Without it Chrome is free
 * to serve the previous entry from its back/forward cache, so after signing out
 * a single Back press handed the whole shell back, fully rendered, with the
 * account surface still naming the account that had just left. The first live run
 * of `e2e/account-session.spec.ts` caught exactly that.
 *
 * A `no-store` main document is what makes a page ineligible for bfcache, so the
 * entry is re-fetched, reaches this function with no `sub` claim, and is
 * redirected. `must-revalidate` and `max-age=0` cover the ordinary HTTP cache for
 * user agents that treat `no-store` more loosely.
 *
 * Applied to the redirect too: a cached redirect is a redirect that can outlive
 * the condition that produced it.
 */
const NO_STORE = "no-store, max-age=0, must-revalidate";

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
    const redirected = NextResponse.redirect(new URL(`/${locale}/auth/login`, request.url));
    redirected.headers.set("Cache-Control", NO_STORE);
    return redirected;
  }

  if (
    inAuth
    && authenticated
    && !isAuthSessionContinuation(request.nextUrl.pathname, locale)
  ) {
    /*
     * Confirmed with the provider before bouncing the user back into the shell,
     * and **only on this branch**.
     *
     * `getClaims()` verifies the JWT locally, which is why the hot path is fast
     * (ADR-era decision, deliberately no network call per request). But
     * `requireUser` verifies over the network — so a token that was *revoked*
     * while still unexpired passes here and fails there. The two rules then
     * redirect at each other: the page sends the user to login, this rule sends
     * them back to the app, and the browser gives up with
     * `ERR_TOO_MANY_REDIRECTS`. The window is up to the access token's whole
     * lifetime, and for that window the product is unusable and cannot even be
     * signed out of. The first live run of `e2e/account-session.spec.ts` hit
     * exactly this.
     *
     * The check is affordable because it is scoped to the four auth routes and
     * only runs when a claim is actually present — never on an app request.
     *
     * When the provider disagrees, the cookies are **cleared** rather than just
     * ignored: `signOut()` writes through `setAll` onto a fresh `response`, so the
     * stale session stops passing local verification on the next request too, and
     * the login page below renders instead of redirecting.
     */
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      return NextResponse.redirect(new URL(`/${locale}/app`, request.url));
    }
    await supabase.auth.signOut();
    return response;
  }

  // Every authenticated response, not only the page ones: an RSC payload for a
  // protected route is the same content in a different envelope.
  if (inApp) response.headers.set("Cache-Control", NO_STORE);

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
