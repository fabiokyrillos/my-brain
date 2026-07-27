/**
 * The closed failure vocabulary of `public.apply_task_command`, declared once
 * (PRD 2E-UPDATE-017, 2E-I18N-003).
 *
 * 2E-UPDATE-017: "The RPC's failure vocabulary is a declared closed list of
 * `2E_*` detail codes, never message text. A database test provokes each
 * declared code and fails if the RPC raises an undeclared one; a TypeScript test
 * fails if the mapper lacks a case for any declared code."
 *
 * Declared as `as const` tuples rather than bare unions, for the reason
 * `outcomes.ts:11-21` records against `ConfirmTasksCode`: a bare union has no
 * runtime members, so nothing can iterate it, which is how two of that union's
 * codes ended up with no test and one with no raising migration at all.
 * 2E-I18N-003 asserts "against the declared code list rather than against a
 * hand-written key list", and a list that only exists at compile time cannot be
 * the thing a test runs against.
 *
 * **Two groups, kept visibly apart.** `TASK_COMMAND_ERROR_DETAILS` are the nine
 * literal DETAIL tokens migration `202607260058` raises; they are database
 * strings and are spelled exactly as the migration spells them, which is what
 * lets `errors.test.ts` grep for each one. `TASK_COMMAND_UNTAGGED_FAILURES` are
 * the five reasons that carry *no* token — four because the RPC signals them
 * with a SQLSTATE alone, and one because it is this process's own answer to an
 * error the database never declared. Naming the second group in `snake_case`
 * rather than inventing `2E_*` spellings for it is deliberate: a reader must be
 * able to tell, from the key alone, which strings are the database's contract
 * and which are ours. Inventing `2E_UNAUTHENTICATED` would put a token in the
 * "declared closed list" that no `raise` anywhere ever emits.
 *
 * **The mapping is data, not conditionals.** `mapTaskCommandApplyError`
 * (`apply.ts`) derives its SQLSTATE branches by reading `sqlstate` out of the
 * table below, so a tenth declared token is matched the moment it is added here
 * — there is no second list of "which details pair with P0001" to fall behind.
 * The 2C mapper (`src/features/tasks/actions.ts:542-593`) is the shape this
 * replaces: eleven hand-written `if`s whose `retryable` argument is passed
 * positionally at each site and is silently `undefined` when forgotten.
 */

import type { TaskCommandOutcome } from "./outcomes";

/**
 * The ten `2E_*` DETAIL tokens migrations `202607260058` and `202607260059`
 * raise.
 *
 * In the order the slice contract tabulates them: the eight the apply path can
 * reach first, then the two only an undo handler raises — `2E_CREATION_UNDONE`
 * appears in the first group because both doors raise it, and it is listed once
 * rather than twice.
 *
 * The naming follows the house convention `<PHASE>_<SUBJECT>_<FAILURE-NOUN>`
 * that the `2C_*` and `2D_*` corpora established. Most pair with `P0001`; the
 * two invalid-value members pair with `22023`, mirroring `2C_INVALID_*`, and
 * `2E_CREATION_UNDONE` pairs with `55P03` because PRD 2E-DESTRUCTIVE-008 names
 * that SQLSTATE for it by hand.
 *
 * **`2E_ACTION_NOT_ENABLED` was retired by Slice 2E.5** and is deliberately
 * absent. It meant "`cancel_task`/`restore_task` are not available yet", and
 * both are now enabled behind the confirmation gate, so no reachable state in
 * `202607260059` raises it. A declared member of a closed vocabulary that
 * nothing can provoke is the same defect as a missing raise — the objection this
 * phase already used twice against tautological reminder guards — so it is gone
 * from here, from `copy.ts`, and from the migration's own `else` terminator,
 * which now raises the provokable bare `22023` instead.
 */
export const TASK_COMMAND_ERROR_DETAILS = [
  /** The operation key is already reserved for a different canonical payload. */
  "2E_IDEMPOTENCY_MISMATCH",
  /**
   * A destructive action arrived with no valid, unused confirmation evidence
   * (2E-DESTRUCTIVE-004).
   *
   * One token for three states — no confirmation for this `(owner, operation
   * key)`, one bound to a different fingerprint, and one already consumed —
   * because the remedy is identical in all three: obtain fresh confirmation for
   * the proposal as it now stands. That is the same reasoning that keeps
   * `invalid_payload` from being twenty tokens, and the three states are still
   * separately provoked in pgTAP.
   */
  "2E_CONFIRMATION_REQUIRED",
  /**
   * The task is deleted in PRD 2E-DESTRUCTIVE-008's sense: an `undone`
   * `confirm_entry_task*` operation names it.
   *
   * Raised by `restore_task` and by the undo of a `cancel_task`, both with
   * `55P03`, so neither door can resurrect it. The third door raises nothing:
   * `public.list_task_command_candidates` reads the same private predicate and
   * simply omits the row, so a deleted task is never offered in the first place.
   */
  "2E_CREATION_UNDONE",
  /** The locked status is not in the action's `eligibleFrom`. */
  "2E_INELIGIBLE_STATUS",
  /** The guarded domain write affected no row: another command reached the task first. */
  "2E_TRANSITION_INTEGRITY",
  /** Reconciliation left a live reminder this command never accounted for. */
  "2E_REMINDER_INTEGRITY",
  /** A patch reference names an entity the caller does not own, or none at all. */
  "2E_INVALID_RELATION",
  /** A due date would land on an intentionally-undated task without clearing the flag. */
  "2E_DUE_CONSISTENCY",
  /** Undo path: the recorded evidence is unusable, or the task moved on since. */
  "2E_UNDO_RESTORE_INTEGRITY",
  /** Undo path: a recorded reminder cannot be re-created from what was stored. */
  "2E_UNDO_REMINDER_INTEGRITY",
] as const;

