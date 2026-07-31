"use server";

/**
 * The write half of the reminder lifecycle (UX-12, DEC-6 option A, DEC-7 option a).
 *
 * ## Why this is an RPC call and not a table write
 *
 * Every other lifecycle slice in this remediation — Projects, People, Memories —
 * writes its table directly under RLS, because `authenticated` holds the grant.
 * `public.reminders` is the one table where it does not: Phase 2F Slice 2F.4
 * (`202607300063:92`) revoked `update` and `delete` on the 2F-REMINDER-003
 * determination, and asserts the revocation at deploy time. DEC-6 authorized a
 * narrow `SECURITY DEFINER` boundary instead of re-granting, so this module
 * calls `apply_reminder_command_v1` and issues no PostgREST DML against the
 * table at all — which is why `direct-write-guard.test.ts`'s reminders allowlist
 * stays exactly one entry long (`createReminder`'s Option C INSERT).
 *
 * That guard reads **raw source text, comments included** — deliberately, so a
 * writer cannot hide inside a string or a disabled block. Spelling a builder
 * chain out in this docstring is therefore enough to fail it, which is how the
 * sentence above came to be phrased without one.
 *
 * ## What this module is responsible for, and what it is not
 *
 * It parses the submission, resolves the owner's **profile** timezone, converts
 * a local wall-clock into an explicit-offset instant, and translates the RPC's
 * closed failure vocabulary into a localized sentence. It decides nothing:
 * ownership, transition legality, staleness and idempotency are all settled in
 * SQL against `auth.uid()`, and a disagreement between this module's mirror of
 * the rules and the database's copy of them ends as a refusal, not as a write.
 *
 * ## The timezone is read here, never submitted
 *
 * `<input type="datetime-local">` yields a wall-clock with no offset. Turning it
 * into an instant with the *browser's* zone would silently reschedule a reminder
 * to the wrong hour for anyone travelling, and a hidden offset field would be
 * caller-supplied data. So the offset comes from `profiles.timezone` read
 * server-side, through `localDateTimeToOffsetInstant` — the same converter the
 * pending-question defer flow already uses (`agent/forms.tsx:256`). DEC-6 names
 * this rule; this is where it is kept.
 */

import { revalidatePath } from "next/cache";

import { localDateTimeToOffsetInstant } from "@/features/tasks/candidate-due-date";
import { requireUser } from "@/lib/auth/require-user";
import { defaultAgentPreferences, resolveLocale, type Locale } from "@/lib/preferences";

import { getReminderCopy, reminderFailureMessage } from "./copy";
import { canApplyReminderAction, type ReminderAction } from "./lifecycle";
import { mapReminderCommandError } from "./outcomes";
import {
  reminderCommandSchema,
  reminderSubmissionSchema,
  type ExpectedReminderState,
} from "./schema";

export type ReminderActionState = {
  readonly status: "idle" | "success" | "error";
  readonly message: string;
  /** Which row the message belongs to, so one banner cannot label another row. */
  readonly reminderId: string | null;
  readonly action: ReminderAction | null;
};

export const IDLE_REMINDER_ACTION_STATE: ReminderActionState = {
  status: "idle",
  message: "",
  reminderId: null,
  action: null,
};

function failure(
  locale: Locale,
  message: string,
  reminderId: string | null,
  action: ReminderAction | null,
): ReminderActionState {
  return { status: "error", message, reminderId, action };
}

/**
 * The submitted fields, without React's own.
 *
 * A Server Action's `FormData` carries `$ACTION_*` framework keys, and every
 * schema here is `.strict()` — deliberately, so a forged control is a rejection
 * rather than a silent drop. Without this filter a strict schema makes the form
 * unusable, which is the trap `memories/actions.ts:76-85` records.
 */
function submittedFields(formData: FormData): Record<string, string> {
  return Object.fromEntries(
    Array.from(formData.entries())
      .filter(([key]) => !key.startsWith("$ACTION_"))
      .map(([key, value]) => [key, typeof value === "string" ? value : ""]),
  );
}

/**
 * The JSON payload for one command, admitting only that command's own fields.
 *
 * Built by a `switch` over the parsed discriminated union rather than by
 * spreading the form, so there is no code path where a field belonging to one
 * command reaches another — the property DEC-6 asks for, enforced here as well
 * as in SQL.
 */
