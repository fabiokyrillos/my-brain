import "server-only";

/**
 * Life Brain B.7 (T7) — the reads behind the contextual suggestions.
 *
 * ## Why this file exists at all
 *
 * The owner asked for suggestions "baseadas no contexto do usuário", and
 * `suggestions.ts` is forbidden from fetching anything:
 * `phase-2k-suggestion-guard.test.ts` refuses `async`, `await`, `fetch(` and any
 * client in that module, because a model call per render of the primary surface
 * would spend the owner's own BYOK credential on something they did not ask for,
 * and a module that can reach for data is a module that can reach for a model.
 *
 * So the split is structural: **this** file reads, buckets and classifies;
 * **that** file orders, caps and refuses. Neither can do the other's job, and
 * the mask is testable precisely because the layer that touches the database is
 * the layer that resolves a classification.
 *
 * ## Six reads, and when they happen
 *
 * One `Promise.all` of small, indexed, owner-scoped reads, then **one**
 * dependent read for the classifications. The dependent read is unavoidable and
 * is the shape `attention-projection.ts` already uses: a task's level lives on
 * its source entry, so the entry ids are only known once the tasks are.
 *
 * The page calls this **only when it is going to render the row** — the empty
 * conversation surface — so an owner with a conversation list pays nothing.
 *
 * ## Two postures on failure, on purpose
 *
 * `people` and `projects` keep `requireSupabaseData`, which throws: that is the
 * posture those two reads shipped with in Phase 2K and this slice does not
 * change an error contract it did not come to change.
 *
 * The six new reads degrade to empty instead, for the reason
 * `resolve-ask-about.ts` states about its banner: additive context is not worth
 * failing the surface for. An owner whose reminder read timed out should still
 * get a field they can type in, and a missing suggestion is indistinguishable
 * from having nothing to suggest — which OD-2K-4 already declares a legitimate
 * answer.
 */

import { actionablePendingQuestionFilter } from "@/features/agent/question-visibility";
import { toSensitivityLevel } from "@/features/sensitivity/contracts";
import {
  UNDETERMINED,
  deriveReminderSensitivity,
  deriveTaskSensitivity,
  type TaskSensitivity,
} from "@/features/sensitivity/task-derivation";
import type { createClient } from "@/lib/supabase/server";
import { requireSupabaseData } from "@/lib/supabase/result";
import {
  addLocalDays,
  compareLocalDates,
  formatLocalDate,
  localDateOf,
  localDayBounds,
  type LocalDate,
} from "@/lib/time/local-day";

import type { SuggestionInputs, SuggestionItem, SuggestionScope } from "./suggestions";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** How far ahead a reminder counts as "coming". The brief's upper bound. */
export const REMINDER_HORIZON_HOURS = 48;

/**
 * How far ahead a birthday counts as "near".
 *
 * Two weeks, because a birthday is something the owner **prepares** for and a
 * suggestion that appears on the morning of is not a suggestion, it is a
 * notification arriving in the wrong place.
 */
export const BIRTHDAY_HORIZON_DAYS = 14;

/**
 * How many rows each bucket may read.
 *
 * The derivation takes **one** row per bucket, so these are not display limits —
 * they are how much headroom the mask gets. A bucket read with `limit 1` whose
 * single row turns out to be `highly_sensitive` would produce no suggestion even
 * though the owner has three readable ones behind it.
 */
const BUCKET_READ_LIMIT = 6;

/** The reasons that mean "you have not looked at this record yet". */
const UNREVIEWED_REASONS: readonly string[] = ["review_interpretation", "confirm_existing_candidates"];

/** A record's first words, enough to recognise it and no more. */
const PREVIEW_LENGTH = 120;

function preview(content: string): string {
  const trimmed = content.trim();
  return trimmed.length > PREVIEW_LENGTH
    ? `${trimmed.slice(0, PREVIEW_LENGTH).trimEnd()}…`
    : trimmed;
}

/** A read whose failure costs a suggestion and nothing else. */
async function soft<Row>(
  read: PromiseLike<{ data: Row[] | null; error: unknown }>,
): Promise<Row[]> {
  try {
    const { data, error } = await read;
    return error ? [] : data ?? [];
  } catch {
    return [];
  }
}

type TaskRow = { id: string; title: string; due_at: string | null; source_entry_id: string | null };
type ReminderRow = { id: string; title: string; remind_at: string; entry_id: string | null };
type QuestionRow = { id: string; question: string; created_at: string; entry_id: string };
type BirthdayRow = { id: string; name: string; birthday_month: number | null; birthday_day: number | null };
type AttentionRow = { entry_id: string; reason: string; occurred_at: string };
type EntryRow = { id: string; original_content: string; sensitivity: string };

