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
import { defaultAgentPreferences } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";
import { isLocale, type Locale } from "@/lib/preferences";

import {
  IDLE_REMINDER_SERIES_PREVIEW,
  type ReminderSeriesActionState,
  type ReminderSeriesPreviewState,
} from "./series-action-state";
import { describeRecurrenceRule } from "./recurrence-language";
import {
  deriveRecurrenceRule,
  isRecurrenceChoice,
  parseLocalAnchor,
} from "./recurrence-derivation";
import { createReminder } from "./actions";
import type { ReminderCreationState } from "./action-state";
import { getReminderCopy } from "./copy";
import { reminderSeriesCreationKey } from "./operation-key";
import {
  reminderSeriesCommandSchema,
  reminderSeriesCreationSchema,
  reminderSeriesSubmissionSchema,
  reminderSeriesUndoSchema,
  commandForScope,
} from "./series-schema";

/**
 * How many occurrences the preview shows.
 *
 * `2R-SURFACE-002` says *"at least the next three"*. Three is the floor the
 * requirement names and the ceiling a dialog can show without the preview
 * pushing save off a phone screen -- which is `2R-MOBILE-002`, and the reason
 * this is a constant rather than a number typed into the call.
 */
const PREVIEW_OCCURRENCES = 3;

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
  return { status: "error", message, seriesId: null, scope: null, undoId: null };
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
    undoId: null,
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
  const result = data as { scope?: string; undo_id?: string; replayed?: boolean } | null;
  const applied = result?.scope ?? null;
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
    /*
      Passed through, never synthesised.

      The RPC returns `undo_id` on the round that wrote the ledger row AND on a
      replay of the same operation key — the idempotent branch hands back the id
      of the row the first round wrote, which is the same operation and the same
      single compensation. So a double-submitted form offers one undo for one
      row rather than two buttons for one change.
    */
    undoId: typeof result?.undo_id === "string" ? result.undo_id : null,
  };
}

/**
 * `2R-SERIES-007` — spend a series undo, exactly once.
 *
 * ## Why this reads a second consumption as success rather than as an error
 *
 * `public.undo_operation` closes the ledger row it spends, so a second press
 * lands on its idempotent branch and returns `{undone: true, affected: 0,
 * idempotent: true}` — no exception, no second compensation. This action
 * therefore has a sentence for *"already undone"* that is distinct from both
 * success and failure: telling the owner "could not undo" when the change is in
 * fact already reversed would send them looking for a problem that does not
 * exist, and telling them "undone" twice would claim a second reversal that
 * never happened.
 *
 * **That branch is reachable here because the two 2R handlers close their row.**
 * `undo_apply_reminder_series_command_v1` and `undo_create_reminder_series_v1`
 * both set `status = 'undone'`; slice 2R.1's `a46b525` is where they learned to.
 * The Phase 2P single-reminder handler does not, which is the remainder
 * `2R-UNDO-LEDGER-NOT-CLOSED` — and it is exactly why no control in this slice
 * offers an undo for `apply_reminder_command_v1`. Cancelling one occurrence
 * asks first instead (`2R-SERIES-008`); see `reminder-actions.tsx`.
 */
export async function undoReminderSeriesOperation(
  _state: ReminderSeriesActionState,
  formData: FormData,
): Promise<ReminderSeriesActionState> {
  const locale = resolveLocale(formData.get("locale"));
  const copy = getReminderCopy(locale);

  const parsed = reminderSeriesUndoSchema.safeParse({
    locale: formData.get("locale"),
    undoId: formData.get("undoId"),
  });
  if (!parsed.success) {
    return failure(locale, copy.series.undoFailed);
  }

  const { supabase } = await requireUser(locale);
  const { data, error } = await supabase.rpc("undo_operation", {
    p_undo_id: parsed.data.undoId,
  });

  if (error) {
    /*
      `55P03` means the series moved since the operation was recorded and the
      handler refused rather than overwriting a newer decision with an older
      one. Reporting that as "try again" would invite the retry that will keep
      being refused — the distinction `undoAutomationCategoryPolicy` draws, for
      the same reason.
    */
    console.error("Reminder series undo failed", error.code);
    return failure(
      locale,
      error.code === "55P03" ? copy.series.undoStale : copy.series.undoFailed,
    );
  }

  const idempotent = (data as { idempotent?: boolean } | null)?.idempotent === true;

  revalidatePath(`/${locale}/app/reminders`);
  return {
    status: "success",
    message: idempotent ? copy.series.undoAlready : copy.series.undoSucceeded,
    seriesId: null,
    scope: null,
    /*
      The offer is not renewed. The row this spent is closed, and handing its id
      back would render a button whose only possible outcome is the sentence
      above — an affordance that cannot change anything is the "disabled
      placeholder for an unsupported operation" UX-12 refuses.
    */
    undoId: null,
  };
}

