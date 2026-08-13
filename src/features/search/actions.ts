"use server";

/**
 * `2I-SEARCH-004` / `2I-SEARCH-005` / `2I-SEARCH-006` / `2I-SEARCH-007` —
 * global lexical search.
 *
 * ## Ownership, and the two things that are NOT how it is enforced
 *
 * Ownership comes from **the authenticated client plus forced RLS**. Every
 * query below runs through `createClient()` — the request-scoped SSR client
 * carrying the user's session — so Postgres itself refuses another owner's
 * rows. There is **no service-role path in this feature**, and
 * `phase-2i-search-guard.test.ts` asserts that structurally.
 *
 * It is *not* enforced by a `.eq("user_id", …)` filter bolted on after
 * retrieval, and it is *not* enforced by trimming results in TypeScript.
 * T-2I-01 names the failure precisely: search is the first surface in this
 * product that accepts an arbitrary string and queries seven tables, so it is
 * the first where "matched nothing" and "matched something you may not see"
 * could become distinguishable outcomes.
 *
 * ## Parallel by requirement, not by optimisation
 *
 * Gate G-2I.2 measured the sequential `UNION` at 338–669 ms and the slowest
 * single domain at 121–244 ms. But the shape was already fixed by the
 * requirements: `2I-SEARCH-006` (per-domain bounds) and `2I-SEARCH-007` (a
 * NAMED per-domain failure) are both meaningless unless each domain is queried
 * on its own. Having required that, the wall clock is the slowest domain — and
 * that is what let the phase close with **zero migrations**.
 *
 * ## OD-1
 *
 * `highly_sensitive` is excluded from the default scope. The exclusion is a
 * predicate **inside** each query, so an excluded row is never retrieved — not
 * retrieved-then-hidden. The response carries no count, no flag and no shape
 * difference that would reveal what was excluded.
 */

import { resolveAliasMatches } from "@/features/entities/aliases";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/lib/preferences";

import {
  DEFAULT_SENSITIVITY,
  DOMAIN_SPECS,
  PER_DOMAIN_LIMIT,
  SEARCH_DOMAINS,
  SENSITIVE_SCOPE_SENSITIVITY,
  TOTAL_LIMIT,
  buildOrFilter,
  buildSnippet,
  periodSince,
  type DomainOutcome,
  type PeriodFilter,
  type SearchDomain,
  type SearchResponse,
  type SearchResult,
} from "./contracts";

export type SearchRequest = {
  readonly query: string;
  readonly locale: Locale;
  readonly domains?: readonly SearchDomain[];
  readonly period?: PeriodFilter | null;
  /** OD-1. Off unless the user explicitly turned it on, and never persisted. */
  readonly sensitiveScope?: boolean;
};

const MIN_QUERY_LENGTH = 2;

/**
 * The minimal builder surface this feature uses. Declared rather than imported
 * so the loosening above stays bounded to exactly these five methods -- a bare
 * `any` would also permit `.rpc()`, which the search guard forbids.
 */
type SearchQueryBuilder = {
  or: (filter: string) => SearchQueryBuilder;
  order: (column: string, options: { ascending: boolean }) => SearchQueryBuilder;
  limit: (count: number) => SearchQueryBuilder;
  in: (column: string, values: string[]) => SearchQueryBuilder;
  gte: (column: string, value: string) => SearchQueryBuilder;
  then: <T>(onfulfilled: (value: { data: unknown; error: unknown }) => T) => Promise<T>;
};

