/**
 * One page of notices, resolved against their subjects — **in two queries, not
 * two per row.**
 *
 * ## Why this module exists at all
 *
 * `2S-ACT-001` requires the primary action to be derived from the subject's own
 * state. The state lives on `public.tasks`, and a page renders up to twenty
 * rows, so the naive shape is twenty round trips — or, worse,
 * `loadTaskDetailProjection` per row, which is several queries each.
 *
 * This reads the whole page's subjects with **one** query per subject kind:
 * `.in("id", ids)`, owner-scoped. The row count does not change the query count.
 *
 * ## Why it does not build a full `WorkItemView`
 *
 * `WorkItemActions` reads exactly three fields — `taskId`, `title` and
 * `availableActions` — so a projection that fabricated relations, priorities and
 * a derived sensitivity would be inventing values nothing reads. Sensitivity in
 * particular is **derived from the source entry** and must never be minted; the
 * honest move is not to carry a field this surface does not use.
 *
 * The verbs are therefore decided by `verbsForRow`, which asks
 * `isEligibleStatus` — the same predicate the command path consults before
 * applying — rather than by a hand-assembled action list.
 *
 * ## Fail-closed, in three separate ways
 *
 * 1. **An unreadable `dedupe_key`** yields no subject (`subject.ts`).
 * 2. **A subject that no longer exists** is absent from the batch read, so its
 *    status is `null` — `2S-REACH-004`, a subject that was deleted.
 * 3. **A subject owned by someone else** cannot appear either: the read is
 *    `.eq("user_id", userId)` under RLS, so a forged `dedupe_key` naming another
 *    owner's task resolves to nothing.
 *
 * In all three the row keeps its message verbs and offers **no task verb**.
 * Absence of an action is the correct outcome of an invalid link — never a
 * silent failure, and never an action dispatched against an id that decoded to
 * something else.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Locale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

import { deriveNotificationSubject, type NotificationSubject } from "./subject";
import { menuVerbsFor, primaryVerbFor, verbsForRow, type VerbDefinition } from "./verbs";

/** The columns this projection needs from a notification row. */
export type NotificationRowSource = {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly body: string;
  readonly action_url: string | null;
  readonly status: string;
  readonly created_at: string;
  readonly dedupe_key: string | null;
};

export type NotificationRowView = {
  readonly notification: NotificationRowSource;
  readonly subject: NotificationSubject | null;
  /**
   * The subject's own status, or `null` when there is no resolvable subject —
   * whether because the key was unreadable, the subject was deleted, or it was
   * never this owner's.
   */
  readonly subjectStatus: string | null;
  /** The subject's own title, for accessible names. Falls back to the notice's body. */
  readonly subjectLabel: string;
  readonly verbs: readonly VerbDefinition[];
  readonly primaryVerb: VerbDefinition | null;
  readonly menuVerbs: readonly VerbDefinition[];
};

export async function projectNotificationRows(
  supabase: SupabaseClient,
  options: {
    readonly rows: readonly NotificationRowSource[];
    readonly userId: string;
    readonly locale: Locale;
  },
): Promise<readonly NotificationRowView[]> {
  const { rows, userId } = options;

  const subjects = new Map<string, NotificationSubject | null>(
    rows.map((row) => [row.id, deriveNotificationSubject(row)]),
  );

  const idsOf = (kind: "task" | "reminder") =>
    [
      ...new Set(
        [...subjects.values()]
          .filter((subject): subject is NotificationSubject => subject?.subjectType === kind)
          .map((subject) => subject.subjectId),
      ),
    ];

  const taskIds = idsOf("task");
  const reminderIds = idsOf("reminder");

  /*
   * Two reads for the whole page, and each is skipped entirely when its kind is
   * absent — `.in("id", [])` is a query that can only return nothing, so
   * issuing it would be a round trip bought for no answer.
   *
   * Both are owner-scoped explicitly as well as by RLS. The redundancy is
   * deliberate: the ids arrive from a parsed string, and a read that depends on
   * RLS alone to reject a forged id is one whose safety is invisible here.
   */
  const [taskRows, reminderRows] = await Promise.all([
    taskIds.length
      ? supabase.from("tasks").select("id,title,status").eq("user_id", userId).in("id", taskIds)
          .then((result) => requireSupabaseData(result, "load notification subjects") ?? [])
      : Promise.resolve([] as { id: string; title: string; status: string }[]),
    reminderIds.length
      ? supabase.from("reminders").select("id,title,status").eq("user_id", userId).in("id", reminderIds)
          .then((result) => requireSupabaseData(result, "load notification reminder subjects") ?? [])
      : Promise.resolve([] as { id: string; title: string; status: string }[]),
  ]);

  const byId = new Map<string, { title: string; status: string }>();
  for (const row of [...taskRows, ...reminderRows]) {
    byId.set(row.id, { title: row.title, status: row.status });
  }

  return rows.map((row) => {
    const subject = subjects.get(row.id) ?? null;
    const resolved = subject ? byId.get(subject.subjectId) : undefined;
    const subjectStatus = resolved?.status ?? null;
    const verbs = verbsForRow({
      // A subject whose row did not come back is treated as no subject at all,
      // so `2S-REACH-004` and an unreadable key converge on the same behaviour.
      subjectType: resolved ? (subject?.subjectType ?? null) : null,
      subjectStatus,
      // `R-24`, carried from the page this projection replaced: a notice that is
      // already read has nothing to mark.
      noticeStatus: row.status,
    });
    return {
      notification: row,
      subject,
      subjectStatus,
      // The notice's body already carries the subject's title (the heartbeat
      // writes `task.title` into it), so the fallback is not a placeholder — it
      // is the same string by another route.
      subjectLabel: resolved?.title ?? row.body,
      verbs,
      primaryVerb: primaryVerbFor(verbs),
      menuVerbs: menuVerbsFor(verbs),
    };
  });
}
