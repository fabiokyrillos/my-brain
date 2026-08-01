import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * `BYOK-JOBS-004` and `BYOK-JOBS-005` — the closed failure vocabulary, and the
 * retry policy that reads off it.
 *
 * ## Why a vocabulary rather than a message
 *
 * `jobs.error` is rendered verbatim on the Jobs page (`TODO.md:209`), and this
 * repository has already leaked a provider-derived message into it once
 * (`SECURITY.md:34`). A `catch (error) { p_error: error.message }` is not a
 * mistake somebody made — it is the *default shape*, and it will come back the
 * next time a handler grows a throw. So the only thing that may reach `p_error`
 * is a member of this list, and `job-failure.test.ts` asserts the whole set is
 * short, lowercase, underscore-separated and free of anything that could carry
 * an excerpt of the thing that failed.
 *
 * ## Why the retry policy lives beside it
 *
 * `BYOK-JOBS-003`. A configuration failure is not a transient failure: no amount
 * of backoff turns a removed credential into a present one, and this codebase
 * has already been burned by a retry budget spent on errors retrying could not
 * fix. Terminality is therefore a **property of the code**, decided once here,
 * rather than a judgement each call site makes for itself.
 *
 * `insufficient_quota` sits on the terminal side by owner decision
 * (`BYOK-DEC-10`): the user's provider account is out of money, and the fix is
 * on the user's side of the boundary. Retrying it spends the queue's time and
 * tells the user nothing new.
 */

/** Terminal: the job stops now and no further attempt is scheduled. */
export const TERMINAL_JOB_FAILURE_CODES = [
  // The five credential states. Everything here is a fact about configuration.
  "credential_required",
  "credential_unavailable",
  "credential_unreadable",
  "invalid_key",
  "revoked",
  "insufficient_quota",
  // Facts about the job or its subject that a retry reproduces exactly.
  "invalid_payload",
  "subject_not_found",
] as const;

/** Retryable: bounded backoff, capped by the row's own `max_attempts`. */
export const RETRYABLE_JOB_FAILURE_CODES = [
  "rate_limited",
  "provider_unavailable",
  "provider_transport",
  "provider_response_invalid",
  "persistence_failed",
  "unexpected_error",
] as const;

export const JOB_FAILURE_CODES = [
  ...TERMINAL_JOB_FAILURE_CODES,
  ...RETRYABLE_JOB_FAILURE_CODES,
] as const;

export type TerminalJobFailureCode = (typeof TERMINAL_JOB_FAILURE_CODES)[number];
export type RetryableJobFailureCode = (typeof RETRYABLE_JOB_FAILURE_CODES)[number];
export type JobFailureCode = (typeof JOB_FAILURE_CODES)[number];

/**
 * The configuration subset — the codes whose honest product state is *"AI is not
 * configured"* rather than *"this failed"*.
 *
 * Declared once, here, because both handlers need it and two copies of a set
 * like this diverge the first time somebody adds a code to one file. `entry.ts`
 * uses it to return the entry to the awaiting state; `attachment.ts` uses it to
 * choose a message that names Settings instead of offering a retry.
 */
export const CONFIGURATION_FAILURE_CODES: ReadonlySet<JobFailureCode> = new Set<JobFailureCode>([
  "credential_required",
  "credential_unavailable",
  "credential_unreadable",
  "invalid_key",
  "revoked",
  "insufficient_quota",
]);

const TERMINAL = new Set<string>(TERMINAL_JOB_FAILURE_CODES);
const ALL = new Set<string>(JOB_FAILURE_CODES);

export function isJobFailureCode(value: unknown): value is JobFailureCode {
  return typeof value === "string" && ALL.has(value);
}

export function isTerminalJobFailureCode(code: JobFailureCode): boolean {
  return TERMINAL.has(code);
}

/**
 * The only error type a job handler may throw on purpose.
 *
 * Its `message` **is** the code, so a handler that forgets this file and writes
 * `error.message` into `p_error` still writes a declared code rather than prose.
 * That is deliberate belt-and-braces: the classification below is the belt.
 */
export class JobFailure extends Error {
  readonly code: JobFailureCode;

  constructor(code: JobFailureCode) {
    super(code);
    this.name = "JobFailure";
    this.code = code;
  }
}

/**
 * Map anything thrown inside a handler onto a declared code.
 *
 * The default is `unexpected_error` and it is **retryable**, because an
 * unclassified throw is by definition something we do not understand, and the
 * safe reading of "we do not understand this" is "it might be transient". The
 * bound is `max_attempts`, which has not changed.
 */
