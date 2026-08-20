import "server-only";

import {
  deriveTaskSensitivity,
  resolveTaskContent,
} from "@/features/sensitivity/task-derivation";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * `2P-REMINDER-002` — the optional link's options, already classified.
 *
 * ## Why the label is resolved here rather than in the component
 *
 * The link is a `<select>`, and a `<select>` renders text. A task title is
 * governed content: `2M-PRIVACY-001` and OD-2L-1 B make the classification a
 * *presentation-time* read, and a picker that printed every title would be the
 * one surface on the product that did not ask.
 *
 * `ProtectedContent` is the component that normally asks, and it cannot be used
 * here — an `<option>` may contain text and nothing else, so there is no element
 * to wrap. So this asks the **same question through the same contract**:
 * `deriveTaskSensitivity` over an owner-scoped read of the source entries, then
 * `resolveTaskContent`, which is the exported wrapper `task-list.tsx` already
 * consults directly for its own `masked` count. The literal surface name stays
 * inside `task-derivation.ts`, so `sensitivity-convergence.test.ts`'s rule that
 * no surface answers for itself is untouched.
 *
 * There is no reveal affordance and there should not be: revealing is a
 * deliberate act on a subject the owner is looking at, not something to offer
 * inside a form control. `resolveTaskContent` is therefore asked with no reveal
 * state, and a withheld task keeps a **stable, choosable** option — the owner
 * can still link a reminder to it, which is the point of masking rather than
 * excluding.
 *
 * ## Nothing here is persisted
 *
 * No classification is stored, and no column is added. This is a read that
 * happens while a dialog is being rendered and is gone afterwards.
 */
export type ReminderTaskOption = {
  readonly id: string;
  /** What the `<option>` shows — the title, or a neutral stand-in. */
  readonly label: string;
  /** Whether the label is the stand-in, so the surface can say so once. */
  readonly withheld: boolean;
};

/**
 * How many tasks the picker offers.
 *
 * A cap rather than everything, and declared rather than inlined: a `<select>`
 * with several hundred options is not a control anybody uses, and an unbounded
 * read on a page that renders a dialog is a cost with no ceiling. It is a
 * **bound on the offer**, not a filter that hides work — a reminder can still be
 * linked from the task's own surface, and leaving the field empty is always
 * available.
 */
export const REMINDER_TASK_OPTION_LIMIT = 50;

/** The statuses worth linking a future reminder to. Mirrors the calendar's. */
const OPEN_TASK_STATUSES = ["inbox", "todo", "in_progress", "waiting", "blocked", "deferred"];

export async function loadReminderTaskOptions(
  supabase: SupabaseClient,
  userId: string,
  withheldLabel: (shortId: string) => string,
): Promise<readonly ReminderTaskOption[]> {
  const tasks = await supabase
    .from("tasks")
    .select("id,title,source_entry_id")
    .eq("user_id", userId)
    .in("status", OPEN_TASK_STATUSES)
    .order("updated_at", { ascending: false })
    .limit(REMINDER_TASK_OPTION_LIMIT);

  // A picker that cannot be built is an empty picker, never an unlinked
  // reminder refused: the field is optional, so the flow continues without it.
  if (tasks.error || tasks.data === null) return [];
  const rows = tasks.data as { id: string; title: string; source_entry_id: string | null }[];
  if (rows.length === 0) return [];

  /*
   * The source classifications, owner-scoped and bounded to the ids on this
   * page — the same read `calendar-projection.ts` makes, and the same
   * fail-closed rule: an unreadable map is an EMPTY map, which resolves every
   * task to the most protective level rather than to `undetermined`.
   */
  const entryIds = [...new Set(rows.map((row) => row.source_entry_id).filter((id): id is string => Boolean(id)))];
  let levels: ReadonlyMap<string, string | null> = new Map();
  if (entryIds.length > 0) {
    const entries = await supabase
      .from("entries")
      .select("id,sensitivity")
      .eq("user_id", userId)
      .in("id", entryIds);
    if (!entries.error && entries.data !== null) {
      levels = new Map(
        (entries.data as { id: string; sensitivity: string | null }[])
          .map((row) => [row.id, row.sensitivity] as const),
      );
    }
  }

  return rows.map((row) => {
    const sensitivity = deriveTaskSensitivity(row.source_entry_id, levels);
    const { show } = resolveTaskContent(sensitivity, row.id);
    return show
      ? { id: row.id, label: row.title, withheld: false }
      // The last six characters, so two withheld tasks are distinguishable from
      // each other without either of them being readable. The id is already in
      // the option's `value`, so this leaks nothing the form did not carry.
      : { id: row.id, label: withheldLabel(row.id.slice(-6)), withheld: true };
  });
}
