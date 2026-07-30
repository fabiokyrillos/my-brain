import "server-only";

import type { createClient } from "@/lib/supabase/server";

import type { OrganizationOption } from "./entity-edit-form";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * The owner's organizations, for the company selector (UX-08, UX-09).
 *
 * `projects.organization_id` and `people.organization_id` have always existed
 * and have never been settable. This is the list that makes them settable —
 * **read only**. Nothing here creates an organization: DEC-4 authorizes
 * surfacing what the schema already holds, and a create path would be a new
 * write surface on a third table nobody asked for. Rows arrive today from the
 * extraction pipeline.
 *
 * Row-level security scopes this to the caller, and the query adds no
 * `user_id` predicate of its own because the value is never used as a filter —
 * it is rendered as options and matched against a column the caller already
 * owns. A leak here would be an RLS failure, which is the boundary's job.
 *
 * Failure degrades to an empty list rather than throwing: the selector then
 * renders disabled with its own explanation, and the rest of the edit form —
 * name, description, status, notes — keeps working. A detail page must not go
 * down because one optional relation could not be listed.
 */
export async function loadOrganizationOptions(
  supabase: SupabaseClient,
): Promise<readonly OrganizationOption[]> {
  const { data, error } = await supabase
    .from("organizations")
    .select("id,name")
    .order("name", { ascending: true })
    .limit(200);

  if (error || !data) return [];
  return data.map((row) => ({ id: row.id, name: row.name }));
}