/**
 * The next time a month-and-day falls, in the owner's own calendar.
 *
 * Exported because it is the only arithmetic here worth testing on its own, and
 * because the year-boundary case is the one a reader will want proof of: a
 * birthday on 2 January, read on 28 December, is **next** year's.
 *
 * A 29 February birthday read in a non-leap year resolves through
 * `Date.UTC`'s own rollover to 1 March. Stated rather than special-cased: the
 * suggestion is a question about the week ahead, and being one day out on the
 * rarest date in the calendar is not worth a month-length table here.
 */
export function nextBirthdayOccurrence(
  today: LocalDate,
  month: number,
  day: number,
): LocalDate {
  const thisYear: LocalDate = { year: today.year, month, day };
  return compareLocalDates(thisYear, today) >= 0
    ? thisYear
    : { year: today.year + 1, month, day };
}

/** Whole calendar days from `from` to `to`. Never a division of milliseconds. */
function daysBetween(from: LocalDate, to: LocalDate): number {
  const start = Date.UTC(from.year, from.month - 1, from.day);
  const end = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((end - start) / (24 * 60 * 60 * 1000));
}

/**
 * Everything the chat page hands `deriveConversationSuggestions`.
 *
 * `scope` is passed straight through rather than used here: narrowing the reads
 * by scope would be a different and much larger feature (a task does not know
 * which life area it belongs to yet), while *refusing to suggest off-scope* is
 * the defect the owner actually reported and costs nothing.
 */
