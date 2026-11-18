import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseData } from "@/lib/supabase/result";

import { greetingName } from "./greeting";

/**
 * The name Hoje greets the owner by, or `null`.
 *
 * One indexed read of `profiles.display_name`, owner-scoped explicitly as well
 * as by RLS — the same shape `account-identity.ts` uses for the account menu.
 * What counts as a name is `greetingName`'s decision, not this module's.
 *
 * Unlike the account menu, this does **not** fall back to the auth metadata or
 * to a neutral label: the account menu must always say *something* about who is
 * signed in, and a greeting need not. "Bom dia." is a complete sentence.
 *
 * A failed read **throws**, deliberately. The dashboard awaits this in its own
 * `Promise.allSettled` slot, so the throw degrades to the nameless greeting and
 * is logged with the other projections — a name missing for a week because the
 * read is broken should be findable, exactly as an empty section is.
 */
export async function loadOwnerGreetingName(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const result = await supabase
    .from("profiles")
    .select("display_name")
    .eq("user_id", userId)
    .maybeSingle();

  const profile = requireSupabaseData(result, "load greeting name") as { display_name: string | null } | null;
  return greetingName(profile?.display_name);
}
