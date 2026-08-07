import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The error sink's application-side writer (2H-SINK-001, 2H-SINK-002,
 * 2H-SINK-003).
 *
 * ## What it is for
 *
 * On 2026-08-04 every account deletion failed for two days and **nothing
 * recorded it**. There was no server-side error record at all, so the only
 * evidence the failure existed was a person eventually noticing. This module is
 * the missing record.
 *
 * ## What it deliberately cannot do
 *
 * It never sends an error's message anywhere. `classifyError` reduces whatever
 * it is given to one member of a closed set, and that member is the only thing
 * that travels. The database agrees: `error_events` has no free-text column, so
 * even a writer that tried could not store one. The two halves are pinned
 * against each other by `error-sink-parity.test.ts` in both directions — the
 * ADR-084 discipline, which exists because SH.6 shipped a producer whose value
 * was rejected by a validator nobody had checked it against, and recorded
 * nothing for weeks while reading as though it recorded everything.
 *
 * ## Best-effort, and counted
 *
 * ## Why this module is NOT `server-only`
 *
 * Nearly everything in `src/lib` that touches the database carries
 * `import "server-only"`. This does not, and the omission is a decision. It
 * holds no credential, constructs no client and reads no environment variable —
 * the caller passes the client in, and the only thing this module knows how to
 * do is turn an unknown value into one word from a closed list. There is
 * nothing here a browser bundle could leak.
 *
 * What the guard *would* cost is real: the repository runs Vitest under
 * `jsdom`, where `server-only` throws at import, so every module carrying it is
 * tested by reading its source rather than by executing it
 * (`extraction-contract.test.ts` is the established example). The behaviour
 * that matters here — that a provider message never leaves the process — is
 * only provable by *running* the writer against a recording client. A guard
 * that made the leak test impossible would be protecting nothing at the cost of
 * the one assertion T-2H-07 asks for.
 *
 * ## Best-effort, and counted
 *
 * `recordErrorEvent` never throws and never rejects: it is called from a path
 * that is already failing, and a sink that could turn a handled failure into an
 * unhandled one would be worse than no sink. But a silent writer is how a sink
 * reads as "no errors" while being broken, so its own failures are **counted**
 * and emitted with a fixed marker. `sinkWriteFailures()` is what makes a broken
 * sink visible from inside the process; `2H-OPS-001`'s volume-by-class read is
 * what makes it visible from outside.
 */

/** Which runtime failed. Mirrors `error_events_surface_check`. */
export const ERROR_SURFACES = [
  "server_action",
  "route_handler",
  "edge_function",
  "scheduled_job",
  "worker",
] as const;
export type ErrorSurface = (typeof ERROR_SURFACES)[number];

/** What was being attempted. Mirrors `error_events_operation_check`. */
export const ERROR_OPERATIONS = [
  "capture_entry",
  "reprocess_entry",
  "interpret_entry",
  "process_attachment",
  "file_upload",
  "chat_answer",
  "embed_text",
  "heartbeat_run",
  "account_deletion",
  "deletion_reap",
  "credential_validation",
  "job_claim",
  "job_drain",
  "product_event",
  "retention_sweep",
  "other",
] as const;
export type ErrorOperation = (typeof ERROR_OPERATIONS)[number];

/** Why it failed. Mirrors `error_events_reason_check`. */
export const ERROR_REASONS = [
  "provider_error",
  "provider_timeout",
  "provider_rate_limited",
  "validation_failed",
  "permission_denied",
  "not_found",
  "conflict",
  "quota_exceeded",
  "throttled",
  "lifecycle_blocked",
  "storage_error",
  "database_error",
  "timeout",
  "unclassified",
] as const;
export type ErrorReason = (typeof ERROR_REASONS)[number];

/**
 * The marker a broken sink prints. Fixed, because the thing that makes a sink
 * failure findable is that it always looks the same.
 */
export const SINK_WRITE_FAILED_MARKER = "error_sink_write_failed";

let writeFailures = 0;

/** How many times this process could not write to the sink. */
export function sinkWriteFailures(): number {
  return writeFailures;
}

/** Test-only: the counter is process-lifetime state and tests must not inherit it. */
export function resetSinkWriteFailures(): void {
  writeFailures = 0;
}