/**
 * `2R-SURFACE-002` — the next three occurrences, before anything is written.
 *
 * ## Why this is a Server Action and not a computation
 *
 * `2R-TIME-007` puts occurrence instants in exactly one place, and that place is
 * `private.reminder_next_instant`. A browser that computed "the next three
 * Mondays" would be a second implementation of the daylight-saving rules
 * `OD-2R-5` signed — right almost always, wrong twice a year, and wrong in a way
 * the owner would only notice after the reminder failed to fire.
 *
 * So the dates come from `public.reminder_series_preview`, which resolves them
 * in the owner's **profile** zone, and they are formatted here with an `Intl`
 * bound to that same zone. What crosses back to the browser is finished text.
 *
 * ## It writes nothing, and could not
 *
 * The RPC is `stable` and `security definer` over `auth.uid()`. This action
 * exists so the owner can check what the single select derived from the date
 * they picked — which is the other half of `2R-SURFACE-001`'s "without becoming
 * a form": the control is small because the preview makes it legible.
 */
export async function previewReminderSeries(
  _state: ReminderSeriesPreviewState,
  formData: FormData,
): Promise<ReminderSeriesPreviewState> {
  const locale = resolveLocale(formData.get("locale"));
  const copy = getReminderCopy(locale);

  const choice = formData.get("recurrence");
  const anchorValue = formData.get("remindAtLocal");
  if (!isRecurrenceChoice(choice) || typeof anchorValue !== "string") {
    return { ...IDLE_REMINDER_SERIES_PREVIEW, status: "error", message: copy.series.invalidAnchor };
  }
  // `none` is not a failure: it is the owner saying this does not repeat, and
  // the preview simply has nothing to show.
  if (choice === "none") return IDLE_REMINDER_SERIES_PREVIEW;

  const anchor = parseLocalAnchor(anchorValue);
  if (anchor === null) {
    return { ...IDLE_REMINDER_SERIES_PREVIEW, status: "error", message: copy.series.invalidAnchor };
  }
  const rule = deriveRecurrenceRule(choice, anchor);
  if (rule === null) return IDLE_REMINDER_SERIES_PREVIEW;

  const [hour, minute] = anchorValue.slice(11).split(":").map(Number);
  const description = describeRecurrenceRule(rule, copy.series.language);

  const { supabase, user } = await requireUser(locale);
  const { data, error } = await supabase.rpc("reminder_series_preview", {
    p_rule: rule,
    p_anchor_date: anchorValue.slice(0, 10),
    p_anchor_hour: hour ?? 0,
    p_anchor_minute: minute ?? 0,
    p_count: PREVIEW_OCCURRENCES,
  });

  if (error) {
    console.error("Reminder series preview failed", error.code);
    return {
      ...IDLE_REMINDER_SERIES_PREVIEW,
      status: "error",
      message: seriesFailureMessage(locale, error.message),
      description,
    };
  }

  /*
    The owner's zone, read from their profile -- never the browser's, and never
    the server's. `2R-TIME-005`: one timezone authority, and this is a second
    surface reading the same one rather than a second authority.
  */
  const profile = requireSupabaseData(
    await supabase.from("profiles").select("timezone").eq("user_id", user.id).maybeSingle(),
    "load reminder preview timezone",
  );
  const timezone =
    typeof profile?.timezone === "string" && profile.timezone !== ""
      ? profile.timezone
      : defaultAgentPreferences.timezone;

  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: timezone,
  });

  const occurrences = ((data ?? []) as string[]).map((iso) => formatter.format(new Date(iso)));
  return {
    status: "ready",
    occurrences,
    // `2R-TRUST-006`: a horizon the rule never reaches produces no row and no
    // guess, so an empty list gets a sentence rather than an empty panel.
    message: occurrences.length === 0 ? copy.series.noHorizon : "",
    description,
  };
}

