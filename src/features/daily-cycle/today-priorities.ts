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
 * The local calendar day boundaries for `timezone`, as epoch milliseconds.
 *
 * Computed from the projection's own timezone rather than the server's, because
 * "due today" is a statement about the user's day. `work-projection.ts` already
 * resolves and returns that timezone; this function must be given it rather
 * than reaching for a default, so a missing timezone is a caller error and not
 * a silently wrong answer at 23:00.
 */
export function localDayBounds(now: Date, timeZone: string): { start: number; end: number } {
  // `en-CA` yields YYYY-MM-DD, which is the only reason it is used here.
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = formatter.format(now);
  // Re-read the offset at that instant instead of assuming a fixed one, so a
  // DST transition inside the day cannot shift the boundary.
  const offsetMs = zoneOffsetMs(now, timeZone);
  const start = Date.parse(`${today}T00:00:00.000Z`) - offsetMs;
  return { start, end: start + 24 * 60 * 60 * 1000 };
}

function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const lookup = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    lookup("year"),
    lookup("month") - 1,
    lookup("day"),
    lookup("hour") % 24,
    lookup("minute"),
    lookup("second"),
  );
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

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
