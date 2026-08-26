import "server-only";

/**
 * The unanswered notices, for the attention surface — **the same rows the
 * notifications page renders, read by the same projection.**
 *
 * ## Why this module is a loader and not a second projection
 *
 * `2S-ACT-011` is the requirement this slice is most able to satisfy in
 * appearance and break in substance: *"The verb set and its copy are read from
 * ONE source and asserted equal across `/app/notifications` and the attention
 * surface; a verb present in one and absent from the other fails."* A second
 * projection that computed the same verbs from the same rules would pass every
 * test written against it and still be two implementations.
 *
 * So this module computes **nothing about verbs, eligibility or subjects**. It
 * asks the same question `/app/notifications` asks — which rows, in what order
 * — and hands them to `projectNotificationRows`, which is where the subject
 * derivation, the batched owner-scoped subject read and `verbsForRow` already
 * live. What it adds is the *selection*: the attention surface shows the
 * notices that are still **unanswered**, where the history page shows every
 * notice that was not dismissed.
 *
 * ## "Unanswered" is `status = 'unread'`, and that is the product's own word
 *
 * `notifications.status` has exactly three members —
 * `('unread','read','dismissed')` (`202607160007:58`). *Read* and *dismissed*
 * are both answers the owner gave; `unread` is the absence of one. The
 * attention surface is where things waiting on the owner live, so it reads the
 * one member that means *waiting*.
 *
 * ## The bound is not decoration
 *
 * Home shows a handful of items, not a page. `limit` is applied in the query
 * and one extra row is read to answer `hasMore` without a second round trip —
 * the same shape `loadAttentionProjection` next door uses.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Locale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

import { projectNotificationRows, type NotificationRowView, type NotificationRowSource } from "./row-projection";
import { deriveNotificationSubject } from "./subject";

/** Home's share of the attention queue. Small, because Home is not a list page. */
export const ATTENTION_NOTICE_LIMIT = 3;

/**
 * The full queue's share, at `/app/inbox?view=needs-you`.
 *
 * Twenty rather than three, because that surface is the one "ver tudo"
 * promises — and twenty rather than unbounded, because a page that renders
 * every notice an account ever accumulated is a page that stops rendering.
 * `hasMore` still answers honestly above it.
 */
export const ATTENTION_NOTICE_QUEUE_LIMIT = 20;

export type AttentionNoticesPage = {
  readonly items: readonly NotificationRowView[];
  readonly hasMore: boolean;
};

export const EMPTY_ATTENTION_NOTICES: AttentionNoticesPage = { items: [], hasMore: false };

export async function loadAttentionNotices(
  supabase: SupabaseClient,
  options: { readonly userId: string; readonly locale: Locale; readonly limit?: number },
): Promise<AttentionNoticesPage> {
  const { userId, locale, limit = ATTENTION_NOTICE_LIMIT } = options;

  /*
    Owner-scoped explicitly as well as by RLS, exactly as `row-projection.ts`
    scopes its subject reads. The redundancy is the same deliberate one: a read
    whose safety is only visible in a policy file is a read whose safety is
    invisible here.
  */
  const result = await supabase
    .from("notifications")
    .select("id,type,title,body,action_url,status,created_at,dedupe_key")
    .eq("user_id", userId)
    .eq("status", "unread")
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  const raw = (requireSupabaseData(result, "load attention notices") ?? []) as NotificationRowSource[];
  if (raw.length === 0) return EMPTY_ATTENTION_NOTICES;

  const rows = oneRowPerSubject(raw);
  const page = rows.slice(0, limit);
  if (page.length === 0) return EMPTY_ATTENTION_NOTICES;

  return {
    items: await projectNotificationRows(supabase, { rows: page, userId, locale }),
    /*
      Read AFTER the collapse, and the difference matters. `raw.length > limit`
      would answer "the read was capped", which can be true because the extra
      row was a duplicate of one already shown — and "+1" beside a queue holding
      everything there is would be a number that promises something that is not
      there. This answers the narrower, true thing: at least one further
      DISTINCT subject exists.
    */
    hasMore: rows.length > limit,
  };
}

/**
 * `2S-ATTENTION-002` — **a subject the list already shows is not shown twice.**
 *
 * ## What actually duplicates here, measured rather than assumed
 *
 * The requirement's example is *"a task present from its own source and from a
 * notice"*, and that pairing does not exist on this surface: the queue's other
 * two sources are `list_needs_attention`, which returns **entries**, and the
 * memory conflicts, which return **memories**. Neither carries a task.
 *
 * What does duplicate is a subject with more than one unanswered notice — and
 * it is not hypothetical. The deployed heartbeat writes `overdue:{task}:{date}`
 * and `stale:{task}:{date}`, and a task key carries the owner's **local date**,
 * so a subject nobody answers accumulates one notice per qualifying day until
 * the backoff ladder stops it. Slice 2S.0 measured exactly that: **54 of 57
 * notices were `task_stale`, about three tasks.** Eighteen rows for one subject
 * is what this collapses.
 *
 * ## The newest one survives, and the rest are not lost
 *
 * `created_at desc` is the order the read already asks for, so the first
 * occurrence of a subject is its most recent notice. The older ones are still
 * in the database, still visible on `/app/notifications`, and still answerable
 * there. This is a projection, never a deletion.
 *
 * ## A notice with no resolvable subject is never collapsed
 *
 * An unreadable `dedupe_key`, a deleted subject or a forged one all produce
 * "no subject", and two rows with no subject are two different things rather
 * than one thing seen twice. Keying them by their own id keeps each of them —
 * the safe direction, because the alternative silently hides a notice.
 */
function oneRowPerSubject(rows: readonly NotificationRowSource[]): NotificationRowSource[] {
  const seen = new Set<string>();
  const kept: NotificationRowSource[] = [];
  for (const row of rows) {
    const subject = deriveNotificationSubject(row);
    const key = subject ? `${subject.subjectType}:${subject.subjectId}` : `row:${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(row);
  }
  return kept;
}
