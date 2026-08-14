import "server-only";

/**
 * The relations surface's only reader (`2N-RELATION-006`, `2N-SEC-002`).
 *
 * ## The query plan, measured before the surface was designed
 *
 * **Eight queries, three round trips, and never one per node or per edge.**
 *
 * | Round | Queries |
 * | --- | --- |
 * | 1 | `person_relationships`, `person_projects`, `person_contexts` — live rows only |
 * | 2 | `audit_logs` (the origin proof), `people`, `projects`, `contexts` — all keyed by round 1's ids |
 * | 3 | `organizations` — keyed by the ids rounds 1–2 produced |
 *
 * That is the shape the person page already uses (18 queries, three rounds), and
 * it is bounded by `RELATION_LIMIT` at every hop. No id is ever fetched
 * individually, so an owner with fifty relationships costs the same three round
 * trips as one with two.
 *
 * ## `confidence` is never selected
 *
 * Every relation table carries it. No select list here names it, and
 * `phase-2n-relations-guard.test.ts` greps for it — `2N-RELATION-005`/`-010`.
 *
 * ## The origin proof, and why it uses `audit_logs`
 *
 * `person_projects` and `person_contexts` have two writers: the owner's Server
 * Actions and the `link_interpreted_entities` trigger. The owner's **creation**
 * actions write an audit row and the trigger writes none, so that row is a
 * positive proof of authorship.
 *
 * It costs nothing new: `authenticated` already holds `select` on `audit_logs`
 * under forced RLS, the project page already reads it, and
 * `audit_logs_user_entity_idx (user_id, entity_type, entity_id)` is exactly the
 * index this predicate wants. `audit_logs` is also **exempt from every retention
 * sweep by decision** (`202608050077:45`, SH-RETENTION-006), so the proof does
 * not decay with age.
 *
 * The `action_type` filter is deliberately narrow: `update_person_project_role`
 * and `end_person_*` write rows carrying the same `entity_type` and `entity_id`,
 * and reading either as proof of *authorship* would be inference.
 *
 * ## A failed read is a failure, never an empty graph
 *
 * The loader returns an outcome. 2N.5 found the opposite shape live — a per-item
 * failure filtered out of a map, so a broken read rendered as an absent link —
 * and an empty relations page is exactly the kind of "answer" a user would
 * believe.
 */

import { boundedList, RELATION_LIMIT, withProbe } from "@/features/bounds/contracts";
import type { Locale } from "@/lib/preferences";
import type { createClient } from "@/lib/supabase/server";

import { OWNER_ASSOCIATION_ACTIONS } from "./contracts";
import { getRelationsCopy } from "./copy";
import { projectRelations, type RelationProjection } from "./projection";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type RelationsOutcome =
  | { readonly status: "ok"; readonly projection: RelationProjection }
  | { readonly status: "failed" };

/** Unique, defined ids from a column of rows — the input every `.in()` takes. */
function idsOf<T>(rows: readonly T[], pick: (row: T) => string | null | undefined): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    const value = pick(row);
    if (typeof value === "string" && value !== "") ids.add(value);
  }
  return [...ids];
}

const EMPTY = { data: [] as never[], error: null };

export async function loadRelations(
  supabase: SupabaseClient,
  locale: Locale,
): Promise<RelationsOutcome> {
  const probe = withProbe(RELATION_LIMIT);

  const [relationshipResult, personProjectResult, personContextResult] = await Promise.all([
    /*
     * Live rows only. A relationship that ended is history, not the current
     * answer to "who is this to me" — the same predicate the person page
     * applies, so the two surfaces cannot disagree about what is current.
     */
    supabase
      .from("person_relationships")
      .select("person_id,relationship_type,description,valid_from")
      .is("valid_until", null)
      .order("valid_from", { ascending: false })
      .limit(probe),
    supabase
      .from("person_projects")
      .select("id,person_id,project_id,role,valid_from")
      .is("valid_until", null)
      .order("valid_from", { ascending: false })
      .limit(probe),
    supabase
      .from("person_contexts")
      .select("id,person_id,context_id,valid_from")
      .is("valid_until", null)
      .order("valid_from", { ascending: false })
      .limit(probe),
  ]);

  if (relationshipResult.error || personProjectResult.error || personContextResult.error) {
    return { status: "failed" };
  }

  const relationships = boundedList(relationshipResult.data ?? [], RELATION_LIMIT);
  const personProjects = boundedList(personProjectResult.data ?? [], RELATION_LIMIT);
  const personContexts = boundedList(personContextResult.data ?? [], RELATION_LIMIT);

  const personIds = [
    ...new Set([
      ...idsOf(relationships.items, (row) => row.person_id),
      ...idsOf(personProjects.items, (row) => row.person_id),
      ...idsOf(personContexts.items, (row) => row.person_id),
    ]),
  ];
  const projectIds = idsOf(personProjects.items, (row) => row.project_id);
  const contextIds = idsOf(personContexts.items, (row) => row.context_id);
  const associationIds = [
    ...idsOf(personProjects.items, (row) => row.id),
    ...idsOf(personContexts.items, (row) => row.id),
  ];

  const [auditResult, peopleResult, projectResult, contextResult] = await Promise.all([
    associationIds.length
      ? supabase
          .from("audit_logs")
          .select("entity_id")
          .in("entity_type", ["person_project", "person_context"])
          .in("action_type", [...OWNER_ASSOCIATION_ACTIONS])
          .in("entity_id", associationIds)
      : Promise.resolve(EMPTY),
    personIds.length
      ? supabase.from("people").select("id,name,organization_id").in("id", personIds)
      : Promise.resolve(EMPTY),
    projectIds.length
      ? supabase.from("projects").select("id,name,organization_id").in("id", projectIds)
      : Promise.resolve(EMPTY),
    contextIds.length ? supabase.from("contexts").select("id,name").in("id", contextIds) : Promise.resolve(EMPTY),
  ]);

  if (auditResult.error || peopleResult.error || projectResult.error || contextResult.error) {
    return { status: "failed" };
  }

  const people = peopleResult.data ?? [];
  const projects = projectResult.data ?? [];
  const organizationIds = [
    ...new Set([
      ...idsOf(people, (row) => row.organization_id),
      ...idsOf(projects, (row) => row.organization_id),
    ]),
  ];

  const organizationResult = organizationIds.length
    ? await supabase.from("organizations").select("id,name").in("id", organizationIds)
    : EMPTY;
  if (organizationResult.error) return { status: "failed" };

  return {
    status: "ok",
    projection: projectRelations({
      relationships: relationships.items,
      personProjects: personProjects.items,
      personContexts: personContexts.items,
      auditedAssociationIds: new Set(
        (auditResult.data ?? [])
          .map((row) => row.entity_id)
          .filter((value): value is string => typeof value === "string" && value !== ""),
      ),
      people,
      projects,
      contexts: contextResult.data ?? [],
      organizations: organizationResult.data ?? [],
      sourceBounded: relationships.bounded || personProjects.bounded || personContexts.bounded,
      limit: RELATION_LIMIT,
      locale,
      ownerLabel: getRelationsCopy(locale).ownerLabel,
    }),
  };
}
