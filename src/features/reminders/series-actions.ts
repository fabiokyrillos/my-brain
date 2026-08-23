"use server";

/**
 * The write half of a **repeating** reminder — `2R-MODEL-001`, `2R-TRUST-005`.
 *
 * ## Why every path here is an RPC
 *
 * `public.reminder_series` grants `authenticated` **select and nothing else**,
 * which is stricter than `public.reminders` (which keeps its Phase 2P insert
 * grant for the single-reminder path). So there is no direct write to make:
 * creating, detaching, editing forward and ending all go through
 * `create_reminder_series_v1` and `apply_reminder_series_command_v1`, both
 * `SECURITY DEFINER`, both validating against `auth.uid()`.
 *
 * That is `2R-TRUST-005` — *"authorization lives in a validated RPC or Server
 * Action, never in the browser"* — satisfied by construction rather than by
 * discipline: a browser could not write these rows if it tried.
 *
 * ## What this module decides: nothing
 *
 * It parses the submission, hands it over, and turns the RPC's closed failure
 * vocabulary into a localized sentence. Ownership, rule validity, staleness,
 * idempotency and **every instant** are settled in SQL. A disagreement between
 * this module's mirror of the rules and the database's copy ends as a refusal,
 * not as a write.
 *
 * **No instant is computed here and none is sent.** `2R-TIME-007` puts
 * occurrence instants in one place, and slice 2R.0's `2R-TZ-SECOND-AUTHORITY`
 * finding is exactly what a second place looks like. What crosses this boundary
 * is a local date and a local time; the RPC resolves them through the owner's
 * profile zone.
 *
 * ## Slice 2R.1 ships the writer without the surface
 *
 * The plan says so in terms, and the reason is ADR-123 Decision 7's rule: a
 * migration may not create schema nobody uses. The writer arrives **with** the
 * migration; the modal that calls it arrives in slice 2R.3.
 */

import { revalidatePath } from "next/cache";

import { assertActiveAccount, requireUser } from "@/lib/auth/require-user";
import { isLocale, type Locale } from "@/lib/preferences";

import type { ReminderSeriesActionState } from "./series-action-state";
import { getReminderCopy } from "./copy";
import {
  reminderSeriesCommandSchema,
  reminderSeriesCreationSchema,
  reminderSeriesSubmissionSchema,
  commandForScope,
} from "./series-schema";

function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : "pt-BR";
}

/**
 * The RPC's closed refusal vocabulary, mapped to a sentence.
 *
 * Matched on the message the function raises rather than on SQLSTATE alone,
 * because `22023` covers four different refusals and telling the owner "invalid
 * request" for all of them would waste the precision the RPC took the trouble
 * to produce. The fallback is the generic sentence, never a raw database
 * string: `2R-SURFACE-004`'s *"never as a rule string"* applies to error text
 * too — a Postgres message quoting the offending JSON would put a rule fragment
 * on the screen.
 */
function seriesFailureMessage(locale: Locale, message: string | undefined): string {
  const copy = getReminderCopy(locale).series;
  if (message === undefined) return copy.failed;
  if (message.includes("Invalid recurrence rule")) return copy.invalidRule;
  if (message.includes("Invalid recurrence anchor")) return copy.invalidAnchor;
  if (message.includes("reaches no occurrence")) return copy.noHorizon;
  if (message.includes("Series not found")) return copy.notFound;
  if (message.includes("Series is not active")) return copy.notActive;
  return copy.failed;
}

function failure(locale: Locale, message: string): ReminderSeriesActionState {
  return { status: "error", message, seriesId: null, scope: null };
}

/**
 * `2R-MODEL-001` — create a rule and its first and only occurrence, atomically.
 *
 * The atomicity is the RPC's, not this function's: a series without an
 * occurrence would be a rule nothing fires, and an occurrence without a series
 * would be an ordinary reminder wearing a sequence number. One statement
 * writes both or neither.
 */
