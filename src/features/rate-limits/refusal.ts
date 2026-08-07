/**
 * Reading a rate-limit verdict off the claim RPC — `2H-RATE-003`, `2H-RATE-005`.
 *
 * ## Why the verdict is data and not an exception
 *
 * `2H-RATE-003` requires a refusal to be a *recorded* outcome, and PostgREST
 * runs one RPC in one transaction: a refusal that raised would roll back the
 * `refused` row it had just written, so the refusal would report itself by
 * destroying its own evidence. `claim_rate_limit_slot` therefore returns
 * `(admitted, slot_id, refusal)` and raises only for genuine faults — an unknown
 * bucket, a missing signed parameter, no session.
 *
 * ## Why anything unrecognised refuses
 *
 * `2H-RATE-005` is fail-closed, and fail-closed is a property of the whole path
 * rather than of the SQL alone. A transport error, an unexpected row shape, a
 * refusal string this module does not know — each of them means *the ceiling was
 * not verified*, and an operation admitted on an unverified ceiling is an
 * operation the limiter did not bound. So the only value that produces
 * `admitted` here is an explicit `admitted === true` in a well-formed row.
 *
 * ## Why the raw error never travels
 *
 * The `quotas/refusal.ts` reasoning, unchanged: a `PostgrestError` names
 * functions, columns and arguments, none of which belongs on a screen or in a
 * product event. What leaves this module is a member of a closed union, and the
 * caller renders copy from it.
 */

/** The declared details `202608070081` returns. */
export const RATE_LIMIT_REFUSALS = [
  "RATE_LIMIT_AI",
  "RATE_LIMIT_UPLOAD",
  /**
   * The fail-closed outcome (`2H-RATE-005`).
   *
   * It is not a ceiling and must never be rendered as one — telling someone
   * they have reached a limit when the limiter itself is unreadable is the
   * product inventing a fact. It is a fault, rendered as "not right now" and
   * counted as a refusal because the operation genuinely did not happen.
   */
  "RATE_LIMIT_STATE_UNAVAILABLE",
] as const;

export type RateLimitRefusal = (typeof RATE_LIMIT_REFUSALS)[number];

export type RateLimitBucket = "ai" | "upload";

/**
 * `slotId` is present on both branches and means the same thing on each: the
 * `rate_limit_events` row this decision wrote. On an admission it is the slot
 * that was consumed; on a ceiling refusal it is the `refused` row that recorded
 * the decision. It is `null` when no row could be written — which is always the
 * case for `RATE_LIMIT_STATE_UNAVAILABLE`, since the table that would hold the
 * record is the one that proved unreadable.
 */
export type RateLimitVerdict =
  | { readonly admitted: true; readonly slotId: string | null }
  | { readonly admitted: false; readonly refusal: RateLimitRefusal; readonly slotId: string | null };

/** The bucket's ceiling refusal, so a caller can tell a ceiling from a fault. */
export function isCeilingRefusal(refusal: RateLimitRefusal): boolean {
  return refusal === "RATE_LIMIT_AI" || refusal === "RATE_LIMIT_UPLOAD";
}

function isKnownRefusal(value: unknown): value is RateLimitRefusal {
  return typeof value === "string"
    && (RATE_LIMIT_REFUSALS as readonly string[]).includes(value);
}

/**
 * The verdict for one claim response.
 *
 * `error` is whatever the client returned; `data` is the RPC rows. Everything
 * that is not an unambiguous admission is a refusal.
 */
export function readRateLimitVerdict(
  error: unknown,
  data: unknown,
): RateLimitVerdict {
  if (error) return { admitted: false, refusal: "RATE_LIMIT_STATE_UNAVAILABLE", slotId: null };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return { admitted: false, refusal: "RATE_LIMIT_STATE_UNAVAILABLE", slotId: null };
  }

  const verdict = row as Record<string, unknown>;
  const slotId = typeof verdict.slot_id === "string" ? verdict.slot_id : null;
  if (verdict.admitted === true) return { admitted: true, slotId };

  // `admitted` absent, null, or anything other than the literal `true` is not an
  // admission. A row that says `false` and a row that says nothing at all are
  // the same fact: the ceiling was not cleared.
  return {
    admitted: false,
    refusal: isKnownRefusal(verdict.refusal) ? verdict.refusal : "RATE_LIMIT_STATE_UNAVAILABLE",
    slotId,
  };
}
