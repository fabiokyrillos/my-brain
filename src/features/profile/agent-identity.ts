import "server-only";

import { cache } from "react";

import { defaultAgentPreferences } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/server";

/**
 * The one place the assistant's name is read (UX-06, DEC-2).
 *
 * `agent_preferences.agent_name` has existed since `202607160001` with a
 * default of `Brain` and a 1–60 character check. `save_profile_settings` has
 * always accepted it. What it never had was an input or a consumer, which is
 * why `capabilities.ts` recorded it as `state: "future"` — honestly, and for
 * long enough that "Brain" hardened into 40-odd literals across the product.
 *
 * DEC-2 separates the two referents those literals had run together:
 *
 * - **"My Brain" is the product.** The manifest, the browser title and the
 *   brand mark keep it, and nothing here touches them.
 * - **The assistant is an actor**, and its name is this value.
 *
 * The chat *destination* was a third referent and is no longer called Brain at
 * all — it is `Conversar` / `Talk`, a place rather than a persona.
 *
 * ## Why one accessor rather than a prop threaded from a layout
 *
 * The name is needed on a dozen unrelated Server Components that share no
 * parent boundary below the shell, and passing it down would put a
 * presentational value into every intermediate signature. `cache()` gives the
 * same deduplication a prop would: React memoizes per request, so a page that
 * asks three times issues **one** query, and two pages in the same navigation
 * do not share stale state because the cache lifetime is the request.
 *
 * ## Why it never throws
 *
 * The name decorates copy. A preferences read that fails must degrade to the
 * default rather than take down a page whose actual content is elsewhere —
 * this is the same posture `ConversationalQuestions` takes for an additive
 * panel. A signed-out caller gets the default too, which is what the pre-auth
 * surfaces want anyway.
 */
export const getAgentName = cache(async (): Promise<string> => {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return defaultAgentPreferences.agentName;

    const { data } = await supabase
      .from("agent_preferences")
      .select("agent_name")
      .eq("user_id", user.id)
      .maybeSingle();

    const stored = data?.agent_name?.trim();
    return stored ? stored : defaultAgentPreferences.agentName;
  } catch {
    return defaultAgentPreferences.agentName;
  }
});