export type TaskCommandErrorDetail = (typeof TASK_COMMAND_ERROR_DETAILS)[number];

/**
 * The five failures no DETAIL token names.
 *
 * The first three are the SQLSTATE-only raises. **The staleness raise carries no
 * detail and no hint by design**: `src/features/agent/actions.ts:221` branches on
 * `error.code === "55P03"` alone before it looks at `details`, and attaching a
 * token to *that* raise would make this phase the one exception to a convention
 * every other staleness gate in the repository follows.
 *
 * Slice 2E.5 gave `55P03` a second, detailed raise — `2E_CREATION_UNDONE` — and
 * that does not weaken the sentence above, because the two are told apart by the
 * presence of a DETAIL rather than by the code. `mapTaskCommandApplyError` reads
 * the token first and falls back to `stale_pre_state`, so a detail-less `55P03`
 * still lands exactly where it always did.
 *
 * `invalid_payload` is the bare-`22023` family — roughly twenty distinct
 * validation messages in the RPC, deliberately *not* enumerated here. They are
 * message text, and 2E-UPDATE-017 forbids a vocabulary built out of message
 * text; a caller cannot act on "the planned date is malformed" differently from
 * "the pre-state is missing a required value", because both mean the same thing:
 * this request did not arrive in the shape the contract declares.
 *
 * `undeclared_failure` is the one member the database never produces. It exists
 * so that an error outside this vocabulary stays *visible* instead of being
 * quietly folded onto a declared code that would then be a lie — the TypeScript
 * counterpart of 2E-UPDATE-017's "fails if the RPC raises an undeclared one".
 * It is the only failure marked retryable alongside the two integrity codes, but
 * **not** for the reason an earlier revision of this comment gave. That revision
 * argued "the whole RPC is one transaction, so an unrecognized raise rolled
 * everything back" — true of a raise, and false of the case this member actually
 * has to cover. `@supabase/postgrest-js` *catches* a client-side fetch failure
 * and resolves with `{ error: { message: "TypeError: fetch failed", code: "" } }`
 * rather than rejecting, so a lost response after a successful commit arrives
 * here with no SQLSTATE at all. Nothing in this process can tell that apart from
 * a rolled-back raise.
 *
 * What makes a retry safe is therefore idempotency, not rollback: the operation
 * key is unique per `(user_id, operation_key)` in the database, so a replay of a
 * committed request returns the original outcome marked replayed and writes
 * nothing new (2E-UPDATE-005). That is the only claim the copy for this member
 * may make, and `copy.ts` says exactly that much and no more — an adversarial
 * review found it asserting "nothing was changed", which is a promise this
 * process cannot keep.
 */
export const TASK_COMMAND_UNTAGGED_FAILURES = [
  /** `42501` — no `auth.uid()`. */
  "unauthenticated",
  /** `P0002` — the task is not the caller's, or does not exist (2E-OWNERSHIP-002). */
  "task_not_found",
  /** `55P03` — the twelve-column pre-state comparison failed. */
  "stale_pre_state",
  /** Bare `22023` — any of the RPC's pure-validation refusals. */
  "invalid_payload",
  /** Nothing in this list matched. Not a database code. */
  "undeclared_failure",
] as const;

export type TaskCommandUntaggedFailure = (typeof TASK_COMMAND_UNTAGGED_FAILURES)[number];

/** Everything `mapTaskCommandApplyError` can return, and everything `copy.ts` must localize. */
export const TASK_COMMAND_APPLY_FAILURES = [
  ...TASK_COMMAND_ERROR_DETAILS,
  ...TASK_COMMAND_UNTAGGED_FAILURES,
] as const;

export type TaskCommandApplyFailure = (typeof TASK_COMMAND_APPLY_FAILURES)[number];

