import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasAcceptedCurrentPolicies } from "@/features/legal/acceptance";
import type { Locale } from "@/lib/preferences";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * The action-side lifecycle gate for modules that authenticate inline rather
 * than through `requireUser` (SH-LIFECYCLE-009). Called immediately after the
 * caller has established `user`; redirects a non-`active` account to the
 * account-state surface, which aborts the Server Action server-side. The same
 * fail-closed rule as `requireUser`: unreadable or absent is non-active.
 */
export async function assertActiveAccount(
  supabase: SupabaseClient<Database>,
  userId: string,
  locale: Locale,
): Promise<void> {
  const lifecycle = await supabase
    .from("account_lifecycle")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();

  if (lifecycle.error || lifecycle.data?.status !== "active") {
    redirect(`/${locale}/account-state`);
  }
}

/**
 * The one authenticated entry point every product page and Server Action uses.
 *
 * Since SH.1 it enforces the account lifecycle as well as the session
 * (SH-LIFECYCLE-008/009): a non-`active` account is redirected to the
 * dedicated `/account-state` surface, which renders no product surface and
 * offers exactly sign-out. Because every feature's actions call this before
 * touching anything, the refusal is server-side across every feature by
 * construction — inside a Server Action the redirect aborts the action, and
 * the database predicates (SH-LIFECYCLE-005/006) remain the deeper boundary
 * behind it.
 *
 * Fail-closed on purpose: a lifecycle row that cannot be read — error or
 * absent (the backfill and `handle_new_user` make absence abnormal) — is
 * treated as non-active. The `/account-state` route then renders the honest
 * "unavailable" state rather than the product, and recovery is a refresh once
 * the read succeeds. Sign-out stays available there (SH-LIFECYCLE-010).
 */
export async function requireUser(locale: Locale) {
  const supabase = await createClient();
  // Product call sites need only the owner id. `getClaims()` verifies the
  // signed token locally when the project uses asymmetric signing keys, so a
  // routine network `getUser()` lookup does not sit in every page transition.
  // RLS, lifecycle, and consent remain the authoritative boundaries below.
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (!userId) redirect(`/${locale}/auth/login`);
  const user = { id: userId };

  const lifecycle = await supabase
    .from("account_lifecycle")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (lifecycle.error || lifecycle.data?.status !== "active") {
    redirect(`/${locale}/account-state`);
  }

  // SH-LEGAL-008/009. The consent gate sits AFTER the lifecycle gate, and the
  // order is a decision: a suspended account is not asked to accept terms it
  // could not then act under, so the more specific state wins. The gate reads
  // `policy_acceptances` — never a cookie, never a session claim — so clearing
  // browser state changes nothing about enforcement (SH-LEGAL-011), and a
  // version bump re-interposes every account by the same code path that
  // interposes a new one.
  if (!(await hasAcceptedCurrentPolicies(supabase, user.id))) {
    redirect(`/${locale}/consent`);
  }

  return { supabase, user };
}
