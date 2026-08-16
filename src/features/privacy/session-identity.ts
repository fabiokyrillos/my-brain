import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

/**
 * Who the reader is signed in as — the first half of `2O-PRIVACY-009`.
 *
 * **The e-mail is not in `profiles`.** That table carries display name, locale,
 * timezone and avatar path and no address, and `requireUser` returns only the
 * `sub` claim, so the identity has to come from the session's own claims. It is
 * read here rather than added to `requireUser`'s return, because every
 * authenticated page in the product calls that function and only this one needs
 * an address.
 *
 * **`null` is a real answer.** A session whose claims carry no `email` — which
 * is possible for identities created outside a password flow — still means the
 * reader is signed in, and the surface says so without inventing an address.
 * Rendering an empty string would have been the "unreadable becomes empty"
 * shape this slice refuses everywhere else.
 */
export async function readSignedInEmail(
  supabase: SupabaseClient<Database>,
): Promise<string | null> {
  const { data, error } = await supabase.auth.getClaims();
  if (error) return null;
  const email = data?.claims?.email;
  return typeof email === "string" && email.length > 0 ? email : null;
}
