import "server-only";

import { pageRange, paginateRows } from "@/lib/pagination";
import type { createClient } from "@/lib/supabase/server";
import { requireSupabaseData } from "@/lib/supabase/result";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * The owner's contexts, as a list and as bounded options (EGC-CTX-001, EGC-ASSOC-008).
 *
 * `contexts` has carried forced RLS, four own-row policies and full
 * `authenticated` CRUD since `202607160003:185-197`, and until EGC.1 only the
 * interpretation-persistence RPC (`202607160005`) ever wrote it. The Person page
 * has read `person_contexts` and resolved names through this table since
 * `202607160009`; what never existed was a way to see a context, name one, or
 * correct one. This module is the read half of closing that.
 *
 * **This module is read-only.** Every write lives in `actions.ts`, which is what
 * `EGC-ASSOC-003`'s one-writer-per-contract rule asserts mechanically.
 *
 * Row-level security scopes both queries to the caller. Neither adds a `user_id`
 * predicate of its own, because neither uses the value as a filter — a leak here
 * would be an RLS failure, which is the boundary's job, and a redundant
 * predicate would hide that rather than prevent it.
 */

export type ContextListRow = {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly kind: string;
  readonly updated_at: string;
};

export type ContextOption = { readonly id: string; readonly name: string; readonly kind: string };

/**
 * The contexts list page's projection.
 *
 * Throws on a query failure, for the reason `loadOrganizations` records: a list
 * page that renders its empty state because the read failed tells the owner
 * their data is gone. Ordered by name — a context is looked up, not scanned.
 */
export async function loadContexts(
  supabase: SupabaseClient,
  page: number,
): Promise<{ items: ContextListRow[]; hasNext: boolean }> {
  const { from, to } = pageRange(page);
  const result = await supabase
    .from("contexts")
    .select("id,name,description,kind,updated_at")
    .order("name", { ascending: true })
    .range(from, to);

  return paginateRows(requireSupabaseData(result, "load contexts") ?? []);
}

/**
 * Contexts as selector options, bounded at 200 rows (EGC-ASSOC-008).
 *
 * The same shape and the same bound as `loadOrganizationOptions` and
 * `relation-options.ts`, and the same degradation: an empty list rather than a
 * throw, so one unavailable optional relation cannot take a detail page down
 * with it. The surface that renders it says why it is empty.
 *
 * `kind` travels with the option because two contexts may share a name across
 * kinds — `Pessoal` the personal context and `Pessoal` a custom one are
 * different rows, and a selector that shows only the name would make them
 * indistinguishable at the moment of choosing.
 */
export async function loadContextOptions(
  supabase: SupabaseClient,
): Promise<readonly ContextOption[]> {
  const { data, error } = await supabase
    .from("contexts")
    .select("id,name,kind")
    .order("name", { ascending: true })
    .limit(200);

  if (error || !data) return [];
  return data.map((row) => ({ id: row.id, name: row.name, kind: row.kind }));
}
