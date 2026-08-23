/**
 * What can be done to a reminder, and when (UX-12, DEC-6 option A, DEC-7 option a).
 *
 * This module is the client-side mirror of the state machine
 * `public.apply_reminder_command_v1` enforces in SQL. It exists so the surface
 * can obey the rule "do not render an action the current state cannot accept"
 * without the page re-deriving eligibility inline — and so the mirror can be
 * tested against the migration's transition table directly.
 *
 * **It is a mirror, never the authority.** Every rule here is re-checked in the
 * database against `auth.uid()`; if the two ever disagree the RPC refuses and
 * the surface reports the refusal. That is the point of duplicating it: the UI
 * copy is a convenience, the SQL is the boundary.
 *
 * ## The four states, and why two of them accept nothing
 *
 * - `scheduled` — pending delivery. The only state that accepts snooze,
 *   reschedule, cancel and edit.
 * - `sent` — **terminal.** `run_user_heartbeat` keys delivery on
 *   `notifications.dedupe_key = 'reminder:' || id` and inserts
 *   `on conflict … do nothing`, so once a reminder has fired that key is spent
 *   for that id forever. Re-arming the row would produce something the heartbeat
 *   selects, fails to notify for, and immediately re-stamps `sent` — a silent
 *   reminder. Re-arming a delivered reminder is a *new* reminder.
 * - `cancelled` — accepts `restore` only. Restoring keeps the recorded
 *   `remind_at` verbatim, which is the precedent `202607260058:141-150` sets
 *   deliberately: a past-due reminder firing on the next tick is the state that
 *   existed. A different time afterwards is an explicit second act.
 * - `snoozed` — **dormant vocabulary, and it stays that way (DEC-7).** The
 *   literal is in the column's CHECK, nothing in production writes it, and
 *   `run_user_heartbeat` has no reactivation branch, so such a row would never
 *   fire. Phase 2F's closeout census measured zero of them and 2F-REMINDER-004
 *   defers retiring the literal. It is modelled here so a legacy row would
 *   render an honest label instead of crashing a lookup — not because anything
 *   can produce one.
 *
 * Pure and synchronous. No clock, no I/O.
 */

/** Exactly the members of the `reminders_status_check` CHECK constraint. */
export const REMINDER_STATUSES = ["scheduled", "sent", "cancelled", "snoozed"] as const;

export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

/** The five named commands `apply_reminder_command_v1` accepts, and no others. */
export const REMINDER_ACTIONS = ["snooze", "reschedule", "cancel", "restore", "edit"] as const;

export type ReminderAction = (typeof REMINDER_ACTIONS)[number];

/**
 * The closed preset set snooze admits, in minutes.
 *
 * Relative offsets from `now()` need no timezone at all, which is why snooze
 * takes this shape and reschedule takes an absolute instant: there is no
 * browser-supplied offset here to mistrust. The values are duplicated in the
 * migration's own `array[15, 60, 180, 1440, 10080]`, and
 * `lifecycle.test.ts` reads the migration to prove the two agree.
 */
export const SNOOZE_PRESET_MINUTES = [15, 60, 180, 1440, 10080] as const;

export type SnoozePresetMinutes = (typeof SNOOZE_PRESET_MINUTES)[number];

export function isSnoozePreset(value: number): value is SnoozePresetMinutes {
  return (SNOOZE_PRESET_MINUTES as readonly number[]).includes(value);
}

/** A status the database produced, narrowed — or `null` for anything else. */
export function toReminderStatus(value: string): ReminderStatus | null {
  return (REMINDER_STATUSES as readonly string[]).includes(value)
    ? (value as ReminderStatus)
    : null;
}

/**
 * The only input eligibility depends on.
 *
 * `taskId` is here because `edit` is the one command gated on a column other
 * than `status`: `apply_task_command`'s insert half copies the *effective task
 * title* into the reminder it arms (`202607270060:1595-1596`), so an owner edit
 * of a task-linked title would be silently discarded by the next command on that
 * task. Editing a task-linked reminder's title is really "rename the task",
 * which `apply_task_command` already offers.
 */
