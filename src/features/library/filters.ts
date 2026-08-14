/**
 * `2N-FILES-010` — classifying and filtering the files the owner owns.
 *
 * ## What the slice's measurement decided, and why the shape follows from it
 *
 * The filters were measured before they were designed. Three of the four axes —
 * processing state, kind and period — are **predicates on the same `attachments`
 * query the page already issues**, so they cost **zero additional round trips**,
 * and the existing `attachments_user_created_idx (user_id, created_at desc)`
 * still serves both the ordering and the period range. No index, no migration,
 * no RPC. The fourth axis, linked entity, needs the link table and therefore one
 * extra sequential read — and only when that filter is actually active.
 *
 * ## The rule that keeps a filter from lying
 *
 * **Filtering happens in the query, before pagination — never in memory over a
 * page.** A page of fifty rows filtered client-side would show "the completed
 * files" of *page one*, which is not the set the user asked for, and the
 * pagination beneath it would be describing a different set again. That is the
 * misleading-filter stop condition this slice was told to report rather than
 * ship, and it is avoided by construction: every predicate below is handed to
 * PostgREST, and `page` resets whenever a filter changes.
 *
 * ## And the rule that keeps a count from being an oracle
 *
 * Nothing here produces a total. `2N-PRIVACY-004` requires a count computed over
 * everything the owner owns *including masked rows*, and this page knows only
 * its bounded page — so it states the filter and the page, and never a number
 * that would have to be either a second query or a guess. Masked rows are
 * filtered on `status`, `mime_type` and `created_at`, none of which is withheld
 * from anybody, so a filter can never hide a row for a privacy reason and make
 * the difference visible.
 */

import { PERIOD_FILTERS, periodSince, type PeriodFilter } from "@/features/search/contracts";
import { ATTACHMENT_LIMITS } from "@/lib/quotas";

import { REVERSE_LINKED_ENTITY_TYPES, type ReverseLinkedEntityType } from "./link-contracts";

export { PERIOD_FILTERS, periodSince };
export type { PeriodFilter };

/**
 * The processing states, mirroring `attachments.status`'s CHECK constraint
 * (`202607160007:107`) exactly.
 *
 * Stated as data rather than as branches so a guard can assert the two agree,
 * and so the labels come from `vocabulary/copy.ts` — which already has all four,
 * because the page has rendered the badge since before this slice.
 */
export const FILE_STATE_FILTERS = ["uploaded", "processing", "ready", "failed"] as const;
export type FileStateFilter = (typeof FILE_STATE_FILTERS)[number];

/**
 * The kinds, and the MIME types each one is.
 *
 * Derived from the upload allowlist rather than invented beside it: a type the
 * product refuses to accept has no business appearing as a filter, and a type it
 * accepts must land somewhere. `other` is not listed here — it is computed as
 * *everything these do not cover*, so a MIME type added to the allowlist without
 * being classified here still has a home, and `phase-2n-library-guard` fails
 * until somebody decides which kind it belongs to.
 */
