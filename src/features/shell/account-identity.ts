import "server-only";

import type { Locale } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/server";
import { getAccountCopy } from "./account-copy";

/**
 * The one thing the account surface may say about who is signed in.
 *
 * **A display name, and nothing else.** No email and no user id, deliberately:
 * the surface's job is to answer "which account am I in" well enough to switch
 * accounts, and a display name does that. An email address would additionally
 * put a credential-adjacent identifier into every screenshot, bug report and
 * support thread that ever captures the shell — and into the artifacts of the
 * authenticated test runs, which is precisely what the initiative's credential
 * hygiene rule forbids. A uuid would say nothing to a person at all.
 */
export type AccountIdentity = {
  /** Already resolved and never empty: the caller renders it as given. */
  readonly displayName: string;
};

/**
 * Resolves the signed-in account's display name, in the declared order.
 *
 * `profiles.display_name` first, because that is the value the user can edit in
 * Settings and therefore the one they expect to see. `user_metadata.display_name`
 * second, because the register form writes it there and a profile row can exist
 * without a name. A neutral localized label last — an absent name is an ordinary
 * state, not an error, and the fallback is what stops the surface reaching for an
 * email to fill the gap.
 *
 * Returns null when there is no session. That is not an error either: the shell
 * renders for a request the proxy already authenticated, but a session can expire
 * between that check and this read, and the account surface must still render so
 * the user has a way *out* (the sign-out action handles the expired case).
 */
export async function loadAccountIdentity(locale: Locale): Promise<AccountIdentity | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // One indexed lookup on `(user_id)`, the same shape `work-projection.ts` and
  // `task-commands/actions.ts` use for the timezone. A failure here is not worth
  // failing the whole shell over: the fallbacks below are correct answers.
  const profile = await supabase
    .from("profiles")
    .select("display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const candidates = [profile.data?.display_name, user.user_metadata?.display_name];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim() !== "") {
      return { displayName: candidate.trim() };
    }
  }
  return { displayName: getAccountCopy(locale).accountFallback };
}
