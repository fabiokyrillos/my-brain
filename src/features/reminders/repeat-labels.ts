import "server-only";

import type { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/lib/preferences";

import { getReminderCopy } from "./copy";
import { describeRecurrenceRule } from "./recurrence-language";
import { parseRecurrenceRule } from "./recurrence-rule";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * "Does this reminder repeat, and how?" — asked by id, answered in words.
 *
 * ## Why this module exists, and it is not a convenience
 *
 * `2R-SURFACE-003` asks **every** surface that lists a recurring reminder to say
 * that it repeats, and the calendar is one of them. The obvious implementation
 * had the calendar select `series_id`, join `reminder_series` and describe the
 * rule — and `phase-2m-recurrence-guard.test.ts` refused it, correctly.
 *
 * ADR-132 Decision 1 lifted `2M-RECUR-001`'s refusal **"strictly limited to
 * reminders — it does not reach tasks, the calendar, or any other object"**, and
 * the guard enumerates the files the lift authorizes. Widening that list to
 * admit `src/features/calendar/**` would have been the quiet act the enumeration
 * exists to prevent: the boundary is signed, so the code moves rather than the
 * boundary.
 *
 * So the recurrence vocabulary stays here. The calendar asks a question in its
 * own terms — *these reminder ids; which of them repeat?* — and receives
 * sentences. It never names a series, never sees a rule, and could not render
 * one if it tried.
 *
 * ## Keyed by reminder, not by series
 *
 * The caller holds reminder ids and nothing else, which is the point: making the
 * caller resolve `series_id` first is what put the schema in the calendar to
 * begin with.
 *
 * Owner-scoped, bounded to the ids asked about, and skipped entirely when none
 * of them repeat. A read failure yields an empty map rather than throwing — the
 * occurrence is a real reminder and belongs on its surface either way; losing
 * the label costs a note, and losing the row would cost the reminder.
 */
export async function loadReminderRepeatLabels(
  supabase: SupabaseClient,
  userId: string,
  reminderIds: readonly string[],
  locale: Locale,
): Promise<ReadonlyMap<string, string>> {
  const ids = [...new Set(reminderIds)];
  if (ids.length === 0) return new Map();

  const occurrences = await supabase
    .from("reminders")
    .select("id,series_id")
    .eq("user_id", userId)
    .not("series_id", "is", null)
    .in("id", ids);
  if (occurrences.error) return new Map();

  const rows = (occurrences.data ?? []) as { id: string; series_id: string | null }[];
  const bySeries = new Map<string, string[]>();
  for (const row of rows) {
    if (typeof row.series_id !== "string") continue;
    const group = bySeries.get(row.series_id) ?? [];
    group.push(row.id);
    bySeries.set(row.series_id, group);
  }
  if (bySeries.size === 0) return new Map();

  const series = await supabase
    .from("reminder_series")
    .select("id,rule")
    .eq("user_id", userId)
    .in("id", [...bySeries.keys()]);
  if (series.error) return new Map();

  const language = getReminderCopy(locale).series.language;
  const labels = new Map<string, string>();
  for (const row of (series.data ?? []) as { id: string; rule: unknown }[]) {
    const parsed = parseRecurrenceRule(row.rule);
    if (!parsed.ok) continue;
    const sentence = describeRecurrenceRule(parsed.rule, language);
    for (const reminderId of bySeries.get(row.id) ?? []) labels.set(reminderId, sentence);
  }
  return labels;
}
