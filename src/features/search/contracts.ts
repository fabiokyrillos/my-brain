/**
 * `2I-SEARCH-001` … `2I-SEARCH-011` — the global lexical search contract.
 *
 * ## The domain map, verified against the schema rather than the PRD's prose
 *
 * Seven existing tables, **no new data model**. Two vocabulary facts the
 * requirements use rather than re-derive: *Companies* is the `organizations`
 * table (displayed **Empresas/Companies** — the label predates the destination,
 * per EGC.1), and *Files* is the `attachments` table reached at the `files`
 * route.
 *
 * ## Sensitivity — OD-1
 *
 * `normal` and `private` are searchable by default. **`highly_sensitive` is
 * excluded** unless the user turns on an explicit, visibly-active sensitive
 * scope, and the default state must leak **neither the existence nor the
 * count** of what it excluded. A "3 hidden results" affordance is an existence
 * oracle wearing a helpful hat.
 *
 * This is an expectation decision, **not an authorization boundary**. Ownership
 * comes exclusively from the authenticated query plus forced RLS. The
 * sensitivity predicate sits on top of that boundary and never replaces it —
 * which is why there is no service-role path anywhere in this feature.
 *
 * ## ADR-055
 *
 * Lexical only. No embeddings, no `memories.embedding`, no `entry_embeddings`,
 * no vector retrieval, no similarity, no generated answers. ADR-055 remains
 * open and expires 2026-10-27; this feature neither satisfies nor supersedes
 * it, and `phase-2i-search-guard.test.ts` asserts that structurally.
 */

/** The seven domains, in the order a result list presents them. */
export const SEARCH_DOMAINS = [
  "tasks",
  "entries",
  "memories",
  "people",
  "projects",
  "organizations",
  "files",
] as const;

export type SearchDomain = (typeof SEARCH_DOMAINS)[number];

/** Sensitivity vocabulary, mirroring the CHECK on the three classified tables. */
export const SENSITIVITY_LEVELS = ["normal", "private", "highly_sensitive"] as const;
export type SensitivityLevel = (typeof SENSITIVITY_LEVELS)[number];

/**
 * The levels a default search may return.
 *
 * OD-1, as data rather than as a condition buried in a query builder — so a
 * guard can assert `highly_sensitive` is absent from it, and so adding a level
 * is a visible change to a constant.
 */
export const DEFAULT_SENSITIVITY: readonly SensitivityLevel[] = ["normal", "private"];

/** The levels the explicit sensitive scope adds. Never the default. */
export const SENSITIVE_SCOPE_SENSITIVITY: readonly SensitivityLevel[] = [
  "normal",
  "private",
  "highly_sensitive",
];

/**
 * How each domain is searched.
 *
 * `table` is the schema name; the **displayed** name comes from `copy.ts`. The
 * two are separated on purpose: `organizations` must never reach the UI, and
 * `Empresas` must never reach a query.
 */
export type DomainSpec = {
  readonly domain: SearchDomain;
  readonly table: string;
  /** Columns matched by the query, in relevance order. */
  readonly columns: readonly string[];
  /** The column shown as the result's primary label. */
  readonly titleColumn: string;
  /** The column a snippet is drawn from, when the title is not enough. */
  readonly snippetColumn: string | null;
  /** Whether the table carries `sensitivity`, and so participates in OD-1. */
  readonly hasSensitivity: boolean;
  /** The timestamp used for the period filter and for display. */
  readonly dateColumn: string;
  /** The `capabilities.ts` route this result opens. */
  readonly route: string;
};