export type ReminderEligibilityInput = {
  readonly status: ReminderStatus;
  readonly taskId: string | null;
  /**
   * This reminder is a cancelled, still-attached occurrence of a series whose
   * one live slot is **already taken** by its replacement — slice 2R.2.
   *
   * ## The fact behind the flag
   *
   * Cancelling an attached occurrence fires
   * `private.reminder_series_materialise_next`, which inserts the next one.
   * `reminders_one_live_occurrence_per_series` is a partial unique index over
   * `(series_id) where series_id is not null and detached_at is null and status
   * = 'scheduled'`, so the slot now holds the replacement. `restore` sets the
   * cancelled row back to `scheduled` — a **second** live occurrence — and the
   * index refuses it with a bare `23505`.
   *
   * Proved by execution against the deployed database, both directions: the same
   * restore succeeds when the occurrence is **detached** (the trigger skips it,
   * so no replacement exists) and when the series has **ended** (the trigger
   * returns early). It fails only for the attached-and-active case, which is
   * what this flag is and no wider.
   *
   * ## Why the surface withholds the control rather than letting it fail
   *
   * `23505` is not in `outcomes.ts`'s closed vocabulary, so pressing Reactivate
   * on such a row produced the generic sentence over a raw constraint violation.
   * UX-12's rule — do not render an action the current state cannot accept — is
   * exactly this case: the state cannot accept it, and the reason is a
   * database invariant rather than a preference.
   *
   * **This is not the whole repair.** Making the reversal work would mean
   * standing down the replacement in the same transaction, which is DDL on a
   * deployed function, and Phase 2R has one migration and has spent it. Carried
   * as `2R-OCCURRENCE-CANCEL-IRREVERSIBLE`; the surface tells the truth about it
   * in the meantime (`2R-SERIES-008`).
   *
   * Optional so every existing caller — and every reminder that carries no rule
   * — keeps its behaviour unchanged, which `2R-MODEL-004` requires.
   */
  readonly seriesSlotTaken?: boolean;
};

const BY_STATUS: Readonly<Record<ReminderStatus, readonly ReminderAction[]>> = {
  scheduled: ["snooze", "reschedule", "edit", "cancel"],
  cancelled: ["restore"],
  sent: [],
  snoozed: [],
};

/**
 * Every action this reminder can currently accept, in the order the surface
 * renders them.
 *
 * Returning a list rather than a per-action predicate is deliberate: the page
 * must render *only* the actions the state accepts and must not render disabled
 * placeholders for the rest (UX-12). A list makes "render what this returns" the
 * whole rule, so a missing filter cannot leave a dead control on the page.
 */
export function availableReminderActions(
  reminder: ReminderEligibilityInput,
): readonly ReminderAction[] {
  const actions = BY_STATUS[reminder.status];
  // Withheld before the task filter, because the two are independent and a
  // cancelled row offers no `edit` for either to remove.
  const offered = reminder.seriesSlotTaken === true
    ? actions.filter((action) => action !== "restore")
    : actions;
  if (reminder.taskId === null) return offered;
  return offered.filter((action) => action !== "edit");
}

export function canApplyReminderAction(
  reminder: ReminderEligibilityInput,
  action: ReminderAction,
): boolean {
  return availableReminderActions(reminder).includes(action);
}

/**
 * Does this state still have a delivery ahead of it?
 *
 * Drives whether the surface labels the timestamp "next reminder" or "delivered
 * at" — UX-12 asks for a *visible next effective reminder time*, and printing
 * one for a row that will never fire again would be the same lie the raw-status
 * badge told.
 */
export function hasPendingDelivery(status: ReminderStatus): boolean {
  return status === "scheduled";
}

/**
 * Cancellation is the one transition that destroys a pending delivery, so the
 * surface requires an explicit confirmation step for it and applies the other
 * four directly after validation. Exported as a predicate rather than hardcoded
 * in the component so the rule is testable and stays one sentence.
 */
export function requiresConfirmation(action: ReminderAction): boolean {
  return action === "cancel";
}
