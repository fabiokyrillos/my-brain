import "server-only";

import { getNavigationHref, type NavigationKey } from "@/features/shell/capabilities";
import { deriveSubjectSensitivity, readableLevelsOf } from "@/features/sensitivity/subject-derivation";
import type { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/lib/preferences";

import {
  LIBRARY_COUNTS,
  LIBRARY_RECENCY,
  type LibraryDomainSummary,
  type LibraryRecencySpec,
  type LibraryRecentRow,
} from "./contracts";
import { BRAIN_OVERVIEW_DOMAINS } from "./lenses";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** How many recent rows a panel shows. Small on purpose — this is a door, not a list. */
export const OVERVIEW_RECENT_LIMIT = 3;

/**
 * The Brain overview's one read.
 *
 * ## Ownership
 *
 * Every query goes through the request-scoped authenticated client under forced
 * RLS, exactly as search and the previous version of this surface did. No
 * loader takes a `user_id`, none adds a redundant `user_id` predicate — the
 * reason `contexts.ts` records applies unchanged: a leak here would be an RLS
 * failure, and a redundant predicate would hide it rather than prevent it.
 *
 * ## A failed read is a missing number, never a zero and never a blank page
 *
 * Brain's job is to be a door. A door that will not open because a counter
 * failed is worse than a door with no number, so a failed count renders as
 * `null` and the panel says so in words. `requireSupabaseData` is deliberately
 * *not* used: it throws to the error boundary, which is right for a page whose
 * subject failed to load and wrong for a page whose subject is *the doors*.
 *
 * The distinction matters more for the recent list than for the count, because
 * an empty array is a sentence a reader will believe. `recencySupported` keeps
 * *"nothing recent"*, *"recency is not shown here"* and *"the read failed"*
 * three different states rather than one shared emptiness.
 */
export async function loadBrainOverview(
  supabase: SupabaseClient,
  locale: Locale,
): Promise<readonly LibraryDomainSummary[]> {
  return Promise.all(
    BRAIN_OVERVIEW_DOMAINS.map(async (key) => summariseDomain(supabase, locale, key)),
  );
}

async function summariseDomain(
  supabase: SupabaseClient,
  locale: Locale,
  key: NavigationKey,
): Promise<LibraryDomainSummary> {
  const countTable = LIBRARY_COUNTS[key];
  const recency = LIBRARY_RECENCY[key];
  const href = getNavigationHref(locale, key);

  const [count, recent] = await Promise.all([
    countTable ? countRows(supabase, countTable) : Promise.resolve(null),
    recency ? recentRows(supabase, recency) : Promise.resolve(OK_EMPTY),
  ]);

  return {
    key,
    href,
    count,
    countSupported: Boolean(countTable),
    recent: recent.rows,
    recencySupported: Boolean(recency),
    recentFailed: recent.failed,
    recentSurface: recency?.surface ?? null,
  };
}

/** A domain with no recency source has not failed to read one. */
const OK_EMPTY = { rows: [] as readonly LibraryRecentRow[], failed: false } as const;

async function countRows(supabase: SupabaseClient, table: string): Promise<number | null> {
  // `head: true` — the count is the whole answer, so no row leaves the database.
  // A domain's rows are content; its size is a navigation aid, and fetching the
  // first to learn the second would be paying in exposure for nothing.
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true });
  return error ? null : (count ?? 0);
}

/**
 * The recent rows, **and whether the read failed**.
 *
 * Returning a bare array made a refusal indistinguishable from an empty domain,
 * and the surface then printed *"Nada aqui ainda"* about data it had not been
 * allowed to see. The distinction is carried out of this function rather than
 * reconstructed from an empty array, because an empty array is exactly what both
 * cases produce.
 */
async function recentRows(
  supabase: SupabaseClient,
  recency: LibraryRecencySpec,
): Promise<{ readonly rows: readonly LibraryRecentRow[]; readonly failed: boolean }> {
  const surface = recency.surface;
  /*
   * `sensitivity` is selected **only** where the label is governed content, and
   * that is not an optimisation.
   *
   * `people`, `projects` and `organizations` carry no such column at all, so
   * naming it would be a query error rather than a wasted byte — and asking for
   * it "just in case" is how a surface ends up with a classification it does not
   * know how to honour. The two shapes are chosen by the same record that
   * decides how the label is rendered, so they cannot disagree.
   */
  const columns = surface ? `id,${recency.label},sensitivity` : `id,${recency.label}`;
  const { data, error } = await supabase
    .from(recency.table)
    .select(columns)
    .order(recency.column, { ascending: false })
    .limit(OVERVIEW_RECENT_LIMIT);

  if (error || !data) return { rows: [], failed: true };

  const rows = data as unknown as readonly { id: string; sensitivity?: string }[];
  // Built from rows that came back, never from ids that were asked for — the
  // same collapse the contextual pages make, so absence has exactly one meaning.
  const levels = surface ? readableLevelsOf(rows) : null;

  return {
    failed: false,
    rows: rows.map((row) => ({
      id: row.id,
      label: String((row as unknown as Record<string, unknown>)[recency.label] ?? ""),
      sensitivity: levels ? deriveSubjectSensitivity(row.id, levels) : null,
    })),
  };
}