/**
 * Reduces anything to one declared reason.
 *
 * The `unknown` parameter type is the point: this is called from `catch`, where
 * the value genuinely can be anything, and the function's contract is that
 * whatever arrives, a member of `ERROR_REASONS` leaves. It reads shapes —
 * Postgres SQLSTATEs, an `AbortError` name, a status number — and **never**
 * interpolates a message into its answer.
 *
 * Ordering matters and is deliberate: the specific database refusals this
 * product raises on purpose (`P0001` details, quota, throttle) are read before
 * the generic `database_error`, so a quota refusal is not filed as a database
 * fault and lost among them.
 */
export function classifyError(error: unknown): ErrorReason {
  if (error === null || typeof error !== "object") return "unclassified";

  const candidate = error as {
    code?: unknown;
    status?: unknown;
    name?: unknown;
    detail?: unknown;
  };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const detail = typeof candidate.detail === "string" ? candidate.detail : "";
  const name = typeof candidate.name === "string" ? candidate.name : "";
  const status = typeof candidate.status === "number" ? candidate.status : undefined;

  // The product's own declared refusals, read before anything generic.
  if (detail.startsWith("QUOTA_")) return "quota_exceeded";
  if (detail.startsWith("AUTH_EVENT_THROTTLED")) return "throttled";
  if (detail.startsWith("ACCOUNT_LIFECYCLE_")) return "lifecycle_blocked";

  if (name === "AbortError" || name === "TimeoutError") return "timeout";

  switch (code) {
    case "42501":
      return "permission_denied";
    case "22023":
    case "23514":
    case "23502":
      return "validation_failed";
    case "23505":
    case "40001":
    case "55P03":
      return "conflict";
    case "PGRST116":
      return "not_found";
    case "57014":
      return "timeout";
    default:
      break;
  }

  if (status !== undefined) {
    if (status === 401 || status === 403) return "permission_denied";
    if (status === 404) return "not_found";
    if (status === 409) return "conflict";
    if (status === 408 || status === 504) return "provider_timeout";
    if (status === 429) return "provider_rate_limited";
    if (status >= 500) return "provider_error";
    if (status >= 400) return "validation_failed";
  }

  // A five-character SQLSTATE this switch does not name is still a database
  // refusal, and filing it as `unclassified` would hide a whole class of them.
  if (/^[0-9A-Z]{5}$/.test(code)) return "database_error";

  return "unclassified";
}

export type ErrorSinkEntry = {
  surface: ErrorSurface;
  operation: ErrorOperation;
  /** Either a classified reason, or the raw thrown value to classify here. */
  reason?: ErrorReason;
  error?: unknown;
  /**
   * Optional caller-supplied correlation id. It must be a UUID and it must not
   * be derived from a session, a cookie or a token (T-2H-09) — one is minted
   * here when the caller has nothing better, which is the common case.
   */
  correlationId?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Records one failure. Never throws, never rejects.
 *
 * Returns the correlation id so the caller can put it in a user-facing message
 * — "if you report this, quote 3f2a…" — which is the whole reason a correlation
 * id exists and is also why it must not be a session identifier.
 */
export async function recordErrorEvent(
  client: Pick<SupabaseClient, "rpc">,
  entry: ErrorSinkEntry,
): Promise<{ recorded: boolean; correlationId: string }> {
  const correlationId =
    entry.correlationId && UUID.test(entry.correlationId)
      ? entry.correlationId
      : crypto.randomUUID();

  const reason = entry.reason ?? classifyError(entry.error);

  try {
    const { error } = await client.rpc("record_error_event", {
      p_surface: entry.surface,
      p_operation: entry.operation,
      p_reason: reason,
      p_correlation_id: correlationId,
    });
    if (error) {
      noteWriteFailure(entry.surface, entry.operation);
      return { recorded: false, correlationId };
    }
    return { recorded: true, correlationId };
  } catch {
    noteWriteFailure(entry.surface, entry.operation);
    return { recorded: false, correlationId };
  }
}

/**
 * Counted and printed, never rethrown.
 *
 * What is printed is the classification only — the same rule the sink itself
 * follows, because a log line is a place a message would otherwise leak into
 * on the one path where the database is not there to refuse it.
 */
function noteWriteFailure(surface: ErrorSurface, operation: ErrorOperation): void {
  writeFailures += 1;
  console.error(SINK_WRITE_FAILED_MARKER, { surface, operation, failures: writeFailures });
}
