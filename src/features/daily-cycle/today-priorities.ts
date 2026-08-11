/**
 * `2J-HOJE-003` … `2J-HOJE-006` — the deterministic daily priorities (ADR-095,
 * OD-2J-3).
 *
 * ## What the owner signed, and what that rules out
 *
 * Priorities are **deterministic**. No model call chooses them, and **no new
 * persistent "pin as today's priority" model is authorized** — so this file
 * introduces no column, no table and no write. It reads what the schema already
 * carries: `due_at`, `status`, and `manual_priority`, which has existed since
 * `202607160003` as `check (manual_priority in ('low','medium','high','urgent'))`.
 *
 * ## Why the rule is this small
 *
 * OD-2J-3 forbids "hidden scoring complexity invented merely to produce exactly
 * three". A weighted score would be exactly that: it would rank two tasks
 * differently for reasons the user cannot see, and it would always find three
 * items because a score always has a top three.
 *
 * So the rule is a **qualification test followed by a stable sort**, and the
 * qualification test is the part that matters. A task earns a place by being
 * late, due today, or explicitly marked urgent/high — never by being the
 * least-bad remaining option. When two qualify, three slots stay two.
 * *Silence is also a result.*
 */

import type { WorkItemView } from "./contracts";
import { localDayBounds } from "@/lib/time/local-day";

/** `2J-HOJE-004`. A ceiling, never a quota. */
export const MAX_TODAY_PRIORITIES = 3;

/**
 * Why a task is on the list. Rendered, not inferred — `2J-HOJE-005` requires
 * the reason to be visible in plain language, and `2J-HOJE-003` requires
 * overdue to be distinguishable from due-today rather than sharing a label.
 */
export const PRIORITY_REASONS = ["overdue", "due_today", "marked_urgent"] as const;
export type PriorityReason = (typeof PRIORITY_REASONS)[number];

export type TodayPriority = {
  readonly item: WorkItemView;
  readonly reason: PriorityReason;
};

/** The `manual_priority` values that qualify on their own. */
const QUALIFYING_MANUAL = new Set(["urgent", "high"]);

/** Rank within a reason bucket. Lower sorts first. */
const MANUAL_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

/**
 * The local calendar day boundaries for `timezone`.
 *
 * **This used to be its own implementation, and it was wrong.** It computed
 * `end = start + 24h`, which is not the end of a 23-hour or a 25-hour local
 * day: on a spring-forward day the window overshot an hour into tomorrow, and
 * on a fall-back day it stopped an hour early. Nothing noticed, because Hoje was
 * the only caller and São Paulo has not observed DST since 2019.
 *
 * `2M-TIME-001` makes one module the answer for the whole product, and this is
 * now a re-export of it so that existing callers and tests keep their import
 * while there is exactly one definition behind it.
 */
export { localDayBounds };

/**
 * `2J-HOJE-003` — the state a due date is actually in, for one task.
 *
 * Returned rather than rendered so the caller can label it; the distinction
 * exists at the data layer precisely so two surfaces cannot disagree about what
 * "late" means.
 */
export function dueState(
  dueAt: string | undefined,
  bounds: { start: number; end: number },
): "overdue" | "due_today" | "later" | "none" {
  if (!dueAt) return "none";
  const due = Date.parse(dueAt);
  if (Number.isNaN(due)) return "none";
  if (due < bounds.start) return "overdue";
  if (due < bounds.end) return "due_today";
  return "later";
}

/**
 * `2J-HOJE-004`/`006` — up to three, and fewer when fewer qualify.
 *
 * `items` is expected to be the `today` work projection, which already excludes
 * `completed` and `cancelled`. This function does not re-filter status: doing
 * so would put the same rule in two places and let them drift.
 */
export function selectTodayPriorities(
  items: readonly WorkItemView[],
  { now, timeZone }: { now: Date; timeZone: string },
): readonly TodayPriority[] {
  const bounds = localDayBounds(now, timeZone);

  const qualified: TodayPriority[] = items.flatMap((item): TodayPriority[] => {
    const state = dueState(item.dueAt, bounds);
    if (state === "overdue") return [{ item, reason: "overdue" as const }];
    if (state === "due_today") return [{ item, reason: "due_today" as const }];
    if (item.priority && QUALIFYING_MANUAL.has(item.priority)) {
      return [{ item, reason: "marked_urgent" as const }];
    }
    // Everything else is honestly not a priority for today. It is not ranked
    // lower -- it is absent, which is what keeps the list from padding itself.
    return [];
  });

  const reasonRank: Record<PriorityReason, number> = { overdue: 0, due_today: 1, marked_urgent: 2 };

  return [...qualified]
    .sort((left, right) => {
      const byReason = reasonRank[left.reason] - reasonRank[right.reason];
      if (byReason !== 0) return byReason;
      const byManual =
        (MANUAL_RANK[left.item.priority ?? ""] ?? 9) - (MANUAL_RANK[right.item.priority ?? ""] ?? 9);
      if (byManual !== 0) return byManual;
      const byDue = Date.parse(left.item.dueAt ?? "") - Date.parse(right.item.dueAt ?? "");
      if (!Number.isNaN(byDue) && byDue !== 0) return byDue;
      // Final tie-break on the id. Without it the order depends on the
      // database's row order, and "deterministic" would be a claim rather than
      // a property: the same data could render two ways across two requests.
      return left.item.taskId.localeCompare(right.item.taskId);
    })
    .slice(0, MAX_TODAY_PRIORITIES);
}
