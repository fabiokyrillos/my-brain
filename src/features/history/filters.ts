import { z } from "zod";
import {
  asHistoryActor,
  asHistoryCategory,
  asHistoryEntityType,
  HISTORY_ACTORS,
  type HistoryActor,
  type HistoryCategory,
  type HistoryEntityType,
} from "./vocabulary";

/**
 * History's filter state, which lives in the URL rather than in a component.
 *
 * ## Why the URL
 *
 * Every other list in this product paginates through `?page=`, and pagination
 * that forgets the filters is the standard way this surface breaks. Keeping the
 * whole filter set in the query string means one source of truth for the server
 * query, the pagination links and the browser's own back button, and it makes a
 * filtered view something the owner can bookmark or reload.
 *
 * ## Malformed input
 *
 * Anything unrecognised is **dropped, never fatal**. A hand-edited or truncated
 * address renders the unfiltered list plus a note that some filters were
 * ignored, because a 400 page for a bad query parameter would lose the reader
 * their history over a typo. `ignoredKeys` records what was discarded so the
 * page can say so instead of silently pretending the filter applied.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The parameter names this surface owns, beside `page`. */
export const HISTORY_FILTER_KEYS = ["from", "to", "actor", "entity", "category", "subject"] as const;
export type HistoryFilterKey = (typeof HISTORY_FILTER_KEYS)[number];

export type HistoryFilters = {
  /** Inclusive first calendar day, as `YYYY-MM-DD` in the owner's timezone. */
  readonly from: string | null;
  /** Inclusive last calendar day. */
  readonly to: string | null;
  readonly actor: HistoryActor | null;
  readonly entityType: HistoryEntityType | null;
  readonly category: HistoryCategory | null;
  /** One specific object, by `audit_logs.entity_id`. */
  readonly subjectId: string | null;
  /** Parameters that were present but unusable, so the page can admit it. */
  readonly ignoredKeys: readonly HistoryFilterKey[];
};

export const EMPTY_HISTORY_FILTERS: HistoryFilters = {
  from: null,
  to: null,
  actor: null,
  entityType: null,
  category: null,
  subjectId: null,
  ignoredKeys: [],
};

/** A repeated parameter (`?actor=a&actor=b`) is not a choice — take the first. */
function single(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value.trim() === "" ? null : value.trim();
  if (Array.isArray(value)) return single(value[0]);
  return null;
}

const isoDate = z.string().regex(ISO_DATE);
const uuid = z.string().regex(UUID);

export type HistorySearchParams = Partial<Record<string, string | string[] | undefined>>;

/**
 * Reads the filter set out of `searchParams`.
 *
 * Ordering is normalized rather than rejected: `from` after `to` is far more
 * likely to be a mistake in entry than a request for an empty list, and the
 * active-filter summary shows the range that was actually applied, so the
 * correction is visible rather than silent.
 */
export function parseHistoryFilters(searchParams: HistorySearchParams): HistoryFilters {
  const ignored: HistoryFilterKey[] = [];

  const readDate = (key: "from" | "to"): string | null => {
    const raw = single(searchParams[key]);
    if (raw === null) return null;
    const parsed = isoDate.safeParse(raw);
    if (!parsed.success) {
      ignored.push(key);
      return null;
    }
    return parsed.data;
  };

  let from = readDate("from");
  let to = readDate("to");
  if (from !== null && to !== null && from > to) [from, to] = [to, from];

  const rawActor = single(searchParams.actor);
  const actor = rawActor === null ? null : asHistoryActorStrict(rawActor);
  if (rawActor !== null && actor === null) ignored.push("actor");

  const rawEntity = single(searchParams.entity);
  const entityType = rawEntity === null ? null : asHistoryEntityType(rawEntity);
  if (rawEntity !== null && entityType === null) ignored.push("entity");

  const rawCategory = single(searchParams.category);
  const category = rawCategory === null ? null : asHistoryCategory(rawCategory);
  if (rawCategory !== null && category === null) ignored.push("category");

  const rawSubject = single(searchParams.subject);
  const subjectParsed = rawSubject === null ? null : uuid.safeParse(rawSubject);
  const subjectId = subjectParsed?.success ? subjectParsed.data : null;
  if (rawSubject !== null && subjectId === null) ignored.push("subject");

  return { from, to, actor, entityType, category, subjectId, ignoredKeys: ignored };
}

/**
 * `asHistoryActor` folds anything unknown to `system`, which is right when
 * *reading a stored row* and wrong when *reading a filter*: it would turn a
 * typo into a silent filter on the system's own actions.
 */
function asHistoryActorStrict(value: string): HistoryActor | null {
  return HISTORY_ACTORS.includes(value as HistoryActor) ? asHistoryActor(value) : null;
}

/** True when nothing is filtered, so the page can pick the right empty state. */
export function hasActiveFilters(filters: HistoryFilters): boolean {
  return (
    filters.from !== null ||
    filters.to !== null ||
    filters.actor !== null ||
    filters.entityType !== null ||
    filters.category !== null ||
    filters.subjectId !== null
  );
}

/**
 * The filters as query parameters, for `PaginationLinks` and the clear control.
 *
 * `page` is deliberately absent: paging is the caller's concern, and carrying a
 * stale page number into a newly filtered list is how "no results" appears on
 * page 4 of a one-page result.
 */
export function historyFilterQuery(filters: HistoryFilters): Record<string, string> {
  const query: Record<string, string> = {};
  if (filters.from !== null) query.from = filters.from;
  if (filters.to !== null) query.to = filters.to;
  if (filters.actor !== null) query.actor = filters.actor;
  if (filters.entityType !== null) query.entity = filters.entityType;
  if (filters.category !== null) query.category = filters.category;
  if (filters.subjectId !== null) query.subject = filters.subjectId;
  return query;
}