/**
 * `2R-SURFACE-001` — one composer, one submit, and the rule decides where it goes.
 *
 * ## Why the branch is here and not in the dialog
 *
 * A reminder that repeats is written by `create_reminder_series_v1`; one that
 * does not is written by `createReminder`. The surface must not know that: a
 * client that picked an RPC by reading its own select would be a second place
 * deciding what "repeats" means, and the first place is
 * `deriveRecurrenceRule`. So the composer submits one form to one action, and
 * the fork is a server-side consequence of whether a rule was derived.
 *
 * It returns `ReminderCreationState` for both paths, so the dialog's existing
 * state handling — including the `pending`-derived openness that slice 2P.6
 * found the hard way — is untouched by this slice.
 *
 * ## `2R-SURFACE-008` is a property of returning early
 *
 * Every refusal below returns an error state **without revalidating**. A
 * `revalidatePath` on the failure path would refresh the page out from under the
 * dialog and take the owner's typing with it, which is the defect
 * `updateProfile` and slice 2N.3's undo control both already record. The fields
 * keep their values because nothing re-rendered them.
 */
export async function createReminderOrSeries(
  state: ReminderCreationState,
  formData: FormData,
): Promise<ReminderCreationState> {
  const locale = resolveLocale(formData.get("locale"));
  const copy = getReminderCopy(locale);

  const choice = formData.get("recurrence");
  // Absent or `none` is the overwhelmingly common case and stays on the path it
  // has always been on, byte for byte. `2R-MODEL-004`: a reminder without a rule
  // behaves exactly as it does today.
  if (!isRecurrenceChoice(choice) || choice === "none") {
    return createReminder(state, formData);
  }

  const rawAnchor = formData.get("remindAtLocal");
  // Narrowed once into a `string` rather than asserted at each use: a non-null
  // assertion on a `FormDataEntryValue` compiles and hands `Blob` to
  // `String.prototype.slice` at runtime.
  const anchorLocal = typeof rawAnchor === "string" ? rawAnchor : "";
  const anchor = parseLocalAnchor(anchorLocal);
  if (anchor === null) {
    return { status: "error", message: copy.creation.invalidDate, reminderId: null };
  }
  const rule = deriveRecurrenceRule(choice, anchor);
  if (rule === null) return createReminder(state, formData);

  const title = formData.get("title");
  if (typeof title !== "string" || title.trim() === "" || title.trim().length > 500) {
    return { status: "error", message: copy.creation.invalid, reminderId: null };
  }
  const rawTask = formData.get("taskId");
  const taskId = typeof rawTask === "string" && rawTask !== "" ? rawTask : null;

  const { supabase, user } = await requireUser(locale);
  await assertActiveAccount(supabase, user.id, locale);

  const [hour, minute] = anchorLocal.slice(11).split(":").map(Number);
  const { data, error } = await supabase.rpc("create_reminder_series_v1", {
    p_rule: rule,
    p_title: title.trim(),
    p_important: formData.get("important") === "on",
    p_task_id: taskId,
    p_anchor_date: anchorLocal.slice(0, 10),
    p_anchor_hour: hour ?? 0,
    p_anchor_minute: minute ?? 0,
    /*
      Derived from the request, not random, for the reason `operation-key.ts`
      sets out: two submits of the same dialog state must carry the same key so
      the second replays rather than creating a second series, while a
      deliberate second reminder differs in title or instant and so differs
      here.
    */
    p_operation_key: reminderSeriesCreationKey(user.id, title.trim(), anchorLocal, choice),
  });

  if (error) {
    console.error("Recurring reminder creation failed", error.code);
    return {
      status: "error",
      message: seriesFailureMessage(locale, error.message),
      reminderId: null,
    };
  }

  revalidatePath(`/${locale}/app/reminders`);
  return {
    status: "success",
    message: copy.series.created,
    // The first occurrence, which IS a reminder and is what the surface means
    // when it says "the row that now exists".
    reminderId: (data as { reminder_id?: string } | null)?.reminder_id ?? null,
  };
}
