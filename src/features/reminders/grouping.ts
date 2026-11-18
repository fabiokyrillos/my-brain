import type { ReminderViewModel } from "./projection";

/**
 * The list's sections (ADR-180): reminders grouped by **when**, not by card.
 *
 * A reminder answers one question — when does it fire — so the list is read
 * down that axis: what already passed its hour, today, tomorrow, the days
 * right after, and everything further out. Rows that will never fire again
 * (delivered, cancelled, inactive) get a section of their own, named by their
 * state, so the "Todos" view is not a single undifferentiated pile.
 *
 * Presentation only. Nothing here reads the database or decides what a
 * reminder may do; it sorts the rows the projection already loaded into
 * sections, keeping the projection's order inside each one.
 */
export const REMINDER_GROUPS = [
  "late",
  "today",
  "tomorrow",
  "week",
  "later",
  "inactive",
  "delivered",
  "cancelled",
] as const;
export type ReminderGroupKey = (typeof REMINDER_GROUPS)[number];

export type ReminderGroup = {
  readonly key: ReminderGroupKey;
  readonly reminders: readonly ReminderViewModel[];
};

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. `null` when either is malformed. */
export function localDayDistance(from: string, to: string): number | null {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.round((end - start) / 86_400_000);
}

export function reminderGroupOf(
  reminder: ReminderViewModel,
  today: string,
  dayOf: (iso: string) => string,
): ReminderGroupKey {
  if (reminder.status === "sent") return "delivered";
  if (reminder.status === "cancelled") return "cancelled";
  if (!reminder.hasPendingDelivery) return "inactive";
  if (reminder.overdue) return "late";
  const distance = localDayDistance(today, dayOf(reminder.remindAt));
  // A day that cannot be read is not guessed into "today".
  if (distance === null) return "later";
  if (distance <= 0) return "today";
  if (distance === 1) return "tomorrow";
  if (distance <= 7) return "week";
  return "later";
}

export function groupReminders(
  reminders: readonly ReminderViewModel[],
  today: string,
  dayOf: (iso: string) => string,
): readonly ReminderGroup[] {
  const buckets = new Map<ReminderGroupKey, ReminderViewModel[]>();
  for (const reminder of reminders) {
    const key = reminderGroupOf(reminder, today, dayOf);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(reminder);
    else buckets.set(key, [reminder]);
  }
  return REMINDER_GROUPS.flatMap((key) => {
    const bucket = buckets.get(key);
    return bucket ? [{ key, reminders: bucket }] : [];
  });
}
