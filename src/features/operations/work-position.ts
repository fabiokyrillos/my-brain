/**
 * `2L-RETURN-001…005` — where the user was when they opened a task.
 *
 * ## Why it is a payload and not "just the referrer"
 *
 * A user opens a task from `?view=all&priority=high&page=3` and presses back.
 * The browser's own history would return them there, and the moment they arrive
 * by a shared link, from a notification, or after a refresh, it would not. So
 * the position travels **with the link**, in the URL, and nowhere else
 * (`2L-RETURN-002`): no server-side state, no stored preference, no
 * client-persisted cursor.
 *
 * ## Why the schema is `.strict()` and refuses by name
 *
 * `2L-RETURN-003` requires this to carry navigation position **only**, and to
 * be *refused rather than ignored* if it carries anything else. `.strict()` is
 * the mechanism; `POSITION_FORBIDDEN_FIELDS` is the statement, and it is
 * asserted field by field so the refusal is legible in a failure message rather
 * than showing up as "the object had an extra key".
 *
 * Every forbidden name is an authorization, a clock that reconstitutes one, or
 * a computed result the user would then be asked to act on without having seen
 * it recomputed. This is the shape `2K-CONT-003` established, reused rather
 * than re-invented — a second way of expressing "carries no authority" would be
 * a second thing to keep right.
 *
 * ## Why it is the query, and not a copy of it
 *
 * The payload *is* a `WorkQuery`. There is no second vocabulary for "where the
 * user was", so a filter that exists on the list cannot be missing from the
 * return, and one that is dropped from the taxonomy cannot survive in a stale
 * payload — it would fail the parse and resolve to the declared default.
 */

import { z } from "zod";

import {
  DEFAULT_WORK_QUERY,
  WORK_DUE_FILTERS,
  WORK_GROUPINGS,
  WORK_ORDERS,
  WORK_ORIGINS,
  WORK_PRIORITIES,
  WORK_STATES,
  workViews,
  type WorkQuery,
} from "@/features/daily-cycle/work-query";

/** The version, so a payload from an older shape is refused rather than coerced. */
export const WORK_POSITION_VERSION = "2026-08-09.1";

/**
 * Fields the payload refuses **by name**.
 *
 * The same list `2K-CONT-003` refuses, for the same reason: a return position
 * that could carry a confirmation, an operation key or a pinned instant would
 * be an authorization travelling in a URL, and the fact that nothing currently
 * puts one there is not a property — it is a coincidence waiting to end.
 */
export const POSITION_FORBIDDEN_FIELDS = [
  "issuedAt",
  "observedBefore",
  "confirmationId",
  "operationKey",
  "requestFingerprint",
  "fingerprint",
  "patch",
  "preview",
  "mutation",
  "authorization",
  "session",
  "expected",
] as const;

/**
 * Short keys because this travels in a URL — not to obscure it.
 *
 * `v` version, `w` view, `s` state, `d` due, `r` priority, `o` origin,
 * `p` project, `c` context, `k` order, `g` group, `n` page. Every one is a
 * navigation identifier or a member of a closed vocabulary; none is content.
 */
const positionSchema = z
  .object({
    v: z.literal(WORK_POSITION_VERSION),
    w: z.enum(workViews),
    s: z.enum(WORK_STATES),
    d: z.enum(WORK_DUE_FILTERS),
    r: z.enum(WORK_PRIORITIES),
    o: z.enum(WORK_ORIGINS),
    p: z.string().uuid().nullable(),
    c: z.string().uuid().nullable(),
    k: z.enum(WORK_ORDERS),
    g: z.enum(WORK_GROUPINGS),
    n: z.number().int().min(1).max(10_000),
  })
  .strict();

export type WorkPosition = z.infer<typeof positionSchema>;

export function toWorkPosition(query: WorkQuery): WorkPosition {
  return {
    v: WORK_POSITION_VERSION,
    w: query.view,
    s: query.state,
    d: query.due,
    r: query.priority,
    o: query.origin,
    p: query.projectId,
    c: query.contextId,
    k: query.order,
    g: query.group,
    n: query.page,
  };
}

export function fromWorkPosition(position: WorkPosition): WorkQuery {
  return {
    view: position.w,
    state: position.s,
    due: position.d,
    priority: position.r,
    origin: position.o,
    projectId: position.p,
    contextId: position.c,
    order: position.k,
    group: position.g,
    page: position.n,
  };
}

export function serializeWorkPosition(query: WorkQuery): string {
  return Buffer.from(JSON.stringify(toWorkPosition(query)), "utf8").toString("base64url");
}

/**
 * Parses an untrusted string from a URL.
 *
 * Returns the **declared default** for anything it cannot read, rather than
 * throwing: a malformed return position is a user who ends up on the default
 * Work view, which is a mildly wrong place — while a throw would be an error
 * page in response to pressing Back.
 */
export function parseWorkPosition(value: string | string[] | undefined): WorkQuery {
  if (typeof value !== "string" || value === "") return DEFAULT_WORK_QUERY;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const parsed = positionSchema.safeParse(decoded);
    return parsed.success ? fromWorkPosition(parsed.data) : DEFAULT_WORK_QUERY;
  } catch {
    return DEFAULT_WORK_QUERY;
  }
}
