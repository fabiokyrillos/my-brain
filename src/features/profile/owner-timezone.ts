import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { resolveOwnerTimeZone } from "@/lib/time/owner-timezone";

/**
 * The one place a Server Component reads the owner's zone (`LDC-DAILY-001`).
 *
 * ## Why an accessor and not a query on each page
 *
 * The zone is needed on a dozen unrelated Server Components — the inbox list,
 * the entry detail, people, projects, memories, files, chat — that share no
 * parent boundary below the shell. Two other shapes were available and both are
 * worse:
 *
 * - **A raw `supabase.from("profiles")` on each page.** This is what the first
 *   attempt did, and `architecture.test.ts` rejected it: the Records list page
 *   is held to a projection boundary (Slice 2X.16), and a page that reads a
 *   table directly is exactly what that rule exists to stop. The guard was
 *   right, and it caught this before review did.
 * - **A `timezone` field on every projection.** Correct where a projection
 *   already computes *in* the zone — `EntryReviewProjection` and the Work
 *   projection both do, and they keep it — but wrong as a general answer: the
 *   inbox and attention projections do not reason about days at all, and adding
 *   a field they never use to satisfy a renderer would put presentation
 *   knowledge into a data contract.
 *
 * This mirrors `getAgentName` exactly, for the same reasons its own comment
 * gives: `cache()` memoizes per request, so a page that asks three times issues
 * **one** query, and two pages in one navigation never share stale state
 * because the cache lifetime is the request.
 *
 * ## Why it never throws
 *
 * `resolveOwnerTimeZone` is total, and a failed preferences read degrades to the
 * declared default rather than taking down a page whose content is elsewhere. A
 * signed-out caller gets the default too.
 *
 * **This is not a licence to guess.** The default is only ever reached when
 * there is nothing to honour — no session, no row, or an unusable value that the
 * write path could not have stored. Where a *day* is computed rather than
 * rendered, `localDayBounds` still refuses an unsupported zone outright, which
 * is the property that keeps a wrong answer at 23:00 from looking like a right
 * one.
 */
export const getOwnerTimeZone = cache(async (): Promise<string> => {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return resolveOwnerTimeZone(undefined);

    const { data } = await supabase
      .from("profiles")
      .select("timezone")
      .eq("user_id", user.id)
      .maybeSingle();

    return resolveOwnerTimeZone(data?.timezone);
  } catch {
    return resolveOwnerTimeZone(undefined);
  }
});
