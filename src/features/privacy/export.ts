import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import {
  ENUMERATED_TABLES,
  ENUMERATION_COVERAGE,
  PRIVACY_CATEGORIES,
  WITHHELD_TABLES,
  type EnumeratedTable,
} from "./enumeration";

/**
 * The export — `2O-PRIVACY-004`, `-005`, `-006`, and `R-2O-19`.
 *
 * ## Complete or refuse, and completeness is derived rather than asserted
 *
 * `R-2O-19` is the whole design: *"An export is complete or it refuses.
 * Completeness is derived from the same enumeration the deletion path uses, and
 * the sharing is asserted so the two cannot drift."*
 *
 * Concretely: this module reads {@link ENUMERATED_TABLES} — it holds no table
 * list of its own, so there is no second list to fall behind. If **any** table
 * refuses, or any page of any table refuses, the whole export **refuses**. It
 * never returns what it managed to read. T-2 is the threat that a table added
 * later is silently absent and the archive still says *"your data"*;
 * `privacy-enumeration-guard.test.ts` fails the build when a new user-owned
 * table appears, which is the half a runtime check cannot do.
 *
 * ## Synchronous and server-side — `OD-2O-4` **A**
 *
 * No job, no storage object, no migration. The archive is built in the Server
 * Action's own request and handed back as a string. That is what the owner
 * signed, and an export that needed any of the three is a **stop condition**
 * under ADR-118 Decision 9 rather than a design choice available here.
 *
 * **Scale is the named third risk, and it is answered by refusing.** A
 * synchronous export can be too large; {@link EXPORT_ROW_CEILING} bounds it, and
 * crossing the bound produces `refused` with `reason: "too-large"` — never a
 * truncated archive. A refusal is honest and a partial is not, so the failure
 * mode stays on the correct side of `R-2O-19` even at a size this product has
 * not yet seen.
 *
 * ## Tenant safety — T-1 and `2O-SEC-003`
 *
 * Every read runs on the request-scoped `authenticated` client under forced RLS.
 * Four of the tables — `entry_entities`, `entity_attachments`, `entity_tags` and
 * the relation tables — are polymorphic and prove ownership **by trigger** on
 * write rather than by a foreign key. For a *read* that distinction does not
 * create an escape: the row's own `user_id` is what the `select` policy filters
 * on, so a row belonging to another tenant cannot enter the result set at all.
 * The proof that matters is against **a foreign row that exists** — an empty
 * table satisfies every isolation assertion vacuously — and that lives in
 * `supabase/tests/phase_2o_privacy_enumeration.sql`.
 *
 * No definer function is created. ADR-116 Decision 7 says reusing the deletion
 * **enumeration** is not authority to reuse or create its definer, and none is.
 */

/**
 * The point at which a synchronous export stops being able to promise
 * completeness. Chosen as a bound this product's accounts are nowhere near, so
 * that crossing it is a signal rather than a routine refusal.
 */
export const EXPORT_ROW_CEILING = 50_000;

/** PostgREST's own page size; the reader pages rather than assuming one request suffices. */
const PAGE_SIZE = 1000;

export type ExportRefusalReason = "unreadable" | "too-large";

export type AccountExport =
  | Readonly<{ status: "complete"; archive: string; rows: number; generatedAt: string }>
  | Readonly<{ status: "refused"; reason: ExportRefusalReason; table?: string }>;

type ExportedRow = Record<string, unknown>;

function redact(row: ExportedRow, entry: EnumeratedTable): ExportedRow {
  if (!entry.withheldColumns || entry.withheldColumns.length === 0) return row;
  const withheld = new Set(entry.withheldColumns.map((column) => column.column));
  return Object.fromEntries(Object.entries(row).filter(([key]) => !withheld.has(key)));
}

async function readTable(
  supabase: SupabaseClient<Database>,
  userId: string,
  entry: EnumeratedTable,
): Promise<readonly ExportedRow[] | null> {
  const rows: ExportedRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await supabase
      // Same closed, guarded set of literals the census reads.
      .from(entry.table as never)
      .select("*")
      .eq("user_id", userId)
      .range(offset, offset + PAGE_SIZE - 1);

    // A refused page is a refused table. Returning the pages that succeeded
    // would be the partial `R-2O-19` forbids, assembled one page at a time.
    if (page.error) return null;

    const data = (page.data ?? []) as ExportedRow[];
    rows.push(...data.map((row) => redact(row, entry)));
    if (data.length < PAGE_SIZE) return rows;
    if (rows.length > EXPORT_ROW_CEILING) return rows;
  }
}

/**
 * The archive's own header — `2O-PRIVACY-006`'s *"states its own scope and
 * generation time"*. It names every table in the coverage, every column that was
 * withheld and why, and every table excluded and why, so the reader can audit
 * what they were given without reading this file.
 */
function scopeOf(generatedAt: string) {
  return {
    generatedAt,
    scope: {
      derivedFrom:
        "public.account_owned_row_counts' predicate: every public BASE TABLE carrying a user_id column",
      tablesCovered: ENUMERATION_COVERAGE.length,
      tablesExported: ENUMERATED_TABLES.length,
      categories: PRIVACY_CATEGORIES.map((category) => ({
        key: category.key,
        tables: category.tables.map((entry) => entry.table),
      })),
      withheldColumns: ENUMERATED_TABLES.filter((entry) => entry.withheldColumns?.length).map(
        (entry) => ({ table: entry.table, columns: entry.withheldColumns }),
      ),
      withheldTables: WITHHELD_TABLES,
    },
  };
}

export async function buildAccountExport(
  supabase: SupabaseClient<Database>,
  userId: string,
  generatedAt: string,
): Promise<AccountExport> {
  const data: Record<string, readonly ExportedRow[]> = {};
  let rows = 0;

  for (const entry of ENUMERATED_TABLES) {
    const table = await readTable(supabase, userId, entry);
    if (table === null) return { status: "refused", reason: "unreadable", table: entry.table };
    rows += table.length;
    if (rows > EXPORT_ROW_CEILING) return { status: "refused", reason: "too-large" };
    data[entry.table] = table;
  }

  return {
    status: "complete",
    rows,
    generatedAt,
    archive: JSON.stringify({ ...scopeOf(generatedAt), rows, data }, null, 2),
  };
}
