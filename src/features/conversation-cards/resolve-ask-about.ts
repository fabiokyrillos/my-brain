import "server-only";

/**
 * `2P-CHAT-005` — the render-time read behind the "asking about" banner.
 *
 * The handle in the URL carries `type:id`. The name is read **here**, under the
 * caller's own client and therefore under RLS, for the reasons `ask-about.ts`
 * states: no copy of the name travels, a subject the caller does not own
 * resolves to nothing, and a renamed subject is correct on the next view because
 * there is nothing cached to disagree.
 *
 * ## Why `null` is the only failure shape
 *
 * A missing row and a row belonging to someone else are indistinguishable from
 * here, and that is the point — RLS filters the second into the first, so both
 * arrive as "no rows". Returning null for both means the surface renders
 * identically in both cases and the link is not an existence oracle. A read
 * error is folded in for the same reason: the banner is additive context, and
 * failing the whole conversation page because a decorative heading could not be
 * drawn would be the wrong trade. The composer still works; the owner simply
 * types who they meant.
 *
 * ## Why a switch rather than a table name from the handle
 *
 * `supabase.from(subject.type)` would turn a query parameter into a table
 * selector. The four cases below are four explicit queries over four columns,
 * which is what keeps the closed vocabulary in `ask-about.ts` load-bearing
 * rather than decorative.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import type { AskAboutSubject, ResolvedAskAboutSubject } from "./ask-about";

export type { ResolvedAskAboutSubject };

export async function resolveAskAboutSubject(
  supabase: SupabaseClient<Database>,
  subject: AskAboutSubject | null,
): Promise<ResolvedAskAboutSubject | null> {
  if (subject === null) return null;

  const read = async (table: "people" | "projects" | "organizations" | "contexts") => {
    const { data, error } = await supabase
      .from(table)
      .select("name")
      .eq("id", subject.id)
      .maybeSingle();
    if (error || !data) return null;
    const name = data.name?.trim();
    return name ? name : null;
  };

  const name = await (subject.type === "person"
    ? read("people")
    : subject.type === "project"
      ? read("projects")
      : subject.type === "organization"
        ? read("organizations")
        : read("contexts"));

  return name === null ? null : { subject, name };
}