export function classifyJobFailure(error: unknown): JobFailureCode {
  if (error instanceof JobFailure) return error.code;
  // A cross-realm `JobFailure` (Deno test isolate, dynamic import) fails the
  // `instanceof`, so the shape is accepted as well — but only when the code is a
  // declared member, never as a way to smuggle a message through.
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    isJobFailureCode((error as { code: unknown }).code)
  ) {
    return (error as { code: JobFailureCode }).code;
  }
  return "unexpected_error";
}

/**
 * Classify a provider HTTP response.
 *
 * The body is read **only** to distinguish `insufficient_quota` from an ordinary
 * `rate_limited`: both are HTTP 429 and they have opposite retry policies, so
 * the status alone cannot decide. Nothing read here is returned, logged or
 * stored — the function's whole output is one member of the vocabulary above.
 */
export async function classifyProviderResponse(response: Response): Promise<JobFailureCode> {
  if (response.status === 401) return "invalid_key";
  if (response.status === 403) return "revoked";
  if (response.status === 429) {
    let quota = false;
    try {
      const body = (await response.clone().json()) as { error?: { code?: unknown; type?: unknown } };
      quota =
        body?.error?.code === "insufficient_quota" || body?.error?.type === "insufficient_quota";
    } catch {
      // Unreadable body: fall back to the retryable reading, which is the one
      // that cannot strand a job that would have succeeded.
      quota = false;
    }
    return quota ? "insufficient_quota" : "rate_limited";
  }
  if (response.status >= 500) return "provider_unavailable";
  // 400 and 404 from the provider mean the request we built is wrong, which a
  // retry reproduces byte for byte — but it is *our* bug, not the user's
  // configuration, so it stays out of the terminal-configuration set and is
  // bounded by max_attempts instead.
  return "provider_response_invalid";
}

/**
 * Classify a thrown transport error — `fetch` rejection, abort, DNS.
 *
 * Deliberately shape-based rather than message-based: a message is the thing we
 * are refusing to persist, and reading it to decide policy is one refactor away
 * from persisting it.
 */
export function classifyTransportError(error: unknown): JobFailureCode {
  if (error instanceof JobFailure) return error.code;
  if (error instanceof DOMException && error.name === "TimeoutError") return "provider_transport";
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TypeError")) {
    return "provider_transport";
  }
  return "unexpected_error";
}

export type JobFailureOutcome = {
  /** `exhausted` means no further attempt will be scheduled. */
  readonly status: "failed" | "exhausted";
  readonly code: JobFailureCode;
  readonly terminal: boolean;
};

/**
 * The **only** way a handler may record a failure — `BYOK-JOBS-003`/`005`.
 *
 * Two RPCs, chosen by the code rather than by the caller:
 *
 *   * a terminal code goes to `fail_job_terminal`, which sets `exhausted`
 *     immediately and schedules nothing. A removed credential does not become a
 *     present one after 2, 4 and 8 seconds, and the attempts this would have
 *     burned are attempts a *fixable* failure will need later;
 *   * everything else goes to `fail_job`, whose backoff and `max_attempts`
 *     ceiling are unchanged from `202607170019`.
 *
 * `p_error` receives `code` and nothing else, in both branches. There is no
 * parameter here through which a message could travel, which is the property
 * that makes `BYOK-JOBS-005` a fact about the type rather than about reviewer
 * attention.
 *
 * Returns `null` when the lease is no longer held — the existing "somebody else
 * owns this row now" signal, unchanged.
 */
export async function failJob(
  service: SupabaseClient,
  input: {
    jobId: string;
    workerId: string;
    code: JobFailureCode;
    baseDelaySeconds: number;
  },
): Promise<JobFailureOutcome | null> {
  const terminal = isTerminalJobFailureCode(input.code);
  const { data, error } = terminal
    ? await service.rpc("fail_job_terminal", {
        p_job_id: input.jobId,
        p_worker_id: input.workerId,
        p_error: input.code,
      })
    : await service.rpc("fail_job", {
        p_job_id: input.jobId,
        p_worker_id: input.workerId,
        p_error: input.code,
        p_base_delay_seconds: input.baseDelaySeconds,
      });

  if (error) {
    console.error("Failed to persist job failure", { code: error.code });
    return null;
  }
  const status = (data as { status?: unknown } | null)?.status;
  if (status !== "failed" && status !== "exhausted") return null;
  return { status, code: input.code, terminal: status === "exhausted" };
}