/**
 * The three outcomes a failed apply can come to rest at.
 *
 * A narrowed subset of `TASK_COMMAND_OUTCOMES`, not a fourth vocabulary — and
 * the `satisfies` is what enforces that rather than a comment. Naming an outcome
 * 2E-UX-001 does not declare would produce a failure result that `copy.ts`'s
 * `outcomes` section cannot title, and this makes that a compile error at the
 * declaration instead of a missing string at the surface.
 */
export const TASK_COMMAND_APPLY_FAILURE_OUTCOMES = [
  "rejected_stale",
  "rejected_conflict",
  "refused",
] as const satisfies readonly TaskCommandOutcome[];

export type TaskCommandApplyFailureOutcome = (typeof TASK_COMMAND_APPLY_FAILURE_OUTCOMES)[number];

export type TaskCommandFailurePolicy = {
  /** Which of 2E-UX-001's outcomes the user is told about. */
  readonly outcome: TaskCommandApplyFailureOutcome;
  /**
   * Whether resubmitting the same command can succeed.
   *
   * Declared here rather than passed at each mapper site, which is the defect
   * `src/features/tasks/actions.ts:653-665` carries: `retryable` is a positional
   * boolean on an optional field, so forgetting it produces `undefined` and a UI
   * that silently offers no retry.
   */
  readonly retryable: boolean;
  /**
   * The SQLSTATE that carries this failure, or null for `undeclared_failure`.
   *
   * Read by the mapper to decide which branch a DETAIL token belongs to, so
   * "`2E_INVALID_RELATION` pairs with `22023`, not `P0001`" is stated once.
   */
  readonly sqlstate: string | null;
  /**
   * The exception message the migration raises, when it is one fixed string.
   *
   * Never matched against — 2E-UPDATE-017 forbids keying on message text. It is
   * here so `errors.test.ts` can prove the row describes a raise that genuinely
   * exists in `202607260058`, which is the only thing that keeps this table from
   * becoming a description of an RPC nobody wrote. Null for `invalid_payload`
   * (many messages) and `undeclared_failure` (no raise).
   */
  readonly message: string | null;
};

/**
 * Slice contract §2, transcribed. One row per declared failure.
 *
 * `2E_TRANSITION_INTEGRITY` and `2E_REMINDER_INTEGRITY` are the two database
 * codes that are `rejected_conflict` **and** retryable, and both for the same
 * reason: each means a concurrent writer got between this command's evidence and
 * its write. Everything the transaction touched rolled back, so a retry
 * re-observes and can legitimately succeed. Every other declared code is a
 * property of the request itself, and resending it unchanged would fail
 * identically — which is what `retryable: false` says.
 *
 * The two undo tokens are `refused`, not `rejected_conflict`: 2E-UNDO-004
 * requires undo to refuse "when a newer change would be silently discarded", and
 * that is a deliberate refusal with a declared reason, not a race a retry
 * resolves. Retrying an undo whose premise a later change invalidated would
 * either keep failing or start discarding that change.
 */
export const TASK_COMMAND_FAILURE_POLICY: Record<
  TaskCommandApplyFailure,
  TaskCommandFailurePolicy
> = {
  "2E_IDEMPOTENCY_MISMATCH": {
    outcome: "refused",
    retryable: false,
    sqlstate: "P0001",
    message: "Operation key payload mismatch",
  },
  "2E_CONFIRMATION_REQUIRED": {
    outcome: "refused",
    // Not retryable, and the distinction matters: resending this exact command
    // fails identically forever. The remedy is a *new* confirmation, which is a
    // different act by the user, not a retry of this one.
    retryable: false,
    sqlstate: "P0001",
    message: "Destructive action requires server-issued confirmation",
  },
  "2E_CREATION_UNDONE": {
    outcome: "refused",
    retryable: false,
    // `55P03`, which PRD 2E-DESTRUCTIVE-008 names by hand. It is the only
    // declared token that pairs with that SQLSTATE, and the staleness raise it
    // shares the code with still carries no detail at all — which is what lets
    // `mapTaskCommandApplyError` tell them apart.
    sqlstate: "55P03",
    message: "Task creation was undone",
  },
  "2E_INELIGIBLE_STATUS": {
    outcome: "refused",
    retryable: false,
    sqlstate: "P0001",
    message: "Action is not allowed from the current status",
  },
  "2E_TRANSITION_INTEGRITY": {
    outcome: "rejected_conflict",
    retryable: true,
    sqlstate: "P0001",
    message: "Task command transition failed",
  },
  "2E_REMINDER_INTEGRITY": {
    outcome: "rejected_conflict",
    retryable: true,
    sqlstate: "P0001",
    message: "Task command reminder reconciliation failed",
  },
  "2E_INVALID_RELATION": {
    outcome: "refused",
    retryable: false,
    sqlstate: "22023",
    message: "Invalid or cross-owner relation reference",
  },
  "2E_DUE_CONSISTENCY": {
    outcome: "refused",
    retryable: false,
    sqlstate: "22023",
    message: "Due date conflicts with the intentional no-due flag",
  },
  "2E_UNDO_RESTORE_INTEGRITY": {
    outcome: "refused",
    retryable: false,
    sqlstate: "P0001",
    message: "Task command undo integrity check failed",
  },
  "2E_UNDO_REMINDER_INTEGRITY": {
    outcome: "refused",
    retryable: false,
    sqlstate: "P0001",
    message: "Task command undo reminder integrity check failed",
  },
  unauthenticated: {
    outcome: "refused",
    retryable: false,
    sqlstate: "42501",
    message: "Authentication required",
  },
  task_not_found: {
    outcome: "refused",
    retryable: false,
    sqlstate: "P0002",
    message: "Task not found",
  },
  stale_pre_state: {
    outcome: "rejected_stale",
    retryable: false,
    sqlstate: "55P03",
    message: "Task changed since the preview",
  },
  invalid_payload: {
    outcome: "refused",
    retryable: false,
    sqlstate: "22023",
    message: null,
  },
  undeclared_failure: {
    outcome: "refused",
    retryable: true,
    sqlstate: null,
    message: null,
  },
};