export const DOMAIN_SPECS: Readonly<Record<SearchDomain, DomainSpec>> = {
  tasks: {
    domain: "tasks",
    table: "tasks",
    columns: ["title", "description"],
    titleColumn: "title",
    snippetColumn: "description",
    hasSensitivity: false,
    dateColumn: "created_at",
    route: "tasks",
  },
  entries: {
    domain: "entries",
    table: "entries",
    columns: ["original_content"],
    titleColumn: "original_content",
    snippetColumn: "original_content",
    hasSensitivity: true,
    dateColumn: "occurred_at",
    route: "inbox",
  },
  memories: {
    domain: "memories",
    table: "memories",
    columns: ["content"],
    titleColumn: "content",
    snippetColumn: "content",
    hasSensitivity: true,
    dateColumn: "created_at",
    route: "memories",
  },
  people: {
    domain: "people",
    table: "people",
    columns: ["name", "notes"],
    titleColumn: "name",
    snippetColumn: "notes",
    hasSensitivity: false,
    dateColumn: "created_at",
    route: "people",
  },
  projects: {
    domain: "projects",
    table: "projects",
    columns: ["name", "description"],
    titleColumn: "name",
    snippetColumn: "description",
    hasSensitivity: false,
    dateColumn: "created_at",
    route: "projects",
  },
  organizations: {
    domain: "organizations",
    table: "organizations",
    columns: ["name", "description"],
    titleColumn: "name",
    snippetColumn: "description",
    hasSensitivity: false,
    dateColumn: "created_at",
    route: "organizations",
  },
  files: {
    domain: "files",
    table: "attachments",
    // OD-2: extracted_text is searchable. It is document CONTENT, not text the
    // user typed, which is why it is a signed decision rather than a default.
    columns: ["original_name", "description", "extracted_text"],
    titleColumn: "original_name",
    snippetColumn: "extracted_text",
    hasSensitivity: true,
    dateColumn: "created_at",
    route: "files",
  },
};

/**
 * Result bounds — `2I-SEARCH-006`.
 *
 * Per domain **and** in total, and the response says which bound it hit, so
 * "more exist" is expressible. A bounded list that does not say it is bounded
 * is a wrong answer that looks complete.
 */
export const PER_DOMAIN_LIMIT = 8;
export const TOTAL_LIMIT = 40;

/** Snippet length. Bounded plain text, never markup — OD-2. */
export const SNIPPET_LENGTH = 160;

/** The period filter's options. `null` means no period constraint. */
export const PERIOD_FILTERS = ["7d", "30d", "12m"] as const;
export type PeriodFilter = (typeof PERIOD_FILTERS)[number];

export type SearchResult = {
  readonly domain: SearchDomain;
  readonly id: string;
  readonly title: string;
  readonly snippet: string | null;
  readonly occurredAt: string | null;
  readonly href: string;
};

export type DomainOutcome =
  | { readonly domain: SearchDomain; readonly status: "ok"; readonly results: readonly SearchResult[]; readonly bounded: boolean }
  /** `2I-SEARCH-007`: a failed domain is NAMED, never silently dropped. */
  | { readonly domain: SearchDomain; readonly status: "failed" };

export type SearchResponse = {
  readonly query: string;
  readonly outcomes: readonly DomainOutcome[];
  readonly results: readonly SearchResult[];
  readonly totalBounded: boolean;
  /** True when at least one domain failed. Surfaced, never swallowed. */
  readonly partial: boolean;
  readonly sensitiveScope: boolean;
};

/**
 * A bounded, plain-text snippet centred on the match.
 *
 * Plain text is not a rendering choice, it is OD-2: extracted document text is
 * data the user may never have written, and it is never markup. Newlines
 * collapse so a result row cannot be inflated to push others off screen.
 */
export function buildSnippet(source: string | null, query: string): string | null {
  if (!source) return null;
  const flat = source.replace(/\s+/g, " ").trim();
  if (flat === "") return null;

  const at = flat.toLowerCase().indexOf(query.toLowerCase());
  if (at === -1 || query === "") {
    return flat.length <= SNIPPET_LENGTH ? flat : `${flat.slice(0, SNIPPET_LENGTH)}…`;
  }

  const start = Math.max(0, at - Math.floor(SNIPPET_LENGTH / 3));
  const slice = flat.slice(start, start + SNIPPET_LENGTH);
  return `${start > 0 ? "…" : ""}${slice}${start + SNIPPET_LENGTH < flat.length ? "…" : ""}`;
}

/** The `since` bound for a period filter, or null. */
export function periodSince(period: PeriodFilter | null, now: Date): string | null {
  if (!period) return null;
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 365;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * The PostgREST `or` filter for one domain.
 *
 * Commas and parentheses are PostgREST's own separators, so a query containing
 * them would otherwise change the filter's structure rather than its value —
 * that is the injection this escaping prevents. The wildcards are added here,
 * around an already-escaped needle.
 */
export function buildOrFilter(spec: DomainSpec, query: string): string {
  const needle = query.replace(/[\\%_(),*]/g, (match) => `\\${match}`);
  return spec.columns.map((column) => `${column}.ilike.*${needle}*`).join(",");
}
