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

/** Home's share of the attention queue. Small, because Home is not a list page. */
export const ATTENTION_NOTICE_LIMIT = 3;

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

  const rows = (requireSupabaseData(result, "load attention notices") ?? []) as NotificationRowSource[];
  const page = rows.slice(0, limit);
  if (page.length === 0) return EMPTY_ATTENTION_NOTICES;

  return {
    items: await projectNotificationRows(supabase, { rows: page, userId, locale }),
    hasMore: rows.length > limit,
  };
}
