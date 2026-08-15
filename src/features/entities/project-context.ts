/**
 * `2N-PROJECT-003`, `-004`, `-005` — the three things the project page may say
 * about a project beyond listing the rows it is linked to.
 *
 * Pure by construction: no Supabase, no clock, no `Intl`, no locale ternary. The
 * page reads; this decides what those reads are allowed to mean.
 *
 * ## The rule all three obey
 *
 * **Say only what a stored row proves.** Each derivation below is a projection
 * of columns that already exist, and each one refuses rather than guesses when
 * the column cannot answer:
 *
 * - a count taken from a **bounded** list reports itself as a lower bound, never
 *   as a total (`deriveProjectState`);
 * - a change is described only from `audit_logs`, through the describer the
 *   History surface already uses, so no second vocabulary exists for the same
 *   fact (`describeEntityChanges`);
 * - a decision is a **stored concept** on the entry's current interpretation,
 *   never a phrase matched in text (`decisionEntryIds`).
 *
 * ## What is deliberately absent: risks
 *
 * `2N-PROJECT-005` surfaces decisions and risks **only if they are representable
 * from existing records**. Decisions are: `entry_interpretations.concepts` is a
 * stored `text[]` whose vocabulary contains `decision`, written by the worker
 * under the same validated contract the app declares.
 *
 * **Risks are not.** There is no risk concept, no risk column and no risk table
 * anywhere in the schema or the extraction vocabulary. The nearest members are
 * `blocker`, `dependency` and `waiting_for_third_party`, and none of them means
 * a risk: a blocker is something that *is* stopping work, a risk is something
 * that *might*. Mapping one onto the other would mint a vocabulary the product
 * does not have and present an inference as a record. So the risk half of
 * `2N-PROJECT-005` closes `not-built-by-rule`, and
 * `phase-2n-project-guard.test.ts` asserts the premise against the tree rather
 * than leaving it as a sentence in a report — if a risk concept is ever added,
 * that guard fails and the requirement is reopened by the same change.
 */

import type { Bounded } from "@/features/bounds/contracts";
import type { HistoryCopy } from "@/features/history/copy";
import { describeHistoryEvent, type HistoryEvent } from "@/features/history/event";

/**
 * The two statuses that take a task out of the open set.
 *
 * Stated as the **terminal** pair rather than as a list of open statuses, which
 * is the form `work-projection.ts` uses for its own `today` view
 * (`.not("status", "in", "(completed,cancelled)")`). Work owns tasks, so its
 * definition is the one this surface borrows; three other projections keep a
 * positive `OPEN_TASK_STATUSES` copy of the complement, and consolidating those
 * four is a Work-domain refactor this slice is not authorized to perform.
 *
 * No new status vocabulary is invented here, which `2N-PROJECT-003` requires
 * explicitly: both members are `tasks_status_check` literals, and the word the
 * page prints for the set is the one the Work filters already print.
 */
export const TERMINAL_TASK_STATUSES = ["completed", "cancelled"] as const;

/** The stored concept that means a record was read as recording a decision. */
export const DECISION_CONCEPT = "decision";

export type ProjectState = {
  /** Linked tasks that are neither completed nor cancelled, among those shown. */
  readonly openTasks: number;
  /**
   * Whether `openTasks` is a floor rather than a total.
   *
   * True when the task list hit its bound: the rows that were dropped may
   * contain further open tasks, so the only true sentence is "at least N". A
   * surface that printed a bare N there would state a total it did not read.
   */
  readonly openTasksAtLeast: boolean;
  /**
   * When the most recent linked entry happened, or `null` when there are none.
   *
   * Exact even under the bound, and that is a property of the caller's ordering
   * rather than luck: the timeline is read `occurred_at desc`, so truncation
   * drops the **oldest** rows and the maximum is always among those kept. The
   * maximum is computed rather than taken from `items[0]` so a caller that
   * changed the ordering would degrade to "the newest one read" instead of
   * silently printing whichever row happened to be first.
   */
  readonly lastEntryAt: string | null;
};

export function deriveProjectState(input: {
  readonly tasks: Bounded<{ readonly status: string }>;
  readonly entries: Bounded<{ readonly occurred_at: string }>;
}): ProjectState {
  const terminal = new Set<string>(TERMINAL_TASK_STATUSES);
  const openTasks = input.tasks.items.filter((task) => !terminal.has(task.status)).length;

  let lastEntryAt: string | null = null;
  let newest = Number.NEGATIVE_INFINITY;
  for (const entry of input.entries.items) {
    const at = Date.parse(entry.occurred_at);
    if (Number.isNaN(at) || at <= newest) continue;
    newest = at;
    lastEntryAt = entry.occurred_at;
  }

  return { openTasks, openTasksAtLeast: input.tasks.bounded, lastEntryAt };
}