export const FILE_KIND_MIME_TYPES = {
  image: ["image/jpeg", "image/png", "image/webp"],
  document: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  spreadsheet: [
    "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
  text: ["text/plain"],
} as const satisfies Record<string, readonly string[]>;

export const FILE_KIND_FILTERS = [
  "image",
  "document",
  "spreadsheet",
  "text",
  "other",
] as const;
export type FileKindFilter = (typeof FILE_KIND_FILTERS)[number];

/** Every MIME type the named kinds cover, so `other` can be their complement. */
export const CLASSIFIED_MIME_TYPES: readonly string[] = Object.values(FILE_KIND_MIME_TYPES).flat();

/**
 * The MIME types a kind selects, or `null` for `other`.
 *
 * `null` is not "no filter" — it is the caller's instruction to negate
 * `CLASSIFIED_MIME_TYPES`, which is what makes `other` exhaustive rather than a
 * hard-coded leftovers list that a new allowed type would silently fall out of.
 */
export function mimeTypesForKind(kind: FileKindFilter): readonly string[] | null {
  if (kind === "other") return null;
  return FILE_KIND_MIME_TYPES[kind];
}

/** The allowlist this module classifies against, re-exported for the guard. */
export const UPLOAD_MIME_ALLOWLIST: readonly string[] = ATTACHMENT_LIMITS.mimeAllowlist;

/**
 * A filter over one linked subject.
 *
 * Only `person` and `project` — the two kinds with a page the owner can have
 * arrived from. There is deliberately no way to express "files with no link at
 * all": with no writer for `entity_attachments` that filter would select every
 * file for every owner, which is a control that looks like a choice and is not.
 */
export type LinkedFilter = {
  readonly entityType: ReverseLinkedEntityType;
  readonly entityId: string;
};

export type FileFilters = {
  readonly state: FileStateFilter | null;
  readonly kind: FileKindFilter | null;
  readonly period: PeriodFilter | null;
  readonly linked: LinkedFilter | null;
};

export const NO_FILE_FILTERS: FileFilters = {
  state: null,
  kind: null,
  period: null,
  linked: null,
};

function first(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}

function narrow<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/**
 * Reads the filters out of the URL.
 *
 * Every unrecognised value becomes `null` — **no filter** — rather than an
 * error. A URL is something a user can edit, share and mistype, and a page that
 * refused to render because `?state=finished` is not a state would be a worse
 * answer than the unfiltered list it can always show honestly. The rendered
 * controls say which filter is active, so an ignored parameter is visible rather
 * than silent.
 */
export function parseFileFilters(
  searchParams: Record<string, string | string[] | undefined>,
): FileFilters {
  const linkType = narrow(first(searchParams.linkType), REVERSE_LINKED_ENTITY_TYPES);
  const linkId = first(searchParams.linkId);
  return {
    state: narrow(first(searchParams.state), FILE_STATE_FILTERS),
    kind: narrow(first(searchParams.kind), FILE_KIND_FILTERS),
    period: narrow(first(searchParams.period), PERIOD_FILTERS),
    // Both halves or neither: a type with no id selects nothing and an id with
    // no type cannot be resolved, and either alone would leave the page claiming
    // a filter it is not applying.
    linked: linkType && linkId ? { entityType: linkType, entityId: linkId } : null,
  };
}

export function hasActiveFileFilter(filters: FileFilters): boolean {
  return (
    filters.state !== null ||
    filters.kind !== null ||
    filters.period !== null ||
    filters.linked !== null
  );
}

/**
 * The query string for a filter link.
 *
 * Takes the current filters and a patch, so a control toggles its own axis while
 * preserving the others — the behaviour a user expects from filter chips and the
 * one that is easiest to get wrong by rebuilding the URL from scratch.
 *
 * `page` is deliberately **not** carried through. Page three of the unfiltered
 * list is not page three of the filtered one, and keeping the number would land
 * the user on an empty page that looks like "no results".
 */
export function fileFiltersQuery(
  filters: FileFilters,
  patch: Partial<FileFilters>,
): string {
  const next: FileFilters = { ...filters, ...patch };
  const params = new URLSearchParams();
  if (next.state) params.set("state", next.state);
  if (next.kind) params.set("kind", next.kind);
  if (next.period) params.set("period", next.period);
  if (next.linked) {
    params.set("linkType", next.linked.entityType);
    params.set("linkId", next.linked.entityId);
  }
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}

/**
 * The active filters as a plain record, for `PaginationLinks`.
 *
 * Exists because page two of a filtered list must still be filtered. Without
 * this the "Next" link dropped every predicate and landed the reader on the
 * unfiltered library at page two — the filter silently ending one click after it
 * was applied, which is worse than never offering it.
 */
export function fileFiltersRecord(filters: FileFilters): Record<string, string> {
  const record: Record<string, string> = {};
  if (filters.state) record.state = filters.state;
  if (filters.kind) record.kind = filters.kind;
  if (filters.period) record.period = filters.period;
  if (filters.linked) {
    record.linkType = filters.linked.entityType;
    record.linkId = filters.linked.entityId;
  }
  return record;
}

/** The files route under a set of filters. */
export function filesHref(
  locale: string,
  filters: FileFilters,
  patch: Partial<FileFilters> = {},
): string {
  return `/${locale}/app/files${fileFiltersQuery(filters, patch)}`;
}

/**
 * Whether a chip is the active one on its axis.
 *
 * A named function rather than an inline comparison at three call sites, so the
 * `aria-current` a screen reader announces and the class a sighted user sees can
 * never disagree about which filter is on.
 */
export function isActiveFilter<K extends keyof FileFilters>(
  filters: FileFilters,
  axis: K,
  value: FileFilters[K],
): boolean {
  if (axis === "linked") {
    const active = filters.linked;
    const candidate = value as LinkedFilter | null;
    if (!active || !candidate) return active === candidate;
    return active.entityType === candidate.entityType && active.entityId === candidate.entityId;
  }
  return filters[axis] === value;
}
