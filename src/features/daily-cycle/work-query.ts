/**
 * `2L-VIEW-001…009` — everything a user is looking at on Work, as a value read
 * from the URL.
 *
 * ## Why this module exists at all
 *
 * `2L-VIEW-007` forbids stored per-user view state: "the complete description
 * of what a user is looking at is in the URL". That is only enforceable if
 * there is one place that turns a URL into that description and back, so a link
 * cannot quietly drop a parameter and a page cannot quietly remember one.
 *
 * ## Fail-closed means *narrower*, never wider
 *
 * `2L-VIEW-008` is the sharp one: an unknown, malformed or unauthorized
 * parameter resolves to the **declared default** and **never to a wider result
 * set**. Every parser below is a membership test against a closed vocabulary
 * with a declared default, and the defaults are chosen so that falling back can
 * only ever narrow or leave the set unchanged — `state` defaults to `open`,
 * which is the narrowest of the three, rather than to `any`.
 *
 * ## Why the canonical views stay three
 *
 * OD-2L-2 option A: `today`, `all` and `waiting` are the only *reported* views,
 * and everything else — upcoming, completed, per-project, per-context — is a
 * **filter within** them. That is what keeps the telemetry vocabulary honest
 * without a migration: every destination a user can reach is one the deployed
 * `workView` enum can already describe.
 */

import { workViews, type WorkViewId } from "./work-views";

export { workViews };
export type { WorkViewId };

/** What a filter may narrow by. Every member is a `tasks` column. */
export const WORK_STATES = ["open", "completed", "cancelled"] as const;
export type WorkState = (typeof WORK_STATES)[number];

export const WORK_DUE_FILTERS = ["any", "overdue", "today", "upcoming", "none"] as const;
export type WorkDueFilter = (typeof WORK_DUE_FILTERS)[number];

export const WORK_PRIORITIES = ["any", "low", "medium", "high", "urgent"] as const;
export type WorkPriorityFilter = (typeof WORK_PRIORITIES)[number];

export const WORK_ORIGINS = ["any", "you", "brain"] as const;
export type WorkOriginFilter = (typeof WORK_ORIGINS)[number];

/**
 * The orderings a user may choose.
 *
 * **There is deliberately no "by priority".** `manual_priority` is stored as
 * text, so a database ordering over it would sort `high, low, medium, urgent`
 * alphabetically — a control that looks like it sorts by importance and does
 * not. Sorting it correctly needs a CASE expression, which PostgREST cannot
 * express without a computed column, which is a migration OD-2L-2 A refuses.
 * Grouping by priority answers the same question honestly and costs nothing.
 */
export const WORK_ORDERS = ["default", "due_asc", "due_desc", "updated_desc", "updated_asc"] as const;
export type WorkOrder = (typeof WORK_ORDERS)[number];

export const WORK_GROUPINGS = ["none", "priority", "project", "context"] as const;
export type WorkGrouping = (typeof WORK_GROUPINGS)[number];

/**
 * A relation the user narrowed by, carried as an id.
 *
 * An id rather than a name, because the name is content and the id is
 * navigation. `2L-RETURN-003` draws that line for the return payload and it is
 * the same line here: a URL that carried "Aurora Participações" would put a
 * project's name in a browser history entry and in every referrer.
 */
export type WorkQuery = {
  readonly view: WorkViewId;
  readonly state: WorkState;
  readonly due: WorkDueFilter;
  readonly priority: WorkPriorityFilter;
  readonly origin: WorkOriginFilter;
  readonly projectId: string | null;
  readonly contextId: string | null;
  readonly order: WorkOrder;
  readonly group: WorkGrouping;
  readonly page: number;
};

/** The declared defaults, in one place, so "the default" is never a guess. */
export const DEFAULT_WORK_QUERY: WorkQuery = {
  view: "today",
  state: "open",
  due: "any",
  priority: "any",
  origin: "any",
  projectId: null,
  contextId: null,
  order: "default",
  group: "none",
  page: 1,
};

type Param = string | string[] | undefined;

/**
 * One value, or the declared default.
 *
 * A repeated parameter (`?order=a&order=b`) arrives as an array and resolves to
 * the default rather than to its first element: two values is a malformed
 * request, and picking one would be guessing which the user meant.
 */
function one<T extends string>(value: Param, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** A uuid, or nothing. Anything else narrows to *no relation filter at all*. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function relationId(value: Param): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

export function parseWorkQuery(
  params: Record<string, Param>,
  parsePage: (value: Param) => number,
): WorkQuery {
  return {
    view: one(params.view, workViews, DEFAULT_WORK_QUERY.view),
    state: one(params.state, WORK_STATES, DEFAULT_WORK_QUERY.state),
    due: one(params.due, WORK_DUE_FILTERS, DEFAULT_WORK_QUERY.due),
    priority: one(params.priority, WORK_PRIORITIES, DEFAULT_WORK_QUERY.priority),
    origin: one(params.origin, WORK_ORIGINS, DEFAULT_WORK_QUERY.origin),
    projectId: relationId(params.project),
    contextId: relationId(params.context),
    order: one(params.order, WORK_ORDERS, DEFAULT_WORK_QUERY.order),
    group: one(params.group, WORK_GROUPINGS, DEFAULT_WORK_QUERY.group),
    page: parsePage(params.page),
  };
}

/**
 * The query as link parameters — **defaults omitted**.
 *
 * Omitting them keeps the URL readable and, more importantly, keeps one
 * description of one state: `?view=today` and `?view=today&state=open&due=any`
 * would otherwise be two URLs for the same page, and a "did the position
 * change" comparison would be answering about strings rather than about state.
 */
export function toWorkQueryParams(query: WorkQuery): Record<string, string> {
  const params: Record<string, string> = {};
  if (query.view !== DEFAULT_WORK_QUERY.view) params.view = query.view;
  if (query.state !== DEFAULT_WORK_QUERY.state) params.state = query.state;
  if (query.due !== DEFAULT_WORK_QUERY.due) params.due = query.due;
  if (query.priority !== DEFAULT_WORK_QUERY.priority) params.priority = query.priority;
  if (query.origin !== DEFAULT_WORK_QUERY.origin) params.origin = query.origin;
  if (query.projectId) params.project = query.projectId;
  if (query.contextId) params.context = query.contextId;
  if (query.order !== DEFAULT_WORK_QUERY.order) params.order = query.order;
  if (query.group !== DEFAULT_WORK_QUERY.group) params.group = query.group;
  if (query.page !== DEFAULT_WORK_QUERY.page) params.page = String(query.page);
  return params;
}

/** The href a link to this exact position uses. */
export function workHref(locale: string, query: WorkQuery): string {
  const params = new URLSearchParams(toWorkQueryParams(query));
  const search = params.toString();
  return search ? `/${locale}/app/work?${search}` : `/${locale}/app/work`;
}

/** Whether the query narrows the view at all — what "filtered empty" means. */
export function isNarrowed(query: WorkQuery): boolean {
  return query.state !== DEFAULT_WORK_QUERY.state
    || query.due !== DEFAULT_WORK_QUERY.due
    || query.priority !== DEFAULT_WORK_QUERY.priority
    || query.origin !== DEFAULT_WORK_QUERY.origin
    || query.projectId !== null
    || query.contextId !== null;
}
