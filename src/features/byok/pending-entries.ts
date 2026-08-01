import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { requireSupabaseSuccess } from "@/lib/supabase/result";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * How many entries are waiting for a credential that now exists.
 *
 * ## Why this is its own module rather than a second reader in `credential-view.ts`
 *
 * `BYOK-GUARD-004` asserts that the credential read path has **exactly one**
 * `select` and that its column list contains no key material. Adding an
 * unrelated query to that file would either break that assertion or, worse,
 * quietly move which `select` it inspects. The guard is more valuable than the
 * convenience of one fewer file.
 *
 * ## Why a `head` count rather than a list
 *
 * The Settings surface needs a number, not the entries — it renders "there are N
 * waiting", and the action reads its own batch when the user asks. Fetching rows
 * to count them would pull a user's raw captured text into a page that has no
 * reason to hold it.
 *
 * The ceiling bounds the **label**, not the query. `count: "exact"` computes the
 * real total regardless, and PostgREST does not stop early for a `limit` — so
 * this is not a performance guard and is not described as one. What it does is
 * keep the surface from rendering a four-digit number nobody acts on: past the
 * ceiling the copy says "N+", which is true and enough to decide with.
 */
export const PENDING_ENTRY_COUNT_CEILING = 500;

/**
 * `BYOK-CAPTURE-006` — the declared ceiling for one invocation of the action.
 *
 * A number rather than "all of them", because that action spends the user's own
 * money at OpenAI, and an unbounded loop over an inbox is not a button, it is a
 * bill. 25 matches `DISPATCH_MAX_JOBS` in the worker's drain, so a full
 * invocation is one drain's worth of work rather than a queue the drain then has
 * to chew through for an hour.
 *
 * It lives here rather than beside the action because `actions.ts` carries
 * `"use server"`, and a `"use server"` module may export **only async
 * functions** — a constant there is a build-time error, and
 * `reminders/actions.test.ts` asserts the rule across the whole repository.
 */
export const PENDING_ENTRY_BATCH_LIMIT = 25;

export type PendingEntryCount = {
  readonly count: number;
  /** True when the real number is at or above the ceiling. */
  readonly atLeast: boolean;
};

export async function loadPendingEntryCount(
  supabase: SupabaseClient,
  userId: string,
): Promise<PendingEntryCount> {
  const result = await supabase
    .from("entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "awaiting_ai_configuration");

  // `requireSupabaseSuccess`, not `requireSupabaseData`: a `head` request returns
  // no rows by definition, so asserting on `data` would be asserting on `null`.
  requireSupabaseSuccess(result, "count entries awaiting AI configuration");
  const count = result.count ?? 0;

  return {
    count: Math.min(count, PENDING_ENTRY_COUNT_CEILING),
    atLeast: count >= PENDING_ENTRY_COUNT_CEILING,
  };
}
