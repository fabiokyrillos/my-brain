import "server-only";

/**
 * The cancelled-task recovery projection (PRD 2E-DESTRUCTIVE-006/009).
 *
 * 2E-DESTRUCTIVE-006: "A cancelled task remains reachable through an explicit
 * affordance, and `restore_task` is offered there, so a confirmed action's
 * result is observable and escapable." PRD §3.3 consequence 3 is why it has to
 * exist at all — once the 24-hour undo window closes, `restore_task` is the
 * only exit from `cancelled`, and a user who cannot find the task cannot ask
 * for it by name either.
 *
 * **It reads through `list_task_command_candidates` rather than querying
 * `public.tasks`,** and that is the load-bearing decision here. 2E-DESTRUCTIVE-009
 * requires the creation-undone guard to close *every* door into such a task —
 * undo, `restore_task`, and this surface — and Slice 2E.5 made that RPC the
 * single place the predicate lives ("the candidate listing excludes
 * creation-undone tasks for *every* action"). A `select … where status =
 * 'cancelled'` here would be a second, weaker door: it would list a task whose
 * creation was undone, offer a restore the database then refuses with
 * `2E_CREATION_UNDONE`, and leave the user staring at a row that cannot be
 * acted on.
 *
 * The action is `restore_task` and not an argument, because 2E-MATCH-002 makes
 * `restore_task` the only action for which a `cancelled` task is ranked at all.
 * Asking for the candidates of any other action would return nothing.
 */

import type { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/lib/preferences";

import { loadTaskCandidates } from "./candidates";
import { validateTaskCommand } from "./schema";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type CancelledTaskView = {
  readonly taskId: string;
  readonly title: string;
  /** Rendered in the caller's zone and locale (2E-I18N-002), or null. */
  readonly cancelledAt: string | null;
  readonly dueAt: string | null;
  readonly projectNames: readonly string[];
};

/**
 * How many cancelled tasks the recovery surface lists.
 *
 * Higher than the match layer's presentation cap because this is a *listing*
 * rather than a disambiguation: the user is looking for one specific task among
 * the ones they cancelled, not choosing between candidates a matcher ranked.
 * The RPC clamps its own limit, and overflow is reported rather than hidden —
 * see `hasMore`.
 */
export const CANCELLED_TASK_PAGE_SIZE = 25;

export type CancelledTaskRecovery = {
  readonly tasks: readonly CancelledTaskView[];
  /**
   * True when the listing was truncated.
   *
   * Disclosed rather than dropped, for the same reason 2E-MATCH-004 makes
   * candidate overflow an explicit outcome: a recovery surface that silently
   * omits the task the user is looking for is worse than one that admits it
   * cannot show everything.
   */
  readonly hasMore: boolean;
};

function renderInstant(iso: string | null, locale: Locale, timeZone: string): string | null {
  if (iso === null) return null;
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "short",
      timeStyle: "short",
      timeZone,
    }).format(new Date(iso));
  } catch {
    // An unknown zone must not take the recovery surface down: this is the one
    // page a stranded task is reachable from.
    return null;
  }
}

export type CancelledTaskRecoveryInput = {
  readonly ownerId: string;
  readonly now: string;
  readonly timeZone: string;
  readonly locale: Locale;
  readonly limit?: number;
};

export async function loadCancelledTaskRecovery(
  supabase: SupabaseClient,
  input: CancelledTaskRecoveryInput,
): Promise<CancelledTaskRecovery> {
  // A hint-free `restore_task` command: the listing asks "which cancelled tasks
  // are restorable", not "which one did the user mean". Every row therefore
  // arrives at prefilter tier 3 with zero token overlap, which is the reachable
  // shape for a query that carried no hint.
  const validation = validateTaskCommand(
    {
      action: "restore_task",
      targetHints: {},
      patch: {},
      // Never reaches a write. `loadTaskCandidates` reads the action and the
      // hints and nothing else, and this projection has no apply behind it.
      operationKey: "00000000-0000-4000-8000-000000000000",
    },
    { now: input.now, timeZone: input.timeZone },
  );
  if (validation.status !== "ok") {
    // Unreachable: the payload above is a constant this module owns. A throw
    // rather than an empty list, because an empty recovery surface is
    // indistinguishable from "you have cancelled nothing" and would hide a
    // stranded task behind a lie.
    throw new Error(
      `the recovery listing could not build its own restore_task command (${validation.status})`,
    );
  }

  const limit = input.limit ?? CANCELLED_TASK_PAGE_SIZE;
  // One beyond the page, so truncation is observed rather than assumed —
  // the same probe 2E-MATCH-004 uses one layer down.
  const rows = await loadTaskCandidates({
    client: supabase,
    command: validation.command,
    ownerId: input.ownerId,
    now: input.now,
    limit: limit + 1,
  });

  const ordered = [...rows]
    // Most recently cancelled first, then by id so the order is total and
    // deterministic — the same shape `rankTaskCandidates` ends on. A row with
    // no `cancelledAt` sorts last rather than being dropped: the status is what
    // makes it restorable, and the timestamp is presentation.
    .sort((left, right) => {
      const a = left.cancelledAt === null ? 0 : Date.parse(left.cancelledAt);
      const b = right.cancelledAt === null ? 0 : Date.parse(right.cancelledAt);
      if (a !== b) return b - a;
      return left.taskId < right.taskId ? -1 : left.taskId > right.taskId ? 1 : 0;
    });

  return {
    tasks: ordered.slice(0, limit).map((row) => ({
      taskId: row.taskId,
      title: row.title,
      cancelledAt: renderInstant(row.cancelledAt, input.locale, input.timeZone),
      dueAt: renderInstant(row.dueAt, input.locale, input.timeZone),
      projectNames: row.projectNames,
    })),
    hasMore: ordered.length > limit,
  };
}
