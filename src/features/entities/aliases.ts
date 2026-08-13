import "server-only";

import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * `2N-IDENTITY-004`, `2N-IDENTITY-009` — `entity_aliases` gains its first reader.
 *
 * ## What was already here, and what was not
 *
 * ADR-108's audit found `entity_aliases` with **neither a reader nor a writer**
 * in the application: the table, its four own-row policies, its `authenticated`
 * grants, its uniqueness constraint and its lookup index have existed since
 * `202607170020`, and the only occurrence of the name outside SQL was the
 * generated types file. OD-2N-1 **option A** signs switching it on rather than
 * building a canonical-identity pointer, which is why this needs **no
 * migration**: nothing here creates a table, a column, a policy or a grant.
 *
 * **This module is read-only, and this slice ships no writer.** `2N-IDENTITY-009`
 * says an alias is owner-authored — no inference, extraction or import may
 * create one — and the most direct way to keep that true in a slice that only
 * needs to *read* is to add no write path at all. There is deliberately no
 * `createAlias` here for a later caller to find and reach for.
 *
 * ## Ownership
 *
 * Row-level security scopes every query below to the caller, through the
 * authenticated client. Neither function takes a `user_id`, neither accepts a
 * client, and there is no service-role path: `2N-SEC-002` keeps ownership
 * RLS-and-query only, and reading an alias **never widens what a query may
 * return beyond what the owner already owns** (`2N-IDENTITY-009`). No redundant
 * `user_id` predicate is added, for the reason `contexts.ts` records — a
 * leak here would be an RLS failure, and a redundant predicate would hide that
 * rather than prevent it.
 *
 * Note in particular what this module does **not** call.
 * `public.resolve_owned_entity_exact` already reads this table and would resolve
 * a nickname in one hop — but it is `security definer` and takes `p_user_id` as
 * a **parameter**, so calling it from a request path would mean handing a
 * caller-supplied owner id to a function that trusts it. It is the worker's
 * authority path and it stays there.
 *
 * ## Why nothing here normalizes
 *
 * `entity_aliases` carries `normalized_alias`, written by the
 * `entity_aliases_prepare` trigger through `public.normalize_entity_alias` — and
 * that function is **revoked from `authenticated`** (`202607170020:314`), so no
 * request path can compute the value it would need to compare against.
 *
 * A TypeScript re-implementation is the obvious workaround and it is the wrong
 * one. `normalizer-divergence.test.ts` already pins the reason: the SQL
 * normalizer has no concept of a combining mark, so `señor` normalizes to
 * `sen or` in the database and to `senor` in TypeScript — the same word, typed
 * two ways, becoming one token or two. That file's conclusion is that candidacy
 * may only ever be decided in SQL, and a second normalizer added here would be a
 * second answer to a question that already has an authority.
 *
 * So this module matches the **`alias` column as the owner typed it**, with the
 * same `ilike` containment every other search domain uses on its own raw
 * columns. That is a narrower promise than exact normalized resolution, it is
 * honest about what it can guarantee, and it needs no vocabulary of its own.
 */

/** One alias, as the owner wrote it. */
export type EntityAlias = {
  readonly id: string;
  readonly alias: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly validFrom: string | null;
  readonly validTo: string | null;
};

/** The entity kinds `entity_aliases.entity_type` admits, per its CHECK constraint. */
export const ALIAS_ENTITY_TYPES = ["context", "organization", "project", "person"] as const;
export type AliasEntityType = (typeof ALIAS_ENTITY_TYPES)[number];

/**
 * Whether an alias is in force at an instant.
 *
 * ## The bounds are the database's, not this module's opinion
 *
 * Both endpoints are nullable and open-ended, and the comparison mirrors
 * `resolve_owned_entity_exact` **exactly** — `valid_from <= at` and
 * `valid_to >= at`, both inclusive, both vacuously true when null. Two answers
 * to "is this alias in force" is precisely the divergence this phase exists to
 * remove, so the SQL that already answers it is the shape this takes rather than
 * a cleaner half-open interval that would disagree at one instant.
 *
 * Exported so the window is testable without a database, and so a surface that
 * has already loaded rows can re-check them against a different instant without
 * a second query.
 */
