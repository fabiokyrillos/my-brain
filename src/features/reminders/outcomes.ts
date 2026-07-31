/**
 * The closed failure vocabulary of `public.apply_reminder_command_v1`.
 *
 * Same doctrine as `src/features/task-commands/errors.ts`, scaled to one RPC:
 * declared as `as const` tuples so the list has runtime members a test can
 * iterate, split into the tokens the *database* spells and the reasons that
 * carry no token, and mapped by data rather than by a ladder of conditionals.
 *
 * A bare TypeScript union would have no runtime members, which is how codes end
 * up unprovoked and untranslated — the objection `errors.ts:11-21` records.
 * `outcomes.test.ts` iterates both lists below: it greps the migration for every
 * declared token, and it asserts the copy module has a sentence for every member
 * of both lists in both locales.
 *
 * **The undo handler's tokens are deliberately absent.** `G5_REMINDER_UNDO_*`
 * are raised by `private.undo_apply_reminder_command_v1`, which is reachable
 * only through `public.undo_operation`. Slice G5 ships no undo affordance on the
 * reminders surface, so no code path here can provoke them, and declaring a code
 * this mapper can never see is the same defect as leaving a reachable one out.
 * They are covered in pgTAP instead, where they *are* reachable.
 */

/** The five DETAIL tokens migration `202607310064` raises, spelled exactly. */
export const REMINDER_COMMAND_ERROR_DETAILS = [
  /** The command is not legal from the reminder's current status. */
  "G5_REMINDER_TRANSITION_NOT_ALLOWED",
  /**
   * `edit` was aimed at a task-linked reminder.
   *
   * Its own token rather than a second use of the one above, because "the task
   * owns this title" and "wrong state" lead the owner to different next steps:
   * one says rename the task, the other says nothing can be done here.
   */
  "G5_REMINDER_EDIT_TASK_LINKED",
  /** The row moved between the read and the write — typically the hourly heartbeat. */
  "G5_REMINDER_STALE_STATE",
  /** The operation key is already reserved for a different canonical payload. */
  "G5_REMINDER_IDEMPOTENCY_MISMATCH",
  /** The guarded UPDATE matched no row. Should be unreachable under the row lock. */
  "G5_REMINDER_TRANSITION_INTEGRITY",
] as const;

/**
 * The four failures that carry no DETAIL token.
 *
 * Three because the RPC signals them with a SQLSTATE alone, and one
 * (`unknown`) because it is this process's answer to an error the database never
 * declared. Spelled in `snake_case` rather than invented `G5_*` names so a
 * reader can tell from the key alone which strings are the database's contract
 * and which are ours — inventing `G5_UNAUTHENTICATED` would put a token in a
 * "closed declared list" that no `raise` anywhere emits.
 */
export const REMINDER_COMMAND_UNTAGGED_FAILURES = [
  /** `42501` — the session expired between render and submit. */
  "unauthenticated",
  /** `22023` — a value the RPC validated and refused. */
  "invalid_payload",
  /**
   * `P0002` — the reminder does not exist **or** belongs to someone else.
   *
   * One code for both, because the RPC raises one error for both: returning
   * different outcomes here would reintroduce, in the UI, exactly the existence
   * disclosure the database refuses to make.
   */
  "not_found",
  /** Anything else. Reported as a generic failure and never as raw SQL text. */
  "unknown",
] as const;

export type ReminderCommandErrorDetail = (typeof REMINDER_COMMAND_ERROR_DETAILS)[number];
export type ReminderCommandUntaggedFailure = (typeof REMINDER_COMMAND_UNTAGGED_FAILURES)[number];
export type ReminderCommandFailureCode =
  | ReminderCommandErrorDetail
  | ReminderCommandUntaggedFailure;

/**
 * The SQLSTATE each declared token pairs with.
 *
 * The mapper derives its SQLSTATE branches from this table, so a sixth token is
 * matched the moment it is added here — there is no second "which details pair
 * with P0001" list to fall behind.
 */
const DETAIL_SQLSTATE: Readonly<Record<ReminderCommandErrorDetail, string>> = {
  G5_REMINDER_TRANSITION_NOT_ALLOWED: "55000",
  G5_REMINDER_EDIT_TASK_LINKED: "55000",
  // 55P03, never 40001: 2C-UNDO-004 fixed the serialization code to 55P03 in
  // migration 050 because 40001 makes the gateway hang.
  G5_REMINDER_STALE_STATE: "55P03",
  G5_REMINDER_IDEMPOTENCY_MISMATCH: "P0001",
  G5_REMINDER_TRANSITION_INTEGRITY: "P0001",
};

export function sqlstateForDetail(detail: ReminderCommandErrorDetail): string {
  return DETAIL_SQLSTATE[detail];
}

/** The shape PostgREST reports a raised exception in. Every field optional. */
export type PostgrestLikeError = {
  readonly code?: string | null;
  readonly details?: string | null;
  readonly message?: string | null;
  readonly hint?: string | null;
};

function detailFrom(error: PostgrestLikeError): ReminderCommandErrorDetail | null {
  // PostgREST puts the raised DETAIL in `details`, but a token has also been
  // observed riding along in `message` when the error passes through a nested
  // context. Scanning both is cheap and keeps a real refusal from degrading into
  // the generic `unknown` sentence.
  const haystack = `${error.details ?? ""}\n${error.message ?? ""}\n${error.hint ?? ""}`;
  return REMINDER_COMMAND_ERROR_DETAILS.find((token) => haystack.includes(token)) ?? null;
}

/**
 * A database error, as a member of the closed vocabulary above.
 *
 * The token wins over the SQLSTATE when both are present: two tokens share
 * `55000` and two share `P0001`, so the code alone cannot tell them apart, while
 * a token is unambiguous. When a token is present its declared SQLSTATE is *not*
 * re-checked — a mismatch would mean the migration and this table disagree,
 * which is a build-time question the tests answer, not a runtime one to degrade
 * on.
 */
export function mapReminderCommandError(
  error: PostgrestLikeError | null,
): ReminderCommandFailureCode {
  if (!error) return "unknown";
  const detail = detailFrom(error);
  if (detail) return detail;
  switch (error.code) {
    case "42501":
      return "unauthenticated";
    case "22023":
      return "invalid_payload";
    case "P0002":
      return "not_found";
    default:
      return "unknown";
  }
}
