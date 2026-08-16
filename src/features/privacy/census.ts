import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import {
  PRIVACY_CATEGORIES,
  type PrivacyCategory,
  type PrivacyCategoryKey,
} from "./enumeration";

/**
 * The census behind *"what is stored about me"* — `2O-PRIVACY-001` and `-003`.
 *
 * ## Three-valued, and the third value is the point
 *
 * `2O-PRIVACY-010` forbids resolving an absent classification to `normal`, and
 * the owner's decision for this slice states the same rule for counts: **a
 * refused or unreadable count is never rendered as zero.** Those are different
 * facts about an account and rendering them identically is a lie the reader
 * cannot detect — the exact shape `2O-ACTIVATION-003` established for
 * activation facts, applied to a number instead of a boolean.
 *
 * So a category resolves to `counted` with a total, or to `unreadable`, and a
 * category is `unreadable` if **any** of its tables refused. Reporting "42" for
 * a category whose fourth table errored would be a partial presented as a whole
 * — `R-2O-19`'s rule, one surface earlier than the export.
 *
 * ## Counts only, never a preview — T-4
 *
 * `head: true` with `count: "exact"` sends no row bodies over the wire at all.
 * That is stronger than filtering a preview out in the component: there is no
 * governed string in the payload to leak, so `ProtectedContent` has nothing to
 * govern here and the sensitivity contract is satisfied by construction rather
 * than by discipline. A category may state how many rows exist without
 * revealing content, and this one cannot reveal content even by accident.
 *
 * ## Under the caller's identity, and nothing else
 *
 * The client is the request-scoped SSR client `requireUser` returns. Every read
 * runs as `authenticated` with forced RLS and an owner-scoped policy, so
 * `.eq("user_id", userId)` is a second lock on a door RLS has already locked
 * rather than the isolation itself. No service-role client, no definer function
 * and no new grant appears anywhere in this path (`2O-SEC-001`, `2O-SEC-002`).
 */

export type CategoryCensus =
  | Readonly<{ key: PrivacyCategoryKey; status: "counted"; rows: number }>
  | Readonly<{ key: PrivacyCategoryKey; status: "unreadable" }>;

export type PrivacyCensus = Readonly<{
  categories: readonly CategoryCensus[];
  /** Total across categories that could be counted. `unreadable` ones are excluded and said so. */
  countedRows: number;
  unreadableCategories: number;
}>;

async function countTable(
  supabase: SupabaseClient<Database>,
  userId: string,
  table: string,
): Promise<number | null> {
  const result = await supabase
    // The enumeration is a closed, guarded set of literals; PostgREST's typed
    // table union cannot express "one of these" without restating it here.
    .from(table as never)
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (result.error) return null;
  // `count` is nullable in the client's types even on success. A successful read
  // that reported no count is not a zero either.
  return result.count ?? null;
}

async function censusForCategory(
  supabase: SupabaseClient<Database>,
  userId: string,
  category: PrivacyCategory,
): Promise<CategoryCensus> {
  const counts = await Promise.all(
    category.tables.map((entry) => countTable(supabase, userId, entry.table)),
  );
  if (counts.some((count) => count === null)) return { key: category.key, status: "unreadable" };
  return {
    key: category.key,
    status: "counted",
    rows: counts.reduce<number>((total, count) => total + (count ?? 0), 0),
  };
}

export async function loadPrivacyCensus(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<PrivacyCensus> {
  const categories = await Promise.all(
    PRIVACY_CATEGORIES.map((category) => censusForCategory(supabase, userId, category)),
  );

  return {
    categories,
    countedRows: categories.reduce(
      (total, category) => total + (category.status === "counted" ? category.rows : 0),
      0,
    ),
    unreadableCategories: categories.filter((category) => category.status === "unreadable").length,
  };
}
