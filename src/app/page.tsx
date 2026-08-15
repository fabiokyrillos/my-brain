import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { entryDestination, type EntryVisitor } from "@/features/entry/destination";
import { createClient } from "@/lib/supabase/server";

/**
 * The product's front door — `2O-ENTRY-001` and `2O-ENTRY-004`.
 *
 * This file used to be two lines: `redirect("/pt-BR/app")`, unconditionally. A
 * stranger was bounced here, bounced again by the proxy to
 * `/pt-BR/auth/login`, and landed on a login form for an unnamed product in a
 * language their browser had not asked for.
 *
 * The decision itself lives in `entryDestination`, which is pure and tested
 * directly; this function only reads the session and the header. That is the
 * split `signup-policy.ts` already uses in this repository.
 */
export default async function Home() {
  const destination = await resolveDestination();
  // Outside the `try`. `redirect()` signals by throwing, so calling it inside
  // one would have the catch below swallow the redirect and return a locale
  // instead of performing it.
  redirect(destination);
}

async function resolveDestination(): Promise<string> {
  const acceptLanguage = (await headers()).get("accept-language");
  const anonymous: EntryVisitor = { authenticated: false, acceptLanguage };

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return entryDestination(anonymous);

    const { data } = await supabase
      .from("profiles")
      .select("locale")
      .eq("user_id", user.id)
      .maybeSingle();

    return entryDestination({ authenticated: true, storedLocale: data?.locale });
  } catch {
    /*
     * A misconfigured or unreachable Supabase must not take the front door with
     * it.
     *
     * This is the same trade `src/proxy.ts` documents for its own fail-open: it
     * refuses `app/` routes in production when unconfigured, and lets everything
     * else through, "or a misconfigured deployment would have no way to display
     * that it is misconfigured". The public entry page is exactly such a page —
     * it reads no account data, so showing it to someone whose session could not
     * be read reveals nothing and keeps the product legible. An authenticated
     * owner who lands here in that state sees the public page and can still
     * reach sign-in from it.
     */
    return entryDestination(anonymous);
  }
}
