/**
 * The consent gate — SH-LEGAL-008/009/011.
 *
 * One mechanism covers both cases the PRD names, and that is the point rather
 * than an economy: a brand-new account and an account facing a bumped version
 * are indistinguishable here. Both are "this account has no acceptance row for
 * the current version of document X", and both are answered by the same
 * interposition. There is no separate first-session flag to get out of step
 * with a separate version-bump flag.
 *
 * **The gate reads the table.** Not a cookie, not a session claim, not
 * anything the browser holds (SH-LEGAL-011): clearing browser state changes
 * nothing about enforcement, and a client that never asks is simply a client
 * that never gets past the interposition.
 *
 * Fail-closed, like the lifecycle gate beside it: an unreadable
 * `policy_acceptances` is treated as "not accepted". The cost of being wrong
 * that way is one extra consent screen; the cost of the other way is product
 * access without a recorded acceptance.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { POLICY_DOCUMENTS, POLICY_VERSIONS, type PolicyDocument } from "./versions";

/**
 * The documents this account still owes an acceptance for, at their CURRENT
 * versions. Empty means the product may render.
 */
export async function missingPolicyAcceptances(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<readonly PolicyDocument[]> {
  const accepted = await supabase
    .from("policy_acceptances")
    .select("document,version")
    .eq("user_id", userId);

  // Fail-closed: unreadable is not "accepted".
  if (accepted.error) return POLICY_DOCUMENTS;

  const rows = accepted.data ?? [];
  return POLICY_DOCUMENTS.filter(
    (document) =>
      !rows.some((row) => row.document === document && row.version === POLICY_VERSIONS[document]),
  );
}

export async function hasAcceptedCurrentPolicies(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  return (await missingPolicyAcceptances(supabase, userId)).length === 0;
}
