import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createProductEventIdempotencyKey, recordProductEvent } from "@/features/product-analytics/server";
import { recordErrorEvent, type ErrorOperation } from "@/lib/observability/error-sink";
import type { Locale } from "@/lib/preferences";
import { claimRateLimitSlot } from "./admission";
import { rateLimitRefusalMessage } from "./copy";
import { isCeilingRefusal, type RateLimitBucket, type RateLimitRefusal } from "./refusal";

/**
 * Admission with its telemetry, for a Server Action — `2H-RATE-003`.
 *
 * ## One producer, so no call site can forget
 *
 * Every rate refusal is recorded here rather than at each call site. SH.6's
 * defect (ADR-084) was a producer nobody had checked against its validator; the
 * shape that avoids repeating it is a single emitter whose payload one parity
 * test pins in both directions, called by every admission point.
 *
 * ## Two outcomes, two records, deliberately
 *
 * A **ceiling** refusal is a product fact: the account is going faster than the
 * signed pace. It emits `rate_limit_refused`, whose `failureKind` is
 * `rate_limited` — a literal distinct from SH.5's auth throttle, SH.6's `quota`,
 * the lifecycle refusals, CAPTCHA, storage and provider failures, because a
 * reader must be able to tell which control refused.
 *
 * A **`RATE_LIMIT_STATE_UNAVAILABLE`** refusal is not a product fact, it is a
 * fault: the limiter could not be read. Filing it as `rate_limited` would put a
 * ceiling that was never reached into the funnel. It goes to 2H.2's error sink
 * as `database_error` instead, and the operation is still refused (`2H-RATE-005`).
 *
 * ## Idempotency
 *
 * The refusal's own ledger row id is the event's idempotency scope, so the
 * funnel event and the `rate_limit_events` row that caused it point at each
 * other, and a retried Server Action cannot double-count one refusal. When the
 * ledger write itself failed there is no id to use, and a fresh one is minted —
 * losing the ability to deduplicate is better than dropping the record.
 */
export type RateLimitAdmission =
  | { readonly ok: true }
  | { readonly ok: false; readonly refusal: RateLimitRefusal; readonly message: string };

export async function admitRateLimitedOperation(input: {
  readonly client: Pick<SupabaseClient, "rpc">;
  readonly bucket: RateLimitBucket;
  readonly locale: Locale;
  /** The error-sink operation this admission guards, used only on a fault. */
  readonly operation: ErrorOperation;
}): Promise<RateLimitAdmission> {
  const verdict = await claimRateLimitSlot(input.client, input.bucket);
  if (verdict.admitted) return { ok: true };

  if (isCeilingRefusal(verdict.refusal)) {
    // Best-effort, and never allowed to turn a refusal into an exception: the
    // caller is already refusing, and telemetry that could throw would make the
    // refusal worse than silent.
    await recordProductEvent({
      name: "rate_limit_refused",
      surface: "server",
      locale: input.locale,
      viewportClass: "unknown",
      appVersion: "server",
      idempotencyKey: createProductEventIdempotencyKey(
        "rate_limit_refused",
        verdict.slotId ?? crypto.randomUUID(),
      ),
      properties: {
        operation: input.bucket,
        failureKind: "rate_limited",
      },
    }).catch(() => {});
  } else {
    await recordErrorEvent(input.client, {
      surface: "server_action",
      operation: input.operation,
      reason: "database_error",
    });
  }

  return {
    ok: false,
    refusal: verdict.refusal,
    message: rateLimitRefusalMessage(input.locale, verdict.refusal),
  };
}