export async function loadSuggestionInputs(
  supabase: SupabaseClient,
  {
    now,
    timeZone,
    scope = null,
  }: { now: Date; timeZone: string; scope?: SuggestionScope | null },
): Promise<SuggestionInputs> {
  const today = localDateOf(now, timeZone);
  const { start: startOfToday, end: endOfToday } = localDayBounds(now, timeZone);
  const reminderHorizon = new Date(now.getTime() + REMINDER_HORIZON_HOURS * 60 * 60 * 1000);
  const birthdayHorizon = addLocalDays(today, BIRTHDAY_HORIZON_DAYS);
  // The one or two calendar months the horizon touches. A month filter in SQL
  // rather than reading every person who has a birthday: the precise test is
  // `nextBirthdayOccurrence` below, and this only has to be a superset.
  const birthdayMonths = [...new Set([today.month, birthdayHorizon.month])];

  const [peopleResult, projectsResult, tasks, reminders, questions, birthdays, attention] =
    await Promise.all([
      supabase.from("people").select("id,name").order("updated_at", { ascending: false }).limit(3),
      supabase.from("projects").select("id,name").order("updated_at", { ascending: false }).limit(3),
      // Everything open with a date up to the end of today, in one read: the
      // split between "late" and "today" is a comparison, not a second query.
      soft<TaskRow>(
        supabase
          .from("tasks")
          .select("id,title,due_at,source_entry_id")
          .eq("status", "open")
          .not("due_at", "is", null)
          .lt("due_at", new Date(endOfToday).toISOString())
          .order("due_at", { ascending: true })
          .limit(BUCKET_READ_LIMIT),
      ),
      // `scheduled` only. A snoozed reminder's real time is `snoozed_until`, and
      // reading one here would need a second ordering rule for a row the owner
      // has already pushed away once.
      soft<ReminderRow>(
        supabase
          .from("reminders")
          .select("id,title,remind_at,entry_id")
          .eq("status", "scheduled")
          .gte("remind_at", now.toISOString())
          .lt("remind_at", reminderHorizon.toISOString())
          .order("remind_at", { ascending: true })
          .limit(BUCKET_READ_LIMIT),
      ),
      // The same visibility rule the question list uses, so a snoozed question
      // cannot reappear as a suggestion before it reappears as a question.
      soft<QuestionRow>(
        supabase
          .from("pending_questions")
          .select("id,question,created_at,entry_id")
          .or(actionablePendingQuestionFilter(now))
          .order("created_at", { ascending: true })
          .limit(BUCKET_READ_LIMIT),
      ),
      soft<BirthdayRow>(
        supabase
          .from("people")
          .select("id,name,birthday_month,birthday_day")
          .in("birthday_month", birthdayMonths)
          .not("birthday_day", "is", null)
          .limit(50),
      ),
      // `list_needs_attention` is the product's single authority on "a record
      // still needs you". Reused rather than re-derived: a second definition of
      // unreviewed is a second answer the two surfaces would eventually give
      // differently.
      soft<AttentionRow>(
        supabase.rpc("list_needs_attention", {
          p_limit: 12,
          p_cursor_occurred_at: null,
          p_cursor_entry_id: null,
        }) as unknown as PromiseLike<{ data: AttentionRow[] | null; error: unknown }>,
      ),
    ]);

  const unreviewed = attention.filter((row) => UNREVIEWED_REASONS.includes(row.reason)).slice(0, BUCKET_READ_LIMIT);

  /*
    One dependent read for every classification on the page.

    A task's level lives on its source entry, a reminder's on `entry_id`, a
    question's on the entry it was asked about, and a record's on itself — so
    one bounded read of `entries` answers all four. Absence from the map is
    unreadable in every sense at once, which `deriveTaskSensitivity` resolves to
    the most protective level: a task whose source the owner can no longer read
    is never named here.
  */
  const sourceIds = [...new Set([
    ...tasks.map((task) => task.source_entry_id).filter((id): id is string => Boolean(id)),
    ...reminders.map((reminder) => reminder.entry_id).filter((id): id is string => Boolean(id)),
    ...questions.map((question) => question.entry_id),
    ...unreviewed.map((row) => row.entry_id),
  ])];

  const entries = sourceIds.length === 0
    ? []
    : await soft<EntryRow>(
      supabase.from("entries").select("id,original_content,sensitivity").in("id", sourceIds),
    );
  const levels = new Map<string, string | null>(entries.map((entry) => [entry.id, entry.sensitivity]));
  const contents = new Map<string, string>(entries.map((entry) => [entry.id, entry.original_content]));

  const overdueTasks: SuggestionItem[] = [];
  const tasksDueToday: SuggestionItem[] = [];
  for (const task of tasks) {
    if (task.due_at === null) continue;
    const due = Date.parse(task.due_at);
    if (!Number.isFinite(due)) continue;
    const item: SuggestionItem = {
      id: task.id,
      name: task.title,
      at: task.due_at,
      sensitivity: deriveTaskSensitivity(task.source_entry_id, levels),
    };
    (due < startOfToday ? overdueTasks : tasksDueToday).push(item);
  }

  return {
    people: requireSupabaseData(peopleResult, "load suggestion people") ?? [],
    projects: requireSupabaseData(projectsResult, "load suggestion projects") ?? [],
    overdueTasks,
    tasksDueToday,
    remindersSoon: reminders.map((reminder) => ({
      id: reminder.id,
      name: reminder.title,
      at: reminder.remind_at,
      sensitivity: deriveReminderSensitivity(reminder.entry_id, levels),
    })),
    birthdaysSoon: birthdays.flatMap((person) => {
      if (person.birthday_month === null || person.birthday_day === null) return [];
      const occurrence = nextBirthdayOccurrence(today, person.birthday_month, person.birthday_day);
      const away = daysBetween(today, occurrence);
      if (away < 0 || away > BIRTHDAY_HORIZON_DAYS) return [];
      /*
        `people` carries no classification column — the same evidenced negative
        `suggestions.ts` records for a person's name, and the reason a birthday
        read from the person is `undetermined` rather than `normal`: there was
        nothing to read, and OD-2L-1 B says an absence is never inferred.
      */
      return [{
        id: person.id,
        name: person.name,
        at: formatLocalDate(occurrence),
        sensitivity: UNDETERMINED,
      }];
    }),
    openQuestions: questions.map((question) => ({
      id: question.id,
      name: question.question,
      at: question.created_at,
      sensitivity: entrySensitivity(question.entry_id, levels),
    })),
    unreviewedEntries: unreviewed.map((row) => ({
      id: row.entry_id,
      name: preview(contents.get(row.entry_id) ?? ""),
      at: row.occurred_at,
      sensitivity: entrySensitivity(row.entry_id, levels),
    })),
    scope,
  };
}

/**
 * An entry's **own** classification, narrowed fail-closed.
 *
 * Not `deriveTaskSensitivity`: that function answers "what level applies to a
 * row whose source is this entry", and for the entry itself the level is not
 * derived from anywhere — it is the column. An entry absent from the map is
 * unreadable, and unreadable is the most protective level, which is what
 * `deriveTaskSensitivity` happens to return for an id it cannot find; reusing it
 * would be relying on a coincidence of implementations rather than on a stated
 * rule.
 */
function entrySensitivity(
  entryId: string,
  levels: ReadonlyMap<string, string | null>,
): TaskSensitivity {
  if (!levels.has(entryId)) return { kind: "derived", level: "highly_sensitive" };
  return { kind: "derived", level: toSensitivityLevel(levels.get(entryId)) };
}