function buildCommand(
  input: ReturnType<typeof reminderCommandSchema.parse>,
  timezone: string,
): { readonly payload: Record<string, unknown>; readonly action: ReminderAction } | null {
  switch (input.action) {
    case "snooze":
      return { payload: { kind: "snooze", snoozeMinutes: input.snoozeMinutes }, action: "snooze" };
    case "reschedule": {
      let instant: string | null = null;
      try {
        instant = localDateTimeToOffsetInstant(input.remindAtLocal, timezone);
      } catch {
        // The converter throws for the two real DST faults — a wall-clock that
        // does not exist (spring gap) and one that happens twice (autumn
        // overlap). Both are invalid input, not server errors.
        instant = null;
      }
      if (instant === null) return null;
      return { payload: { kind: "reschedule", remindAt: instant }, action: "reschedule" };
    }
    case "cancel":
      return { payload: { kind: "cancel" }, action: "cancel" };
    case "restore":
      return { payload: { kind: "restore" }, action: "restore" };
    case "edit":
      return {
        payload: { kind: "edit", title: input.title, important: input.important },
        action: "edit",
      };
  }
}

export async function applyReminderCommand(
  _state: ReminderActionState,
  formData: FormData,
): Promise<ReminderActionState> {
  const fields = submittedFields(formData);
  const locale = resolveLocale(fields.locale);
  const copy = getReminderCopy(locale);

  const submission = reminderSubmissionSchema.safeParse({
    locale: fields.locale,
    reminderId: fields.reminderId,
    operationKey: fields.operationKey,
    expectedState: fields.expectedState,
  });
  const command = reminderCommandSchema.safeParse(
    Object.fromEntries(
      Object.entries(fields).filter(
        ([key]) => !["locale", "reminderId", "operationKey", "expectedState"].includes(key),
      ),
    ),
  );

  if (!submission.success || !command.success) {
    return failure(locale, copy.failure.invalid_payload, fields.reminderId ?? null, null);
  }

  const { supabase, user } = await requireUser(locale);

  // Read the owner's timezone before building the command: a reschedule cannot
  // be converted without it, and it must not come from the browser.
  const profile = await supabase
    .from("profiles")
    .select("timezone")
    .eq("user_id", user.id)
    .maybeSingle();
  const timezone =
    typeof profile.data?.timezone === "string" && profile.data.timezone !== ""
      ? profile.data.timezone
      : defaultAgentPreferences.timezone;

  const built = buildCommand(command.data, timezone);
  if (built === null) {
    return failure(locale, copy.failure.invalid_payload, submission.data.reminderId, null);
  }

  // The mirror of the state machine, checked before the round trip. Not a
  // security control — the RPC re-checks it against the row under a lock — but
  // it turns a stale button into the precise sentence rather than a generic one.
  if (
    !canApplyReminderAction(
      { status: submission.data.expectedState.status, taskId: null },
      built.action,
    )
  ) {
    return failure(
      locale,
      reminderFailureMessage(locale, "G5_REMINDER_TRANSITION_NOT_ALLOWED"),
      submission.data.reminderId,
      built.action,
    );
  }

  const { error } = await supabase.rpc("apply_reminder_command_v1", {
    p_reminder_id: submission.data.reminderId,
    p_command: built.payload,
    p_expected_state: toExpectedStatePayload(submission.data.expectedState),
    p_operation_key: submission.data.operationKey,
  });

  if (error) {
    return failure(
      locale,
      reminderFailureMessage(locale, mapReminderCommandError(error)),
      submission.data.reminderId,
      built.action,
    );
  }

  revalidatePath(`/${locale}/app/reminders`);
  return {
    status: "success",
    message: copy.success[built.action],
    reminderId: submission.data.reminderId,
    action: built.action,
  };
}

/**
 * The expected pre-state, with its keys in the order the RPC's own
 * `jsonb_build_object` uses.
 *
 * Key order does not affect the fingerprint — `jsonb::text` is canonical — but
 * writing it out explicitly rather than passing the parsed object through keeps
 * the payload's shape a decision this module makes, not a by-product of Zod's
 * output.
 */
function toExpectedStatePayload(state: ExpectedReminderState): Record<string, unknown> {
  return {
    status: state.status,
    remindAt: state.remindAt,
    title: state.title,
    important: state.important,
  };
}
