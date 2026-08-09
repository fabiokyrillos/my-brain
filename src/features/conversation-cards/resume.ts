import "server-only";

/**
 * `2K-CONT-002` … `2K-CONT-008` — the return path.
 *
 * ## Why this is not a Server Action
 *
 * The implementation plan named `assistant/actions.ts` as the re-derivation
 * entry point. It lives here instead, as a `server-only` module the
 * conversation page calls during render, and the reason is the slice's own
 * subject: a `"use server"` export becomes a **client-callable endpoint**, and
 * the whole point of this path is that returning cannot be used as an
 * authorization. The resume needs no client call — the user arrives by
 * navigation, with the handle in the URL — so giving it an endpoint would add
 * reachable surface for nothing. Fewer doors is the correct trade here.
 *
 * ## What "re-derive" can honestly mean with an identifier-only payload
 *
 * The handle carries no command, no patch and no clock (ADR-100), so the
 * *earlier preview* is not reconstructible — by design, not by omission. What
 * **is** derivable from the authorized identifiers alone is the object's
 * current state, read under RLS at a fresh clock.
 *
 * That is exactly `2K-CONT-006`'s third branch, and it is the only branch this
 * shape can express: *the earlier preview no longer applies, here is what the
 * object looks like now, and the action must be stated again.* The surface
 * **does not invent** a difference it cannot reconstruct. A payload rich enough
 * to describe the difference would be a payload rich enough to authorize the
 * change, which is the trade T-2K-02 refuses.
 *
 * ## The three `unavailable` causes
 *
 * Deleted, foreign and unreadable all resolve to `unavailableCard(type)` —
 * which takes no cause parameter, so the outputs are byte-identical and the
 * surface is not an existence oracle (`2K-CONT-008`).
 *
 * A **suspended account** is refused one layer earlier and more strongly:
 * `requireUser` redirects it to `/account-state` before this module is reached,
 * so it sees no product surface at all rather than an `unavailable` card. That
 * is stated rather than folded in, because reporting it as "byte-identical
 * unavailable" would describe a code path that does not run.
 */

import { requireUser } from "@/lib/auth/require-user";
import type { Locale } from "@/lib/preferences";

import {
  messageAnchorId,
  parseContinuityHandle,
  type ContinuityHandle,
  type ContinuityResumption,
} from "./continuity";
import { readOnlyPreviewCard, unavailableCard } from "./contracts";

function objectHref(locale: Locale, handle: ContinuityHandle): string {
  return handle.t === "entry"
    ? `/${locale}/app/inbox/${handle.o}`
    : `/${locale}/app/memories/${handle.o}`;
}

/**
 * Re-derives what a returning user should see.
 *
 * Returns `null` when the handle is unusable **as a handle** — malformed, an
 * old version, or naming a message that is not in the conversation it claims.
 * That is different from `unavailable`: nothing about the user's data is being
 * reported, so the surface simply does not offer a restored position.
 */
export async function resumeConversationCard(
  raw: unknown,
  locale: Locale,
): Promise<ContinuityResumption | null> {
  const parsed = parseContinuityHandle(raw);
  if (parsed.status !== "ok") return null;
  const handle = parsed.handle;

  // `requireUser` is the whole authorization story for this path: it
  // authenticates, enforces the account lifecycle, and hands back a client
  // whose every read is under forced RLS. Nothing in the handle is trusted.
  const { supabase, user } = await requireUser(locale);

  // The position must be real before it can be restored. Ownership is RLS's
  // answer; this is about coherence — a handle naming a message that is not in
  // the conversation it claims describes a position that never existed.
  const message = await supabase
    .from("conversation_messages")
    .select("id")
    .eq("id", handle.m)
    .eq("conversation_id", handle.c)
    .eq("user_id", user.id)
    .maybeSingle();
  if (message.error || !message.data) return null;

  /**
   * The new clock, minted **here**.
   *
   * ADR-100: no clock crosses the navigation, so this is not the instant the
   * departing render used and cannot be. A derivation minted with a new clock
   * cannot consume an earlier confirmation — which is the mechanism, not an
   * inconvenience it works around.
   */
  const issuedAt = new Date().toISOString();
  const anchor = messageAnchorId(handle.m);
  const base = {
    requiresFreshConfirmation: true as const,
    issuedAt,
    anchor,
    conversationId: handle.c,
    messageId: handle.m,
  };

  const row = handle.t === "entry"
    ? await supabase
      .from("entries")
      .select("id,original_content,sensitivity")
      .eq("id", handle.o)
      .eq("user_id", user.id)
      .maybeSingle()
    : await supabase
      .from("memories")
      .select("id,content,sensitivity")
      .eq("id", handle.o)
      .eq("user_id", user.id)
      .maybeSingle();

  if (row.error || !row.data) {
    // Deleted, foreign, or unreadable for any other reason. One shape, no cause.
    return { ...base, card: unavailableCard(handle.t) };
  }

  const data = row.data as { original_content?: string; content?: string; sensitivity?: string | null };
  return {
    ...base,
    card: readOnlyPreviewCard({
      cardType: handle.t,
      objectId: handle.o,
      // Classification is consulted **now**, from the row itself, which is the
      // property OD-2K-2 exists to give: there is no stored copy that could
      // disagree with it.
      snippet: handle.t === "entry" ? data.original_content ?? null : data.content ?? null,
      sensitivity: data.sensitivity ?? null,
      href: objectHref(locale, handle),
    }),
  };
}