export async function createReminderSeries(
  _state: ReminderSeriesActionState,
  formData: FormData,
): Promise<ReminderSeriesActionState> {
  const locale = resolveLocale(formData.get("locale"));
  const copy = getReminderCopy(locale);

  /*
   * The rule arrives as JSON in one hidden field rather than as loose controls.
   *
   * Not a shortcut: it keeps the rule's fields atomically paired with each
   * other, so a half-updated control set cannot assemble a rule that is valid
   * in shape and wrong in meaning — the same reason `expectedState` travels as
   * one field in `schema.ts`.
   */
  let ruleCandidate: unknown = null;
  try {
    ruleCandidate = JSON.parse(String(formData.get("rule") ?? "null"));
  } catch {
    return failure(locale, copy.series.invalidRule);
  }

  const parsed = reminderSeriesCreationSchema.safeParse({
    locale: formData.get("locale"),
    title: formData.get("title"),
    important: formData.get("important") ?? "false",
    taskId: formData.get("taskId") ?? "",
    anchorDate: formData.get("anchorDate"),
    anchorTime: formData.get("anchorTime"),
    rule: ruleCandidate,
    operationKey: formData.get("operationKey"),
  });
  if (!parsed.success) {
    // Which half failed decides which sentence the owner reads. A rule the
    // union rejected is not "check the date".
    const ruleFailed = parsed.error.issues.some((issue) => issue.path[0] === "rule");
    return failure(locale, ruleFailed ? copy.series.invalidRule : copy.creation.invalid);
  }

  const { supabase, user } = await requireUser(locale);
  await assertActiveAccount(supabase, user.id, parsed.data.locale);

  const [hour, minute] = parsed.data.anchorTime.split(":").map(Number);

  const { data, error } = await supabase.rpc("create_reminder_series_v1", {
    p_rule: parsed.data.rule,
    p_title: parsed.data.title,
    p_important: parsed.data.important,
    p_task_id: parsed.data.taskId,
    p_anchor_date: parsed.data.anchorDate,
    p_anchor_hour: hour,
    p_anchor_minute: minute,
    p_operation_key: parsed.data.operationKey,
  });

  if (error) {
    return failure(locale, seriesFailureMessage(locale, error.message));
  }

  const result = data as { series_id?: string } | null;
  revalidatePath(`/${locale}/app/reminders`);
  return {
    status: "success",
    message: copy.series.created,
    seriesId: result?.series_id ?? null,
    scope: null,
  };
}

/**
 * `2R-SERIES-001` … `-005`, `-009` — apply a scope, and report which one landed.
 *
 * The scope is submitted as a word from a closed set, not as a command name:
 * `commandForScope` is the single mapping, so a surface cannot send
 * `edit_future` while its own label said *this one*. `2R-SERIES-009` is then
 * satisfied by reading the scope **the RPC reports back**, rather than by
 * echoing what was asked for — if the two ever disagreed, echoing the request
 * would hide it.
 */
export async function applyReminderSeriesCommand(
  _state: ReminderSeriesActionState,
  formData: FormData,
): Promise<ReminderSeriesActionState> {
  const locale = resolveLocale(formData.get("locale"));
  const copy = getReminderCopy(locale);

  const submission = reminderSeriesSubmissionSchema.safeParse({
    locale: formData.get("locale"),
    seriesId: formData.get("seriesId"),
    operationKey: formData.get("operationKey"),
    scope: formData.get("scope"),
  });
  if (!submission.success) {
    return failure(locale, copy.creation.invalid);
  }

  const ending = formData.get("end") === "on";
  const kind = ending ? "end_series" : commandForScope(submission.data.scope);

  let command: unknown = { kind };
  if (kind === "edit_future") {
    const title = formData.get("title");
    const time = formData.get("anchorTime");
    let rule: unknown;
    if (typeof formData.get("rule") === "string") {
      try {
        rule = JSON.parse(String(formData.get("rule")));
      } catch {
        return failure(locale, copy.series.invalidRule);
      }
    }
    const [hour, minute] = typeof time === "string" && /^\d{2}:\d{2}$/.test(time)
      ? time.split(":").map(Number)
      : [undefined, undefined];
    command = {
      kind,
      ...(rule === undefined ? {} : { rule }),
      ...(typeof title === "string" && title.trim() !== "" ? { title: title.trim() } : {}),
      ...(formData.get("important") === null
        ? {}
        : { important: formData.get("important") === "on" }),
      ...(hour === undefined ? {} : { hour, minute }),
    };
  }

  const parsedCommand = reminderSeriesCommandSchema.safeParse(command);
  if (!parsedCommand.success) {
    const ruleFailed = parsedCommand.error.issues.some((issue) => issue.path[0] === "rule");
    return failure(locale, ruleFailed ? copy.series.invalidRule : copy.creation.invalid);
  }

  const { supabase, user } = await requireUser(locale);
  await assertActiveAccount(supabase, user.id, submission.data.locale);

  const { data, error } = await supabase.rpc("apply_reminder_series_command_v1", {
    p_series_id: submission.data.seriesId,
    p_command: parsedCommand.data,
    p_operation_key: submission.data.operationKey,
  });

  if (error) {
    return failure(locale, seriesFailureMessage(locale, error.message));
  }

  // The scope the DATABASE says it applied, not the one that was asked for.
  const applied = (data as { scope?: string } | null)?.scope ?? null;
  const message = applied === "occurrence"
    ? copy.series.appliedOccurrence
    : applied === "future"
      ? copy.series.appliedFuture
      : copy.series.ended;

  revalidatePath(`/${locale}/app/reminders`);
  return {
    status: "success",
    message,
    seriesId: submission.data.seriesId,
    scope: applied === "occurrence" || applied === "future" ? applied : null,
  };
}
