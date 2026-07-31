import "server-only";
import { pageRange, paginateRows } from "@/lib/pagination";
import type { Locale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";
import type { createClient } from "@/lib/supabase/server";
import { localDayEndExclusive, localDayStartFromIsoDate } from "@/lib/zoned-day";
import type { HistoryCopy } from "./copy";
import { describeHistoryEvent, type HistoryEvent, type HistoryEventRow } from "./event";
import type { HistoryFilters } from "./filters";
import type { LinkableEntityType } from "./subject-route";
import { actionTypesInCategory, asHistoryEntityType, type HistoryEntityType } from "./vocabulary";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * The History read (UX-13).
 *
 * ## Every filter runs in Postgres
 *
 * Nothing is fetched-then-discarded: each active filter becomes a predicate on
 * the query, so a filtered page reads one page of rows regardless of how much
 * history exists. That is the difference between a surface that stays usable at
 * ten thousand audit rows and one that ships the whole table to the browser.
 *
 * The predicates were chosen to land on the two indexes that already exist
 * (`202607160003:141-142`) — no migration is added for this slice:
 *
 * | filter | column | index used |
 * | --- | --- | --- |
 * | date range | `created_at` | `audit_logs_user_created_idx (user_id, created_at desc)` |
 * | item type | `entity_type` | `audit_logs_user_entity_idx (user_id, entity_type, entity_id)` |
 * | one item | `entity_type` + `entity_id` | the same index, both keys |
 * | who | `actor` | filtered after the index scan; three distinct values |
 * | action type | `action_type in (…)` | filtered after the index scan; ≤27 values |
 *
 * `actor` and `action_type` have no index of their own and do not get one. Both
 * are low-cardinality equality predicates applied to a range the leading index
 * has already narrowed to one user, and the unfiltered ordering is the indexed
 * one — so the plan is the same index scan either way, with a filter step.
 * Adding an index to save that step would be a migration for convenience.
 *
 * ## Free-text search is deliberately absent
 *
 * `reason` is the only free-text column, and this slice stops rendering it
 * (UX-28) because every value any writer produces merely restates the localized
 * sentence. Searching a field the reader cannot see would return rows with no
 * visible reason for matching. The useful text axis — the subject's own title —
 * lives in six other tables and cannot be reached from one indexed query. So
 * G4 ships structured filters only; see the slice report for what a text-search
 * cut would cost.
 */

const SELECT =
  "id,action_type,entity_type,entity_id,actor,before_state,after_state,created_at";

/**
 * The subject's own name, per entity type, and where to read it from.
 *
 * Keyed by `LinkableEntityType`, so a new linkable entity type cannot be added
 * to the route map without also saying what its name column is.
 */
const SUBJECT_SOURCES: Readonly<
  Record<LinkableEntityType, { readonly table: string; readonly column: string }>
> = {
  task: { table: "tasks", column: "title" },
  entry: { table: "entries", column: "original_content" },
  memory: { table: "memories", column: "content" },
  project: { table: "projects", column: "name" },
  person: { table: "people", column: "name" },
  conversation: { table: "conversations", column: "title" },
};

export type HistoryPage = {
  readonly events: readonly HistoryEvent[];
  readonly hasNext: boolean;
};

/**
 * Loads one page of history, already described.
 *
 * Ownership is enforced twice: every query is `user_id`-scoped *and* runs under
 * the caller's RLS session. A subject the reader does not own simply does not
 * come back from the label query, so its row renders as unavailable rather than
 * leaking the existence of someone else's object.
 */
export async function loadHistoryPage(
  supabase: SupabaseClient,
  options: {
    readonly userId: string;
    readonly locale: Locale;
    readonly timezone: string;
    readonly page: number;
    readonly filters: HistoryFilters;
    readonly copy: HistoryCopy;
    readonly formatDate: (iso: string) => string;
  },
): Promise<HistoryPage> {
  const { from, to } = pageRange(options.page);
  const { filters } = options;

  let query = supabase
    .from("audit_logs")
    .select(SELECT)
    .eq("user_id", options.userId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.from !== null) {
    const start = localDayStartFromIsoDate(filters.from, options.timezone);
    if (start !== null) query = query.gte("created_at", start.toISOString());
  }
  if (filters.to !== null) {
    // Exclusive end of the *next* day, so the whole of the chosen day counts.
    const end = localDayEndExclusive(filters.to, options.timezone);
    if (end !== null) query = query.lt("created_at", end.toISOString());
  }
  if (filters.actor !== null) query = query.eq("actor", filters.actor);
  if (filters.entityType !== null) query = query.eq("entity_type", filters.entityType);
  if (filters.subjectId !== null) query = query.eq("entity_id", filters.subjectId);
  if (filters.category !== null) {
    query = query.in("action_type", [...actionTypesInCategory(filters.category)]);
  }

  const rows = (requireSupabaseData(await query, "load change history") ?? []) as {
    id: string;
    action_type: string;
    entity_type: string;
    entity_id: string | null;
    actor: string;
    before_state: unknown;
    after_state: unknown;
    created_at: string;
  }[];
  const { items, hasNext } = paginateRows(rows);

  const labels = await loadSubjectLabels(supabase, options.userId, items);

  const events = items.map((row) => {
    const eventRow: HistoryEventRow = {
      id: row.id,
      actionType: row.action_type,
      actor: row.actor,
      entityType: row.entity_type,
      entityId: row.entity_id,
      beforeState: row.before_state,
      afterState: row.after_state,
      occurredAt: row.created_at,
    };
    const key = subjectKey(row.entity_type, row.entity_id);
    // `has` and `get` answer different questions: whether the object still
    // exists and is owned, and whether it has a name worth printing.
    const found = key !== null && labels.has(key);
    return describeHistoryEvent(
      eventRow,
      { found, label: key === null ? null : (labels.get(key) ?? null) },
      options.copy,
      options.formatDate,
    );
  });

  return { events, hasNext };
}

function subjectKey(entityType: string, entityId: string | null): string | null {
  if (entityId === null) return null;
  const narrowed = asHistoryEntityType(entityType);
  return narrowed === null ? null : `${narrowed}:${entityId}`;
}

/**
 * The names of the objects this page mentions, one query per entity type present.
 *
 * At most six queries, each an indexed primary-key `in (…)` over at most one
 * page of ids, and only for the types that actually appear. A row whose object
 * was deleted has no entry in the map, which is what makes the unavailable
 * state truthful rather than a guess.
 */
async function loadSubjectLabels(
  supabase: SupabaseClient,
  userId: string,
  rows: readonly { entity_type: string; entity_id: string | null }[],
): Promise<Map<string, string | null>> {
  const idsByType = new Map<HistoryEntityType, Set<string>>();
  for (const row of rows) {
    const entityType = asHistoryEntityType(row.entity_type);
    if (entityType === null || row.entity_id === null) continue;
    if (!(entityType in SUBJECT_SOURCES)) continue;
    const bucket = idsByType.get(entityType) ?? new Set<string>();
    bucket.add(row.entity_id);
    idsByType.set(entityType, bucket);
  }

  // Key present ⇒ the object exists and the reader owns it. Value is its name,
  // or null when the row has nothing printable — which is still "it exists".
  const labels = new Map<string, string | null>();
  await Promise.all(
    [...idsByType].map(async ([entityType, ids]) => {
      const source = SUBJECT_SOURCES[entityType as LinkableEntityType];
      const result = await supabase
        .from(source.table as "tasks")
        .select(`id,${source.column}`)
        .eq("user_id", userId)
        .in("id", [...ids]);
      // A failed label lookup degrades to "no name"; it must not take the page
      // down, because the history row itself is still true and still readable.
      if (result.error) return;
      for (const row of (result.data ?? []) as unknown as Record<string, unknown>[]) {
        const id = row.id;
        if (typeof id !== "string") continue;
        const label = row[source.column];
        const printable = typeof label === "string" && label.trim() !== "" ? label : null;
        labels.set(`${entityType}:${id}`, printable);
      }
    }),
  );
  return labels;
}