export function aliasIsInForce(alias: EntityAlias, at: Date): boolean {
  const instant = at.getTime();
  if (alias.validFrom !== null && Date.parse(alias.validFrom) > instant) return false;
  if (alias.validTo !== null && Date.parse(alias.validTo) < instant) return false;
  return true;
}

const ROW_COLUMNS = "id,alias,entity_type,entity_id,valid_from,valid_to";

type AliasRow = {
  id: string;
  alias: string;
  entity_type: string;
  entity_id: string;
  valid_from: string | null;
  valid_to: string | null;
};

function toAlias(row: AliasRow): EntityAlias {
  return {
    id: row.id,
    alias: row.alias,
    entityType: row.entity_type,
    entityId: row.entity_id,
    validFrom: row.valid_from,
    validTo: row.valid_to,
  };
}

/**
 * The aliases in force for one entity, at one instant.
 *
 * Degrades to an empty list rather than throwing, the way
 * `loadContextOptions` does: an alias is an enrichment of a contextual page, and
 * one unavailable optional relation must not take the page down with it. A page
 * that shows no aliases is a page with no aliases, which is also the honest
 * rendering when the read failed — and unlike a memory or an entry, an absent
 * alias reveals nothing and withholds nothing.
 *
 * The validity window is applied **in the query**, so a row that has expired
 * never reaches the surface at all, and re-checked in `aliasIsInForce` for the
 * rows that do — the filter is the bound, the predicate is the proof.
 */
export async function loadAliasesForEntity(
  supabase: SupabaseClient,
  entityType: AliasEntityType,
  entityId: string,
  at: Date,
): Promise<readonly EntityAlias[]> {
  const instant = at.toISOString();
  const { data, error } = await supabase
    .from("entity_aliases")
    .select(ROW_COLUMNS)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .or(`valid_from.is.null,valid_from.lte.${instant}`)
    .or(`valid_to.is.null,valid_to.gte.${instant}`)
    .order("alias", { ascending: true });

  if (error || !data) return [];
  return (data as AliasRow[]).map(toAlias).filter((alias) => aliasIsInForce(alias, at));
}

/**
 * The entity ids whose alias contains `query`, at one instant.
 *
 * `2N-IDENTITY-004`'s "a known nickname resolves to the person it names, in
 * entity resolution and in search" — the search half. Returns ids rather than
 * rows so the caller joins them against a domain query it already scopes and
 * bounds itself; this widens **which of the owner's rows match**, never which
 * rows are visible.
 *
 * Bounded, because an unbounded `in (…)` built from user input is a query whose
 * cost the user chooses. The bound is deliberately generous relative to search's
 * `PER_DOMAIN_LIMIT` of 8: this is a pre-filter feeding a bounded query, not a
 * result list.
 */
export async function resolveAliasMatches(
  supabase: SupabaseClient,
  entityType: AliasEntityType,
  query: string,
  at: Date,
  limit = ALIAS_MATCH_LIMIT,
): Promise<readonly string[]> {
  const needle = query.trim();
  if (needle === "") return [];
  const instant = at.toISOString();
  const { data, error } = await supabase
    .from("entity_aliases")
    .select(ROW_COLUMNS)
    .eq("entity_type", entityType)
    .ilike("alias", `%${escapeLikePattern(needle)}%`)
    .or(`valid_from.is.null,valid_from.lte.${instant}`)
    .or(`valid_to.is.null,valid_to.gte.${instant}`)
    .limit(limit);

  if (error || !data) return [];
  const ids = (data as AliasRow[])
    .map(toAlias)
    .filter((alias) => aliasIsInForce(alias, at))
    .map((alias) => alias.entityId);
  return Array.from(new Set(ids));
}

export const ALIAS_MATCH_LIMIT = 50;

/**
 * Escapes the wildcards `ilike` would otherwise read as structure.
 *
 * `%` and `_` in a user's query are characters they typed, not operators they
 * chose — without this, searching for `_` matches every single-character alias.
 * The same reasoning `buildOrFilter` applies to PostgREST's own separators.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}