/**
 * The three tokens an undo handler can raise.
 *
 * Split out because they reach TypeScript through a different door: not
 * `apply_task_command`, but `public.undo_operation`, the shared router that every
 * undo affordance in the product already calls. Migration `202607260058`
 * registered `apply_task_command` and `apply_task_command_relation` in
 * `private.undo_operation_handlers`, so from this slice onwards an undo submitted
 * through *any* surface can come back carrying one of these — which is why
 * `src/features/agent/actions.ts` needs them and why naming them as a derived
 * list is better than a prefix test on the string.
 *
 * The `satisfies` is load-bearing: a typo here would be a token that matches
 * nothing the migration raises, and the branch would be dead rather than wrong.
 */
export const TASK_COMMAND_UNDO_ERROR_DETAILS = [
  "2E_UNDO_RESTORE_INTEGRITY",
  "2E_UNDO_REMINDER_INTEGRITY",
  // Slice 2E.5. Unlike the other two this one is *also* raised on the apply
  // path, by `restore_task` — the two doors PRD 2E-DESTRUCTIVE-009 requires to
  // refuse with one code. It has to be here because the undo of a `cancel_task`
  // reaches TypeScript through `public.undo_operation`, and without this branch
  // the honest "that task was deleted" collapses onto "Could not undo."
  "2E_CREATION_UNDONE",
] as const satisfies readonly TaskCommandErrorDetail[];

export type TaskCommandUndoErrorDetail = (typeof TASK_COMMAND_UNDO_ERROR_DETAILS)[number];

/** Whether `value` is one of the nine tokens the migration raises as a DETAIL. */
export function isTaskCommandErrorDetail(value: unknown): value is TaskCommandErrorDetail {
  return (
    typeof value === "string" && (TASK_COMMAND_ERROR_DETAILS as readonly string[]).includes(value)
  );
}

/**
 * The declared failure carrying `details` under `sqlstate`, or null.
 *
 * Both halves are required, which is the point: a `22023` arriving with
 * `2E_TRANSITION_INTEGRITY` is not that failure, it is a payload the database
 * refused while something upstream mislabelled it, and treating it as a
 * retryable conflict would tell the user to try again forever. The pairing is
 * read from the policy table so it is stated in exactly one place.
 */
export function taskCommandErrorDetailFor(
  sqlstate: string,
  details: string | undefined,
): TaskCommandErrorDetail | null {
  if (!isTaskCommandErrorDetail(details)) return null;
  return TASK_COMMAND_FAILURE_POLICY[details].sqlstate === sqlstate ? details : null;
}

/**
 * The declared undo-path failure a `public.undo_operation` error carries, or null.
 *
 * For callers of the shared undo router, which cannot know in advance whether the
 * operation it is compensating belongs to Phase 2E. Two of these pair with
 * `P0001` and `2E_CREATION_UNDONE` pairs with `55P03`, so the pairing is read
 * from the policy table rather than assumed — a `P0001` carrying
 * `2E_CREATION_UNDONE` is not that failure, and this returns null for it.
 */
export function taskCommandUndoErrorDetailFor(
  sqlstate: string | undefined,
  details: string | undefined,
): TaskCommandUndoErrorDetail | null {
  if (sqlstate === undefined) return null;
  const detail = taskCommandErrorDetailFor(sqlstate, details);
  if (detail === null) return null;
  return (TASK_COMMAND_UNDO_ERROR_DETAILS as readonly string[]).includes(detail)
    ? (detail as TaskCommandUndoErrorDetail)
    : null;
}