export async function searchEverything(request: SearchRequest): Promise<SearchResponse> {
  const query = request.query.trim();
  const sensitiveScope = request.sensitiveScope === true;

  if (query.length < MIN_QUERY_LENGTH) {
    return {
      query,
      outcomes: [],
      results: [],
      totalBounded: false,
      partial: false,
      sensitiveScope,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fail closed. An unresolved session returns the same empty shape a
  // no-match returns, so an unauthenticated probe learns nothing either.
  if (!user) {
    return { query, outcomes: [], results: [], totalBounded: false, partial: false, sensitiveScope };
  }

  const selected = request.domains && request.domains.length > 0 ? request.domains : SEARCH_DOMAINS;
  const since = periodSince(request.period ?? null, new Date());
  const levels = sensitiveScope ? SENSITIVE_SCOPE_SENSITIVITY : DEFAULT_SENSITIVITY;

  // Every domain concurrently. `allSettled`, so one failing domain is NAMED
  // rather than collapsing the whole response — 2I-SEARCH-007.
  const settled = await Promise.allSettled(
    selected.map((domain) => queryDomain(supabase, domain, query, since, levels, request.locale)),
  );

  const outcomes: DomainOutcome[] = settled.map((entry, index) =>
    entry.status === "fulfilled"
      ? entry.value
      : { domain: selected[index], status: "failed" as const },
  );

  const collected: SearchResult[] = [];
  for (const outcome of outcomes) {
    if (outcome.status === "ok") collected.push(...outcome.results);
  }

  const totalBounded = collected.length > TOTAL_LIMIT;

  return {
    query,
    outcomes,
    results: collected.slice(0, TOTAL_LIMIT),
    totalBounded,
    partial: outcomes.some((outcome) => outcome.status === "failed"),
    sensitiveScope,
  };
}

async function queryDomain(
  supabase: Awaited<ReturnType<typeof createClient>>,
  domain: SearchDomain,
  query: string,
  since: string | null,
  levels: readonly string[],
  locale: Locale,
): Promise<DomainOutcome> {
  const spec = DOMAIN_SPECS[domain];

  /**
   * The one place the generated types cannot help, and it is worth naming.
   *
   * `database.types.ts` types `.select()` against a *literal* projection, and
   * this projection is assembled per domain from `DOMAIN_SPECS`. Seven typed
   * query builders would restore inference at the cost of seven copies of the
   * same predicate — and a divergence between them is precisely how one domain
   * quietly loses its sensitivity filter.
   *
   * So the builder is loosened here **and nowhere else**. What is NOT loosened
   * is the boundary: this is still the request-scoped authenticated client, so
   * forced RLS decides what exists regardless of how the projection is typed.
   */
  const loose = supabase as unknown as {
    from: (table: string) => {
      select: (projection: string) => SearchQueryBuilder;
    };
  };

  /*
   * `2N-IDENTITY-004` — a known nickname resolves to the person it names.
   *
   * Resolved before the domain query and folded into the same `or`, so an alias
   * hit and a name hit produce **one** result set: a person matched both ways
   * appears once, ordered and bounded with everybody else. A second query unioned
   * afterwards would have needed its own bound and its own dedupe, and would have
   * made `bounded` mean two different things in one outcome.
   *
   * This widens **which of the owner's rows match**, never which rows are
   * visible: the ids come from an owner-scoped read under the same forced RLS as
   * the query they feed, and they are matched against `id`, which the domain
   * query already restricts to the caller's rows. A failed alias read yields no
   * ids and therefore narrows nothing — search keeps working, minus nicknames.
   */
  const aliasIds = spec.aliasEntityType
    ? await resolveAliasMatches(supabase, spec.aliasEntityType, query, new Date())
    : [];
  const columnFilter = buildOrFilter(spec, query);
  const orFilter = aliasIds.length
    ? `${columnFilter},id.in.(${aliasIds.join(",")})`
    : columnFilter;

  // One extra row, so "there are more" is knowable without a second count
  // query — and without ever telling the user how many more.
  let builder = loose
    .from(spec.table)
    .select(`id, ${spec.columns.join(", ")}, ${spec.dateColumn}`)
    .or(orFilter)
    .order(spec.dateColumn, { ascending: false })
    .limit(PER_DOMAIN_LIMIT + 1);

  if (spec.hasSensitivity) {
    // OD-1, applied as a predicate in the query. An excluded row is never
    // retrieved, so there is nothing to leak downstream.
    builder = builder.in("sensitivity", levels as string[]);
  }
  if (since) {
    builder = builder.gte(spec.dateColumn, since);
  }

  const { data, error } = await builder;
  if (error) return { domain, status: "failed" };

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const bounded = rows.length > PER_DOMAIN_LIMIT;

  const results = rows.slice(0, PER_DOMAIN_LIMIT).map((row) => {
    const rawTitle = String(row[spec.titleColumn] ?? "").replace(/\s+/g, " ").trim();
    const snippetSource = spec.snippetColumn ? (row[spec.snippetColumn] as string | null) : null;
    // When title and snippet are the same column the snippet would repeat the
    // title, which wastes the row and reads as a bug.
    const snippet =
      spec.snippetColumn && spec.snippetColumn !== spec.titleColumn
        ? buildSnippet(snippetSource, query)
        : null;

    return {
      domain,
      id: String(row.id),
      title: rawTitle.length > 120 ? `${rawTitle.slice(0, 120)}…` : rawTitle || "—",
      snippet,
      occurredAt: (row[spec.dateColumn] as string | null) ?? null,
      href: `/${locale}/app/${spec.route}`,
    } satisfies SearchResult;
  });

  return { domain, status: "ok", results, bounded };
}
