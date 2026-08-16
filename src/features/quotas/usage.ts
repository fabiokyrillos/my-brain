import "server-only";

import { QUOTAS } from "@/lib/quotas";
import type { createClient } from "@/lib/supabase/server";

import type { QuotaDetail } from "./refusal";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * The ceilings that apply to this account, and how much of each is used —
 * `2O-COST-002`, `-006` and `-007`.
 *
 * ## The number stated is the number enforced
 *
 * `2O-COST-002`'s words are *"read from the enforced quota configuration, not
 * from a copy"*. Every ceiling below comes from `QUOTAS`, which
 * `quotas-parity.test.ts` already compares three ways — against PRD §20, against
 * the constants, and against the `private.quota_ceilings` seed. So a surface
 * built on this cannot state a limit the database does not enforce, which is
 * `SH-QUOTA-010`'s second half.
 *
 * The **usage** side has the same hazard one layer down, and it is the one this
 * module actually had to solve: the counts must use the *same predicates* as
 * the triggers. A page saying "12 of 300 today" while the trigger counts
 * something subtly different is a second copy of the rule, and
 * `usage.test.ts` reads those predicates out of `202608050076` and fails if
 * either side moves.
 *
 * ## Everything is UTC here, and that is not the local-day contract
 *
 * `private.utc_day_start()` is `date_trunc('day', now() at time zone 'UTC')`.
 * The daily ceilings reset at UTC midnight, **not** at the owner's midnight, so
 * this module reports a UTC window and says so. `2O-COST-006` requires every
 * figure to carry the zone it was computed in; for spend that zone is the
 * owner's, through `get_ai_cost_summary(p_timezone)`, and for quota it is UTC.
 * Two different zones on one page is a fact about the system rather than an
 * inconsistency to paper over — and describing the quota window as "your day"
 * would be the invention.
 *
 * ## The one ceiling this deliberately does not report
 *
 * `QUOTA_ATTACHMENTS_PER_ENTRY` is five attachments **per record**, so it has no
 * account-level usage figure — "3 of 5" would have to be about one record, and
 * which record is not a question this surface is answering. `2O-COST-002` asks
 * for *"the quota ceiling that applies to the account"*, and this one does not.
 * It is named here rather than quietly dropped, and it still refuses with its
 * own copy through `quotaRefusalMessage` when it fires.
 *
 * ## Why a read that fails is a state and not an exception
 *
 * `2O-COST-007`: *"a cost read that fails renders as a failed read, never as
 * zero"*. `requireSupabaseData` throws, which takes the whole route to the error
 * boundary — never zero, but never a partial page either. Each count below is
 * wrapped independently, so one unreadable table leaves the others answerable.
 * This is deliberately **not** `?? 0`: a failed count and an empty account are
 * different facts, and collapsing them is precisely the defect the requirement
 * names.
 */

export type QuotaWindow = "utc-day" | "account";

export type QuotaUsage = Readonly<{
  /** The ceiling's own detail token, so copy and refusal share one vocabulary. */
  detail: QuotaDetail;
  ceiling: number;
  /** `null` means the read failed. It never means zero. */
  used: number | null;
  window: QuotaWindow;
}>;

/**
 * One count, or `null`.
 *
 * The Supabase client resolves rather than rejects, so this returns `null` on
 * `error` and cannot mask a failure as an empty result — `count` is `null` for a
 * failed request too, which is why the error is checked first.
 */
async function count(run: PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> {
  try {
    const result = await run;
    if (result.error) return null;
    return result.count ?? null;
  } catch {
    return null;
  }
}

/** The start of the current UTC day, in the shape PostgREST filters take. */
export function utcDayStart(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

export async function loadQuotaUsage(
  supabase: SupabaseClient,
  userId: string,
  now: Date,
): Promise<readonly QuotaUsage[]> {
  const dayStart = utcDayStart(now);

  const [entriesToday, liveJobs, storedObjects, storedBytes, attachmentsToday] = await Promise.all([
    // `entries.created_at >= private.utc_day_start()`
    count(
      supabase
        .from("entries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", dayStart),
    ),
    /*
     * `status in ('pending','running') or (status = 'failed' and attempts <
     * max_attempts)`.
     *
     * PostgREST cannot compare two columns in a filter, so the third disjunct is
     * expressed as an inner-join-free `or` over the two states plus a failed
     * count that the trigger would also admit. What ships instead is the two
     * unambiguous states and `failed`, which **over-counts** a job that has
     * exhausted its attempts.
     *
     * Over-counting is the safe direction and it is stated rather than hidden:
     * the surface may say the queue is fuller than the trigger thinks, and will
     * never say it is emptier. Saying "you have room" to someone the database is
     * about to refuse is the failure that matters.
     */
    count(
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("status", ["pending", "running", "failed"]),
    ),
    // `count(*) from attachments where user_id = owner`
    count(
      supabase
        .from("attachments")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
    ),
    /*
     * `sum(size_bytes)`, summed here because PostgREST has no aggregate and
     * `2O-COST-002` names the ceiling that applies to the **account** — 500 MiB
     * is the largest of them and omitting it would leave the surface answering a
     * question the owner did not ask.
     *
     * Bounded by construction rather than by hope: `storageObjectsPerUser` is
     * 200, so the row set this sums cannot exceed the object ceiling. The
     * `limit` is that ceiling plus one, which means a row set that is somehow
     * larger comes back **truncated and detectable** rather than silently short.
     */
    (async (): Promise<number | null> => {
      try {
        const result = await supabase
          .from("attachments")
          .select("size_bytes")
          .eq("user_id", userId)
          .limit(QUOTAS.storageObjectsPerUser + 1);
        if (result.error || !result.data) return null;
        if (result.data.length > QUOTAS.storageObjectsPerUser) return null;
        return result.data.reduce((total, row) => total + (row.size_bytes ?? 0), 0);
      } catch {
        return null;
      }
    })(),
    // `count(*) filter (where created_at >= private.utc_day_start())`
    count(
      supabase
        .from("attachments")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", dayStart),
    ),
  ]);

  return [
    { detail: "QUOTA_ENTRIES_PER_DAY", ceiling: QUOTAS.entriesPerDay, used: entriesToday, window: "utc-day" },
    { detail: "QUOTA_LIVE_JOBS", ceiling: QUOTAS.liveJobsPerUser, used: liveJobs, window: "account" },
    { detail: "QUOTA_STORAGE_BYTES", ceiling: QUOTAS.storageBytesPerUser, used: storedBytes, window: "account" },
    { detail: "QUOTA_STORAGE_OBJECTS", ceiling: QUOTAS.storageObjectsPerUser, used: storedObjects, window: "account" },
    { detail: "QUOTA_ATTACHMENTS_PER_DAY", ceiling: QUOTAS.attachmentsPerDay, used: attachmentsToday, window: "utc-day" },
  ];
}