/**
 * One `audit_logs` row, exactly as the project page reads it.
 *
 * `reason` is deliberately not part of this type. It is free text every writer
 * fills with a restatement of the localized sentence, and the History surface
 * stopped rendering it for that reason (UX-28); a second surface reading it
 * would resurrect a field the product decided not to show.
 */
export type EntityChangeRow = {
  readonly id: string;
  readonly action_type: string;
  readonly entity_type: string;
  readonly entity_id: string | null;
  readonly actor: string;
  readonly before_state: unknown;
  readonly after_state: unknown;
  readonly created_at: string;
};

/**
 * `2N-PROJECT-004` — audit rows turned into sentences, newest first.
 *
 * ## Renamed from `describeProjectChanges` when the person workspace arrived
 *
 * Nothing in it was ever project-specific: it sorts rows and delegates each to
 * `describeHistoryEvent`. The person workspace needs exactly this, and the
 * choice was between a second copy under a second name and one function under a
 * name that says what it does. The alternative was the failure this module's own
 * header warns about — *a second vocabulary for one fact* — arriving through the
 * back door of a name that made reuse look wrong.
 *
 * ## Why this delegates rather than describes
 *
 * `describeHistoryEvent` already turns an audit row into a localized sentence,
 * already knows every action type this page can encounter
 * (`update_project`, `associate_person_project`, `update_person_project_role`,
 * `end_person_project`), and already refuses to manufacture detail — a row whose
 * payloads do not overlap on a labelled field gets the plain sentence and
 * nothing more. Writing a second describer here would be a second vocabulary for
 * one fact, which is exactly how a product ends up narrating the same change two
 * different ways on two different screens.
 *
 * So this module contributes the two things History cannot know: **which rows
 * concern one project**, and **that the project need not name itself**.
 *
 * ## The subject is `found` with no label, and both halves are deliberate
 *
 * `found: true` is the truth: the caller loaded this project, so its subject
 * demonstrably exists — passing `false` would render "unavailable" beside a
 * project the reader is looking at.
 *
 * `label: null` then selects the without-subject phrasing, because the page's
 * own `<h1>` is that label. "Você alterou a descrição de X para Y" under the
 * heading of the project it happened to says everything the subject-carrying
 * form would, without repeating the name once per row. The templates are written
 * for this: the optional segment is bracketed, so removing it leaves a
 * grammatical sentence in both locales.
 *
 * The association rows carry no subject at all — `person_project` is
 * deliberately not linkable, since `entity_id` is the junction row's own id —
 * and their payloads carry `has_role` rather than the role text, so nothing a
 * person typed reaches this list.
 */
export function describeEntityChanges(
  rows: readonly EntityChangeRow[],
  copy: HistoryCopy,
  formatDate: (iso: string) => string,
): readonly HistoryEvent[] {
  const at = (value: string) => {
    const parsed = Date.parse(value);
    // A `timestamptz not null` column cannot produce this. Sorting an
    // unparseable value oldest keeps the list total rather than throwing away a
    // real row or leaving the comparator returning NaN.
    return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
  };

  return [...rows]
    .sort((left, right) => at(right.created_at) - at(left.created_at))
    .map((row) =>
      describeHistoryEvent(
        {
          id: row.id,
          actionType: row.action_type,
          actor: row.actor,
          entityType: row.entity_type,
          entityId: row.entity_id,
          beforeState: row.before_state,
          afterState: row.after_state,
          occurredAt: row.created_at,
        },
        { found: true, label: null },
        copy,
        formatDate,
      ),
    );
}

/**
 * `2N-PROJECT-005` — the entries whose **current** interpretation recorded a
 * decision.
 *
 * ## Current, not any
 *
 * The caller passes interpretations looked up by `entries.current_interpretation_id`,
 * so a reading the owner has since corrected cannot resurface as a decision. A
 * query on `entry_interpretations.entry_id` would have matched every superseded
 * version and shown the owner a decision they had already removed.
 *
 * ## No text is read, here or anywhere upstream
 *
 * The only input is the stored `concepts` array. Nothing matches on the entry's
 * words, and there is no parameter that could accept them — the same shape
 * `provenance/contracts.ts` keeps, and for the same reason: a rule that depends
 * on callers not passing the content is weaker than a signature that cannot take
 * it.
 *
 * An absent, null or non-array `concepts` yields no decision rather than an
 * error: it means the reading recorded none, which is an ordinary answer.
 */
export function decisionEntryIds(
  rows:
    | readonly {
        readonly entry_id: string | null;
        readonly concepts: readonly string[] | null;
      }[]
    | null
    | undefined,
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const row of rows ?? []) {
    if (!row?.entry_id || !Array.isArray(row.concepts)) continue;
    if (row.concepts.includes(DECISION_CONCEPT)) ids.add(row.entry_id);
  }
  return ids;
}
